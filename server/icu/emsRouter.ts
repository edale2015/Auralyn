/**
 * EMS Routing Engine
 * Routes patients to optimal hospitals based on ICU bed availability and proximity.
 * Scoring weights: 70% bed capacity, 30% proximity.
 */

export interface Hospital {
  id: string;
  name: string;
  icuBeds: number;
  totalBeds: number;
  distance: number;  // km from patient
  lat?: number;
  lon?: number;
  specialties?: string[];
}

export interface RoutingDecision {
  hospital: Hospital;
  score: number;
  rationale: string;
}

export function routePatient(
  patient: { id: string; symptoms?: string[]; urgency?: "routine" | "urgent" | "critical" },
  hospitals: Hospital[]
): RoutingDecision | null {
  if (!hospitals.length) return null;

  const scored = hospitals
    .filter(h => h.icuBeds > 0)
    .map(h => {
      const bedScore = Math.min(1, h.icuBeds / 10) * 0.70;
      const proximityScore = Math.max(0, 1 - h.distance / 50) * 0.30;
      const score = bedScore + proximityScore;
      return { hospital: h, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const best = scored[0];
  return {
    hospital: best.hospital,
    score: best.score,
    rationale: `Selected ${best.hospital.name}: ${best.hospital.icuBeds} ICU beds available, ${best.hospital.distance}km away`,
  };
}

export function routeMultiplePatients(
  patients: Array<{ id: string; urgency?: string }>,
  hospitals: Hospital[]
): Array<{ patientId: string; decision: RoutingDecision | null }> {
  const bedState = hospitals.map(h => ({ ...h }));  // mutable copy

  return patients.map(p => {
    const decision = routePatient(p as any, bedState);
    if (decision) {
      // Decrement bed count after allocation
      const h = bedState.find(b => b.id === decision.hospital.id);
      if (h && h.icuBeds > 0) h.icuBeds--;
    }
    return { patientId: p.id, decision };
  });
}
