export const PAYER_CONTRACTS: Record<string, { multiplier: number }> = {
  Aetna:    { multiplier: 1.0 },
  BlueCross: { multiplier: 0.95 },
  Cigna:    { multiplier: 0.9 },
  United:   { multiplier: 0.85 },
  Medicare:  { multiplier: 0.8 },
  Medicaid:  { multiplier: 0.6 },
};

export const CPT_BASE: Record<string, number> = {
  "99285": 500,
  "99284": 300,
  "99283": 200,
  "99282": 150,
  "99213": 120,
  "99212":  80,
};

export interface ClaimInput {
  insurance?: string;
  cpt?: string;
  [key: string]: unknown;
}

export function payerContract(claim: ClaimInput): number {
  const base = CPT_BASE[claim.cpt ?? ""] ?? 0;
  const contract = PAYER_CONTRACTS[claim.insurance ?? ""] ?? { multiplier: 0.5 };
  return Math.round(base * contract.multiplier * 100) / 100;
}
