/**
 * bedAllocator.ts — ICU bed allocation engine
 *
 * Article 28c (Hospital Command Center): "allocateICUBed(patient):
 *   hospital = getAvailableHospital()
 *   if !hospital || hospital.icuBeds <= 0 → { assigned: false, reason: 'No ICU beds available' }
 *   hospital.icuBeds -= 1
 *   return { assigned: true, hospital: hospital.name }"
 *
 * Clinical use case:
 *   Patient at Auralyn urgent care clinic deteriorates. System needs to
 *   find the nearest hospital with an available ICU bed. The bed allocator
 *   finds the best-fit hospital, reserves the bed atomically, and returns
 *   the assignment. EMS is notified and transport begins.
 *
 * Extended: deallocate when patient is transferred, admitted, or diverted.
 */

import {
  getAvailableHospital, getHospital, getTotalAvailableBeds,
  getSystemOccupancy, getAllHospitals,
  type Hospital,
} from "./hospitalRegistry";

export interface AllocationRequest {
  patientId:  string;
  urgency:    "critical" | "urgent" | "routine";
  specialty?: string;
}

export interface AllocationResult {
  assigned:    boolean;
  patientId:   string;
  hospital?:   string;
  hospitalId?: string;
  reason?:     string;     // only set on failure
  allocatedAt?: Date;
}

export interface AllocationRecord {
  id:         string;
  patientId:  string;
  hospitalId: string;
  status:     "active" | "released" | "diverted";
  allocatedAt: Date;
  releasedAt?: Date;
}

// ── Allocation store ──────────────────────────────────────────────────────────

const _allocations = new Map<string, AllocationRecord>();
let _seq = 1;

// ── allocateICUBed ────────────────────────────────────────────────────────────

export function allocateICUBed(req: AllocationRequest): AllocationResult {
  const hospital = getAvailableHospital(req.specialty);

  if (!hospital || hospital.icuBeds <= 0) {
    return {
      assigned:  false,
      patientId: req.patientId,
      reason:    "No ICU beds available across the hospital network",
    };
  }

  // Reserve the bed
  hospital.icuBeds -= 1;

  const record: AllocationRecord = {
    id:          `alloc_${Date.now()}_${_seq++}`,
    patientId:   req.patientId,
    hospitalId:  hospital.id,
    status:      "active",
    allocatedAt: new Date(),
  };
  _allocations.set(record.id, record);

  return {
    assigned:    true,
    patientId:   req.patientId,
    hospital:    hospital.name,
    hospitalId:  hospital.id,
    allocatedAt: record.allocatedAt,
  };
}

// ── releaseICUBed ─────────────────────────────────────────────────────────────

export function releaseICUBed(allocationId: string, reason: "admitted" | "diverted" | "error" = "admitted"): boolean {
  const record = _allocations.get(allocationId);
  if (!record || record.status !== "active") return false;

  record.status    = reason === "diverted" ? "diverted" : "released";
  record.releasedAt = new Date();

  // Return the bed to the hospital
  const hospital = getHospital(record.hospitalId);
  if (hospital) hospital.icuBeds = Math.min(hospital.icuBeds + 1, hospital.totalIcuBeds);

  return true;
}

// ── Network status ────────────────────────────────────────────────────────────

export interface NetworkStatus {
  totalAvailable: number;
  occupancy:      number;     // 0-1
  hospitals:      Array<{
    id:        string;
    name:      string;
    available: number;
    capacity:  number;
    status:    "open" | "near_capacity" | "full";
  }>;
  activeAllocations: number;
}

export function getNetworkStatus(): NetworkStatus {
  return {
    totalAvailable:   getTotalAvailableBeds(),
    occupancy:        getSystemOccupancy(),
    hospitals:        getAllHospitals().map((h) => ({
      id:       h.id,
      name:     h.name,
      available: h.icuBeds,
      capacity:  h.totalIcuBeds,
      status:   h.icuBeds === 0 ? "full" : h.icuBeds <= 2 ? "near_capacity" : "open",
    })),
    activeAllocations: Array.from(_allocations.values()).filter((a) => a.status === "active").length,
  };
}

export function getAllAllocations(): AllocationRecord[] {
  return Array.from(_allocations.values());
}
