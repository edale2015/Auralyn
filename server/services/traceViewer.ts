import type { CaseState } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";

export interface TraceTimeline {
  scenarioId: string;
  timestamp: string;
  steps: TraceStep[];
}

export interface TraceStep {
  order: number;
  phase: string;
  type: string;
  summary: string;
  details: Record<string, any>;
  evidence?: string[];
}

const traceStore = new Map<string, { state: CaseState; events: TraceEvent[]; timestamp: string; pipelineDebug?: Record<string, any> }>();

export function storeTrace(scenarioId: string, state: CaseState, events: TraceEvent[], pipelineDebug?: Record<string, any>): void {
  traceStore.set(scenarioId, {
    state: JSON.parse(JSON.stringify(state)),
    events: [...events],
    timestamp: new Date().toISOString(),
    pipelineDebug,
  });

  if (traceStore.size > 200) {
    const keys = [...traceStore.keys()];
    for (let i = 0; i < keys.length - 200; i++) {
      traceStore.delete(keys[i]);
    }
  }
}

export function getStoredTraceIds(): string[] {
  return [...traceStore.keys()];
}

export function buildTraceTimeline(scenarioId: string): TraceTimeline | null {
  const stored = traceStore.get(scenarioId);
  if (!stored) return null;

  const { state, events, timestamp, pipelineDebug } = stored;
  const steps: TraceStep[] = [];
  let order = 0;

  steps.push({
    order: order++,
    phase: "INPUT",
    type: "CASE_INIT",
    summary: `Chief complaint: "${state.chiefComplaint}"`,
    details: {
      chiefComplaint: state.chiefComplaint,
      demographics: state.demographics,
      meds: state.modifiers?.meds ?? [],
      allergies: state.modifiers?.allergies ?? [],
      pmh: state.modifiers?.pmh ?? [],
      dm: state.dm,
      htn: state.htn,
      glp1: state.glp1,
      bariatric: state.bariatric,
      social: state.social,
    },
  });

  if (state.clinicalStateTrace) {
    const cst = state.clinicalStateTrace;
    steps.push({
      order: order++,
      phase: "CLINICAL_STATE",
      type: "MED_NORMALIZATION",
      summary: `${cst.normalizedMeds.length} medications normalized into ${cst.medGroups.length} groups`,
      details: {
        normalizedMeds: cst.normalizedMeds,
        medGroups: cst.medGroups,
      },
      evidence: cst.normalizedMeds.map(m => `${m.name} (${m.source})`),
    });

    if (cst.inferredConditions.length > 0) {
      steps.push({
        order: order++,
        phase: "CLINICAL_STATE",
        type: "CONDITION_INFERENCE",
        summary: `${cst.inferredConditions.length} conditions inferred from medications/rules`,
        details: { inferredConditions: cst.inferredConditions },
        evidence: cst.inferredConditions.flatMap(c => c.evidence),
      });
    }

    if (cst.confirmedProblems.length > 0) {
      steps.push({
        order: order++,
        phase: "CLINICAL_STATE",
        type: "CONFIRMED_PROBLEMS",
        summary: `${cst.confirmedProblems.length} confirmed problems from PMH/FHIR`,
        details: { confirmedProblems: cst.confirmedProblems },
      });
    }

    if (cst.riskFlags.length > 0) {
      steps.push({
        order: order++,
        phase: "CLINICAL_STATE",
        type: "RISK_FLAGS",
        summary: `${cst.riskFlags.length} risk flags identified`,
        details: { riskFlags: cst.riskFlags },
      });
    }

    steps.push({
      order: order++,
      phase: "CLINICAL_STATE",
      type: "TABLES_QUERIED",
      summary: `${cst.tablesQueried.length} tables queried in ${cst.buildDurationMs}ms`,
      details: { tablesQueried: cst.tablesQueried, buildDurationMs: cst.buildDurationMs },
    });
  }

  if (state.confidence) {
    steps.push({
      order: order++,
      phase: "CONFIDENCE",
      type: "CONFIDENCE_SCORING",
      summary: `Global confidence: ${state.confidence.global} (${state.confidence.by_inference.length} inferences)`,
      details: {
        global: state.confidence.global,
        by_inference: state.confidence.by_inference,
      },
      evidence: state.confidence.by_inference.flatMap(i => i.evidence),
    });
  }

  if (state.redFlagGate) {
    steps.push({
      order: order++,
      phase: "RED_FLAG_GATE",
      type: "RED_FLAG_EVALUATION",
      summary: `Gate result: ${state.redFlagGate.gateResult} — ${state.redFlagGate.flagsFound.length} flags found`,
      details: {
        gateResult: state.redFlagGate.gateResult,
        flagsFound: state.redFlagGate.flagsFound,
      },
      evidence: state.redFlagGate.flagsFound.map(f => `${f.flagId}: ${f.reasons.join(", ")} (${f.source})`),
    });
  }

  if (state.spotInterventions.length > 0) {
    const ucSpots = state.spotInterventions.filter(s => s.source === "UC_SPOT_INTERVENTIONS");
    const obesitySpots = state.spotInterventions.filter(s => s.source === "OBESITY_AGENT");
    
    if (ucSpots.length > 0) {
      steps.push({
        order: order++,
        phase: "UC_INTERVENTIONS",
        type: "UC_SPOT_SELECTED",
        summary: `${ucSpots.length} UC spot interventions selected`,
        details: { interventions: ucSpots },
        evidence: ucSpots.map(s => `${s.interventionId}: ${s.contextCondition}`),
      });
    }

    if (obesitySpots.length > 0) {
      steps.push({
        order: order++,
        phase: "OBESITY_AGENT",
        type: "OBESITY_INTERVENTIONS",
        summary: `${obesitySpots.length} obesity agent interventions`,
        details: { interventions: obesitySpots },
      });
    }
  }

  const obesityEvents = events.filter(e =>
    e.type === "OBESITY_AGENT_TRIGGERED" || e.type === "CROSSOVER_OBESITY_MERGED" || e.type === "OBESITY_AGENT_COMPLETE"
  );
  if (obesityEvents.length > 0) {
    steps.push({
      order: order++,
      phase: "OBESITY_AGENT",
      type: "OBESITY_AGENT_EXECUTION",
      summary: obesityEvents.map(e => e.message).join("; "),
      details: {
        dm: state.dm,
        htn: state.htn,
        glp1: state.glp1,
        metabolic: state.metabolic,
        events: obesityEvents,
      },
    });
  }

  if (state.careGaps && state.careGaps.length > 0) {
    steps.push({
      order: order++,
      phase: "CARE_GAPS",
      type: "CARE_GAP_EVALUATION",
      summary: `${state.careGaps.length} care gaps identified`,
      details: { careGaps: state.careGaps },
      evidence: state.careGaps.map(g => `${g.gap_id} (${g.severity}): ${g.recommended_action}`),
    });
  }

  steps.push({
    order: order++,
    phase: "FINAL_OUTPUT",
    type: "MERGE_AND_ROUTING",
    summary: `Routing: ${state.routing.state}, Red flags: ${state.redFlags.length}, Disposition: ${state.disposition ?? "pending"}`,
    details: {
      routing: state.routing,
      redFlags: state.redFlags,
      disposition: state.disposition,
      activeClusters: state.activeClusters,
      ruleTrace: state.ruleTrace,
    },
  });

  return { scenarioId, timestamp, steps };
}
