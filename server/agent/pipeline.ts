import type { CaseState, AgentRunConfig } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import { normalizeChiefComplaint, normalizeSystem } from "../data/canonicalKeys";
import { getRouterEntryByComplaint, type RouterEntry } from "../services/complaintRouter";
import { getQuestionsForBundles, buildQuestionQueue, type QueueEntry } from "../services/questionQueue";
import { getRulesForContext, executeRules, applyRuleActions, type RuleAction } from "../services/rulesEngine";
import { getModifiersForSet, applyFhirPrefill, computeModifierSummary } from "../services/modifiers";
import { enhancedSupervisorGate } from "../services/supervisorEnhanced";
import { fetchFhirPrefill, buildPrefillFromManualEntry } from "../services/fhirPrefill";
import { registerDynamicQuestion } from "./router";

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

  if (bundleIds.length > 0) {
    try {
      const secondaryQs = await getQuestionsForBundles(bundleIds);
      const answeredIds = new Set(Object.keys(updated.answers));
      const queue = buildQuestionQueue(secondaryQs, answeredIds);

      for (const qEntry of queue) {
        registerDynamicQuestion(qEntry.questionId, qEntry.questionText);
      }

      updated.questionQueue = queue.map(q => ({
        questionId: q.questionId,
        bundleId: q.bundleId,
        askOrder: q.askOrder,
        isRedFlag: q.isRedFlag,
        questionText: q.questionText,
        answered: q.answered,
      }));

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
