import type { CaseState, AgentRunConfig } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import { normalizeChiefComplaint, normalizeSystem } from "../data/canonicalKeys";
import { getRouterEntryByComplaint, type RouterEntry } from "../services/complaintRouter";
import { getQuestionsForBundles, buildQuestionQueue, type QueueEntry } from "../services/questionQueue";
import { getRulesForContext, executeRules, applyRuleActions, type RuleAction } from "../services/rulesEngine";
import { getModifiersForSet, applyFhirPrefill, computeModifierSummary } from "../services/modifiers";
import { enhancedSupervisorGate } from "../services/supervisorEnhanced";
import { detectRedFlags } from "./safety/redFlags";
import { fetchFhirPrefill, buildPrefillFromManualEntry } from "../services/fhirPrefill";
import { runMedicationTriggeredQuestions } from "../services/medicationTriggeredQuestions";
import { runObesityAgent } from "../agents/obesity/obesityAgent";
import { registerDynamicQuestion } from "./router";
import { buildClinicalState } from "../services/clinicalStateBuilder";
import { runCrossoverHooks } from "../agents/crossoverHooks";
import { runClinicalBrain } from "../core/clinicalBrainEngine";
import {
  buildClinicalContext,
  createAgentState,
  enforceAgentCaps,
  incrementLlmCall,
  HarnessCapExceeded,
} from "../harness/harnessEnforcer";
import { runGeometricReasoning } from "../reasoning/geometricReasoningIntegrator";
import { assessUncertainty }    from "../reasoning/dualModelUncertaintySampler";
import { OntologyFirewall }     from "../ontology/ontologyFirewall";
import { OntologyFieldMapper }  from "../ontology/ontologyFieldMapper";
import { retrieveRelevantSkills } from "../learning/clinicalSkillsSystem";

export interface PipelineResult {
  state: CaseState;
  events: TraceEvent[];
  routerEntry: RouterEntry | null;
}

export async function initializePipeline(
  state: CaseState,
  _cfg: AgentRunConfig
): Promise<PipelineResult> {
  const events: TraceEvent[] = [];
  let updated = { ...state };

  const canonicalCC = normalizeChiefComplaint(state.chiefComplaint);
  if (canonicalCC) {
    updated.normalizedComplaint = canonicalCC;
  }

  const routerEntry = await getRouterEntryByComplaint(state.chiefComplaint);

  if (!routerEntry) {
    events.push({
      type: "PIPELINE_INIT",
      severity: "info",
      message: `No router entry for "${state.chiefComplaint}" — using legacy path`,
    });

    if (updated.modifiers?.allergies || updated.modifiers?.meds || updated.modifiers?.pmh) {
      const prefill = buildPrefillFromManualEntry(
        updated.modifiers?.allergies ?? [],
        updated.modifiers?.meds ?? [],
        updated.modifiers?.pmh ?? [],
        updated.demographics?.pregnant ?? false
      );
      updated.fhirPrefill = prefill;
    }

    try {
      const clinicalTrace = await buildClinicalState(updated);
      updated.clinicalStateTrace = clinicalTrace;
      events.push({
        type: "CLINICAL_STATE_BUILT",
        severity: "info",
        message: `Clinical state: ${clinicalTrace.normalizedMeds.length} meds, ${clinicalTrace.inferredConditions.length} conditions, ${clinicalTrace.riskFlags.length} risk flags (${clinicalTrace.buildDurationMs}ms)`,
      });
    } catch (err: any) {
      events.push({ type: "CLINICAL_STATE_ERROR", severity: "warn", message: `Clinical state builder failed: ${err.message}` });
    }

    const crossoverResult = await runCrossoverHooks(updated);
    updated = crossoverResult.state;
    events.push(...crossoverResult.events);

    const supervisorDecision = enhancedSupervisorGate(updated);
    if (!supervisorDecision.allow && supervisorDecision.forceState === "EMERGENT_ESCALATION") {
      updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
      events.push({ type: "SUPERVISOR_BLOCK", severity: "error", message: supervisorDecision.reason });
    }

    return { state: updated, events, routerEntry: null };
  }

  events.push({
    type: "PIPELINE_INIT",
    severity: "info",
    message: `Router: ${routerEntry.system}/${routerEntry.chiefComplaint} → cluster=${routerEntry.defaultCluster}, bundle=${routerEntry.primarySecondaryBundleId}`,
  });

  updated.system = routerEntry.system;
  updated.normalizedComplaint = routerEntry.chiefComplaint;

  if (routerEntry.defaultCluster && !updated.activeClusters.includes(routerEntry.defaultCluster)) {
    updated.activeClusters = [...updated.activeClusters, routerEntry.defaultCluster];
  }

  updated.routing = {
    ...updated.routing,
    flowId: `${routerEntry.system}_${routerEntry.chiefComplaint}`,
    modifierSetId: routerEntry.modifierSetId || undefined,
    primaryBundleId: routerEntry.primarySecondaryBundleId || undefined,
  };

  if (!updated.fhirPrefill && routerEntry.fhirCore) {
    if (updated.modifiers?.allergies || updated.modifiers?.meds || updated.modifiers?.pmh) {
      const prefill = buildPrefillFromManualEntry(
        updated.modifiers?.allergies ?? [],
        updated.modifiers?.meds ?? [],
        updated.modifiers?.pmh ?? [],
        updated.demographics?.pregnant ?? false
      );
      updated.fhirPrefill = prefill;
      events.push({
        type: "FHIR_PREFILL",
        severity: "info",
        message: `Manual prefill: ${prefill.meds.length} meds, ${prefill.allergies.length} allergies, ${prefill.problems.length} pmh`,
      });
    }
  }

  if (routerEntry.modifierSetId) {
    try {
      const modDefs = await getModifiersForSet(routerEntry.modifierSetId);
      if (modDefs.length > 0) {
        const prefillResults = applyFhirPrefill(modDefs, updated.fhirPrefill);
        const summary = computeModifierSummary(modDefs, prefillResults, updated.modifierAnswers);

        updated.modifierAnswers = { ...updated.modifierAnswers, ...summary.answers };

        if (summary.triageUpgradeTarget) {
          updated.ruleTrace = [
            ...updated.ruleTrace,
            {
              ruleId: "MODIFIER_TRIAGE_UPGRADE",
              triggerLevel: "MODIFIER_GATE",
              action: "TRIAGE_UPGRADE",
              detail: `Modifier risk score ${summary.riskScore} → ${summary.triageUpgradeTarget}`,
            },
          ];
        }

        events.push({
          type: "MODIFIERS_LOADED",
          severity: "info",
          message: `${modDefs.length} modifiers (${summary.pendingModifiers.length} pending), risk=${summary.riskScore}`,
        });

        if (summary.pendingModifiers.length > 0) {
          updated.routing = { ...updated.routing, state: "MODIFIERS_PENDING" };
        }
      }
    } catch (err: any) {
      events.push({
        type: "MODIFIERS_ERROR",
        severity: "warn",
        message: `Failed to load modifiers: ${err.message}`,
      });
    }
  }

  const bundleIds: string[] = [];
  if (routerEntry.primarySecondaryBundleId) {
    bundleIds.push(routerEntry.primarySecondaryBundleId);
  }

  try {
    const rules = await getRulesForContext(
      routerEntry.system,
      routerEntry.chiefComplaint,
      routerEntry.defaultCluster
    );

    if (rules.length > 0) {
      const modGateActions = executeRules(rules, "MODIFIER_GATE", updated.modifierAnswers, updated.answers);
      const symptomGateActions = executeRules(rules, "SYMPTOM_GATE", updated.modifierAnswers, updated.answers);
      const allActions = [...modGateActions, ...symptomGateActions];

      if (allActions.length > 0) {
        const ruleState = applyRuleActions(allActions, {
          activeClusters: [...updated.activeClusters],
          questionBundles: [...bundleIds],
          triageTarget: undefined,
          flaggedDx: [],
          medContraFlags: [],
        });

        updated.activeClusters = ruleState.activeClusters;
        bundleIds.push(...ruleState.questionBundles.filter(b => !bundleIds.includes(b)));

        for (const action of allActions) {
          updated.ruleTrace = [
            ...updated.ruleTrace,
            {
              ruleId: action.ruleId,
              triggerLevel: action.triggerLevel,
              action: action.actionType,
              detail: action.detail,
            },
          ];
        }

        events.push({
          type: "RULES_EXECUTED",
          severity: "info",
          message: `${allActions.length} rule actions fired from ${rules.length} rules`,
        });
      }
    }
  } catch (err: any) {
    events.push({
      type: "RULES_ERROR",
      severity: "warn",
      message: `Failed to execute rules: ${err.message}`,
    });
  }

  try {
    const medTriggerResult = await runMedicationTriggeredQuestions(updated);
    if (medTriggerResult.actions.length > 0) {
      for (const action of medTriggerResult.actions) {
        if (action.type === "ADD_INLINE_QUESTION") {
          registerDynamicQuestion(action.questionId, action.text);
          updated.questionQueue = [
            ...updated.questionQueue,
            {
              questionId: action.questionId,
              bundleId: action.bundleId,
              askOrder: action.askOrder,
              isRedFlag: false,
              questionText: action.text,
              answered: Object.keys(updated.answers).includes(action.questionId),
            },
          ];
        } else if (action.type === "ADD_BUNDLE") {
          if (!bundleIds.includes(action.bundleId)) {
            bundleIds.push(action.bundleId);
          }
          updated.ruleTrace = [
            ...updated.ruleTrace,
            {
              ruleId: "MED_TRIGGER",
              triggerLevel: "MED_RECONCILE",
              action: "ADD_BUNDLE",
              detail: action.bundleId,
            },
          ];
        }
      }
      events.push({
        type: "MED_TRIGGERS_MATCHED",
        severity: "info",
        message: `${medTriggerResult.matchedTriggers.length} med triggers matched, ${medTriggerResult.actions.length} actions`,
      });
    }
  } catch (err: any) {
    events.push({
      type: "MED_TRIGGERS_ERROR",
      severity: "warn",
      message: `Med trigger check failed: ${err.message}`,
    });
  }

  try {
    const clinicalTrace = await buildClinicalState(updated);
    updated.clinicalStateTrace = clinicalTrace;
    events.push({
      type: "CLINICAL_STATE_BUILT",
      severity: "info",
      message: `Clinical state: ${clinicalTrace.normalizedMeds.length} meds, ${clinicalTrace.inferredConditions.length} conditions, ${clinicalTrace.riskFlags.length} risk flags (${clinicalTrace.buildDurationMs}ms)`,
    });
  } catch (err: any) {
    events.push({ type: "CLINICAL_STATE_ERROR", severity: "warn", message: `Clinical state builder failed: ${err.message}` });
  }

  const crossoverResult = await runCrossoverHooks(updated);
  updated = crossoverResult.state;
  events.push(...crossoverResult.events);
  for (const bundle of crossoverResult.bundlesAdded) {
    if (!bundleIds.includes(bundle)) {
      bundleIds.push(bundle);
    }
  }

  if (bundleIds.length > 0) {
    try {
      const secondaryQs = await getQuestionsForBundles(bundleIds);
      const answeredIds = new Set(Object.keys(updated.answers));
      const queue = buildQuestionQueue(secondaryQs, answeredIds);

      for (const qEntry of queue) {
        registerDynamicQuestion(qEntry.questionId, qEntry.questionText);
      }

      const existingInlineQs = updated.questionQueue.filter(
        q => q.bundleId === "BUNDLE_MED_CONFIRM"
      );
      const bundleQs = queue.map(q => ({
        questionId: q.questionId,
        bundleId: q.bundleId,
        askOrder: q.askOrder,
        isRedFlag: q.isRedFlag,
        questionText: q.questionText,
        answered: q.answered,
      }));
      updated.questionQueue = [...bundleQs, ...existingInlineQs];

      const unansweredCount = queue.filter(q => !q.answered).length;
      events.push({
        type: "QUEUE_BUILT",
        severity: "info",
        message: `${queue.length} questions queued (${unansweredCount} unanswered) from bundles: ${bundleIds.join(", ")}`,
      });

      if (unansweredCount > 0 && updated.routing.state === "INTAKE_PENDING") {
        updated.routing = { ...updated.routing, state: "CORE_QS_PENDING" };
      }
    } catch (err: any) {
      events.push({
        type: "QUEUE_ERROR",
        severity: "warn",
        message: `Failed to build question queue: ${err.message}`,
      });
    }
  }

  // ── Win 14 Gate 1: Ontology Intake Firewall ─────────────────────────────────
  // Validates the case structure BEFORE any LLM call.
  // Blocks malformed/unsafe cases, enriches all downstream consumers via _ont.
  const _caseDocForOntology = {
    caseId:    (updated as any).caseId ?? (updated as any).sessionId ?? "unknown",
    complaint: updated.normalizedComplaint ?? updated.chiefComplaint,
    triage:    (updated as any).triage,
    source:    (updated as any).source,
    answers:   { structured: (updated.answers as any) ?? {} },
  };
  try {
    const intakeGate = await OntologyFirewall.guardIntake(_caseDocForOntology);
    if (intakeGate.blocked) {
      events.push({
        type:     "ONTOLOGY_INTAKE_BLOCKED",
        severity: "warn",
        message:  `Ontology Gate 1 blocked: ${intakeGate.reason}`,
      });
      // Degrade gracefully — log the violation but continue pipeline
    } else {
      if (intakeGate.warnings.length > 0) {
        (updated as any).ontologyWarnings = intakeGate.warnings;
      }
    }
    // Enrich with canonical _ont fields — available to all downstream consumers
    const _enriched = OntologyFieldMapper.enrichCaseDoc(_caseDocForOntology);
    (updated as any)._ont = _enriched._ont;
    events.push({
      type:     "ONTOLOGY_GATE1_PASSED",
      severity: "info",
      message:  `Ontology: disposition=${_enriched._ont.disposition ?? "unset"}, complaint=${_enriched._ont.complaintSlug ?? "undifferentiated"}, urgency=${_enriched._ont.urgencyLevel}`,
    });
  } catch (ontGate1Err: any) {
    events.push({
      type:     "ONTOLOGY_GATE1_ERROR",
      severity: "warn",
      message:  `ontologyFirewall.guardIntake threw: ${ontGate1Err.message}`,
    });
  }

  // ─── CLINICAL BRAIN ENGINE ────────────────────────────────────────────────
  // G3: create AgentState here so enforceAgentCaps guards every LLM call below.
  const caseIdForHarness = (updated as any).caseId ?? (updated as any).sessionId ?? "unknown";
  let agentState = createAgentState(caseIdForHarness);

  try {
    const differentialCandidates = updated.activeClusters.map((id) => ({ clusterId: id, score: 1 }));
    const availableQuestions = updated.questionQueue
      .filter((q) => !q.answered)
      .map((q) => q.questionId);

    // ── Harness Addition 3: inject EHR clinical context before LLM call ──
    // GP-05: EHR wins for medications/allergies; LOW_CONTEXT flagged if absent.
    let harnessContext: Awaited<ReturnType<typeof buildClinicalContext>> | null = null;
    try {
      harnessContext = await buildClinicalContext(
        {
          caseId:    (updated as any).caseId ?? (updated as any).sessionId ?? "unknown",
          complaint: updated.normalizedComplaint ?? updated.chiefComplaint,
          answers:   { structured: {
            age:         updated.demographics?.age,
            sex:         updated.demographics?.sex,
            medications: updated.modifiers?.meds      ?? [],
            allergies:   updated.modifiers?.allergies ?? [],
            conditions:  updated.modifiers?.pmh       ?? [],
          }},
        },
        { ehrVendor: "mock" }   // real vendor + token injected when FHIR token is present
      );
      (updated as any).harnessContext = harnessContext;
      events.push({
        type:     "HARNESS_CONTEXT_INJECTED",
        severity: "info",
        message:  `Harness context: level=${harnessContext.dataQuality.contextLevel}, meds=${harnessContext.medications.length}, allergies=${harnessContext.allergies.length}`,
      });
    } catch (harnessErr: any) {
      events.push({
        type:     "HARNESS_CONTEXT_ERROR",
        severity: "warn",
        message:  `buildClinicalContext failed: ${harnessErr.message}`,
      });
    }

    // ── Win 15: Clinical Skills — Tier 1 memory injection ────────────────────
    // Retrieve active physician-approved playbooks for this complaint slug
    // and prepend them to the system prompt so the LLM applies learned corrections.
    try {
      const complaintSlug = (updated as any)._ont?.complaintSlug ?? updated.normalizedComplaint ?? "";
      if (complaintSlug) {
        const skillResult = await retrieveRelevantSkills(complaintSlug, 3)
          .catch(() => ({ skills: [], promptInjection: "", tokenEstimate: 0 }));

        if (skillResult.promptInjection) {
          (updated as any).systemPromptAdditions = [
            ...((updated as any).systemPromptAdditions ?? []),
            skillResult.promptInjection,
          ];
          events.push({
            type:     "SKILLS_INJECTED",
            severity: "info",
            message:  `${skillResult.skills.length} clinical skills injected (~${skillResult.tokenEstimate} tokens) for complaint: ${complaintSlug}`,
          });
        }
      }
    } catch (skillErr: any) {
      events.push({
        type:     "SKILLS_INJECTION_ERROR",
        severity: "warn",
        message:  `retrieveRelevantSkills failed: ${skillErr.message}`,
      });
    }

    // ── Win 12: Geometric Reasoning — runs before LLM proposal ───────────────
    // Geometry (ClinicalKnowledgeGraph) + Metric (BayesianConfidenceUpdater)
    // produce a promptEnrichment block that is prepended to the system prompt,
    // giving the LLM structured pre-analysis instead of flat symptom text.
    try {
      const complaintSlug = updated.normalizedComplaint ?? updated.chiefComplaint ?? "";
      const rawAnswers    = (updated.answers as Record<string, any>) ?? {};

      const geoResult = await runGeometricReasoning(
        complaintSlug,
        rawAnswers,
        {
          patientAge:       updated.demographics?.age,
          patientSex:       updated.demographics?.sex,
          knownMedications: updated.modifiers?.meds      ?? [],
          knownConditions:  updated.modifiers?.pmh       ?? [],
        }
      );

      (updated as any).geometricReasoning = geoResult;

      // Inject prompt enrichment so runClinicalBrain receives pre-structured analysis
      if (!(updated as any).systemPromptAdditions) {
        (updated as any).systemPromptAdditions = [];
      }
      (updated as any).systemPromptAdditions.push(geoResult.promptEnrichment);

      events.push({
        type:     "GEOMETRIC_REASONING_INJECTED",
        severity: "info",
        message:  `GeoReasoning: combined=${Math.round(geoResult.combinedConfidence * 100)}%, ` +
                  `redFlags=${geoResult.redFlagSignals.length}, ` +
                  `clusters=${geoResult.graphAnalysis.activatedClusters.length}, ` +
                  `topDx=${geoResult.beliefState.topDiagnosis?.diagnosis ?? "none"}`,
      });
    } catch (geoErr: any) {
      events.push({
        type:     "GEOMETRIC_REASONING_ERROR",
        severity: "warn",
        message:  `runGeometricReasoning failed: ${geoErr.message}`,
      });
    }

    // ── G3: enforce caps before the expensive Opus LLM call ──────────────────
    enforceAgentCaps(agentState);

    const brainOutput = await runClinicalBrain({
      complaint: updated.chiefComplaint ?? updated.normalizedComplaint ?? "",
      answers: updated.answers || {},
      state: updated,  // harnessContext is now on updated.harnessContext
      differentialCandidates,
      availableQuestions,
    });

    // Track LLM call: clinical_brain uses Claude Opus (~$0.08/call at typical token load)
    agentState = incrementLlmCall(agentState, 0.08);

    if (brainOutput.similarity)              updated.similarity               = brainOutput.similarity;
    if (brainOutput.memoryCases)             updated.memoryCases              = brainOutput.memoryCases;
    if (brainOutput.differentials)           updated.differentials            = brainOutput.differentials;
    if (brainOutput.evidenceResults)         updated.evidenceResults          = brainOutput.evidenceResults;
    if (brainOutput.aggregatedDifferentials) updated.aggregatedDifferentials  = brainOutput.aggregatedDifferentials;
    if (brainOutput.contradictions)          updated.contradictions           = brainOutput.contradictions;
    if (brainOutput.governance)              updated.governance               = brainOutput.governance;
    if (brainOutput.temporal)               updated.temporal                 = brainOutput.temporal;
    if (brainOutput.risk)                   updated.risk                     = brainOutput.risk;
    if (brainOutput.guideline)              updated.guideline                = brainOutput.guideline;
    if (brainOutput.physicianPacket)        updated.physicianPacket          = brainOutput.physicianPacket;
    if (brainOutput.completeness)           updated.completeness             = brainOutput.completeness;
    if (brainOutput.testYield)              updated.testYield                = brainOutput.testYield;
    if (brainOutput.medicationSafety)       updated.medicationSafety         = brainOutput.medicationSafety;
    if (brainOutput.calibration)            updated.calibration              = brainOutput.calibration;
    if (brainOutput.feedbackStats)          updated.feedbackStats            = brainOutput.feedbackStats;
    if (brainOutput.severity)              updated.severity                 = brainOutput.severity;
    if (brainOutput.routedComplaints)      updated.routedComplaints         = brainOutput.routedComplaints;
    if (brainOutput.protocolVariance)      updated.protocolVariance         = brainOutput.protocolVariance;
    if (brainOutput.diagnosticDrift)       updated.diagnosticDrift          = brainOutput.diagnosticDrift;
    if (brainOutput.unifiedGovernance)     updated.unifiedGovernance        = brainOutput.unifiedGovernance;
    if (brainOutput.nextQuestion !== undefined) updated.nextBestQuestion = brainOutput.nextQuestion;
    if (brainOutput.questionRankings)     updated.questionRankings      = brainOutput.questionRankings;
    if (brainOutput.redFlags?.length)     updated.redFlags = [...new Set([...updated.redFlags, ...brainOutput.redFlags])];
    if (brainOutput.disposition)          updated.disposition           = brainOutput.disposition;
    if (brainOutput.uncertainty)          updated.clinicalUncertainty   = brainOutput.uncertainty;
    if (brainOutput.normalizedSymptoms)   updated.normalizedSymptoms    = brainOutput.normalizedSymptoms;
    if (brainOutput.safetyGuardTrigger !== undefined) updated.safetyGuardTrigger = brainOutput.safetyGuardTrigger;
    if (brainOutput.treatments)           updated.treatments            = brainOutput.treatments;
    if (brainOutput.tests)                updated.tests                 = brainOutput.tests;
    if (brainOutput.returnPrecautions)    updated.returnPrecautions     = brainOutput.returnPrecautions;

    events.push({
      type: "CLINICAL_BRAIN_COMPLETE",
      severity: "info",
      message: `Brain: ${brainOutput.differentials?.length ?? 0} differentials, disposition=${brainOutput.disposition ?? "none"}, nextQ=${brainOutput.nextQuestion ?? "none"}`,
    });

    // ── Win 14 Gate 2: Ontology Triage Output Firewall ─────────────────────
    // Catches ontologically impossible AI outputs before the physician sees them.
    // Key rule: red flag + SELF_CARE disposition is a hard violation → force URGENT_CARE.
    try {
      const triageGate = await OntologyFirewall.guardTriageOutput({
        caseId:       _caseDocForOntology.caseId,
        disposition:  brainOutput.disposition ?? "self_care",
        confidence:   brainOutput.calibration?.confidence ?? 0.5,
        topDiagnosis: brainOutput.differentials?.[0]?.diagnosis
                      ?? brainOutput.aggregatedDifferentials?.[0]?.diagnosis
                      ?? "",
        redFlagFired: (brainOutput as any).redFlagFired ?? false,
        redFlags:     (brainOutput as any).redFlags ?? [],
        differential: brainOutput.differentials ?? brainOutput.aggregatedDifferentials ?? [],
      });
      if (triageGate.blocked) {
        events.push({
          type:     "ONTOLOGY_TRIAGE_BLOCKED",
          severity: "warn",
          message:  `Triage Gate 2 blocked: ${triageGate.reason} — forced URGENT_CARE`,
        });
        brainOutput.disposition = "urgent_care";
        (updated as any).triageOntologyViolation = triageGate.reason;
      } else if (triageGate.warnings.length > 0) {
        (updated as any).triageOntologyWarnings = triageGate.warnings;
        events.push({
          type:     "ONTOLOGY_TRIAGE_WARNINGS",
          severity: "info",
          message:  `Triage Gate 2 warnings: ${triageGate.warnings.join(" | ")}`,
        });
      }
    } catch (ontGate2Err: any) {
      events.push({
        type:     "ONTOLOGY_GATE2_ERROR",
        severity: "warn",
        message:  `ontologyFirewall.guardTriageOutput threw: ${ontGate2Err.message}`,
      });
    }

    // ── Rec 4: Dual-Model Uncertainty Sampling ─────────────────────────────
    // Runs a second LLM call at different temperature when primary confidence
    // is in the 40-75% uncertainty zone. Surfaces LOW_AGREEMENT / CRITICAL_DIVERGENCE
    // flags to the physician BEFORE they open the case.
    try {
      const primaryConf    = typeof brainOutput.calibration?.confidence === "number"
        ? brainOutput.calibration.confidence
        : 0.50;
      const primaryTopDx   = brainOutput.differentials?.[0]?.diagnosis
        ?? brainOutput.aggregatedDifferentials?.[0]?.diagnosis
        ?? "Unknown";
      const primaryDisp    = brainOutput.disposition ?? "routine_urgent";
      const primaryDiff    = brainOutput.differentials ?? brainOutput.aggregatedDifferentials ?? [];

      const caseIdForAudit = (updated as any).caseId ?? (updated as any).sessionId ?? "unknown";
      const complaintSlug  = updated.normalizedComplaint ?? updated.chiefComplaint ?? "";
      const systemPrompt   = `You are a clinical AI triage system. Analyze the patient presentation and return a structured differential assessment. Be conservative and flag any red flags or high-urgency conditions.`;

      // ── G3: enforce caps before the Sonnet uncertainty LLM call ─────────────
      enforceAgentCaps(agentState);

      const uncertainty = await assessUncertainty(
        { topDiagnosis: primaryTopDx, confidence: primaryConf, disposition: primaryDisp, differential: primaryDiff },
        { caseId: caseIdForAudit, complaint: { slug: complaintSlug }, answers: { structured: (updated.answers as any) ?? {} } },
        systemPrompt
      );

      // Track LLM call: uncertainty_sampler uses Claude Sonnet (~$0.01/call)
      agentState = incrementLlmCall(agentState, 0.01);

      (updated as any).uncertaintyAssessment = uncertainty;

      events.push({
        type:     "UNCERTAINTY_SAMPLED",
        severity: uncertainty.flag === "CRITICAL_DIVERGENCE" ? "warn" : "info",
        message:  `Uncertainty: flag=${uncertainty.flag}, divergence=${Math.round(uncertainty.divergenceScore * 100)}%, applied=${uncertainty.samplingApplied}`,
      });
    } catch (uncertErr: any) {
      events.push({
        type:     "UNCERTAINTY_SAMPLING_ERROR",
        severity: "warn",
        message:  `assessUncertainty failed: ${uncertErr.message}`,
      });
    }
  } catch (err: any) {
    if (err instanceof HarnessCapExceeded) {
      // G3: cap breached — route to mandatory physician review, never self-care
      events.push({
        type:     "HARNESS_CAP_EXCEEDED",
        severity: "error",
        message:  `Safety cap breached (${err.cap}: ${err.value}/${err.limit}) — routed to physician review`,
      });
      updated.routing = { ...updated.routing, state: "PHYSICIAN_REVIEW_REQUIRED" };
      // Ensure disposition is not self_care when caps breach
      if ((updated as any).disposition === "self_care" || !(updated as any).disposition) {
        (updated as any).disposition = "urgent_care";
      }
    } else {
      events.push({
        type:     "CLINICAL_BRAIN_ERROR",
        severity: "warn",
        message:  `Clinical brain failed: ${err.message}`,
      });
    }
  }

  if (!updated.redFlagGate || !updated.redFlagGate.evaluated) {
    const liveFlags2 = detectRedFlags(updated);
    if (liveFlags2.length > 0) {
      updated.redFlags = [...new Set([...updated.redFlags, ...liveFlags2])];
    }
  }

  const supervisorDecision = enhancedSupervisorGate(updated);
  if (!supervisorDecision.allow && supervisorDecision.forceState) {
    if (supervisorDecision.forceState === "EMERGENT_ESCALATION") {
      updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
      events.push({
        type: "SUPERVISOR_BLOCK",
        severity: "error",
        message: supervisorDecision.reason,
      });
    }
  }

  return { state: updated, events, routerEntry };
}
