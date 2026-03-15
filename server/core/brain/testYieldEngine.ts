import { RankedItem } from '../../../shared/brainEngineTypes';

export function runTestYieldEngine(
  tests: RankedItem[],
  differentials: RankedItem[]
): RankedItem[] {
  const topDx = differentials.slice(0, 3).map((d) => d.id);
  return tests
    .map((t) => ({ ...t, score: t.score * (topDx.length > 0 ? 1.2 : 1.0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
