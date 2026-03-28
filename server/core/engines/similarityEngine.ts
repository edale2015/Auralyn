import type { EngineScore } from "./bayesianEngine";

export interface StoredCase {
  id: string;
  features: string[];
  diagnoses: string[];
  outcome?: string;
  storedAt: number;
}

/* ── In-memory case store (max 2000 cases, FIFO rotation) ── */
const caseStore: StoredCase[] = [];
const MAX_CASES = 2000;

export function storeCase(caseData: Omit<StoredCase, "storedAt">) {
  if (caseStore.length >= MAX_CASES) caseStore.shift();
  caseStore.push({ ...caseData, storedAt: Date.now() });
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const intersection = [...A].filter(x => B.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarCase {
  case: StoredCase;
  similarity: number;
}

/** Find top-k most similar past cases using Jaccard on feature sets */
export function findSimilarCases(features: string[], k = 5): SimilarCase[] {
  return caseStore
    .map(c => ({ case: c, similarity: jaccard(c.features, features) }))
    .filter(x => x.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/** Engine adapter — scores diagnoses by frequency in top similar cases */
export function similarityEngine(symptoms: string[]): EngineScore[] {
  const similar = findSimilarCases(symptoms, 10);
  if (similar.length === 0) return [];

  const dxScores: Record<string, number> = {};
  for (const { case: c, similarity } of similar) {
    for (const dx of c.diagnoses) {
      dxScores[dx] = (dxScores[dx] ?? 0) + similarity;
    }
  }
  return Object.entries(dxScores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}

export function getSimilarityCaseCount() {
  return caseStore.length;
}
