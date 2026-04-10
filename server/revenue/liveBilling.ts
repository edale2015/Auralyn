export interface BillingClaim {
  patientId: string;
  cpt?: string;
  dx?: string;
  insurance?: string;
  disposition?: string;
  [key: string]: unknown;
}

export interface BillingResponse {
  status: "submitted" | "denied" | "pending" | "skipped";
  claimId?: string;
  message?: string;
}

export async function submitLiveClaim(claim: BillingClaim): Promise<BillingResponse> {
  const url   = process.env.PAYER_API   ?? process.env.REAL_PAYER_API;
  const token = process.env.PAYER_TOKEN;

  if (!url || !token) {
    return { status: "skipped", message: "Payer API not configured" };
  }

  const payload = {
    patientId: claim.patientId,
    cpt:       claim.cpt,
    diagnosis: claim.dx,
    insurance: claim.insurance,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: "denied", message: `HTTP ${res.status}` };
    const data = await res.json();
    return { status: "submitted", ...data };
  } catch (e: any) {
    return { status: "denied", message: e?.message };
  }
}

export function optimizeClaim(claim: BillingClaim): BillingClaim {
  const c = { ...claim };
  if (c.insurance === "Private" && c.disposition === "URGENT") {
    c.cpt = "99285";
  }
  if (c.insurance === "Medicaid") {
    c.cpt = c.cpt ?? "99284";
  }
  return c;
}
