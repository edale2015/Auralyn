import { sendToECWEncounter } from "../integrations/ecwAdapter";
import { runUIAutomation } from "../automation/uiEngine";

// ── Next Best Question (information gain) ────────────────────────────────────
export interface Diagnosis { name: string; p: number }
export interface Question  { id: string; weight: number }

export function nextBestQuestion(
  dx: Diagnosis[],
  qs: Question[]
): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const q of qs) {
    const score = dx.reduce((s, d) => s + d.p * q.weight, 0);
    if (score > bestScore) { bestScore = score; best = q.id; }
  }
  return best;
}

// ── Physician One-Glance Card ─────────────────────────────────────────────────
export function oneGlance(c: {
  complaint?:    string;
  differential?: Array<{ diagnosis?: string }>;
  disposition?:  string;
}): string {
  return `${c.complaint ?? "?"} | ${c.differential?.[0]?.diagnosis ?? "—"} | ${c.disposition ?? "pending"}`;
}

// ── Robust Retry with Exponential Back-off + Jitter ──────────────────────────
export async function retry<T>(
  fn: () => Promise<T>,
  tries = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const delay = 200 * 2 ** i + Math.random() * 100;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Z-Score Anomaly Detection ─────────────────────────────────────────────────
export function zAnomaly(series: number[], threshold = 3): boolean {
  const n    = series.length || 1;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const varr = series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd   = Math.sqrt(varr || 1);
  const last = series[n - 1] ?? 0;
  return Math.abs((last - mean) / sd) > threshold;
}

export function zScore(series: number[]): number {
  const n    = series.length || 1;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const varr = series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd   = Math.sqrt(varr || 1);
  const last = series[n - 1] ?? 0;
  return (last - mean) / sd;
}

// ── Universal Write (API → UI → Vision) ──────────────────────────────────────
export async function universalWrite(data: {
  patientId?: string;
  disposition?: string;
  template?: { url: string; steps: Array<{ type: string; label: string; value?: string }> };
  page?: unknown;
  [key: string]: unknown;
}): Promise<"ecw" | "ui" | "vision" | "failed"> {
  try {
    await sendToECWEncounter({ patientId: data.patientId ?? "", disposition: data.disposition ?? "" });
    return "ecw";
  } catch {
    try {
      if (data.template) {
        await runUIAutomation(data.template as any);
        return "ui";
      }
    } catch {}
    try {
      if (data.page) {
        const { smartClick } = await import("../automation/visionAgent");
        await smartClick(data.page, "submit");
        return "vision";
      }
    } catch {}
  }
  return "failed";
}
