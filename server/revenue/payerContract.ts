export const CONTRACT_BASE_RATES: Record<string, number> = {
  "99285": 500,
  "99284": 300,
  "99283": 200,
  "99282": 150,
  "99213": 120,
  "99212": 80,
};

export interface PayerContractInput {
  cpt?: string;
  time?: number;
  complexity?: "low" | "medium" | "high";
  denialRisk?: number;
  [key: string]: unknown;
}

export function simulatePayerContract(claim: PayerContractInput): number {
  let reimbursement = CONTRACT_BASE_RATES[claim.cpt ?? ""] ?? 0;

  if (claim.time !== undefined && claim.time > 60) {
    reimbursement *= 1.1;
  }
  if (claim.complexity === "high") {
    reimbursement *= 1.2;
  }
  if (claim.denialRisk !== undefined && claim.denialRisk > 0.5) {
    reimbursement *= 0.6;
  }

  return Math.round(reimbursement * 100) / 100;
}

export function batchSimulateContracts(
  claims: PayerContractInput[]
): Array<{ claim: PayerContractInput; reimbursement: number }> {
  return claims.map(c => ({ claim: c, reimbursement: simulatePayerContract(c) }));
}

export function sendPush(patientId: string, msg: string): void {
  console.log(`[Push] 📱 ${patientId}: ${msg}`);
}
