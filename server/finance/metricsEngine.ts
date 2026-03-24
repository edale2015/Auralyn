import { auditLog } from "../security/auditLogger";

export interface PatientFinancials {
  id: string;
  acquisitionCost: number;
  revenue: number;
  complaint?: string;
  source?: string;
  zip?: string;
  visitDate?: string;
}

export interface FinancialSnapshot {
  ltv: number;
  cac: number;
  margin: number;
  ltvCacRatio: number;
  totalRevenue: number;
  totalCost: number;
  totalPatients: number;
  netIncome: number;
  burnRate?: number;
  runway?: number;
}

const patients: PatientFinancials[] = [];

const FIXED_MONTHLY_OVERHEAD = 25_000;
const SEED_PATIENTS: PatientFinancials[] = [
  { id: "p-fin-001", acquisitionCost: 42, revenue: 135, complaint: "sore_throat", source: "nyc_campaign", zip: "10033" },
  { id: "p-fin-002", acquisitionCost: 38, revenue: 175, complaint: "rash", source: "organic", zip: "10027" },
  { id: "p-fin-003", acquisitionCost: 55, revenue: 120, complaint: "ear_pain", source: "referral", zip: "10032" },
  { id: "p-fin-004", acquisitionCost: 28, revenue: 85, complaint: "flu_like", source: "whatsapp", zip: "10031" },
  { id: "p-fin-005", acquisitionCost: 61, revenue: 220, complaint: "chest_pain", source: "nyc_campaign", zip: "10036" },
  { id: "p-fin-006", acquisitionCost: 33, revenue: 120, complaint: "cough", source: "organic", zip: "10025" },
  { id: "p-fin-007", acquisitionCost: 44, revenue: 145, complaint: "sinusitis", source: "referral", zip: "10033" },
  { id: "p-fin-008", acquisitionCost: 29, revenue: 90, complaint: "fever", source: "whatsapp", zip: "10032" },
];

for (const p of SEED_PATIENTS) patients.push(p);

export function recordPatient(p: PatientFinancials): void {
  patients.push({ ...p, visitDate: p.visitDate ?? new Date().toISOString() });
  auditLog({ actor: "finance_metrics", action: "patient_recorded", details: { id: p.id, revenue: p.revenue } });
}

export function computeLTV(): number {
  if (!patients.length) return 0;
  return patients.reduce((s, p) => s + p.revenue, 0) / patients.length;
}

export function computeCAC(): number {
  if (!patients.length) return 0;
  return patients.reduce((s, p) => s + p.acquisitionCost, 0) / patients.length;
}

export function computeMargin(): number {
  const revenue = patients.reduce((s, p) => s + p.revenue, 0);
  const cost = patients.reduce((s, p) => s + p.acquisitionCost, 0) + FIXED_MONTHLY_OVERHEAD;
  if (!revenue) return 0;
  return (revenue - cost) / revenue;
}

export function getFinancialSnapshot(): FinancialSnapshot {
  const totalRevenue = patients.reduce((s, p) => s + p.revenue, 0);
  const totalCost = patients.reduce((s, p) => s + p.acquisitionCost, 0) + FIXED_MONTHLY_OVERHEAD;
  const netIncome = totalRevenue - totalCost;
  const ltv = computeLTV();
  const cac = computeCAC();
  const margin = computeMargin();

  return {
    ltv: Math.round(ltv * 100) / 100,
    cac: Math.round(cac * 100) / 100,
    margin: Math.round(margin * 10000) / 100,
    ltvCacRatio: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : 0,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100,
    totalPatients: patients.length,
    burnRate: FIXED_MONTHLY_OVERHEAD,
    runway: netIncome > 0 ? null : Math.round(100_000 / Math.abs(netIncome)) as any,
  };
}

export function getRevenueBySource(): Record<string, { patients: number; revenue: number; avgRevenue: number }> {
  const bySource: Record<string, { patients: number; revenue: number }> = {};
  for (const p of patients) {
    const src = p.source ?? "unknown";
    if (!bySource[src]) bySource[src] = { patients: 0, revenue: 0 };
    bySource[src].patients++;
    bySource[src].revenue += p.revenue;
  }
  return Object.fromEntries(
    Object.entries(bySource).map(([k, v]) => [k, { ...v, avgRevenue: Math.round((v.revenue / v.patients) * 100) / 100 }])
  );
}

export function getRevenueByComplaint(): Record<string, { patients: number; revenue: number; avgRevenue: number }> {
  const by: Record<string, { patients: number; revenue: number }> = {};
  for (const p of patients) {
    const k = p.complaint ?? "unknown";
    if (!by[k]) by[k] = { patients: 0, revenue: 0 };
    by[k].patients++;
    by[k].revenue += p.revenue;
  }
  return Object.fromEntries(
    Object.entries(by).map(([k, v]) => [k, { ...v, avgRevenue: Math.round((v.revenue / v.patients) * 100) / 100 }])
  );
}
