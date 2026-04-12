/**
 * ICU Bed Allocator — predictive bed allocation BEFORE patient crashes
 * Uses Digital Twin ICU probability + time-to-event to prioritize beds
 */

import { runDigitalTwin, type TwinPatient } from "../digitalTwin/digitalTwinEngine";

export interface ICUBed {
  id:           string;
  hospitalId:   string;
  available:    boolean;
  wing?:        string;
}

export interface ICUProjection {
  patientId: string;
  icuProb:   number;
  tte:       number;          // minutes to ICU threshold, -1 = never
  priority:  number;          // 0–1 combined score
}

export interface ICUAssignment {
  patientId:     string;
  bedId:         string;
  hospitalId:    string;
  priorityScore: number;
  assignedAt:    string;
}

export function allocateICUBeds(patients: TwinPatient[], beds: ICUBed[]): ICUAssignment[] {
  const projections: ICUProjection[] = patients.map((p) => {
    const twin = runDigitalTwin(p, 120); // 2-hour horizon
    // Priority: high icuProb + imminent TTE
    const tteFactor = twin.tteMinutes === -1 ? 0 : Math.max(0, 1 - twin.tteMinutes / 120);
    return {
      patientId: p.id,
      icuProb:   twin.icuProb,
      tte:       twin.tteMinutes,
      priority:  twin.icuProb * 0.7 + tteFactor * 0.3,
    };
  });

  // Sort sickest-first
  projections.sort((a, b) => {
    if (Math.abs(b.priority - a.priority) > 0.01) return b.priority - a.priority;
    const tteA = a.tte === -1 ? Infinity : a.tte;
    const tteB = b.tte === -1 ? Infinity : b.tte;
    return tteA - tteB;
  });

  const availableBeds = beds.filter((b) => b.available);
  const assignments:  ICUAssignment[] = [];

  for (let i = 0; i < projections.length && i < availableBeds.length; i++) {
    const p   = projections[i];
    const bed = availableBeds[i];
    if (p.icuProb < 0.15) continue; // Don't allocate ICU for very low risk

    assignments.push({
      patientId:     p.patientId,
      bedId:         bed.id,
      hospitalId:    bed.hospitalId,
      priorityScore: Math.round(p.priority * 1000) / 1000,
      assignedAt:    new Date().toISOString(),
    });
  }

  return assignments;
}
