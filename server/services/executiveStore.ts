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

export function seedExecutiveData() {
  if (snapshotStore.length > 0) return 0;

  const baseDate = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i * 7);
    snapId++;
    snapshotStore.push({
      id: snapId,
      clinicId: "clinicA",
      snapshotDate: d.toISOString(),
      totalCases: String(400 + Math.floor(Math.random() * 200)),
      reviewedCases: String(350 + Math.floor(Math.random() * 150)),
      escalatedCases: String(20 + Math.floor(Math.random() * 30)),
      overrideRate: String((0.05 + Math.random() * 0.12).toFixed(3)),
      avgSatisfaction: String((4.0 + Math.random() * 0.8).toFixed(2)),
      avgCostPerCase: String((15 + Math.random() * 10).toFixed(2)),
      avgRevenuePerCase: String((35 + Math.random() * 15).toFixed(2)),
      complaintBreakdown: { cough: 120, headache: 80, chest_pain: 60, back_pain: 40 },
      physicianBreakdown: { "dr-johnson": 150, "dr-lee": 120, "dr-smith": 80 },
    });
  }

  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i * 7);
    snapId++;
    snapshotStore.push({
      id: snapId,
      clinicId: "clinicB",
      snapshotDate: d.toISOString(),
      totalCases: String(250 + Math.floor(Math.random() * 150)),
      reviewedCases: String(220 + Math.floor(Math.random() * 100)),
      escalatedCases: String(10 + Math.floor(Math.random() * 20)),
      overrideRate: String((0.03 + Math.random() * 0.08).toFixed(3)),
      avgSatisfaction: String((4.2 + Math.random() * 0.6).toFixed(2)),
      avgCostPerCase: String((12 + Math.random() * 8).toFixed(2)),
      avgRevenuePerCase: String((30 + Math.random() * 12).toFixed(2)),
      complaintBreakdown: { cough: 80, rash: 50, dizziness: 40 },
      physicianBreakdown: { "dr-patel": 100, "dr-kim": 90 },
    });
  }

  return snapshotStore.length;
}
