function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function shouldUseNewModel(patientId: string, rolloutPct = 0.1): boolean {
  return (stableHash(patientId) % 1000) / 1000 < rolloutPct;
}

export function assignExperiment(
  userId: string,
  experimentName: string,
  treatmentPct = 0.5
): "control" | "treatment" {
  const h = stableHash(userId + experimentName);
  return (h % 1000) / 1000 < treatmentPct ? "treatment" : "control";
}

export function canaryDecide<T>(
  patientId: string,
  opts: { rolloutPct?: number; newFn: () => T; oldFn: () => T }
): { result: T; variant: "new" | "old" } {
  const useNew = shouldUseNewModel(patientId, opts.rolloutPct ?? 0.1);
  if (useNew) return { result: opts.newFn(), variant: "new" };
  return { result: opts.oldFn(), variant: "old" };
}
