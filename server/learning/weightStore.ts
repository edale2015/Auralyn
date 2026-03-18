const weights: Record<string, number> = {};
const history: Array<{ key: string; delta: number; timestamp: string }> = [];

export function updateWeight(key: string, delta: number): void {
  weights[key] = (weights[key] || 1.0) + delta;
  history.push({ key, delta, timestamp: new Date().toISOString() });
}

export function getWeight(key: string): number {
  return weights[key] || 1.0;
}

export function getAllWeights(): Record<string, number> {
  return { ...weights };
}

export function getWeightHistory(): Array<{ key: string; delta: number; timestamp: string }> {
  return [...history];
}

export function resetWeights(): void {
  Object.keys(weights).forEach((k) => delete weights[k]);
  history.length = 0;
}
