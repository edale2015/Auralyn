export function normalizeMapScores(scores: Record<string, number>): Record<string, number> {
  const values = Object.values(scores);
  if (!values.length) return {};
  const max = Math.max(...values);
  if (max <= 0) return Object.fromEntries(Object.keys(scores).map((k) => [k, 0]));
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v / max]));
}

export function shannonEntropy(probs: number[]): number {
  return probs.filter((p) => p > 0).reduce((acc, p) => acc - p * Math.log2(p), 0);
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}
