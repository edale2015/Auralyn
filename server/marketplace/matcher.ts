export interface Provider {
  id: string;
  name: string;
  specialty: string;
  distance: number;
  rating?: number;
  available?: boolean;
  [key: string]: unknown;
}

export interface PatientRequest {
  complaint: string;
  location?: string;
  insurance?: string;
  [key: string]: unknown;
}

export function matchPatient(
  patient: PatientRequest,
  providers: Provider[]
): Provider | null {
  const eligible = providers.filter(
    p => p.specialty === patient.complaint && p.available !== false
  );
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => a.distance - b.distance)[0];
}

export function rankProviders(
  patient: PatientRequest,
  providers: Provider[]
): Provider[] {
  return providers
    .filter(p => p.specialty === patient.complaint)
    .sort((a, b) => {
      const distScore = a.distance - b.distance;
      const ratingDiff = (b.rating ?? 3) - (a.rating ?? 3);
      return distScore * 0.7 + ratingDiff * 0.3;
    });
}

export function filterByInsurance(
  providers: Provider[],
  insurance: string
): Provider[] {
  return providers.filter(
    p => !p.acceptedInsurance || (p.acceptedInsurance as string[]).includes(insurance)
  );
}
