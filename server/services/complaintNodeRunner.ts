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
import { enhancedSupervisorGate } from "./supervisorEnhanced";

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
    DISPOSITION_RULES: "OUTPUT_COMPOSE",
    OUTPUT_COMPOSE: "DONE",
  },
};

const GRAPH_REGISTRY: Record<string, GraphDefinition> = {
  ST_GRAPH_V1: SORE_THROAT_GRAPH,
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

  if (state.redFlagGate?.gateResult === "ER_SEND") return "DISPOSITION_RULES";

  const hasScores = Object.keys(state.scores).length > 0;
  if (!hasScores) return "SCORING";

  if (!state.disposition) return "DISPOSITION_RULES";

  return "OUTPUT_COMPOSE";
}

export async function runComplaintGraph(
  state: CaseState,
  ccId: string,
  maxNodes: number = 20
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

  const graphId = config.registry.graphId;
  let updated = { ...state };
  const events: TraceEvent[] = [];
  const nodeTraces: NodeTrace[] = [];
  let iterations = 0;

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

        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: rfResult.gateResult === "PASS" ? "info" : "warn", message: `[RED_FLAG_GATE] ${rfResult.gateResult} — ${rfResult.triggeredFlags.length} flags (${rfResult.anySeverity})` });

        if (rfResult.gateResult === "ER_SEND") {
          updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
          currentNode = "DISPOSITION_RULES";
          trace.durationMs = Date.now() - nodeStart;
          nodeTraces.push(trace);
          continue;
        }
        break;
      }

      case "SCORING": {
        const scoreResult = runScoring(updated, config);
        trace.inputsUsed = config.scoringDefs.flatMap(d => d.inputs);
        trace.ruleRefs = config.scoringDefs.map(d => d.scoreId);
        trace.outputs = {
          scores: scoreResult.scores,
          components: scoreResult.components,
          missingInputs: scoreResult.missingInputs,
        };

        updated.scores = { ...updated.scores, ...scoreResult.scores };
        events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[SCORING] ${Object.entries(scoreResult.scores).map(([k, v]) => `${k}=${v}`).join(", ")}` });
        break;
      }

      case "TESTING_DECISION": {
        const centor = updated.scores?.centor;
        const actions: CaseState["recommendedActions"] = [];

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

        updated.recommendedActions = [...updated.recommendedActions, ...actions];
        trace.inputsUsed = ["scores.centor"];
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
