import { sendSlackAlert, sendWhatsAppAlert } from "../monitoring/alerts";

export interface SLOMetrics {
  errors: number;
  p95: number;
  [key: string]: unknown;
}

export interface SLOResult {
  availability: number;
  latency: boolean;
}

export function computeSLO(metrics: SLOMetrics): SLOResult {
  return {
    availability: metrics.errors < 1 ? 0.999 : 0.99,
    latency: metrics.p95 < 1500,
  };
}

export async function onCallAlert(msg: string): Promise<void> {
  await Promise.all([
    sendSlackAlert("🚨 ON-CALL: " + msg),
    sendWhatsAppAlert(msg),
  ]);
}

export async function checkSLOAndAlert(metrics: SLOMetrics): Promise<SLOResult> {
  const slo = computeSLO(metrics);
  if (!slo.latency) await onCallAlert("Latency SLO violated");
  if (slo.availability < 0.999) await onCallAlert("Availability SLO violated");
  return slo;
}

export function anomalyCard(data: { erRate: number; [key: string]: unknown }): string | null {
  if (data.erRate > 0.3) return "High ER spike";
  return null;
}

export function rankQuestions(
  questions: string[],
  weights: Record<string, number>
): string[] {
  return [...questions].sort((a, b) => (weights[b] ?? 1) - (weights[a] ?? 1));
}
