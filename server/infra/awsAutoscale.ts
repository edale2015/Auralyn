export type ScaleTarget = number;

export function computeScale(queueDepth: number): ScaleTarget {
  if (queueDepth > 100) return 10;
  if (queueDepth > 50)  return 5;
  return 2;
}

export async function lambdaFallback(payload: unknown): Promise<Response | null> {
  const lambdaUrl = process.env.LAMBDA_URL;
  if (!lambdaUrl) {
    console.warn("[AWSAutoscale] LAMBDA_URL not configured — fallback skipped");
    return null;
  }
  return fetch(lambdaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function chooseRegion(latencyMap: Record<string, number>): string {
  const entries = Object.entries(latencyMap);
  if (entries.length === 0) return "us-east-1";
  return entries.sort((a, b) => a[1] - b[1])[0][0];
}

export function computeScaleStep(
  currentInstances: number,
  targetInstances: number
): { action: "scale_up" | "scale_down" | "no_change"; delta: number } {
  const delta = targetInstances - currentInstances;
  if (delta > 0) return { action: "scale_up", delta };
  if (delta < 0) return { action: "scale_down", delta: Math.abs(delta) };
  return { action: "no_change", delta: 0 };
}

export function getScaleRecommendation(queueDepth: number, currentInstances: number): {
  recommendedInstances: number;
  action: "scale_up" | "scale_down" | "no_change";
  delta: number;
} {
  const recommended = computeScale(queueDepth);
  const step = computeScaleStep(currentInstances, recommended);
  return { recommendedInstances: recommended, ...step };
}
