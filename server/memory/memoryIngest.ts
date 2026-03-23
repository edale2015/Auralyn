import { addNode, addEdge, MemoryNode } from "./memoryGraph";

export interface ClinicalCaseIngestInput {
  patientId: string;
  complaints: string[];
  triage: string;
  riskScore: number;
  recommendedActions: string[];
  decision?: Record<string, any>;
  outcome?: "correct" | "incorrect" | "unknown";
  roboticActionsTriggered?: string[];
  guardrailWarnings?: string[];
}

export function logClinicalCase(input: ClinicalCaseIngestInput): { patientNodeId: string; decisionNodeId: string } {
  const now = new Date().toISOString();

  const patientNode = addNode({
    type: "patient",
    label: `Patient ${input.patientId}`,
    data: {
      patientId: input.patientId,
      complaints: input.complaints,
      triage: input.triage,
      riskScore: input.riskScore,
    },
    tags: input.complaints,
  });

  const decisionNode = addNode({
    type: "decision",
    label: `Decision: ${input.triage}`,
    data: {
      triage: input.triage,
      riskScore: input.riskScore,
      recommendedActions: input.recommendedActions,
      ...(input.decision ?? {}),
    },
    tags: [input.triage],
  });

  addEdge({ from: patientNode.id, to: decisionNode.id, relation: "led_to" });

  if (input.outcome) {
    const outcomeNode = addNode({
      type: "outcome",
      label: `Outcome: ${input.outcome}`,
      data: { outcome: input.outcome, patientId: input.patientId },
      tags: [input.outcome],
    });
    addEdge({ from: decisionNode.id, to: outcomeNode.id, relation: "resulted_in" });
  }

  for (const action of input.roboticActionsTriggered ?? []) {
    const robotNode = addNode({
      type: "robot_action",
      label: `Robotic: ${action}`,
      data: { action, patientId: input.patientId, triggeredAt: now },
      tags: ["robotic"],
    });
    addEdge({ from: decisionNode.id, to: robotNode.id, relation: "triggered" });
  }

  for (const warning of input.guardrailWarnings ?? []) {
    const eventNode = addNode({
      type: "event",
      label: `Guardrail warning`,
      data: { warning, patientId: input.patientId, at: now },
      tags: ["guardrail", "warning"],
    });
    addEdge({ from: patientNode.id, to: eventNode.id, relation: "flagged" });
  }

  return { patientNodeId: patientNode.id, decisionNodeId: decisionNode.id };
}

export function logRobotAction(patientId: string, action: string, result: Record<string, any>) {
  const robotNode = addNode({
    type: "robot_action",
    label: `Robotic: ${action}`,
    data: { action, patientId, result, at: new Date().toISOString() },
    tags: ["robotic", action],
  });
  return robotNode;
}

export function logError(source: string, message: string, context?: Record<string, any>) {
  const errorNode = addNode({
    type: "error",
    label: `Error: ${source}`,
    data: { source, message, context, at: new Date().toISOString() },
    tags: ["error", source],
  });
  return errorNode;
}
