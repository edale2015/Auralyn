export interface EligibilityResult {
  patientId: string;
  eligible: boolean;
  payer?: string;
  planId?: string;
  raw?: unknown;
}

export interface ScrubResult {
  claim: Record<string, unknown>;
  issues: string[];
  ok: boolean;
}

export interface RevenueKPIs {
  total: number;
  denialRate: number;
  estimatedRevenue: number;
  approvedCount: number;
}

export async function checkEligibility(patientId: string): Promise<EligibilityResult> {
  const api = process.env.PAYER_API;
  if (!api) {
    return { patientId, eligible: true, payer: "unknown (sandbox)" };
  }
  try {
    const r = await fetch(`${api}/eligibility/${patientId}`);
    if (!r.ok) throw new Error("eligibility failed");
    const raw = await r.json();
    return { patientId, eligible: true, raw };
  } catch {
    return { patientId, eligible: false, payer: "unreachable" };
  }
}

export function scrubClaim(claim: Record<string, unknown>): ScrubResult {
  const issues: string[] = [];
  const c = { ...claim };

  if (!c.insurance) issues.push("missing_insurance");
  if (!c.cpt) issues.push("missing_cpt");
  if (!c.patientId) issues.push("missing_patient_id");

  if (c.cpt === "99285" && c.disposition !== "ER_NOW") {
    issues.push("overcoding");
    c.cpt = "99284";
  }

  return { claim: c, issues, ok: issues.length === 0 };
}

export function revenueKPIs(claims: Array<{ denied?: boolean; amount?: number }>): RevenueKPIs {
  const total = claims.length;
  const denied = claims.filter(c => c.denied).length;
  const approved = total - denied;
  const est = claims.reduce((s, c) => s + (c.amount ?? 0), 0);

  return {
    total,
    denialRate: total > 0 ? denied / total : 0,
    estimatedRevenue: est,
    approvedCount: approved,
  };
}
