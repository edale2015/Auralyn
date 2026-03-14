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

  // ─── CLINICAL BRAIN ENGINE ────────────────────────────────────────────────
  try {
    const differentialCandidates = updated.activeClusters.map((id) => ({ clusterId: id, score: 1 }));
    const availableQuestions = updated.questionQueue
      .filter((q) => !q.answered)
      .map((q) => q.questionId);

    const brainOutput = await runClinicalBrain({
      complaint: updated.chiefComplaint ?? updated.normalizedComplaint ?? "",
      answers: updated.answers || {},
      state: updated,
      differentialCandidates,
      availableQuestions,
    });

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
  } catch (err: any) {
    events.push({
      type: "CLINICAL_BRAIN_ERROR",
      severity: "warn",
      message: `Clinical brain failed: ${err.message}`,
    });
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
