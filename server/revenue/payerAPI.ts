export interface PayerClaim {
  patientId: string;
  cpt: string;
  insurance: string;
  amount?: number;
  [key: string]: unknown;
}

export interface PayerAPIResponse {
  claimId?: string;
  status: "submitted" | "denied" | "pending" | "skipped";
  amount?: number;
  message?: string;
}

export async function submitRealClaim(claim: PayerClaim): Promise<PayerAPIResponse> {
  const url   = process.env.REAL_PAYER_API;
  const token = process.env.PAYER_TOKEN;

  if (!url || !token) {
    console.log(`[PayerAPI] No REAL_PAYER_API/PAYER_TOKEN — skipping live claim for ${claim.patientId}`);
    return { status: "skipped", message: "Live payer API not configured" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(claim),
  });

  if (!res.ok) {
    return { status: "denied", message: `HTTP ${res.status}` };
  }

  return { status: "submitted", ...await res.json() };
}

export function estimateReimbursement(cpt: string, insurance: string): number {
  const base: Record<string, number> = {
    "99281": 50, "99282": 120, "99283": 200, "99284": 280, "99285": 350,
  };
  const multiplier: Record<string, number> = {
    Aetna: 1.0, BlueCross: 0.95, Cigna: 0.9, United: 0.85,
    Medicare: 0.8, Medicaid: 0.6,
  };
  return (base[cpt] ?? 100) * (multiplier[insurance] ?? 0.5);
}
