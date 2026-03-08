import type { GraphNode, GraphEdge } from "./decisionGraphBuilder";

export interface CaseTraceGraph {
  caseId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildCaseTraceGraph(caseId: string, caseData: any): CaseTraceGraph {
  const nodes: GraphNode[] = [{ id: "intake", label: "Intake", type: "decision" }];
  const edges: GraphEdge[] = [];

  const answers = caseData?.answers ?? {};
  const answerKeys = Object.keys(answers);

  answerKeys.forEach((key, i) => {
    const nodeId = `ans_${i}`;
    nodes.push({ id: nodeId, label: `${key}: ${answers[key]}`, type: "question" });
    edges.push({ from: i === 0 ? "intake" : `ans_${i - 1}`, to: nodeId });
  });

  const disp = caseData?.engineResult?.recommendedDisposition;
  if (disp) {
    const outId = "disposition";
    nodes.push({ id: outId, label: disp, type: "outcome" });
    edges.push({ from: answerKeys.length > 0 ? `ans_${answerKeys.length - 1}` : "intake", to: outId });
  }

  return { caseId, nodes, edges };
}
