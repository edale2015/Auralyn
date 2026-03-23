import { queryNodes, getEdgesFrom, getNeighbors, listAllNodes, listAllEdges, getStats, MemoryNode } from "./memoryGraph";

export function findSimilarCases(complaints: string[]): MemoryNode[] {
  if (!complaints.length) return [];
  const results: Map<string, { node: MemoryNode; matchCount: number }> = new Map();

  for (const complaint of complaints) {
    const matches = queryNodes({ type: "patient", tags: [complaint] });
    for (const node of matches) {
      const existing = results.get(node.id);
      if (existing) existing.matchCount++;
      else results.set(node.id, { node, matchCount: 1 });
    }
  }

  return [...results.values()]
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(r => r.node);
}

export function getPatientTimeline(patientId: string): MemoryNode[] {
  const patientNodes = queryNodes({ type: "patient", dataKey: "patientId", dataValue: patientId });
  const timeline: MemoryNode[] = [];

  for (const pNode of patientNodes) {
    timeline.push(pNode);
    const neighbors = getNeighbors(pNode.id);
    timeline.push(...neighbors);
  }

  return timeline.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getDecisionsByTriage(triage: string): MemoryNode[] {
  return queryNodes({ type: "decision", tags: [triage] });
}

export function getOutcomeSuccessRate(): { total: number; correct: number; rate: number } {
  const outcomes = queryNodes({ type: "outcome" });
  const correct = outcomes.filter(n => n.data.outcome === "correct").length;
  return { total: outcomes.length, correct, rate: outcomes.length ? correct / outcomes.length : 0 };
}

export function getRecentErrors(limit = 20): MemoryNode[] {
  return queryNodes({ type: "error" })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getRobotActions(limit = 50): MemoryNode[] {
  return queryNodes({ type: "robot_action" })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getGraphSummary() {
  const stats = getStats();
  const successRate = getOutcomeSuccessRate();
  const recentErrors = getRecentErrors(5);

  return {
    stats,
    successRate,
    recentErrorCount: recentErrors.length,
    recentErrors: recentErrors.map(e => ({ id: e.id, label: e.label, at: e.data.at })),
  };
}

export { listAllNodes, listAllEdges, getStats };
