export const CPT_RATES: Record<string, number> = {
  "99285": 500,
  "99284": 300,
  "99283": 200,
  "99282": 150,
  "99213": 120,
  "99212": 80,
};

export function assignCPT(disposition: string): string {
  switch (disposition) {
    case "ER_NOW":   return "99285";
    case "URGENT":   return "99284";
    case "SAME_DAY": return "99283";
    case "NEXT_DAY": return "99282";
    case "ROUTINE":  return "99213";
    default:         return "99213";
  }
}

export function getCPTRate(code: string): number {
  return CPT_RATES[code] ?? 0;
}

export function estimateRevenue(visits: Array<{ disposition?: string; cptCode?: string }>): number {
  return visits.reduce((sum, v) => {
    const code = v.cptCode ?? assignCPT(v.disposition ?? "");
    return sum + (CPT_RATES[code] ?? 0);
  }, 0);
}

export function computePLV(patientHistory: Array<unknown>): number {
  return patientHistory.length * 150;
}

export interface ClinicScore {
  efficiency: number;
  erRate: number;
  avgRevenue: number;
  visits: number;
}

export function clinicScore(visits: Array<{ disposition?: string; er?: boolean }>): ClinicScore {
  const n = visits.length;
  const erCount = visits.filter(v => v.er || v.disposition === "ER_NOW").length;
  const revenue = estimateRevenue(visits);
  return {
    efficiency: n > 0 ? n / 8 : 0,
    erRate:     n > 0 ? erCount / n : 0,
    avgRevenue: n > 0 ? revenue / n : 0,
    visits:     n,
  };
}
