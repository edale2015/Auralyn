/**
 * Hospital Coordinator — multi-hospital routing based on availability + proximity
 * Routes patients to hospitals with available ICU beds and shortest ETA
 */

export interface Hospital {
  id:           string;
  name:         string;
  icuBeds:      number;
  availableBeds:number;
  capabilities?: string[];    // ["trauma", "stroke", "cardiac", "burn"]
  location?:    { lat: number; lng: number };
}

export interface PatientRoute {
  patientId:         string;
  assignedHospital:  string | null;
  hospitalName?:     string;
  distanceScore?:    number;
  availableBeds?:    number;
  reason?:           string;
}

function haversineDistance(a?: { lat: number; lng: number }, b?: { lat: number; lng: number }): number {
  if (!a || !b) return 0;
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
}

export function routePatients(
  patients: Array<{ id: string; location?: { lat: number; lng: number }; requiredCapabilities?: string[] }>,
  hospitals: Hospital[]
): PatientRoute[] {
  return patients.map((p) => {
    let candidates = hospitals.filter((h) => h.availableBeds > 0);

    // Filter by required capabilities
    if (p.requiredCapabilities?.length) {
      const filtered = candidates.filter((h) =>
        p.requiredCapabilities!.every((c) => h.capabilities?.includes(c))
      );
      if (filtered.length > 0) candidates = filtered;
    }

    if (candidates.length === 0) {
      return { patientId: p.id, assignedHospital: null, reason: "No available beds at any hospital" };
    }

    // Sort by proximity then availability
    candidates.sort((a, b) => {
      const distA = haversineDistance(p.location, a.location);
      const distB = haversineDistance(p.location, b.location);
      if (Math.abs(distA - distB) > 0.01) return distA - distB;
      return b.availableBeds - a.availableBeds;
    });

    const best = candidates[0];
    return {
      patientId:        p.id,
      assignedHospital: best.id,
      hospitalName:     best.name,
      distanceScore:    haversineDistance(p.location, best.location),
      availableBeds:    best.availableBeds,
    };
  });
}

export function getSystemCapacity(hospitals: Hospital[]) {
  const total     = hospitals.reduce((s, h) => s + h.icuBeds, 0);
  const available = hospitals.reduce((s, h) => s + h.availableBeds, 0);
  return {
    total,
    available,
    utilized: total - available,
    utilizationPct: total > 0 ? Math.round((1 - available / total) * 100) : 0,
    critical: available < total * 0.1,
  };
}
