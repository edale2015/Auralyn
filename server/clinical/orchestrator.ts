import { runFinalPipeline } from "./finalPipeline";
import { processRevenue } from "../revenue/fullRevenue";
import { writeEHRAll } from "../integrations/ehrUnified";
import { safeExternalCall } from "./followupUtils";
import { sendSlackAlert } from "../monitoring/alerts";
import { sendTelegramAlert, broadcastMultiChannel } from "../monitoring/alerts";
import { sendToECWEncounter } from "../integrations/ecwAdapter";

export interface OrchestratorResult {
  triage: ReturnType<typeof runFinalPipeline>;
  revenue: ReturnType<typeof processRevenue>;
  ehr: { epic: string; ecw: string };
}

export async function orchestrate(patient: {
  patientId: string;
  complaint: string;
  insurance?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<OrchestratorResult> {
  const triage  = runFinalPipeline(patient as any);
  const revenue = processRevenue(patient, triage.safetyDisposition);
  const ehr = await writeEHRAll({
    patientId: patient.patientId,
    disposition: triage.safetyDisposition,
    vitals: patient.vitals,
  });
  await safeExternalCall(
    async () => sendSlackAlert(`🏥 Hospital referral: ${patient.patientId} → ${triage.safetyDisposition}`),
    undefined
  );
  return { triage, revenue, ehr };
}

// ── System Health Score ────────────────────────────────────────────────────────
export function systemScore(metrics: {
  errorRate: number;
  latency: number;
  denialRate: number;
}): number {
  const score =
    (1 - metrics.errorRate)             * 0.4 +
    (1 - metrics.latency / 3000)        * 0.3 +
    (1 - metrics.denialRate)            * 0.3;
  return Math.max(0, Math.min(1, score));
}

// ── Universal Connector Router ─────────────────────────────────────────────────
async function noop(payload: unknown): Promise<unknown> {
  console.log("[Connector] No handler registered, payload:", payload);
  return null;
}

export async function routeConnector(type: string, payload: unknown): Promise<unknown> {
  const map: Record<string, (p: unknown) => Promise<unknown>> = {
    slack:    async (p: any) => { await sendSlackAlert(String(p?.msg ?? p)); return { ok: true }; },
    telegram: async (p: any) => { await sendTelegramAlert(String(p?.msg ?? p)); return { ok: true }; },
    broadcast: async (p: any) => { await broadcastMultiChannel(String(p?.msg ?? p)); return { ok: true }; },
    ecw:      async (p: any) => sendToECWEncounter(p as any),
  };
  return (map[type] ?? noop)(payload);
}

// ── Fast Action Cache ─────────────────────────────────────────────────────────
const actionCache: Record<string, unknown> = {};

export function cacheAction(key: string, result: unknown): void {
  actionCache[key] = result;
}

export function getCachedAction(key: string): unknown {
  return actionCache[key];
}

export function clearActionCache(): void {
  Object.keys(actionCache).forEach(k => delete actionCache[k]);
}
