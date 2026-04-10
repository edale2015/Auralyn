import { assignCPT } from "../billing/cptRevenue";
import { scrubClaim } from "./eligibility";
import { predictDenial } from "./denialPredictor";
import { payerContract } from "./contracts";

export interface FullRevenueInput {
  patientId: string;
  insurance?: string;
  [key: string]: unknown;
}

export interface FullRevenueResult {
  claim: Record<string, unknown>;
  denial: ReturnType<typeof predictDenial>;
  revenue: number;
}

export function processRevenue(patient: FullRevenueInput, disposition: string): FullRevenueResult {
  let claim: Record<string, unknown> = {
    patientId: patient.patientId,
    insurance: patient.insurance ?? "unknown",
    disposition,
    cpt: assignCPT(disposition),
  };

  const scrubResult = scrubClaim(claim);
  claim = { ...claim, ...scrubResult.claim };

  const denial = predictDenial(claim as any);
  if (denial.risk === "high") {
    claim.cpt = "99284";
  }

  const revenue = payerContract(claim as any);

  return { claim, denial, revenue };
}
