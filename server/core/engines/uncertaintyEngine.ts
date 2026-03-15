export function entropy(scores: number[]): number {
  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let e = 0;
  for (const s of scores) {
    const p = s / total;
    if (p > 0) e -= p * Math.log(p);
  }
  return e;
}
