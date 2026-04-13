/**
 * hospitalRegistry.ts — Multi-hospital coordination registry
 *
 * Article 28c (Hospital Command Center): "hospitals = [
 *   { id: 'H1', name: 'NYC General', icuBeds: 5 },
 *   { id: 'H2', name: 'Columbia', icuBeds: 2 },
 *   { id: 'H3', name: 'Mount Sinai', icuBeds: 8 },
 * ]
 * getAvailableHospital() → sort by icuBeds descending → return highest capacity"
 *
 * Auralyn clinical context:
 *   Multi-hospital network in NYC urgent care market. When an ESI-1 patient
 *   needs ICU transfer, the system routes to the hospital with the most
 *   available ICU beds in real time.
 *
 * Real-world extension points:
 *   - Integrate with Epic ADT (Admission/Discharge/Transfer) for live bed counts
 *   - Add specialty capability flags (trauma center, burn unit, cardiac cath)
 *   - Add travel time matrix for ambulance routing optimization
 */

export interface Hospital {
  id:          string;
  name:        string;
  borough:     string;
  icuBeds:     number;    // current available beds (mutable)
  totalIcuBeds: number;   // total capacity
  specialties: string[];
  active:      boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _hospitals: Hospital[] = [
  {
    id: "H1", name: "NYC General Hospital",   borough: "Manhattan",
    icuBeds: 5, totalIcuBeds: 12,
    specialties: ["trauma", "cardiac", "neurology"],
    active: true,
  },
  {
    id: "H2", name: "Columbia University Medical Center", borough: "Manhattan",
    icuBeds: 2, totalIcuBeds: 8,
    specialties: ["cardiac", "oncology", "transplant"],
    active: true,
  },
  {
    id: "H3", name: "Mount Sinai Hospital",   borough: "Manhattan",
    icuBeds: 8, totalIcuBeds: 20,
    specialties: ["cardiac", "neurology", "trauma"],
    active: true,
  },
  {
    id: "H4", name: "Bellevue Hospital Center", borough: "Manhattan",
    icuBeds: 3, totalIcuBeds: 15,
    specialties: ["trauma", "psychiatry", "burn"],
    active: true,
  },
  {
    id: "H5", name: "NewYork-Presbyterian",   borough: "Manhattan",
    icuBeds: 10, totalIcuBeds: 35,
    specialties: ["cardiac", "transplant", "neurology", "oncology", "trauma"],
    active: true,
  },
];

export function getAvailableHospital(specialty?: string): Hospital | null {
  const candidates = _hospitals
    .filter((h) => h.active && h.icuBeds > 0)
    .filter((h) => !specialty || h.specialties.includes(specialty));

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.icuBeds - a.icuBeds)[0];
}

export function getAllHospitals(): Hospital[] {
  return _hospitals;
}

export function getHospital(id: string): Hospital | undefined {
  return _hospitals.find((h) => h.id === id);
}

export function getTotalAvailableBeds(): number {
  return _hospitals.filter((h) => h.active).reduce((s, h) => s + h.icuBeds, 0);
}

export function getTotalCapacity(): number {
  return _hospitals.filter((h) => h.active).reduce((s, h) => s + h.totalIcuBeds, 0);
}

export function getSystemOccupancy(): number {
  const available = getTotalAvailableBeds();
  const capacity  = getTotalCapacity();
  return capacity > 0 ? Math.round((1 - available / capacity) * 1000) / 1000 : 0;
}

export function updateBedCount(id: string, available: number): boolean {
  const h = _hospitals.find((h) => h.id === id);
  if (!h) return false;
  h.icuBeds = Math.max(0, Math.min(available, h.totalIcuBeds));
  return true;
}
