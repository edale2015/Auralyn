/**
 * Cross-Clinic Learning Network — Moat Component
 *
 * Aggregates anonymised case signals across all clinics.
 * The more clinics join, the smarter every clinic's model becomes —
 * a true data network effect.
 *
 * Privacy: only diagnosis-level aggregates flow cross-clinic.
 * Raw patient data never leaves the originating clinic's partition.
 */

import { getRedisAsync }     from "../queue/redis";
import { addDpNoise, getDpMetadata } from "./differentialPrivacy";

const REDIS_CLINIC_CASES_KEY  = "moat:network:clinic_cases";     // hash: clinicId → count
const REDIS_SPECIALTY_KEY     = "moat:network:specialty_counts"; // hash: specialty → count
const REDIS_CLINIC_LIST_KEY   = "moat:network:active_clinics";   // set of clinicIds

export interface NetworkContribution {
  clinicId:   string;
  specialty:  string;
  diagnosis:  string;
  disposition: string;
  ts:         string;
}

export async function recordNetworkContribution(c: NetworkContribution): Promise<void> {
  const r = await getRedisAsync();
  if (!r) return;

  try {
    await Promise.all([
      r.hincrby(REDIS_CLINIC_CASES_KEY, c.clinicId, 1),
      r.hincrby(REDIS_SPECIALTY_KEY, c.specialty, 1),
      r.sadd(REDIS_CLINIC_LIST_KEY, c.clinicId),
    ]);
  } catch { /* fire-and-forget */ }
}

export async function getNetworkStats(applyDp = true): Promise<{
  activeClinicCount: number;
  totalNetworkCases: number;
  specialtyBreakdown: Array<{ specialty: string; cases: number; share: number }>;
  perClinicContributions: Array<{ clinicId: string; cases: number }>;
  privacyMetadata?: ReturnType<typeof getDpMetadata>;
}> {
  const r = await getRedisAsync();
  if (!r) {
    return { activeClinicCount: 0, totalNetworkCases: 0, specialtyBreakdown: [], perClinicContributions: [] };
  }

  try {
    const [clinicHash, specialtyHash] = await Promise.all([
      r.hgetall(REDIS_CLINIC_CASES_KEY),
      r.hgetall(REDIS_SPECIALTY_KEY),
    ]);

    /* Apply Laplace noise to per-clinic case counts (Recommendation #1)
     * so individual clinics cannot be re-identified via rare-case counts.
     * Noise is applied at query time — raw Redis values remain clean. */
    const perClinic = Object.entries(clinicHash ?? {}).map(([clinicId, cnt]) => ({
      clinicId,
      cases: applyDp ? addDpNoise(Number(cnt)) : Number(cnt),
    })).sort((a, b) => b.cases - a.cases);

    const totalNetworkCases = perClinic.reduce((s, c) => s + c.cases, 0);

    const specialtyBreakdown = Object.entries(specialtyHash ?? {})
      .map(([specialty, cnt]) => ({
        specialty,
        cases: Number(cnt),
        share: totalNetworkCases > 0 ? Number(cnt) / totalNetworkCases : 0,
      }))
      .sort((a, b) => b.cases - a.cases);

    return {
      activeClinicCount: perClinic.length,
      totalNetworkCases,
      specialtyBreakdown,
      perClinicContributions: perClinic,
      ...(applyDp ? { privacyMetadata: getDpMetadata() } : {}),
    };
  } catch {
    return { activeClinicCount: 0, totalNetworkCases: 0, specialtyBreakdown: [], perClinicContributions: [] };
  }
}
