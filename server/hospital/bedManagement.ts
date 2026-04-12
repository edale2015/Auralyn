/**
 * Bed Management — Real-time occupancy, patient flow, admission queue.
 */

import { randomUUID } from "crypto";
import type { Unit } from "./staffingEngine";

export type BedType   = "GENERAL" | "ICU" | "ISOLATION" | "TELEMETRY" | "STEP_DOWN";
export type BedStatus = "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "RESERVED";

export interface Bed {
  id:                string;
  number:            string;
  unit:              Unit;
  type:              BedType;
  status:            BedStatus;
  patientId?:        string;
  patientName?:      string;
  admittedAt?:       string;
  predictedDischarge?:string;
  acuityLevel:       1 | 2 | 3 | 4 | 5; // 1=critical, 5=routine
}

export interface AdmitRequest {
  patientId:           string;
  patientName:         string;
  unit:                Unit;
  bedType?:            BedType;
  acuityLevel?:        Bed["acuityLevel"];
  predictedDischarge?: string;
}

export interface BedOccupancyReport {
  unit:             Unit;
  total:            number;
  occupied:         number;
  available:        number;
  occupancyRate:    number;
  critical:         number;      // acuity 1–2
  predictedDischarges:number;
}

const beds = new Map<string, Bed>();

// Seed bed inventory
const UNITS: { unit: Unit; type: BedType; count: number }[] = [
  { unit: "ED",          type: "GENERAL",    count: 20 },
  { unit: "ICU",         type: "ICU",        count: 12 },
  { unit: "ICU",         type: "ISOLATION",  count: 4  },
  { unit: "MedSurg",     type: "GENERAL",    count: 30 },
  { unit: "MedSurg",     type: "TELEMETRY",  count: 8  },
  { unit: "Urgent_Care", type: "GENERAL",    count: 10 },
  { unit: "OB",          type: "GENERAL",    count: 10 },
  { unit: "PEDS",        type: "GENERAL",    count: 12 },
];

let bedNum = 1;
for (const { unit, type, count } of UNITS) {
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    beds.set(id, {
      id,
      number:      `${unit.slice(0, 2).toUpperCase()}-${String(bedNum++).padStart(3, "0")}`,
      unit,
      type,
      status:      Math.random() > 0.4 ? "OCCUPIED" : Math.random() > 0.5 ? "AVAILABLE" : "CLEANING",
      acuityLevel: Math.ceil(Math.random() * 5) as Bed["acuityLevel"],
    });
  }
}
// Assign some patient names to occupied beds
const SAMPLE_PATIENTS = ["Anna Kim", "Carlos Diaz", "Emily Park", "George Brown", "Helen Li"];
let pi = 0;
for (const bed of beds.values()) {
  if (bed.status === "OCCUPIED") {
    bed.patientId    = `P${String(pi + 100).padStart(4, "0")}`;
    bed.patientName  = SAMPLE_PATIENTS[pi % SAMPLE_PATIENTS.length];
    bed.admittedAt   = new Date(Date.now() - Math.random() * 72 * 3600000).toISOString();
    bed.predictedDischarge = new Date(Date.now() + Math.random() * 48 * 3600000).toISOString();
    pi++;
  }
}

export function getBed(id: string): Bed | undefined {
  return beds.get(id);
}

export function listBeds(filter?: { unit?: Unit; status?: BedStatus; type?: BedType }): Bed[] {
  let list = [...beds.values()];
  if (filter?.unit)   list = list.filter((b) => b.unit   === filter.unit);
  if (filter?.status) list = list.filter((b) => b.status === filter.status);
  if (filter?.type)   list = list.filter((b) => b.type   === filter.type);
  return list;
}

export function admitPatient(req: AdmitRequest): { ok: boolean; bed?: Bed; error?: string } {
  const available = listBeds({ unit: req.unit, status: "AVAILABLE" })
    .filter((b) => !req.bedType || b.type === req.bedType);

  if (available.length === 0) {
    return { ok: false, error: `No available beds in ${req.unit}` };
  }

  const bed = available[0];
  bed.status            = "OCCUPIED";
  bed.patientId         = req.patientId;
  bed.patientName       = req.patientName;
  bed.admittedAt        = new Date().toISOString();
  bed.predictedDischarge= req.predictedDischarge;
  bed.acuityLevel       = req.acuityLevel ?? 3;

  return { ok: true, bed };
}

export function dischargePatient(bedId: string): { ok: boolean; error?: string } {
  const bed = beds.get(bedId);
  if (!bed)                      return { ok: false, error: "Bed not found" };
  if (bed.status !== "OCCUPIED") return { ok: false, error: "Bed is not occupied" };

  bed.status   = "CLEANING";
  bed.patientId    = undefined;
  bed.patientName  = undefined;
  bed.admittedAt   = undefined;
  bed.predictedDischarge = undefined;
  bed.acuityLevel  = 5;

  return { ok: true };
}

export function markBedAvailable(bedId: string): boolean {
  const bed = beds.get(bedId);
  if (!bed || bed.status !== "CLEANING") return false;
  bed.status = "AVAILABLE";
  return true;
}

export function getOccupancyReport(): BedOccupancyReport[] {
  const units = [...new Set([...beds.values()].map((b) => b.unit))];
  return units.map((unit) => {
    const unitBeds   = listBeds({ unit });
    const occupied   = unitBeds.filter((b) => b.status === "OCCUPIED");
    const available  = unitBeds.filter((b) => b.status === "AVAILABLE");
    const critical   = occupied.filter((b) => b.acuityLevel <= 2);
    const predicted  = occupied.filter((b) => b.predictedDischarge && new Date(b.predictedDischarge) < new Date(Date.now() + 8 * 3600000));
    return {
      unit,
      total:               unitBeds.length,
      occupied:            occupied.length,
      available:           available.length,
      occupancyRate:       unitBeds.length ? Number((occupied.length / unitBeds.length).toFixed(3)) : 0,
      critical:            critical.length,
      predictedDischarges: predicted.length,
    };
  });
}

export function getHospitalCapacity() {
  const all      = [...beds.values()];
  const occupied = all.filter((b) => b.status === "OCCUPIED").length;
  const total    = all.length;
  const critical = all.filter((b) => b.status === "OCCUPIED" && b.acuityLevel <= 2).length;
  return {
    total,
    occupied,
    available: all.filter((b) => b.status === "AVAILABLE").length,
    cleaning:  all.filter((b) => b.status === "CLEANING").length,
    occupancyRate: Number((occupied / total).toFixed(3)),
    criticalPatients: critical,
  };
}
