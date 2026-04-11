export type SloStatus = "ok" | "burning" | "critical";

export interface SloBurnResult {
  rate: number;
  status: SloStatus;
  errorPct: string;
}

export function sloBurnRate(errors: number, total: number): SloBurnResult {
  const rate = errors / Math.max(1, total);
  let status: SloStatus = "ok";
  if (rate > 0.05) status = "critical";
  else if (rate > 0.01) status = "burning";

  return {
    rate,
    status,
    errorPct: (rate * 100).toFixed(2) + "%",
  };
}

export interface ProviderSla {
  slaMs: number;
  load: number;
  [key: string]: unknown;
}

export function updateSLA(provider: ProviderSla, latencyMs: number): ProviderSla {
  return {
    ...provider,
    slaMs: Math.round(0.7 * provider.slaMs + 0.3 * latencyMs),
    load: Math.min(1, provider.load + 0.05),
  };
}

export function resetSlaLoad(provider: ProviderSla, decayFactor = 0.95): ProviderSla {
  return {
    ...provider,
    load: Math.max(0, provider.load * decayFactor),
  };
}

export interface ApproveAndSendResult {
  ok: boolean;
  traceId: string;
  tier?: string;
}

export async function approveAndSend(caseData: {
  traceId: string;
  patientId: string;
  disposition?: string;
  note?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<ApproveAndSendResult> {
  try {
    const { writeAudit } = await import("./auditService").catch(() => ({ writeAudit: async () => {} }));
    await writeAudit({ traceId: caseData.traceId, step: "approve", data: caseData });
  } catch {}

  try {
    const { universalWrite } = await import("../integrations/universalWrite");
    const result = await universalWrite({
      patientId: caseData.patientId,
      disposition: caseData.disposition,
      note: caseData.note,
      vitals: caseData.vitals,
      traceId: caseData.traceId,
    });
    return { ok: result.success, traceId: caseData.traceId, tier: result.tier };
  } catch (err) {
    return { ok: false, traceId: caseData.traceId, tier: "failed" };
  }
}
