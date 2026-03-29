/**
 * Data Flywheel Engine — Core Moat Component
 *
 * Every triage completion feeds the flywheel:
 *   encounter → network recording → (if validated) golden case promotion
 *                                → rare-case boost → specialty weight update
 *
 * Metrics are Redis-persisted so the compounding advantage survives restarts.
 */

import { getRedisAsync } from "../queue/redis";

export interface FlywheelEntry {
  encounterId:  string;
  clinicId:     string;
  complaint:    string;
  topDiagnosis: string;
  disposition:  string;
  confidence:   number;
  fusionHit:    boolean;
  rareCase:     boolean;
  specialty:    string;
  validated:    boolean;
  ts:           string;
}

const REDIS_FLYWHEEL_KEY    = "moat:flywheel:entries";
const REDIS_VELOCITY_KEY    = "moat:flywheel:velocity";
const REDIS_TOTAL_KEY       = "moat:flywheel:total";
const REDIS_GOLDEN_KEY      = "moat:flywheel:golden_promoted";
const REDIS_VALIDATED_KEY   = "moat:flywheel:validated";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function inferSpecialty(complaint: string, diagnosis: string): string {
  const c = (complaint + " " + diagnosis).toLowerCase();
  if (/ear|nose|throat|sinus|tonsil|pharyngitis|otitis|rhinitis/.test(c)) return "ENT";
  if (/chest|cardiac|heart|palpitation|mi|stemi|pe|pulmonary/.test(c)) return "Cardiology";
  if (/cough|asthma|copd|pneumonia|respiratory|wheez/.test(c)) return "Pulmonology";
  if (/rash|derm|skin|eczema|cellulitis|urticaria/.test(c)) return "Dermatology";
  if (/mental|anxiety|depression|suicid|psych/.test(c)) return "Psychiatry";
  if (/diabetes|thyroid|endo|glucose|hyperglycemia/.test(c)) return "Endocrinology";
  if (/abdomen|nausea|vomit|diarrhea|gi|gastro/.test(c)) return "Gastroenterology";
  if (/pediatric|child|infant|pews/.test(c)) return "Pediatrics";
  if (/obstetric|pregnan|maternal/.test(c)) return "Obstetrics";
  return "General";
}

/* ── public API ───────────────────────────────────────────────────────────── */

export async function recordFlywheelEntry(entry: FlywheelEntry): Promise<void> {
  const r = await getRedisAsync();
  if (!r) return;

  try {
    await Promise.all([
      r.incr(REDIS_TOTAL_KEY),
      entry.validated ? r.incr(REDIS_VALIDATED_KEY) : Promise.resolve(),
      entry.validated ? r.incr(REDIS_GOLDEN_KEY)    : Promise.resolve(),
      // Store last 5000 entries as a capped list
      r.lpush(REDIS_FLYWHEEL_KEY, JSON.stringify(entry)),
    ]);

    // Velocity: keep a sorted-set of timestamps for last-24-h rate
    const nowSec = Math.floor(Date.now() / 1000);
    await r.zadd(REDIS_VELOCITY_KEY, { score: nowSec, member: `${entry.encounterId}:${nowSec}` });
    // Trim entries older than 48h
    await r.zremrangebyscore(REDIS_VELOCITY_KEY, 0, nowSec - 172800);
  } catch { /* fire-and-forget */ }
}

export async function getFlywheelStats(): Promise<{
  totalEncounters:    number;
  validatedEncounters: number;
  goldenPromotions:   number;
  velocity24h:        number;
  velocity7d:         number;
}> {
  const r = await getRedisAsync();
  if (!r) return { totalEncounters: 0, validatedEncounters: 0, goldenPromotions: 0, velocity24h: 0, velocity7d: 0 };

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const [total, validated, golden, count24h, count7d] = await Promise.all([
      r.get(REDIS_TOTAL_KEY),
      r.get(REDIS_VALIDATED_KEY),
      r.get(REDIS_GOLDEN_KEY),
      r.zcount(REDIS_VELOCITY_KEY, nowSec - 86400,  nowSec),
      r.zcount(REDIS_VELOCITY_KEY, nowSec - 604800, nowSec),
    ]);
    return {
      totalEncounters:     Number(total    ?? 0),
      validatedEncounters: Number(validated ?? 0),
      goldenPromotions:    Number(golden   ?? 0),
      velocity24h:         Number(count24h ?? 0),
      velocity7d:          Number(count7d  ?? 0),
    };
  } catch {
    return { totalEncounters: 0, validatedEncounters: 0, goldenPromotions: 0, velocity24h: 0, velocity7d: 0 };
  }
}

export { inferSpecialty };
