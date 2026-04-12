/**
 * Revenue Optimizer
 * Applies payer-specific multipliers to CPT codes and computes adjusted values.
 */

export interface OptimizedCode {
  code:          string;
  baseRVU:       number;
  adjustedValue: number;
  payerCategory: string;
}

export interface RevenueReport {
  codes:         OptimizedCode[];
  totalRevenue:  number;
  currency:      "USD";
}

const PAYER_MULTIPLIERS: Record<string, number> = {
  "99213": 1.0,
  "99214": 1.3,
  "99215": 1.6,
  "99285": 2.2,   // ED high complexity
  "87880": 0.8,   // rapid strep
  "87635": 0.9,   // COVID PCR
  "87804": 0.8,   // flu rapid
  "81001": 0.6,   // urinalysis
  "71046": 1.1,   // chest X-ray
  "93000": 0.9,   // ECG
  "84484": 1.0,   // troponin
};

const BASE_RVU: Record<string, number> = {
  "99213": 92,
  "99214": 134,
  "99215": 180,
  "99285": 290,
  "87880": 28,
  "87635": 42,
  "87804": 26,
  "81001": 14,
  "71046": 52,
  "93000": 38,
  "84484": 48,
};

function getPayerCategory(code: string): string {
  if (code.startsWith("992"))  return "E&M";
  if (code.startsWith("87"))   return "Lab/Micro";
  if (code.startsWith("81"))   return "Lab/UA";
  if (code.startsWith("71"))   return "Radiology";
  if (code.startsWith("93"))   return "Cardiology";
  if (code.startsWith("84"))   return "Lab/Chemistry";
  return "Other";
}

export function optimizeRevenue(codes: string[]): RevenueReport {
  const optimized: OptimizedCode[] = codes.map((code) => {
    const base  = BASE_RVU[code]          ?? 50;
    const mult  = PAYER_MULTIPLIERS[code] ?? 1.0;
    return {
      code,
      baseRVU:       base,
      adjustedValue: Number((base * mult).toFixed(2)),
      payerCategory: getPayerCategory(code),
    };
  });

  const totalRevenue = Number(optimized.reduce((sum, c) => sum + c.adjustedValue, 0).toFixed(2));

  return { codes: optimized, totalRevenue, currency: "USD" };
}
