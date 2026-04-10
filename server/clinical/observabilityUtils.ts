import { sendSlackAlert, sendWhatsAppAlert } from "../monitoring/alerts";

export function sloBurn(errors: number, total: number): "burning" | "stable" {
  const rate = errors / Math.max(1, total);
  return rate > 0.01 ? "burning" : "stable";
}

export interface SystemState {
  latency: number;
  safety: { mismatchRate: number };
  [key: string]: unknown;
}

export function evaluateSystem(state: SystemState): string[] {
  const alerts: string[] = [];
  if (state.latency > 2000) alerts.push("High latency");
  if (state.safety.mismatchRate > 0.01) alerts.push("Safety risk");
  return alerts;
}

export async function routeOnCall(alerts: string[]): Promise<void> {
  await Promise.all(
    alerts.flatMap(a => [sendSlackAlert(a), sendWhatsAppAlert(a)])
  );
}
