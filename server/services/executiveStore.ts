export interface SimulationRun {
  id: number;
  packId: string;
  complaint: string;
  createdAt: string;
  strategyResults: unknown[];
}

export interface ControlRun {
  id: number;
  clinicId: string;
  runAt: string;
  input: unknown;
  output: unknown;
}

export interface ExecutiveSnapshot {
  id: number;
  clinicId: string;
  snapshotDate: string;
  totalCases: string;
  reviewedCases: string;
  escalatedCases: string;
  overrideRate: string;
  avgSatisfaction: string;
  avgCostPerCase: string;
  avgRevenuePerCase: string;
  complaintBreakdown: unknown;
  physicianBreakdown: unknown;
}

const simulationRunStore: SimulationRun[] = [];
const controlRunStore: ControlRun[] = [];
const snapshotStore: ExecutiveSnapshot[] = [];
let simId = 0;
let ctrlId = 0;
let snapId = 0;

export function saveSimulationRun(packId: string, complaint: string, strategyResults: unknown[]): SimulationRun {
  simId++;
  const row: SimulationRun = {
    id: simId,
    packId,
    complaint,
    createdAt: new Date().toISOString(),
    strategyResults,
  };
  simulationRunStore.unshift(row);
  return row;
}

export function listSimulationRuns(limit = 20): SimulationRun[] {
  return simulationRunStore.slice(0, limit);
}

export function saveControlRun(clinicId: string, input: unknown, output: unknown): ControlRun {
  ctrlId++;
  const row: ControlRun = {
    id: ctrlId,
    clinicId,
    runAt: new Date().toISOString(),
    input,
    output,
  };
  controlRunStore.unshift(row);
  return row;
}

export function listControlRuns(clinicId?: string, limit = 30): ControlRun[] {
  const filtered = clinicId ? controlRunStore.filter(r => r.clinicId === clinicId) : controlRunStore;
  return filtered.slice(0, limit);
}

export function saveExecutiveSnapshot(payload: {
  clinicId: string;
  totalCases: number;
  reviewedCases: number;
  escalatedCases: number;
  overrideRate: number;
  avgSatisfaction: number;
  avgCostPerCase: number;
  avgRevenuePerCase: number;
  complaintBreakdown: unknown;
  physicianBreakdown: unknown;
}): ExecutiveSnapshot {
  snapId++;
  const row: ExecutiveSnapshot = {
    id: snapId,
    clinicId: payload.clinicId,
    snapshotDate: new Date().toISOString(),
    totalCases: String(payload.totalCases),
    reviewedCases: String(payload.reviewedCases),
    escalatedCases: String(payload.escalatedCases),
    overrideRate: String(payload.overrideRate),
    avgSatisfaction: String(payload.avgSatisfaction),
    avgCostPerCase: String(payload.avgCostPerCase),
    avgRevenuePerCase: String(payload.avgRevenuePerCase),
    complaintBreakdown: payload.complaintBreakdown,
    physicianBreakdown: payload.physicianBreakdown,
  };
  snapshotStore.unshift(row);
  return row;
}

export function listExecutiveSnapshots(clinicId: string, limit = 30): ExecutiveSnapshot[] {
  return snapshotStore.filter(s => s.clinicId === clinicId).slice(0, limit);
}

const CLINIC_A_SEED: Array<{ totalCases: number; reviewedCases: number; escalatedCases: number; overrideRate: number; avgSatisfaction: number; avgCostPerCase: number; avgRevenuePerCase: number }> = [
  { totalCases: 412, reviewedCases: 372, escalatedCases: 22, overrideRate: 0.063, avgSatisfaction: 4.12, avgCostPerCase: 18.40, avgRevenuePerCase: 38.20 },
  { totalCases: 438, reviewedCases: 391, escalatedCases: 26, overrideRate: 0.071, avgSatisfaction: 4.08, avgCostPerCase: 19.10, avgRevenuePerCase: 39.80 },
  { totalCases: 455, reviewedCases: 408, escalatedCases: 24, overrideRate: 0.068, avgSatisfaction: 4.19, avgCostPerCase: 17.90, avgRevenuePerCase: 40.50 },
  { totalCases: 470, reviewedCases: 421, escalatedCases: 28, overrideRate: 0.075, avgSatisfaction: 4.22, avgCostPerCase: 20.30, avgRevenuePerCase: 42.10 },
  { totalCases: 489, reviewedCases: 442, escalatedCases: 31, overrideRate: 0.079, avgSatisfaction: 4.15, avgCostPerCase: 21.00, avgRevenuePerCase: 43.60 },
  { totalCases: 501, reviewedCases: 458, escalatedCases: 29, overrideRate: 0.074, avgSatisfaction: 4.28, avgCostPerCase: 19.70, avgRevenuePerCase: 44.30 },
  { totalCases: 518, reviewedCases: 474, escalatedCases: 33, overrideRate: 0.082, avgSatisfaction: 4.31, avgCostPerCase: 22.10, avgRevenuePerCase: 46.20 },
];

const CLINIC_B_SEED: Array<{ totalCases: number; reviewedCases: number; escalatedCases: number; overrideRate: number; avgSatisfaction: number; avgCostPerCase: number; avgRevenuePerCase: number }> = [
  { totalCases: 258, reviewedCases: 228, escalatedCases: 11, overrideRate: 0.038, avgSatisfaction: 4.23, avgCostPerCase: 14.20, avgRevenuePerCase: 31.80 },
  { totalCases: 271, reviewedCases: 241, escalatedCases: 13, overrideRate: 0.042, avgSatisfaction: 4.31, avgCostPerCase: 13.90, avgRevenuePerCase: 32.50 },
  { totalCases: 284, reviewedCases: 255, escalatedCases: 14, overrideRate: 0.044, avgSatisfaction: 4.38, avgCostPerCase: 14.80, avgRevenuePerCase: 33.20 },
  { totalCases: 296, reviewedCases: 268, escalatedCases: 16, overrideRate: 0.047, avgSatisfaction: 4.41, avgCostPerCase: 15.30, avgRevenuePerCase: 34.10 },
  { totalCases: 309, reviewedCases: 281, escalatedCases: 17, overrideRate: 0.049, avgSatisfaction: 4.45, avgCostPerCase: 15.90, avgRevenuePerCase: 35.40 },
  { totalCases: 322, reviewedCases: 294, escalatedCases: 19, overrideRate: 0.051, avgSatisfaction: 4.52, avgCostPerCase: 16.40, avgRevenuePerCase: 36.20 },
  { totalCases: 338, reviewedCases: 309, escalatedCases: 21, overrideRate: 0.054, avgSatisfaction: 4.58, avgCostPerCase: 17.10, avgRevenuePerCase: 37.80 },
];

export function seedExecutiveData() {
  if (snapshotStore.length > 0) return 0;

  const baseDate = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i * 7);
    const s = CLINIC_A_SEED[6 - i];
    snapId++;
    snapshotStore.push({
      id: snapId,
      clinicId: "clinicA",
      snapshotDate: d.toISOString(),
      totalCases: String(s.totalCases),
      reviewedCases: String(s.reviewedCases),
      escalatedCases: String(s.escalatedCases),
      overrideRate: String(s.overrideRate.toFixed(3)),
      avgSatisfaction: String(s.avgSatisfaction.toFixed(2)),
      avgCostPerCase: String(s.avgCostPerCase.toFixed(2)),
      avgRevenuePerCase: String(s.avgRevenuePerCase.toFixed(2)),
      complaintBreakdown: { cough: 120 + i * 8, headache: 80 + i * 4, chest_pain: 60 + i * 3, back_pain: 40 + i * 2 },
      physicianBreakdown: { "dr-johnson": 150 + i * 6, "dr-lee": 120 + i * 5, "dr-smith": 80 + i * 4 },
    });
  }

  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i * 7);
    const s = CLINIC_B_SEED[6 - i];
    snapId++;
    snapshotStore.push({
      id: snapId,
      clinicId: "clinicB",
      snapshotDate: d.toISOString(),
      totalCases: String(s.totalCases),
      reviewedCases: String(s.reviewedCases),
      escalatedCases: String(s.escalatedCases),
      overrideRate: String(s.overrideRate.toFixed(3)),
      avgSatisfaction: String(s.avgSatisfaction.toFixed(2)),
      avgCostPerCase: String(s.avgCostPerCase.toFixed(2)),
      avgRevenuePerCase: String(s.avgRevenuePerCase.toFixed(2)),
      complaintBreakdown: { cough: 80 + i * 4, rash: 50 + i * 3, dizziness: 40 + i * 2 },
      physicianBreakdown: { "dr-patel": 100 + i * 5, "dr-kim": 90 + i * 4 },
    });
  }

  return snapshotStore.length;
}
