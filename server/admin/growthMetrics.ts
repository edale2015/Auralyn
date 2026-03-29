export interface ClinicData {
  clinicId: string;
  clinicName?: string;
  patients: number;
  revenue: number;
  marketingSpend: number;
  monthsActive: number;
  encountersPerDay?: number;
}

export interface GrowthMetrics {
  clinicId: string;
  clinicName?: string;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  revenuePerPatient: number;
  monthlyRecurring: number;
  paybackMonths: number;
  grade: "A" | "B" | "C" | "D";
}

export function growthMetrics(clinic: ClinicData): GrowthMetrics {
  const ltv = +(clinic.revenue / Math.max(clinic.patients, 1)).toFixed(2);
  const cac = +(clinic.marketingSpend / Math.max(clinic.patients, 1)).toFixed(2);
  const ltvCacRatio = cac > 0 ? +(ltv / cac).toFixed(2) : 0;
  const monthlyRecurring = +(clinic.revenue / Math.max(clinic.monthsActive, 1)).toFixed(2);
  const paybackMonths = monthlyRecurring > 0 ? +(clinic.marketingSpend / monthlyRecurring).toFixed(1) : 0;

  let grade: GrowthMetrics["grade"] = "D";
  if (ltvCacRatio >= 3) grade = "A";
  else if (ltvCacRatio >= 2) grade = "B";
  else if (ltvCacRatio >= 1) grade = "C";

  return {
    clinicId: clinic.clinicId,
    clinicName: clinic.clinicName,
    ltv,
    cac,
    ltvCacRatio,
    revenuePerPatient: ltv,
    monthlyRecurring,
    paybackMonths,
    grade,
  };
}

export function computeSystemGrowth(clinics: ClinicData[]): {
  totalPatients: number;
  totalRevenue: number;
  avgLtvCacRatio: number;
  topGrade: string;
  clinicMetrics: GrowthMetrics[];
} {
  const clinicMetrics = clinics.map(growthMetrics);
  const totalPatients = clinics.reduce((s, c) => s + c.patients, 0);
  const totalRevenue  = clinics.reduce((s, c) => s + c.revenue, 0);
  const avgLtvCacRatio = clinicMetrics.length > 0
    ? +(clinicMetrics.reduce((s, m) => s + m.ltvCacRatio, 0) / clinicMetrics.length).toFixed(2)
    : 0;
  const topGrade = clinicMetrics.some((m) => m.grade === "A") ? "A" : clinicMetrics[0]?.grade ?? "N/A";

  return { totalPatients, totalRevenue, avgLtvCacRatio, topGrade, clinicMetrics };
}

export function getGrowthMetricStats() {
  return { active: true, grades: ["A", "B", "C", "D"], ltvCacThreshold: 3 };
}
