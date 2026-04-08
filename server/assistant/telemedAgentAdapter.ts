export interface TelemedAgentOpinion {
  agentId: string;
  domain: string;
  conclusion: string;
  confidence: number;
  reasoning: string;
  priority: number;
  evidence?: any;
}

export function mapTelemedToAgents(result: any): TelemedAgentOpinion[] {
  const agents: TelemedAgentOpinion[] = [];

  if (result.differential?.length) {
    const top = result.differential[0];
    agents.push({
      agentId: "diagnostic_engine",
      domain: "diagnosis",
      conclusion: top.diagnosis,
      confidence: Math.min(1, Math.max(0, top.confidence ?? 0.5)),
      reasoning: `Top differential: ${top.diagnosis} (${((top.confidence ?? 0.5) * 100).toFixed(0)}% confidence)`,
      priority: 2,
      evidence: result.differential.slice(0, 3),
    });
  }

  agents.push({
    agentId: "triage_engine",
    domain: "triage",
    conclusion: result.triage?.level ?? "routine",
    confidence: Math.min(1, Math.max(0, (result.triage?.urgencyScore ?? 30) / 100)),
    reasoning: result.triage?.reason ?? "Urgency scoring complete",
    priority: 3,
  });

  if ((result.safetyAlerts?.length ?? 0) > 0) {
    agents.push({
      agentId: "safety_engine",
      domain: "safety",
      conclusion: "emergency",
      confidence: 1.0,
      reasoning: result.safetyAlerts.map((a: any) => a.message ?? String(a)).join("; "),
      priority: 10,
    });
  }

  if (result.resources?.recommendedActions?.length) {
    const topAction = result.resources.recommendedActions[0];
    agents.push({
      agentId: "treatment_engine",
      domain: "treatment",
      conclusion: topAction.type ?? "observation",
      confidence: 0.60,
      reasoning: `Recommended action: ${topAction.type} for ${topAction.diagnosis}`,
      priority: 1,
    });
  }

  return agents;
}

export function runAgentDebate(agents: TelemedAgentOpinion[]): {
  winner: TelemedAgentOpinion | null;
  consensusScore: number;
  disagreement: number;
  opinions: TelemedAgentOpinion[];
} {
  if (!agents.length) return { winner: null, consensusScore: 0, disagreement: 1, opinions: [] };

  const sorted = [...agents].sort((a, b) => b.confidence * b.priority - a.confidence * a.priority);
  const winner = sorted[0];

  const conclusionCounts: Record<string, number> = {};
  for (const a of agents) {
    conclusionCounts[a.conclusion] = (conclusionCounts[a.conclusion] ?? 0) + 1;
  }
  const maxAgreement = Math.max(...Object.values(conclusionCounts));
  const consensusScore = maxAgreement / agents.length;

  const confidences = agents.map(a => a.confidence);
  const mean = confidences.reduce((s, c) => s + c, 0) / confidences.length;
  const variance = confidences.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / confidences.length;

  return { winner, consensusScore: Math.round(consensusScore * 100) / 100, disagreement: Math.round(Math.sqrt(variance) * 100) / 100, opinions: agents };
}
