import { RankedItem } from '../../../shared/brainEngineTypes';

function normalize(items: RankedItem[]): Map<string, number> {
  const max = Math.max(1, ...items.map((i) => i.score));
  return new Map(items.map((i) => [i.id, i.score / max]));
}

export function runEvidenceAggregatorEngine(
  bayes: RankedItem[],
  similarity: RankedItem[],
  graph: RankedItem[]
): RankedItem[] {
  const b = normalize(bayes), s = normalize(similarity), g = normalize(graph);
  const ids = new Set([...b.keys(), ...s.keys(), ...g.keys()]);
  return [...ids]
    .map((id) => ({
      id,
      score: (b.get(id) || 0) * 0.5 + (s.get(id) || 0) * 0.3 + (g.get(id) || 0) * 0.2,
      source: 'aggregated'
    }))
    .sort((a, b) => b.score - a.score);
}
