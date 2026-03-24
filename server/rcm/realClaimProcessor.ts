import { logCFR11Entry } from "../fda/cfr11AuditLogger";

export interface ClaimInput {
  caseId: string;
  patientId: string;
  icd10: string;
  cpt: string;
  amount: number;
  providerId: string;
  insurerId: string;
  dateOfService: string;
}

export interface ClaimResult {
  claimId: string;
  status: "accepted" | "pending" | "rejected";
  verified: true;
  submittedAt: string;
  clearinghouseRef?: string;
}

export async function submitRealClaim(claim: ClaimInput): Promise<ClaimResult> {
  const clearinghouseUrl = process.env.CLEARINGHOUSE_API;

  if (!clearinghouseUrl) {
    throw new Error(
      "CLEARINGHOUSE_API is not configured. Set this environment variable before submitting claims."
    );
  }

  let result: ClaimResult;

  try {
    const response = await fetch(`${clearinghouseUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claim),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Clearinghouse returned HTTP ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = await response.json();

    if (!data || !data.claimId || !data.status) {
      throw new Error(
        "Clearinghouse response missing claimId or status — submission unverified"
      );
    }

    result = {
      claimId: data.claimId,
      status: data.status,
      verified: true,
      submittedAt: new Date().toISOString(),
      clearinghouseRef: data.ref ?? data.referenceId,
    };
  } catch (e: any) {
    throw new Error(`Claim submission failed: ${e?.message ?? String(e)}`);
  }

  await logCFR11Entry({
    actor: "rcm_processor",
    action: "claim_submitted",
    traceId: `claim-${claim.caseId}-${Date.now()}`,
    entityType: "claim",
    entityId: result.claimId,
    details: { status: result.status, icd10: claim.icd10, cpt: claim.cpt, amount: claim.amount },
  });

  return result;
}
