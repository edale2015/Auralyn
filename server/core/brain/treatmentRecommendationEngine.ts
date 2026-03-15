import { RankedItem } from '../../../shared/brainEngineTypes';
import { graphTreatmentsForDiagnoses } from './knowledgeGraphEngine';

export function runTreatmentRecommendationEngine(differentials: RankedItem[]): RankedItem[] {
  const dxIds = differentials.slice(0, 3).map((d) => d.id);
  const seen = new Set<string>();
  return graphTreatmentsForDiagnoses(dxIds).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
