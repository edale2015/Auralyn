import { RankedItem } from '../../../shared/brainEngineTypes';
import { CLINICAL_GRAPH_EDGES } from '../../data/clinicalKnowledgeGraph';

export function runKnowledgeGraphEngine(symptoms: string[]): RankedItem[] {
  const scoreMap = new Map<string, number>();
  for (const edge of CLINICAL_GRAPH_EDGES) {
    if (edge.relation === 'supports_dx' && symptoms.includes(edge.from)) {
      scoreMap.set(edge.to, (scoreMap.get(edge.to) || 0) + edge.weight);
    }
  }
  const max = Math.max(1, ...scoreMap.values());
  return [...scoreMap.entries()]
    .map(([id, score]) => ({ id, score: score / max, source: 'graph' }))
    .sort((a, b) => b.score - a.score);
}

export function graphTestsForDiagnoses(dxIds: string[]): RankedItem[] {
  return CLINICAL_GRAPH_EDGES
    .filter((e) => e.relation === 'suggests_test' && dxIds.includes(e.from))
    .map((e) => ({ id: e.to, score: e.weight, source: 'graph_test' }))
    .sort((a, b) => b.score - a.score);
}

export function graphTreatmentsForDiagnoses(dxIds: string[]): RankedItem[] {
  return CLINICAL_GRAPH_EDGES
    .filter((e) => e.relation === 'suggests_treatment' && dxIds.includes(e.from))
    .map((e) => ({ id: e.to, score: e.weight, source: 'graph_treatment' }))
    .sort((a, b) => b.score - a.score);
}
