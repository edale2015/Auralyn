/**
 * Staffing Engine — Shift management, ratio monitoring, demand forecasting.
 */

import { randomUUID } from "crypto";

export type StaffRole = "MD" | "DO" | "NP" | "PA" | "RN" | "LPN" | "CNA" | "TECH" | "ADMIN";
export type Unit      = "ED" | "ICU" | "MedSurg" | "OB" | "PEDS" | "OR" | "PACU" | "Urgent_Care";
export type ShiftType = "DAY" | "EVENING" | "NIGHT" | "FLOAT";

export interface StaffMember {
  id:          string;
  name:        string;
  role:        StaffRole;
  unit:        Unit;
  shiftType:   ShiftType;
  shiftStart:  string;   // ISO
  shiftEnd:    string;
  patientLoad: number;
  overtimeHrs: number;
  active:      boolean;
}

export interface StaffingAlert {
  type:    "RATIO_BREACH" | "OVERTIME" | "UNDERSTAFFED" | "COVERAGE_GAP";
  unit:    Unit;
  message: string;
  severity:"low" | "medium" | "high" | "critical";
}

export interface ShiftDemand {
  unit:          Unit;
  currentStaff:  number;
  requiredStaff: number;
  deficit:       number;
  patientCount:  number;
}

// Nurse-to-patient ratios by unit (max patients per nurse)
const SAFE_RATIOS: Record<Unit, { rn: number; md: number }> = {
  ED:          { rn: 4,  md: 8  },
  ICU:         { rn: 2,  md: 6  },
  MedSurg:     { rn: 5,  md: 15 },
  OB:          { rn: 3,  md: 10 },
  PEDS:        { rn: 4,  md: 12 },
  OR:          { rn: 1,  md: 4  },
  PACU:        { rn: 2,  md: 8  },
  Urgent_Care: { rn: 4,  md: 10 },
};

const staff = new Map<string, StaffMember>();
let patientCounts: Record<Unit, number> = { ED: 18, ICU: 8, MedSurg: 22, OB: 6, PEDS: 10, OR: 4, PACU: 5, Urgent_Care: 14 };

// Seed staff roster
const seedStaff: Omit<StaffMember, "id">[] = [
  { name: "Dr. Patel",    role: "MD", unit: "ED",          shiftType: "DAY",     shiftStart: "07:00", shiftEnd: "19:00", patientLoad: 8,  overtimeHrs: 0,  active: true },
  { name: "Dr. Chen",     role: "MD", unit: "ICU",         shiftType: "DAY",     shiftStart: "07:00", shiftEnd: "19:00", patientLoad: 5,  overtimeHrs: 0,  active: true },
  { name: "NP Williams",  role: "NP", unit: "Urgent_Care", shiftType: "DAY",     shiftStart: "08:00", shiftEnd: "20:00", patientLoad: 9,  overtimeHrs: 0,  active: true },
  { name: "RN Martinez",  role: "RN", unit: "ED",          shiftType: "DAY",     shiftStart: "07:00", shiftEnd: "19:00", patientLoad: 4,  overtimeHrs: 2,  active: true },
  { name: "RN Thompson",  role: "RN", unit: "ICU",         shiftType: "DAY",     shiftStart: "07:00", shiftEnd: "19:00", patientLoad: 2,  overtimeHrs: 0,  active: true },
  { name: "RN Davis",     role: "RN", unit: "MedSurg",     shiftType: "EVENING", shiftStart: "15:00", shiftEnd: "23:00", patientLoad: 5,  overtimeHrs: 0,  active: true },
  { name: "RN Garcia",    role: "RN", unit: "MedSurg",     shiftType: "NIGHT",   shiftStart: "23:00", shiftEnd: "07:00", patientLoad: 5,  overtimeHrs: 4,  active: true },
  { name: "CNA Brown",    role: "CNA",unit: "MedSurg",     shiftType: "DAY",     shiftStart: "07:00", shiftEnd: "15:00", patientLoad: 8,  overtimeHrs: 0,  active: true },
];
for (const s of seedStaff) addStaff(s);

export function addStaff(member: Omit<StaffMember, "id">): StaffMember {
  const s = { ...member, id: randomUUID() };
  staff.set(s.id, s);
  return s;
}

export function getStaff(id: string): StaffMember | undefined {
  return staff.get(id);
}

export function listStaff(filter?: { unit?: Unit; role?: StaffRole; active?: boolean }): StaffMember[] {
  let list = [...staff.values()];
  if (filter?.unit)   list = list.filter((s) => s.unit   === filter.unit);
  if (filter?.role)   list = list.filter((s) => s.role   === filter.role);
  if (filter?.active !== undefined) list = list.filter((s) => s.active === filter.active);
  return list;
}

export function updatePatientCounts(counts: Partial<Record<Unit, number>>): void {
  patientCounts = { ...patientCounts, ...counts };
}

export function checkStaffingRatios(): StaffingAlert[] {
  const alerts: StaffingAlert[] = [];

  for (const unit of Object.keys(SAFE_RATIOS) as Unit[]) {
    const ratio       = SAFE_RATIOS[unit];
    const unitStaff   = listStaff({ unit, active: true });
    const nurses      = unitStaff.filter((s) => s.role === "RN" || s.role === "LPN");
    const physicians  = unitStaff.filter((s) => ["MD", "DO", "NP", "PA"].includes(s.role));
    const patients    = patientCounts[unit] ?? 0;

    if (nurses.length === 0 && patients > 0) {
      alerts.push({ type: "UNDERSTAFFED", unit, message: `No nurses on ${unit} with ${patients} patients`, severity: "critical" });
    } else if (nurses.length > 0 && patients / nurses.length > ratio.rn) {
      const breach = (patients / nurses.length - ratio.rn).toFixed(1);
      alerts.push({ type: "RATIO_BREACH", unit, message: `Nurse ratio breach on ${unit}: +${breach} over limit`, severity: "high" });
    }

    if (physicians.length === 0 && patients > 0) {
      alerts.push({ type: "COVERAGE_GAP", unit, message: `No physician coverage on ${unit}`, severity: "critical" });
    }
  }

  // Overtime alerts
  for (const s of staff.values()) {
    if (s.overtimeHrs > 8) {
      alerts.push({ type: "OVERTIME", unit: s.unit, message: `${s.name} at ${s.overtimeHrs}h overtime`, severity: s.overtimeHrs > 16 ? "high" : "medium" });
    }
  }

  return alerts;
}

export function computeShiftDemand(): ShiftDemand[] {
  return (Object.keys(SAFE_RATIOS) as Unit[]).map((unit) => {
    const ratio      = SAFE_RATIOS[unit];
    const patients   = patientCounts[unit] ?? 0;
    const nurses     = listStaff({ unit, active: true }).filter((s) => s.role === "RN" || s.role === "LPN").length;
    const required   = Math.ceil(patients / ratio.rn);
    return { unit, currentStaff: nurses, requiredStaff: required, deficit: Math.max(0, required - nurses), patientCount: patients };
  });
}

export function getStaffingSummary() {
  const all      = [...staff.values()];
  const active   = all.filter((s) => s.active);
  const alerts   = checkStaffingRatios();
  const demand   = computeShiftDemand();
  const totalDeficit = demand.reduce((s, d) => s + d.deficit, 0);
  return { totalStaff: all.length, activeStaff: active.length, alerts, demand, totalDeficit, patientCounts };
}
