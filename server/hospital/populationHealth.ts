/**
 * Population Health — Cohort risk stratification, chronic disease tracking,
 * readmission risk, and preventive care gap analysis.
 */

import { randomUUID } from "crypto";

export type ChronicCondition = "HTN" | "DM2" | "COPD" | "CHF" | "CKD" | "OBESITY" | "DEPRESSION" | "AFIB";
export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface PatientRecord {
  id:               string;
  name:             string;
  age:              number;
  sex:              "M" | "F" | "X";
  conditions:       ChronicCondition[];
  lastVisit:        string;      // ISO date
  readmissionRisk:  number;      // 0–1
  riskTier:         RiskTier;
  A1c?:             number;
  systolicBP?:      number;
  bmi?:             number;
  smokingStatus:    "NEVER" | "FORMER" | "CURRENT";
  preventiveGaps:   string[];    // e.g. "flu_vaccine", "mammogram"
}

export interface CohortAnalysis {
  condition:        ChronicCondition;
  count:            number;
  avgAge:           number;
  avgReadmissionRisk:number;
  highRiskCount:    number;
  commonGaps:       string[];
}

export interface PopulationSummary {
  totalPatients:    number;
  byRiskTier:       Record<RiskTier, number>;
  topConditions:    { condition: ChronicCondition; count: number }[];
  avgReadmissionRisk:number;
  preventiveCareGapRate:number;
  readmissionRiskAbove50: number;
}

const patients = new Map<string, PatientRecord>();

// Seed realistic patient population (30 patients)
const CONDITIONS: ChronicCondition[] = ["HTN", "DM2", "COPD", "CHF", "CKD", "OBESITY", "DEPRESSION", "AFIB"];
const NAMES = ["Alma Torres", "Ben Wright", "Clara Song", "David Osei", "Eva Reyes", "Frank Liu", "Grace Yoon",
  "Henry Addo", "Isla Novak", "Jax Ferreira", "Karen Stone", "Leo Diaz", "Maya Chen", "Nate Park",
  "Olivia Grant", "Paul Mensah", "Quinn Rivera", "Rosa Ito", "Sam Kumar", "Tia Brooks"];

for (let i = 0; i < 20; i++) {
  const age   = 40 + Math.floor(Math.random() * 40);
  const condCount = Math.floor(Math.random() * 4);
  const conds = CONDITIONS.slice(0, condCount + 1).sort(() => Math.random() - 0.5).slice(0, condCount);
  const readRisk = calculateReadmissionRisk(age, conds);
  const gaps = generatePreventiveGaps(age, conds);
  const id = randomUUID();
  patients.set(id, {
    id,
    name:             NAMES[i],
    age,
    sex:              (["M", "F", "X"] as const)[Math.floor(Math.random() * 2)],
    conditions:       conds,
    lastVisit:        new Date(Date.now() - Math.random() * 180 * 86400000).toISOString(),
    readmissionRisk:  readRisk,
    riskTier:         toRiskTier(readRisk),
    A1c:              conds.includes("DM2") ? 6.5 + Math.random() * 3 : undefined,
    systolicBP:       conds.includes("HTN") ? 130 + Math.floor(Math.random() * 30) : undefined,
    bmi:              conds.includes("OBESITY") ? 30 + Math.random() * 10 : 22 + Math.random() * 8,
    smokingStatus:    (["NEVER", "FORMER", "CURRENT"] as const)[Math.floor(Math.random() * 3)],
    preventiveGaps:   gaps,
  });
}

function calculateReadmissionRisk(age: number, conditions: ChronicCondition[]): number {
  let risk = 0.05;
  risk += conditions.length * 0.08;
  if (age > 65) risk += 0.12;
  if (conditions.includes("CHF"))   risk += 0.15;
  if (conditions.includes("COPD"))  risk += 0.10;
  if (conditions.includes("CKD"))   risk += 0.08;
  if (conditions.includes("DM2"))   risk += 0.06;
  return Math.min(Number(risk.toFixed(3)), 1.0);
}

function toRiskTier(risk: number): RiskTier {
  if (risk >= 0.6) return "VERY_HIGH";
  if (risk >= 0.35) return "HIGH";
  if (risk >= 0.15) return "MEDIUM";
  return "LOW";
}

function generatePreventiveGaps(age: number, conditions: ChronicCondition[]): string[] {
  const gaps: string[] = [];
  if (Math.random() > 0.6) gaps.push("flu_vaccine");
  if (age > 50 && Math.random() > 0.5) gaps.push("colonoscopy");
  if (conditions.includes("DM2") && Math.random() > 0.5) gaps.push("eye_exam");
  if (conditions.includes("HTN") && Math.random() > 0.6) gaps.push("echocardiogram");
  if (age > 45 && Math.random() > 0.7) gaps.push("lipid_panel");
  if (conditions.includes("CKD") && Math.random() > 0.5) gaps.push("renal_ultrasound");
  return gaps;
}

export function addPatient(record: Omit<PatientRecord, "id" | "readmissionRisk" | "riskTier">): PatientRecord {
  const readmissionRisk = calculateReadmissionRisk(record.age, record.conditions);
  const p: PatientRecord = { ...record, id: randomUUID(), readmissionRisk, riskTier: toRiskTier(readmissionRisk) };
  patients.set(p.id, p);
  return p;
}

export function getPatient(id: string): PatientRecord | undefined {
  return patients.get(id);
}

export function listPatients(filter?: { riskTier?: RiskTier; condition?: ChronicCondition }): PatientRecord[] {
  let list = [...patients.values()];
  if (filter?.riskTier)  list = list.filter((p) => p.riskTier  === filter.riskTier);
  if (filter?.condition) list = list.filter((p) => p.conditions.includes(filter.condition!));
  return list.sort((a, b) => b.readmissionRisk - a.readmissionRisk);
}

export function analyzeConditionCohort(condition: ChronicCondition): CohortAnalysis {
  const cohort = listPatients({ condition });
  if (!cohort.length) return { condition, count: 0, avgAge: 0, avgReadmissionRisk: 0, highRiskCount: 0, commonGaps: [] };

  const avgAge = cohort.reduce((s, p) => s + p.age, 0) / cohort.length;
  const avgRisk = cohort.reduce((s, p) => s + p.readmissionRisk, 0) / cohort.length;
  const highRisk = cohort.filter((p) => p.riskTier === "HIGH" || p.riskTier === "VERY_HIGH");

  const gapCounts: Record<string, number> = {};
  for (const p of cohort) for (const g of p.preventiveGaps) gapCounts[g] = (gapCounts[g] ?? 0) + 1;
  const commonGaps = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  return {
    condition,
    count:             cohort.length,
    avgAge:            Number(avgAge.toFixed(1)),
    avgReadmissionRisk:Number(avgRisk.toFixed(3)),
    highRiskCount:     highRisk.length,
    commonGaps,
  };
}

export function getPopulationSummary(): PopulationSummary {
  const all = [...patients.values()];
  const byRiskTier: Record<RiskTier, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 };
  for (const p of all) byRiskTier[p.riskTier]++;

  const condCount: Record<string, number> = {};
  for (const p of all) for (const c of p.conditions) condCount[c] = (condCount[c] ?? 0) + 1;
  const topConditions = Object.entries(condCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([condition, count]) => ({ condition: condition as ChronicCondition, count }));

  const avgRisk = all.reduce((s, p) => s + p.readmissionRisk, 0) / (all.length || 1);
  const gapPatients = all.filter((p) => p.preventiveGaps.length > 0);
  const highRisk = all.filter((p) => p.readmissionRisk > 0.5);

  return {
    totalPatients:       all.length,
    byRiskTier,
    topConditions,
    avgReadmissionRisk:  Number(avgRisk.toFixed(3)),
    preventiveCareGapRate: Number((gapPatients.length / (all.length || 1)).toFixed(3)),
    readmissionRiskAbove50: highRisk.length,
  };
}

export function getReadmissionAlerts(threshold = 0.5): PatientRecord[] {
  return listPatients().filter((p) => p.readmissionRisk >= threshold);
}
