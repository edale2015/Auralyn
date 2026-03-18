import type { ClaimData } from "./claimBuilder";

const submittedClaims: ClaimData[] = [];

export interface ClaimSubmissionResult {
  success: boolean;
  claimId: string;
  status: string;
  submittedAt: string;
  clearinghouseRef?: string;
}

export async function submitClaim(claim: ClaimData): Promise<ClaimSubmissionResult> {
  claim.status = "submitted";
  submittedClaims.push(claim);

  return {
    success: true,
    claimId: claim.claimId,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    clearinghouseRef: `CH-${Date.now()}`,
  };
}

export function getSubmittedClaims(limit = 50): ClaimData[] {
  return submittedClaims.slice(-limit);
}

export function getClaimById(claimId: string): ClaimData | undefined {
  return submittedClaims.find((c) => c.claimId === claimId);
}
