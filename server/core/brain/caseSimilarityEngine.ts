import { BrainCaseInput, RankedItem } from '../../../shared/brainEngineTypes';
import { retrieveClinicalMemory } from './clinicalMemoryEngine';

export function runCaseSimilarityEngine(input: BrainCaseInput): RankedItem[] {
  const memory = retrieveClinicalMemory(input);
  const scoreMap = new Map<string, number>();
  for (const match of memory.matches) {
    for (const dx of match.diagnoses || []) {
      scoreMap.set(dx.id, (scoreMap.get(dx.id) || 0) + match.similarity * dx.score);
    }
  }
  return [...scoreMap.entries()]
    .map(([id, score]) => ({ id, score, source: 'similarity' }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
