/**
 * National EMS Routing Engine
 * Routes patients to optimal facilities based on capacity, proximity, and specialization.
 * Supports multi-hospital network load balancing for mass casualty scenarios.
 */

export interface Facility {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  capacity: number;       // total ICU/acute beds available
  specialties?: string[]; // e.g., ["cardiology", "trauma", "neurology"]
  level?: number;         // trauma center level (1=highest)
}

export interface RoutingScore {
  facility: Facility;
  score: number;
  distanceKm: number;
  capacityScore: number;
  specialtyMatch: boolean;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function routeNationwide(
  patient: { lat: number; lon: number; requiredSpecialty?: string; urgency?: "critical" | "urgent" | "routine" },
  facilities: Facility[]
): RoutingScore[] {
  return facilities
    .filter(f => f.capacity > 0)
    .map(f => {
      const distanceKm   = haversineKm(patient.lat, patient.lon, f.lat, f.lon);
      const capacityScore = Math.min(1, f.capacity / 20);
      const proximityScore = Math.max(0, 1 - distanceKm / 200);
      const specialtyMatch = patient.requiredSpecialty
        ? (f.specialties ?? []).includes(patient.requiredSpecialty)
        : false;
      const specialtyBonus = specialtyMatch ? 0.2 : 0;

      const score = capacityScore * 0.50 + proximityScore * 0.30 + specialtyBonus;
      return { facility: f, score, distanceKm, capacityScore, specialtyMatch };
    })
    .sort((a, b) => b.score - a.score);
}

export function getBestFacility(
  patient: Parameters<typeof routeNationwide>[0],
  facilities: Facility[]
): RoutingScore | null {
  const ranked = routeNationwide(patient, facilities);
  return ranked[0] ?? null;
}
