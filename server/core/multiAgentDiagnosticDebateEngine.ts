import type { DifferentialScore, BrainCaseInput } from '../../shared/clinicalEngineTypes';

export interface AgentVote {
  agentId: string;
  role: string;
  topDiagnosis: string;
  confidence: number;
  rationale: string[];
  dissent: string[];
}

export interface DebateResult {
  consensus: string;
  consensusScore: number;
  agentVotes: AgentVote[];
  disagreements: string[];
  finalDifferentials: DifferentialScore[];
  debateSummary: string;
}

const AGENT_ROLES = [
  { id: 'internist', role: 'Internal Medicine', bias: ['pneumonia', 'sepsis', 'uti', 'pyelonephritis', 'heart_failure'] },
  { id: 'cardiologist', role: 'Cardiology', bias: ['acute_coronary_syndrome', 'pulmonary_embolism', 'heart_failure', 'arrhythmia'] },
  { id: 'infectionist', role: 'Infectious Disease', bias: ['sepsis', 'meningitis', 'pneumonia', 'uti', 'covid'] },
  { id: 'ent_specialist', role: 'ENT', bias: ['pharyngitis', 'otitis_media', 'sinusitis', 'laryngitis'] },
  { id: 'generalist', role: 'General Practitioner', bias: [] },
];

function scoreForAgent(
  agent: typeof AGENT_ROLES[0],
  differentials: DifferentialScore[]
): AgentVote {
  const scored = differentials.map((d) => ({
    ...d,
    adjustedScore: d.score * (agent.bias.includes(d.diagnosis) ? 1.25 : 1.0),
  })).sort((a, b) => b.adjustedScore - a.adjustedScore);

  const top = scored[0];
  const rationale: string[] = [`${agent.role} evaluation: ${top?.diagnosis ?? 'uncertain'} most consistent`];
  if (agent.bias.includes(top?.diagnosis ?? '')) rationale.push(`Specialty-concordant diagnosis`);

  const dissent: string[] = [];
  if (scored[1] && scored[1].adjustedScore > scored[0].adjustedScore * 0.7) {
    dissent.push(`Alternative: ${scored[1].diagnosis} also plausible`);
  }

  return {
    agentId: agent.id,
    role: agent.role,
    topDiagnosis: top?.diagnosis ?? 'uncertain',
    confidence: Math.round((top?.adjustedScore ?? 0) * 100) / 100,
    rationale,
    dissent,
  };
}

export function runMultiAgentDiagnosticDebateEngine(
  input: BrainCaseInput,
  differentials: DifferentialScore[]
): DebateResult {
  if (!differentials.length) {
    return { consensus: 'uncertain', consensusScore: 0, agentVotes: [], disagreements: [], finalDifferentials: [], debateSummary: 'No differentials available for debate.' };
  }

  const agentVotes = AGENT_ROLES.map((a) => scoreForAgent(a, differentials));

  // ── Tally votes ────────────────────────────────────────────────────────────
  const tally: Record<string, number> = {};
  agentVotes.forEach((v) => {
    tally[v.topDiagnosis] = (tally[v.topDiagnosis] ?? 0) + v.confidence;
  });

  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a);
  const consensus = sorted[0]?.[0] ?? 'uncertain';
  const consensusScore = Math.round(((sorted[0]?.[1] ?? 0) / agentVotes.length) * 100) / 100;

  // ── Find disagreements ─────────────────────────────────────────────────────
  const uniqueTopDx = new Set(agentVotes.map((v) => v.topDiagnosis));
  const disagreements = uniqueTopDx.size > 1
    ? [...uniqueTopDx].filter((dx) => dx !== consensus).map((dx) => `${dx} favored by minority agents`)
    : [];

  // ── Aggregate final differentials ─────────────────────────────────────────
  const finalScores: Record<string, number> = {};
  agentVotes.forEach((v) => {
    finalScores[v.topDiagnosis] = (finalScores[v.topDiagnosis] ?? 0) + v.confidence / agentVotes.length;
  });
  const finalDifferentials: DifferentialScore[] = Object.entries(finalScores)
    .map(([diagnosis, score]) => ({ diagnosis, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score);

  const debateSummary = `${agentVotes.length} agents debated. Consensus: ${consensus} (avg confidence: ${consensusScore}). ${disagreements.length ? `Dissent on: ${disagreements.join(', ')}.` : 'Full consensus.'}`;

  return { consensus, consensusScore, agentVotes, disagreements, finalDifferentials, debateSummary };
}
