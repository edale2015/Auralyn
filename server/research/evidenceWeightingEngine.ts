export type SourceType =
  | 'guideline'
  | 'review'
  | 'rct'
  | 'journal'
  | 'sheet'
  | 'journalism'
  | 'forum'
  | 'commentary'
  | 'case_report'
  | 'expert_opinion';

const EVIDENCE_WEIGHTS: Record<string, number> = {
  guideline: 1.0,
  review: 0.9,
  rct: 0.88,
  journal: 0.8,
  sheet: 0.7,
  case_report: 0.55,
  expert_opinion: 0.45,
  journalism: 0.4,
  forum: 0.2,
  commentary: 0.2,
};

export interface WeightedEdge {
  from: string;
  relation: string;
  to: string;
  weight: number;
  sourceType: string;
  confidence: 'high' | 'moderate' | 'low';
}

export function evidenceWeightingEngine(sourceType: string): number {
  return EVIDENCE_WEIGHTS[sourceType] ?? 0.1;
}

export function applyWeightsToEdges<T extends { sourceType?: string }>(
  edges: T[]
): (T & { weight: number; confidence: 'high' | 'moderate' | 'low' })[] {
  return edges.map((e) => {
    const w = evidenceWeightingEngine(e.sourceType ?? 'journal');
    const confidence: 'high' | 'moderate' | 'low' =
      w >= 0.8 ? 'high' : w >= 0.5 ? 'moderate' : 'low';
    return { ...e, weight: w, confidence };
  });
}

export function getWeightTable(): Record<string, number> {
  return { ...EVIDENCE_WEIGHTS };
}
