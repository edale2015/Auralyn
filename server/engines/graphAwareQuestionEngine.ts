import { getKnowledgeGraph } from "../knowledge/knowledgeGraphStore";

export interface NextQuestionResult {
  questionId: string;
  questionLabel: string;
  weight: number;
  reason: string;
}

export function chooseNextQuestion(complaint: string, answeredIds: string[]): NextQuestionResult | null {
  const graph = getKnowledgeGraph();
  const complaintId = `complaint:${complaint}`;

  const questionEdges = graph.edges
    .filter(e => e.from === complaintId && e.relation === "asks")
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  for (const edge of questionEdges) {
    if (answeredIds.includes(edge.to)) continue;
    const node = graph.nodes.find(n => n.id === edge.to);
    if (!node) continue;

    return {
      questionId: node.id,
      questionLabel: node.label,
      weight: edge.weight ?? 0,
      reason: `Priority question for ${complaint} (weight ${edge.weight ?? 0})`,
    };
  }

  return null;
}

export function getQuestionSequence(complaint: string): NextQuestionResult[] {
  const graph = getKnowledgeGraph();
  const complaintId = `complaint:${complaint}`;

  return graph.edges
    .filter(e => e.from === complaintId && e.relation === "asks")
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map(edge => {
      const node = graph.nodes.find(n => n.id === edge.to);
      return node ? {
        questionId: node.id,
        questionLabel: node.label,
        weight: edge.weight ?? 0,
        reason: `Mapped question for ${complaint}`,
      } : null;
    })
    .filter(Boolean) as NextQuestionResult[];
}
