import { auditLog } from "../security/auditLogger";

export type ShiftType = "day" | "night" | "on_call" | "weekend";
export type WorkforceAction = "hire" | "reduce_hours" | "stable" | "reallocate";

export interface WorkforcePhysician {
  id: string;
  name: string;
  specialties: string[];
  hoursWorked: number;
  hoursPerWeek: number;
  performance: number;
  active: boolean;
  salary?: number;
  joinedAt?: string;
  avgCasesPerHour?: number;
}

export interface ScheduleEntry {
  physicianId: string;
  name: string;
  shift: ShiftType;
  specialties: string[];
  hoursThisWeek: number;
  available: boolean;
}

export interface WorkforceDecision {
  action: WorkforceAction;
  count?: number;
  reason: string;
  utilizationRate: number;
  loadFactor: number;
  recommendedSpecialties?: string[];
}

const physicianReg = new Map<string, WorkforcePhysician>();

const SEED_PHYSICIANS: WorkforcePhysician[] = [
  { id: "dr-001", name: "Dr. Chen", specialties: ["ent", "general"], hoursWorked: 820, hoursPerWeek: 40, performance: 0.88, active: true, salary: 280_000, avgCasesPerHour: 3.2 },
  { id: "dr-002", name: "Dr. Patel", specialties: ["general", "infectious"], hoursWorked: 960, hoursPerWeek: 48, performance: 0.92, active: true, salary: 300_000, avgCasesPerHour: 3.8 },
  { id: "dr-003", name: "Dr. Rivera", specialties: ["derm", "general"], hoursWorked: 640, hoursPerWeek: 32, performance: 0.79, active: true, salary: 260_000, avgCasesPerHour: 2.9 },
  { id: "dr-004", name: "Dr. Kim", specialties: ["cardio", "general"], hoursWorked: 1100, hoursPerWeek: 50, performance: 0.95, active: false, salary: 380_000, avgCasesPerHour: 4.1 },
];

for (const p of SEED_PHYSICIANS) physicianReg.set(p.id, p);

export function registerPhysician(p: WorkforcePhysician): WorkforcePhysician {
  physicianReg.set(p.id, { ...p, joinedAt: p.joinedAt ?? new Date().toISOString() });
  auditLog({ actor: "workforce_registry", action: "physician_registered", details: { id: p.id, specialties: p.specialties } });
  return p;
}

export function updatePerformance(id: string, score: number): void {
  const p = physicianReg.get(id);
  if (!p) return;
  const updated = { ...p, performance: Math.max(0, Math.min(1, score)) };
  physicianReg.set(id, updated);
  auditLog({ actor: "workforce_registry", action: "performance_updated", details: { id, score } });
}

export function updateHours(id: string, hoursToAdd: number): void {
  const p = physicianReg.get(id);
  if (!p) return;
  physicianReg.set(id, { ...p, hoursWorked: p.hoursWorked + hoursToAdd });
}

export function getPhysicians(activeOnly = false): WorkforcePhysician[] {
  const all = [...physicianReg.values()];
  return activeOnly ? all.filter((p) => p.active) : all;
}

export function generateSchedule(): ScheduleEntry[] {
  const active = [...physicianReg.values()]
    .filter((p) => p.active)
    .sort((a, b) => a.hoursWorked - b.hoursWorked);

  return active.map((p, i) => ({
    physicianId: p.id,
    name: p.name,
    shift: (["day", "night", "day", "on_call"] as ShiftType[])[i % 4],
    specialties: p.specialties,
    hoursThisWeek: p.hoursPerWeek,
    available: p.performance >= 0.5,
  }));
}

export function evaluateWorkforce(totalActiveCases: number): WorkforceDecision {
  const active = [...physicianReg.values()].filter((p) => p.active);
  const capacityPerHour = active.reduce((s, p) => s + (p.avgCasesPerHour ?? 3), 0);
  const weeklyCapacity = capacityPerHour * 40;
  const utilizationRate = weeklyCapacity > 0 ? totalActiveCases / weeklyCapacity : 0;
  const loadFactor = active.length > 0 ? active.reduce((s, p) => s + p.hoursWorked / (p.hoursPerWeek * 52), 0) / active.length : 0;

  let action: WorkforceAction;
  let count: number | undefined;
  let reason: string;
  let recommendedSpecialties: string[] | undefined;

  if (utilizationRate > 0.85) {
    action = "hire";
    count = Math.ceil((totalActiveCases - weeklyCapacity * 0.7) / (3.5 * 40));
    reason = `Utilization at ${(utilizationRate * 100).toFixed(0)}% — system overloaded, hire ${count} more physician(s)`;
    const underrepresented = ["cardio", "derm", "pulm"].filter((s) => !active.some((p) => p.specialties.includes(s)));
    if (underrepresented.length) recommendedSpecialties = underrepresented;
  } else if (utilizationRate < 0.3) {
    action = "reduce_hours";
    reason = `Utilization at ${(utilizationRate * 100).toFixed(0)}% — reduce hours or redeploy capacity`;
  } else if (loadFactor > 0.9) {
    action = "reallocate";
    reason = `High per-physician load factor (${(loadFactor * 100).toFixed(0)}%) — redistribute caseload`;
  } else {
    action = "stable";
    reason = `Workforce healthy at ${(utilizationRate * 100).toFixed(0)}% utilization`;
  }

  auditLog({ actor: "workforce_registry", action: "workforce_evaluated", details: { action, utilizationRate, loadFactor, totalActiveCases } });

  return { action, count, reason, utilizationRate, loadFactor, recommendedSpecialties };
}

export function getWorkforceStats() {
  const all = [...physicianReg.values()];
  const active = all.filter((p) => p.active);
  const avgPerf = active.length > 0 ? active.reduce((s, p) => s + p.performance, 0) / active.length : 0;
  const totalSalary = all.reduce((s, p) => s + (p.salary ?? 0), 0);
  const topPerformer = [...active].sort((a, b) => b.performance - a.performance)[0];

  return {
    total: all.length,
    active: active.length,
    avgPerformance: Math.round(avgPerf * 1000) / 1000,
    totalAnnualSalary: totalSalary,
    topPerformer: topPerformer ? { id: topPerformer.id, name: topPerformer.name, performance: topPerformer.performance } : null,
  };
}
