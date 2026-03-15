import { RankedItem } from '../../../shared/brainEngineTypes';
import { graphTestsForDiagnoses } from './knowledgeGraphEngine';

export function runTestRecommendationEngine(differentials: RankedItem[]): RankedItem[] {
  const dxIds = differentials.slice(0, 5).map((d) => d.id);
  const seen = new Set<string>();
  return graphTestsForDiagnoses(dxIds).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
