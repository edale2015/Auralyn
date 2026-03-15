export interface ReasoningState {
  entropy: number;
  similarityConfidence: number;
  graphCoverage: number;
  topDifferentialScore: number;
  safetyTriggered: boolean;
  contradictionsFound: number;
  questionCompleteness: number;
}

export interface MetaAdjustments {
  bayesian_weight?: number;
  similarity_weight?: number;
  graph_weight?: number;
  safety_weight?: number;
  evidence_weight?: number;
}

export interface MetaClinicalResult {
  adjustments: MetaAdjustments;
  notes: string[];
  confidenceMode: 'high' | 'moderate' | 'low' | 'override_required';
  recommendedAction: 'proceed' | 'gather_more_data' | 'escalate' | 'block';
}

export function metaClinicalIntelligenceEngine(state: ReasoningState): MetaClinicalResult {
  const adjustments: MetaAdjustments = {};
  const notes: string[] = [];

  // ── High entropy → down-weight Bayesian, boost graph ────────────────────
  if (state.entropy > 1.5) {
    adjustments.bayesian_weight = 0.5;
    adjustments.graph_weight = 0.9;
    notes.push(`High entropy (${state.entropy.toFixed(2)}) — reducing Bayesian dominance, boosting graph traversal`);
  } else if (state.entropy > 1.2) {
    adjustments.bayesian_weight = 0.7;
    notes.push(`Elevated entropy (${state.entropy.toFixed(2)}) — moderate Bayesian reduction`);
  }

  // ── Low similarity confidence → reduce similarity weight ────────────────
  if (state.similarityConfidence < 0.3) {
    adjustments.similarity_weight = 0.1;
    notes.push(`Very low case similarity (${state.similarityConfidence.toFixed(2)}) — case is atypical`);
  } else if (state.similarityConfidence < 0.4) {
    adjustments.similarity_weight = 0.2;
    notes.push(`Low case similarity (${state.similarityConfidence.toFixed(2)}) — similarity weight reduced`);
  }

  // ── Low graph coverage → boost evidence gathering ────────────────────────
  if (state.graphCoverage < 0.4) {
    adjustments.graph_weight = 0.5;
    adjustments.evidence_weight = 0.8;
    notes.push(`Poor graph coverage (${state.graphCoverage.toFixed(2)}) — evidence engines boosted`);
  }

  // ── Safety override ───────────────────────────────────────────────────────
  if (state.safetyTriggered) {
    adjustments.safety_weight = 1.0;
    notes.push('Safety guard triggered — safety weight maximized, governance override active');
  }

  // ── Contradictions found ──────────────────────────────────────────────────
  if (state.contradictionsFound >= 2) {
    adjustments.similarity_weight = 0.1;
    adjustments.bayesian_weight = 0.6;
    notes.push(`${state.contradictionsFound} contradictions found — reducing similarity reliance`);
  }

  // ── Low question completeness ─────────────────────────────────────────────
  if (state.questionCompleteness < 0.5) {
    notes.push(`Question completeness ${Math.round(state.questionCompleteness * 100)}% — more data needed before final disposition`);
  }

  // ── Determine overall confidence mode ────────────────────────────────────
  let confidenceMode: MetaClinicalResult['confidenceMode'];
  let recommendedAction: MetaClinicalResult['recommendedAction'];

  if (state.safetyTriggered || state.entropy > 1.8) {
    confidenceMode = 'override_required';
    recommendedAction = 'escalate';
  } else if (state.entropy > 1.2 || state.topDifferentialScore < 0.4 || state.questionCompleteness < 0.5) {
    confidenceMode = 'low';
    recommendedAction = 'gather_more_data';
  } else if (state.entropy > 0.8 || state.topDifferentialScore < 0.65) {
    confidenceMode = 'moderate';
    recommendedAction = 'proceed';
  } else {
    confidenceMode = 'high';
    recommendedAction = 'proceed';
  }

  if (notes.length === 0) notes.push('Reasoning state within normal parameters — no weight adjustments required');

  return { adjustments, notes, confidenceMode, recommendedAction };
}
