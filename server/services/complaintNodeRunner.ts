import type { CaseState, AgentAction } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import type { ComplaintConfig } from "./complaintConfigLoader";
import { loadComplaintConfig } from "./complaintConfigLoader";
import {
  runCoreQuestions,
  runRedFlagsComplaint,
  runScoring,
  runDisposition,
  renderTemplate,
  findTemplate,
} from "./complaintEngines";
import { runGenericComplaintV1 } from "../engines/genericComplaintEngineV1";
import { enhancedSupervisorGate } from "./supervisorEnhanced";
import { applyExamOverrides } from "./nodes/examOverride";
import { runDiffAndConfidenceNode } from "./nodes/diffAndConfidenceNode";
import { joinRedFlagsToMaster } from "./nodes/redFlagMasterJoin";
import { addSpotInterventions } from "./nodes/spotInterventionsNode";
import { runSpecialistCouncilNode } from "./nodes/specialistCouncilNode";
import type { CouncilLLM } from "./nodes/specialistCouncilNode";

export type NodeId =
  | "INIT_CASE"
  | "MODIFIERS_INTAKE"
  | "CC_NORMALIZE"
  | "CORE_QUESTIONS"
  | "RED_FLAG_GATE"
  | "SCORING"
  | "TESTING_DECISION"
  | "DIFF_AND_CONFIDENCE"
  | "DISPOSITION_RULES"
  | "SPECIALIST_COUNCIL"
  | "OUTPUT_COMPOSE"
  | "DONE";

export const REQUIRED_GRAPH_NODES: NodeId[] = [
  "CORE_QUESTIONS",
  "RED_FLAG_GATE",
  "SCORING",
  "DISPOSITION_RULES",
];

export interface NodeExecutionResult {
  nodeId: NodeId;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface NodeTrace {
  nodeId: NodeId;
  inputsUsed: string[];
  outputs: Record<string, any>;
  ruleRefs: string[];
  llmCalls: number;
  confidence?: string;
  durationMs: number;
}

export interface GraphResult {
  state: CaseState;
  events: TraceEvent[];
  nodeTraces: NodeTrace[];
  currentNode: NodeId;
  pendingAction?: AgentAction;
  done: boolean;
}

interface GraphDefinition {
  nodes: NodeId[];
  transitions: Record<string, NodeId>;
}

const SORE_THROAT_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE",
    "MODIFIERS_INTAKE",
    "CC_NORMALIZE",
    "CORE_QUESTIONS",
    "RED_FLAG_GATE",
    "SCORING",
    "TESTING_DECISION",
    "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE",
    "SPECIALIST_COUNCIL",
    "OUTPUT_COMPOSE",
    "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE",
    MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS",
    CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING",
    SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES",
    DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL",
    SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const EARACHE_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE",
    "MODIFIERS_INTAKE",
    "CC_NORMALIZE",
    "CORE_QUESTIONS",
    "RED_FLAG_GATE",
    "SCORING",
    "TESTING_DECISION",
    "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE",
    "SPECIALIST_COUNCIL",
    "OUTPUT_COMPOSE",
    "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE",
    MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS",
    CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING",
    SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES",
    DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL",
    SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const PERSISTENT_COUGH_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE",
    "MODIFIERS_INTAKE",
    "CC_NORMALIZE",
    "CORE_QUESTIONS",
    "RED_FLAG_GATE",
    "SCORING",
    "TESTING_DECISION",
    "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE",
    "SPECIALIST_COUNCIL",
    "OUTPUT_COMPOSE",
    "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE",
    MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS",
    CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING",
    SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES",
    DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL",
    SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const CHEST_PAIN_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const DIZZINESS_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const ABD_PAIN_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const UTI_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const TESTICULAR_PAIN_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const PELVIC_PAIN_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const HEADACHE_GRAPH: GraphDefinition = {
  nodes: [
    "INIT_CASE", "MODIFIERS_INTAKE", "CC_NORMALIZE", "CORE_QUESTIONS",
    "RED_FLAG_GATE", "SCORING", "TESTING_DECISION", "DISPOSITION_RULES",
    "DIFF_AND_CONFIDENCE", "SPECIALIST_COUNCIL", "OUTPUT_COMPOSE", "DONE",
  ],
  transitions: {
    INIT_CASE: "MODIFIERS_INTAKE", MODIFIERS_INTAKE: "CC_NORMALIZE",
    CC_NORMALIZE: "CORE_QUESTIONS", CORE_QUESTIONS: "RED_FLAG_GATE",
    RED_FLAG_GATE: "SCORING", SCORING: "TESTING_DECISION",
    TESTING_DECISION: "DISPOSITION_RULES", DISPOSITION_RULES: "DIFF_AND_CONFIDENCE",
    DIFF_AND_CONFIDENCE: "SPECIALIST_COUNCIL", SPECIALIST_COUNCIL: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const GRAPH_REGISTRY: Record<string, GraphDefinition> = {
  ST_GRAPH_V1: SORE_THROAT_GRAPH,
  EA_GRAPH_V1: EARACHE_GRAPH,
  PC_GRAPH_V1: PERSISTENT_COUGH_GRAPH,
  CP_GRAPH_V1: CHEST_PAIN_GRAPH,
  DZ_GRAPH_V1: DIZZINESS_GRAPH,
  AP_GRAPH_V1: ABD_PAIN_GRAPH,
  UTI_GRAPH_V1: UTI_GRAPH,
  TP_GRAPH_V1: TESTICULAR_PAIN_GRAPH,
  PP_GRAPH_V1: PELVIC_PAIN_GRAPH,
  HA_GRAPH_V1: HEADACHE_GRAPH,
};

function getNextNode(graphId: string, current: NodeId): NodeId {
  const graph = GRAPH_REGISTRY[graphId];
  if (!graph) return "DONE";
  return (graph.transitions[current] as NodeId) ?? "DONE";
}

function determineCurrentNode(state: CaseState): NodeId {
  if (!state.system) return "INIT_CASE";
  if (!state.normalizedComplaint) return "CC_NORMALIZE";

  const hasQuestionQueue = (state.questionQueue?.length ?? 0) > 0;
  const allQsAnswered = hasQuestionQueue && state.questionQueue.every(q => q.answered);
  const hasNoQueue = !hasQuestionQueue;

  if (state.routing.state === "MORE_INFO_REQUIRED") return "CORE_QUESTIONS";
  if (state.routing.state === "EMERGENT_ESCALATION") return "DONE";
  if (state.routing.state === "REVIEW_REQUIRED") return "DONE";

  if (!state.redFlagGate?.evaluated) {
    if (hasNoQueue || allQsAnswered) return "RED_FLAG_GATE";
    return "CORE_QUESTIONS";
  }

  const hasScores = Object.keys(state.scores).length > 0;
  if (!hasScores) return "SCORING";

  if (!state.disposition) return "DISPOSITION_RULES";

  const s = state as any;
  if (state.disposition && !s.caseConfidence && !s.activeClusters?.length) return "DIFF_AND_CONFIDENCE";

  return "OUTPUT_COMPOSE";
}

const defaultCouncilLLM: CouncilLLM = {
  async callJson(_system: string, _payload: any): Promise<any> {
    return {};
  },
};

export async function runComplaintGraph(
  state: CaseState,
  ccId: string,
  maxNodes: number = 25,
  councilLLM?: CouncilLLM
): Promise<GraphResult> {
  const config = await loadComplaintConfig(ccId);
  if (!config) {
    return {
      state,
      events: [{ type: "COMPLAINT_GRAPH_ERROR", severity: "error", message: `No config for complaint: ${ccId}` }],
      nodeTraces: [],
      currentNode: "INIT_CASE",
      done: false,
    };
  }

  if (config.registry.engineType === "GENERIC_V1") {
    return runGenericComplaintV1(state, ccId, maxNodes);
  }

  const graphId = config.registry.graphId;
  let updated = { ...state };
  const events: TraceEvent[] = [];
  const nodeTraces: NodeTrace[] = [];
  const nodeResults: NodeExecutionResult[] = [];
  let iterations = 0;

  // ── Pre-flight: required-node validation ─────────────────────────────────
  const graph = GRAPH_REGISTRY[graphId];
  if (graph) {
    for (const required of REQUIRED_GRAPH_NODES) {
      if (!graph.nodes.includes(required)) {
        const msg = `[NodeRunner] Required node "${required}" missing from graph "${graphId}" for complaint "${ccId}"`;
        return {
          state,
          events: [{ type: "COMPLAINT_GRAPH_ERROR", severity: "error", message: msg }],
          nodeTraces: [],
          currentNode: "INIT_CASE",
          done: false,
        };
      }
    }
  }

  let currentNode = determineCurrentNode(updated);

  while (currentNode !== "DONE" && iterations < maxNodes) {
    iterations++;
    const nodeStart = Date.now();
    const trace: NodeTrace = {
      nodeId: currentNode,
      inputsUsed: [],
      outputs: {},
      ruleRefs: [],
      llmCalls: 0,
      durationMs: 0,
    };
    const isRequired = REQUIRED_GRAPH_NODES.includes(currentNode);

    try {
    switch (currentNode) {
      case "INIT_CASE": {
        updated.system = config.registry.system;
        updated.normalizedComplaint = config.registry.ccId;
        if (config.registry.defaultCluster && !updated.activeClusters.includes(config.registry.defaultCluster)) {
          updated.activeClusters = [...updated.activeClusters, config.registry.defaultCluster];
        }
        trace.outputs = { system: updated.system, cluster: config.registry.defaultCluster };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[INIT_CASE] System=${config.registry.system}, cluster=${config.registry.defaultCluster}` });
        break;
      }

      case "MODIFIERS_INTAKE": {
        trace.inputsUsed = ["modifiers"];
        trace.outputs = { modifiers: updated.modifiers ?? {} };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[MODIFIERS_INTAKE] allergies=${(updated.modifiers?.allergies ?? []).length}, meds=${(updated.modifiers?.meds ?? []).length}, pmh=${(updated.modifiers?.pmh ?? []).length}` });
        break;
      }

      case "CC_NORMALIZE": {
        trace.inputsUsed = ["chiefComplaint"];
        trace.outputs = { normalized: config.registry.ccId };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[CC_NORMALIZE] ${state.chiefComplaint} → ${config.registry.ccId}` });
        break;
      }

      case "CORE_QUESTIONS": {
        const qResult = runCoreQuestions(updated, config);
        trace.inputsUsed = ["answers"];
        trace.outputs = {
          nextQuestion: qResult.nextQuestion?.qId ?? null,
          allAnswered: qResult.allAnswered,
          requiredMissing: qResult.requiredMissing,
          evaluated: qResult.questionsEvaluated,
        };

        if (qResult.nextQuestion) {
          const questionQueue = config.coreQuestions
            .filter(q => {
              const shouldAsk = true;
              return shouldAsk;
            })
            .map(q => ({
              questionId: q.qId,
              bundleId: `CC_${config.registry.ccId}`,
              askOrder: q.askOrder,
              isRedFlag: false,
              questionText: q.questionText,
              answered: q.qId in (updated.answers ?? {}),
            }));

          updated.questionQueue = questionQueue;
          updated.requiredQuestionIdsMissing = qResult.requiredMissing;

          trace.durationMs = Date.now() - nodeStart;
          nodeTraces.push(trace);
          events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[CORE_QUESTIONS] Next: ${qResult.nextQuestion.qId}, ${qResult.requiredMissing.length} required missing` });

          return {
            state: updated,
            events,
            nodeTraces,
            currentNode,
            pendingAction: {
              type: "ASK_QUESTION",
              questionId: qResult.nextQuestion.qId,
              prompt: qResult.nextQuestion.questionText,
            },
            done: false,
          };
        }

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[CORE_QUESTIONS] All questions answered` });
        break;
      }

      case "RED_FLAG_GATE": {
        const rfResult = runRedFlagsComplaint(updated, config.redFlagRules);
        trace.inputsUsed = ["answers", "modifiers", "demographics"];
        trace.ruleRefs = rfResult.triggeredFlags.map(f => f.rfId);
        trace.outputs = {
          gateResult: rfResult.gateResult,
          flagCount: rfResult.triggeredFlags.length,
          severity: rfResult.anySeverity,
        };

        updated.redFlagGate = {
          evaluated: true,
          flagsFound: rfResult.triggeredFlags.map(f => ({
            flagId: f.rfId,
            label: f.label,
            severity: f.severity,
            action: f.action,
            reasons: [f.rationale],
            immediateActions: f.immediateActions,
            source: "COMPLAINT_RED_FLAG_RULES",
          })),
          gateResult: rfResult.gateResult,
        };
        updated.redFlags = [
          ...new Set([...updated.redFlags, ...rfResult.triggeredFlags.map(f => f.rfId)]),
        ];

        if (rfResult.triggeredFlags.length > 0) {
          try {
            const masterEntries = await joinRedFlagsToMaster(rfResult.triggeredFlags.map(f => f.rfId));
            (updated as any).redFlagMaster = masterEntries;
            trace.ruleRefs.push(...masterEntries.filter(m => m.templateId).map(m => m.templateId));
          } catch (err: any) {
            events.push({ type: "RED_FLAG_MASTER_JOIN_WARN", severity: "warn", message: `Failed to join RED_FLAGS_MASTER: ${err.message}` });
          }
        }

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: rfResult.gateResult === "PASS" ? "info" : "warn", message: `[RED_FLAG_GATE] ${rfResult.gateResult} — ${rfResult.triggeredFlags.length} flags (${rfResult.anySeverity})` });

        if (rfResult.gateResult === "ER_SEND") {
          updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
        }
        break;
      }

      case "SCORING": {
        const overrideResult = applyExamOverrides(updated.answers);
        if (overrideResult.applied) {
          updated.audit = {
            ...updated.audit,
            events: [
              ...(updated.audit?.events ?? []),
              { type: "EXAM_OVERRIDE", severity: "info", message: `Centor exam override applied: ${overrideResult.overrides.join(", ")}` },
            ],
          };
        }

        const scoreResult = runScoring(updated, config);
        trace.inputsUsed = config.scoringDefs.flatMap(d => d.inputs);
        trace.ruleRefs = config.scoringDefs.map(d => d.scoreId);
        trace.outputs = {
          scores: scoreResult.scores,
          components: scoreResult.components,
          missingInputs: scoreResult.missingInputs,
          examOverrideApplied: overrideResult.applied,
        };

        updated.scores = { ...updated.scores, ...scoreResult.scores };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[SCORING] ${Object.entries(scoreResult.scores).map(([k, v]) => `${k}=${v}`).join(", ")}${overrideResult.applied ? " (exam override)" : ""}` });
        break;
      }

      case "TESTING_DECISION": {
        const actions: CaseState["recommendedActions"] = [];
        const cc = updated.normalizedComplaint || "";

        if (cc === "sore_throat") {
          const centor = updated.scores?.centor;
          if (typeof centor === "number") {
            if (centor >= 3) {
              actions.push({ type: "RAPID_STREP_TEST", priority: "high" });
              actions.push({ type: "SAFETY_NET", priority: "high" });
            } else if (centor === 2) {
              actions.push({ type: "RAPID_STREP_TEST", priority: "medium" });
            } else {
              actions.push({ type: "SUPPORTIVE_CARE", priority: "medium" });
            }
          }
          trace.inputsUsed = ["scores.centor"];
        } else if (cc === "earache") {
          const oeScore = updated.scores?.oe_score ?? 0;
          const aomScore = updated.scores?.aom_score ?? 0;
          if (aomScore >= 4) {
            actions.push({ type: "OTOSCOPIC_EXAM", priority: "high" });
            actions.push({ type: "TYMPANOMETRY", priority: "medium" });
          } else if (oeScore >= 4) {
            actions.push({ type: "EAR_CANAL_EXAM", priority: "high" });
          } else {
            actions.push({ type: "SUPPORTIVE_CARE", priority: "medium" });
          }
          trace.inputsUsed = ["scores.oe_score", "scores.aom_score"];
        } else if (cc === "persistent_cough") {
          const peScore = updated.scores?.pe_score ?? 0;
          const asthmaExac = updated.scores?.asthma_exac_score ?? 0;
          const copdExac = updated.scores?.copd_exac_score ?? 0;
          const pneumonia = updated.scores?.pneumonia_score ?? 0;
          if (peScore >= 5) {
            actions.push({ type: "CTA_PULMONARY", priority: "high" });
            actions.push({ type: "D_DIMER", priority: "high" });
            actions.push({ type: "OXYGEN_MONITORING", priority: "high" });
          } else if (peScore >= 3) {
            actions.push({ type: "D_DIMER", priority: "high" });
            actions.push({ type: "CHEST_XRAY", priority: "medium" });
          } else if (copdExac >= 4) {
            actions.push({ type: "PFTS", priority: "high" });
            actions.push({ type: "CHEST_XRAY", priority: "medium" });
          } else if (asthmaExac >= 4) {
            actions.push({ type: "PFTS", priority: "medium" });
            actions.push({ type: "PEAK_FLOW", priority: "medium" });
          } else if (pneumonia >= 4) {
            actions.push({ type: "CHEST_XRAY", priority: "high" });
            actions.push({ type: "CBC", priority: "medium" });
          } else {
            actions.push({ type: "CHEST_XRAY", priority: "medium" });
            actions.push({ type: "SUPPORTIVE_CARE", priority: "medium" });
          }
          trace.inputsUsed = ["scores.pe_score", "scores.asthma_exac_score", "scores.copd_exac_score", "scores.pneumonia_score"];
        } else {
          actions.push({ type: "SUPPORTIVE_CARE", priority: "medium" });
          trace.inputsUsed = ["scores"];
        }

        updated.recommendedActions = [...updated.recommendedActions, ...actions];
        trace.outputs = { actions: actions.map(a => a.type) };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[TESTING_DECISION] ${actions.map(a => a.type).join(", ")}` });
        break;
      }

      case "DISPOSITION_RULES": {
        const dispResult = runDisposition(updated, config.dispositionRules);
        trace.inputsUsed = ["scores", "redFlagGate", "answers"];
        trace.ruleRefs = [dispResult.matchedRuleId];
        trace.outputs = {
          disposition: dispResult.dispositionLevel,
          templateId: dispResult.rationaleTemplateId,
          confidence: dispResult.confidenceHint,
          rulesEvaluated: dispResult.rulesEvaluated,
        };
        trace.confidence = dispResult.confidenceHint;

        updated.disposition = dispResult.dispositionLevel;
        updated.dispositionReasonCodes = [
          ...updated.dispositionReasonCodes,
          dispResult.matchedRuleId,
        ];

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[DISPOSITION_RULES] ${dispResult.dispositionLevel} (rule: ${dispResult.matchedRuleId}, confidence: ${dispResult.confidenceHint})` });
        break;
      }

      case "DIFF_AND_CONFIDENCE": {
        try {
          const diffResult = await runDiffAndConfidenceNode(updated);
          updated = diffResult.updated as typeof updated;

          trace.inputsUsed = ["answers", "scores", "GLOBAL_CLUSTER_MASTER", "CLUSTER_PRIMARY_DIAGNOSIS"];
          trace.outputs = diffResult.outputs;
          trace.ruleRefs = diffResult.ruleRefs;
          trace.confidence = diffResult.confidence;

          const spotResult = await addSpotInterventions(updated);
          if (spotResult.count > 0) {
            trace.outputs.spotInterventions = spotResult.interventionIds;
            trace.ruleRefs.push(...spotResult.interventionIds);
          }

          events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[DIFF_AND_CONFIDENCE] clusters=${(updated as any).activeClusters?.join(",")}, dx=${diffResult.outputs.dxCount}, confidence=${diffResult.confidence}${spotResult.count > 0 ? `, spots=${spotResult.count}` : ""}` });
        } catch (err: any) {
          events.push({ type: "DIFF_AND_CONFIDENCE_ERROR", severity: "warn", message: `DIFF_AND_CONFIDENCE failed: ${err.message}` });
          (updated as any).caseConfidence = "LOW";
        }
        break;
      }

      case "SPECIALIST_COUNCIL": {
        const llm = councilLLM || defaultCouncilLLM;
        const councilResult = await runSpecialistCouncilNode({ state: updated, llm });

        events.push(...councilResult.eventsToAdd);

        trace.inputsUsed = ["answers", "scores", "disposition", "redFlagGate", "activeClusters"];
        trace.outputs = councilResult.outputs;
        trace.ruleRefs = councilResult.ruleRefs;
        trace.llmCalls = councilResult.llmCalls;
        trace.confidence = (updated as any).caseConfidence;

        updated = councilResult.updated as typeof updated;

        if (councilResult.pendingAction) {
          trace.durationMs = Date.now() - nodeStart;
          nodeTraces.push(trace);

          return {
            state: updated,
            events,
            nodeTraces,
            currentNode,
            pendingAction: councilResult.pendingAction,
            done: false,
          };
        }

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[SPECIALIST_COUNCIL] ${councilResult.outputs.skipped ? "skipped" : `invoked, llmCalls=${councilResult.llmCalls}`}` });
        break;
      }

      case "OUTPUT_COMPOSE": {
        const templateId = updated.dispositionReasonCodes.length > 0
          ? config.dispositionRules.find(r => r.dispRuleId === updated.dispositionReasonCodes[updated.dispositionReasonCodes.length - 1])?.rationaleTemplateId
          : undefined;

        let rendered = "";
        if (templateId) {
          const template = findTemplate(config.outputTemplates, templateId);
          if (template) {
            const result = renderTemplate(template, updated);
            rendered = result.rendered;
            trace.ruleRefs = [templateId];
          }
        }

        const supervisorDecision = enhancedSupervisorGate(updated);
        trace.inputsUsed = ["disposition", "dispositionReasonCodes"];
        trace.outputs = {
          templateId: templateId ?? "none",
          rendered: rendered.substring(0, 200),
          supervisorAllow: supervisorDecision.allow,
        };

        if (updated.routing.state !== "EMERGENT_ESCALATION") {
          updated.routing = { ...updated.routing, state: "REVIEW_REQUIRED" };
        }

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[OUTPUT_COMPOSE] Template: ${templateId ?? "none"}, supervisor: ${supervisorDecision.allow ? "ALLOW" : "BLOCK"}` });
        break;
      }

      default: {
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[${currentNode}] No-op node` });
        break;
      }
    }
    // ── Per-node isolation catch ────────────────────────────────────────────
    } catch (nodeErr: any) {
      const errorMsg = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
      nodeResults.push({ nodeId: currentNode, success: false, error: errorMsg, durationMs: Date.now() - nodeStart });

      if (isRequired) {
        events.push({ type: "COMPLAINT_GRAPH_ERROR", severity: "error", message: `[NodeRunner] Required node "${currentNode}" failed: ${errorMsg}` });
        return {
          state: updated,
          events,
          nodeTraces,
          currentNode,
          done: false,
        };
      }

      console.warn(`[NodeRunner] Non-critical node "${currentNode}" failed — continuing:`, errorMsg);
      events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "warn", message: `[NodeRunner] Non-critical node "${currentNode}" failed, skipped: ${errorMsg}` });
      trace.durationMs = Date.now() - nodeStart;
      nodeTraces.push(trace);
      currentNode = getNextNode(graphId, currentNode);
      continue;
    }

    nodeResults.push({ nodeId: currentNode, success: true, durationMs: Date.now() - nodeStart });
    trace.durationMs = Date.now() - nodeStart;
    nodeTraces.push(trace);
    currentNode = getNextNode(graphId, currentNode);
  }

  updated.audit = {
    ...updated.audit,
    steps: [
      ...(updated.audit?.steps ?? []),
      ...nodeTraces.map(t => ({
        node_id: t.nodeId,
        inputs_used: t.inputsUsed,
        outputs: t.outputs,
        rule_refs: t.ruleRefs,
        llm_calls: t.llmCalls,
        confidence: t.confidence,
        duration_ms: t.durationMs,
      })),
    ],
  };

  return {
    state: updated,
    events,
    nodeTraces,
    currentNode,
    done: currentNode === "DONE" || iterations >= maxNodes,
  };
}
