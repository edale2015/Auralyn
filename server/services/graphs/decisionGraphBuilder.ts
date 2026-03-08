export interface GraphNode {
  id: string;
  label: string;
  type: "question" | "decision" | "outcome" | "redFlag";
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

export interface DecisionGraph {
  complaintId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildDecisionGraph(complaintId: string, questions: string[], outcomes: string[]): DecisionGraph {
  const nodes: GraphNode[] = [{ id: "start", label: `Complaint: ${complaintId}`, type: "decision" }];
  const edges: GraphEdge[] = [];

  questions.forEach((q, i) => {
    const qId = `q_${i}`;
    nodes.push({ id: qId, label: q, type: "question" });
    edges.push({ from: i === 0 ? "start" : `q_${i - 1}`, to: qId, label: "next" });
  });

  outcomes.forEach((o, i) => {
    const oId = `outcome_${i}`;
    nodes.push({ id: oId, label: o, type: "outcome" });
    if (questions.length > 0) edges.push({ from: `q_${questions.length - 1}`, to: oId, label: o });
    else edges.push({ from: "start", to: oId });
  });

  return { complaintId, nodes, edges };
}
