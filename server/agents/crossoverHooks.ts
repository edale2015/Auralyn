import type { CaseState } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import { runObesityAgent, type ObesityAgentResult } from "./obesity/obesityAgent";
import { selectSpotInterventions, type UCSpotResult } from "../services/urgentCareSpotInterventions";
import { evaluateRedFlagsMaster, type RedFlagGateResult } from "../services/redFlagsMaster";

export interface CrossoverResult {
  state: CaseState;
  events: TraceEvent[];
  redFlagGate: RedFlagGateResult;
  ucSpotResult: UCSpotResult;
  obesityResult: ObesityAgentResult | null;
  bundlesAdded: string[];
  mergeOrder: string[];
}

export async function runCrossoverHooks(
  state: CaseState
): Promise<CrossoverResult> {
  const events: TraceEvent[] = [];
  let updated = { ...state };
  const bundlesAdded: string[] = [];
  const mergeOrder: string[] = [];

  const redFlagGate = await evaluateRedFlagsMaster(updated);
  updated.redFlagGate = {
    evaluated: redFlagGate.evaluated,
    flagsFound: redFlagGate.flagsFound,
    gateResult: redFlagGate.gateResult,
  };

  if (redFlagGate.flagsFound.length > 0) {
    mergeOrder.push("RED_FLAGS");
    updated.redFlags = [
      ...new Set([
        ...updated.redFlags,
        ...redFlagGate.flagsFound.map(f => f.flagId),
      ]),
    ];
    events.push({
      type: "RED_FLAG_GATE",
      severity: "error",
      message: `Red flag gate: ${redFlagGate.gateResult} — ${redFlagGate.flagsFound.map(f => f.flagId).join(", ")}`,
    });
  } else {
    events.push({
      type: "RED_FLAG_GATE",
      severity: "info",
      message: "Red flag gate: PASS — no flags detected",
    });
  }

  if (redFlagGate.gateResult === "ER_SEND") {
    updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
    events.push({
      type: "RED_FLAG_GATE_ER_SEND",
      severity: "error",
      message: "Red flag gate forced EMERGENT_ESCALATION — skipping counseling agents",
    });

    return {
      state: updated,
      events,
      redFlagGate,
      ucSpotResult: { selected: [], skipped: [], source: "skipped_due_to_er_send" },
      obesityResult: null,
      bundlesAdded,
      mergeOrder,
    };
  }

  const shouldRunObesity = shouldTriggerObesity(updated);

  const [ucSpotResult, obesityResult] = await Promise.all([
    selectSpotInterventions(updated),
    shouldRunObesity
      ? runObesityAgent(updated).catch((err: any): ObesityAgentResult => {
          events.push({ type: "OBESITY_AGENT_ERROR", severity: "warn", message: `Obesity agent failed: ${err.message}` });
          return {
            triggered: false,
            entryReasons: [],
            state: updated,
            events: [],
            spotInterventionIds: [],
            bundlesAdded: [],
            rulesEvaluated: 0,
            rulesFired: 0,
          };
        })
      : Promise.resolve(null),
  ]);

  if (ucSpotResult.selected.length > 0) {
    mergeOrder.push("URGENT_CARE_SPOT");
    for (const si of ucSpotResult.selected) {
      if (!updated.spotInterventions.some(existing => existing.interventionId === si.interventionId)) {
        updated.spotInterventions = [
          ...updated.spotInterventions,
          {
            interventionId: si.interventionId,
            contextCondition: si.contextCondition,
            actions: si.actions,
            testsIfAvailable: si.testsIfAvailable,
            doNotDo: si.doNotDo,
            referralWindow: si.referralWindow,
            erTriggers: si.erTriggers,
            source: "UC_SPOT_INTERVENTIONS",
            safetyClass: si.safetyClass as any,
          },
        ];
      }
    }
    events.push({
      type: "UC_SPOT_SELECTED",
      severity: "info",
      message: `${ucSpotResult.selected.length} UC spot interventions selected (${ucSpotResult.skipped.length} skipped). Source: ${ucSpotResult.source}`,
    });
  }

  if (obesityResult && obesityResult.triggered) {
    mergeOrder.push("OBESITY_AGENT");
    updated = obesityResult.state;
    events.push(...obesityResult.events);
    for (const bundle of obesityResult.bundlesAdded) {
      if (!bundlesAdded.includes(bundle)) {
        bundlesAdded.push(bundle);
      }
    }
    events.push({
      type: "CROSSOVER_OBESITY_MERGED",
      severity: "info",
      message: `Obesity agent: ${obesityResult.rulesFired} rules fired, ${obesityResult.spotInterventionIds.length} interventions, ${obesityResult.bundlesAdded.length} bundles`,
    });
  }

  mergeOrder.push("EDUCATION");

  return {
    state: updated,
    events,
    redFlagGate,
    ucSpotResult,
    obesityResult,
    bundlesAdded,
    mergeOrder,
  };
}

function shouldTriggerObesity(state: CaseState): boolean {
  const allMeds = [
    ...(state.fhirPrefill?.meds ?? []),
    ...(state.modifiers?.meds ?? []),
    ...(state.dm?.meds ?? []),
    ...(state.htn?.meds ?? []),
  ].map(m => m.toLowerCase());

  const GLP1_AGENTS = ["semaglutide", "liraglutide", "tirzepatide", "dulaglutide", "exenatide", "ozempic", "wegovy", "mounjaro"];
  const HTN_MEDS = ["lisinopril", "losartan", "amlodipine", "metoprolol", "hydrochlorothiazide"];
  const DM_MEDS = ["metformin", "insulin", "glipizide", "glyburide", "empagliflozin", "dapagliflozin"];
  const BARIATRIC_TERMS = ["bariatric", "gastric bypass", "sleeve gastrectomy", "roux-en-y"];

  if (state.metabolic?.bmi && state.metabolic.bmi >= 25) return true;
  if (state.dm?.hasDM || state.htn?.hasHTN || state.glp1?.agent || state.bariatric?.surgeryType) return true;
  if (allMeds.some(m => GLP1_AGENTS.some(a => m.includes(a)))) return true;
  if (allMeds.some(m => HTN_MEDS.some(a => m.includes(a)))) return true;
  if (allMeds.some(m => DM_MEDS.some(a => m.includes(a)))) return true;

  const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
  if (problems.some(p => p.includes("diabetes") || p.includes("hypertension") || p.includes("obesity") || p.includes("sleep apnea"))) return true;
  if (problems.some(p => BARIATRIC_TERMS.some(t => p.includes(t)))) return true;

  const cc = (state.chiefComplaint || "").toLowerCase();
  if (cc.includes("weight") || cc.includes("bmi") || cc.includes("diabetes") || cc.includes("blood pressure")) return true;

  return false;
}
