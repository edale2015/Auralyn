export interface MarketplaceProvider {
  id: string;
  specialty: string;
  distanceKm: number;
  load: number;      // 0..1
  slaMs: number;     // expected response time ms
  name?: string;
  [key: string]: unknown;
}

export interface PatientQuery {
  complaint: string;
  [key: string]: unknown;
}

export interface BookingResult {
  ok: boolean;
  status?: string;
  message?: string;
}

export function matchProvider(
  patient: PatientQuery,
  providers: MarketplaceProvider[]
): MarketplaceProvider | null {
  const candidates = providers.filter(p => p.specialty === patient.complaint);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const scoreA = a.distanceKm * 0.4 + a.load * 0.4 + (a.slaMs / 1_000) * 0.2;
    const scoreB = b.distanceKm * 0.4 + b.load * 0.4 + (b.slaMs / 1_000) * 0.2;
    return scoreA - scoreB;
  })[0];
}

export async function bookProvider(
  providerId: string,
  patientId: string
): Promise<BookingResult> {
  const url = process.env.BOOKING_API;
  if (!url) {
    console.log(`[Marketplace] No BOOKING_API — skipping booking for ${patientId} → ${providerId}`);
    return { ok: true, status: "skipped", message: "BOOKING_API not configured" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, patientId }),
    });
    return { ok: res.ok, status: res.ok ? "booked" : "failed", message: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, status: "error", message: e?.message };
  }
}

export function rankProvidersSLA(
  patient: PatientQuery,
  providers: MarketplaceProvider[]
): MarketplaceProvider[] {
  return providers
    .filter(p => p.specialty === patient.complaint)
    .sort((a, b) =>
      (a.distanceKm * 0.4 + a.load * 0.4 + (a.slaMs / 1_000) * 0.2) -
      (b.distanceKm * 0.4 + b.load * 0.4 + (b.slaMs / 1_000) * 0.2)
    );
}
