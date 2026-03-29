/**
 * Clinic Lock-In Value Engine
 *
 * Quantifies the "switching cost" each clinic has accumulated.
 * The more a clinic uses Auralyn, the more their case history,
 * specialty weights, and outcome patterns are embedded in the system.
 *
 * Leaving = losing all of that accumulated intelligence.
 * This metric is surfaced to investors and clinic administrators.
 */

import { getRedisAsync } from "../queue/redis";

const REDIS_CLINIC_VALUE_KEY = "moat:lockin:clinic_value"; // hash: clinicId → JSON

export interface ClinicValueRecord {
  clinicId:            string;
  totalEncounters:     number;
  uniqueDiagnoses:     number;
  uniqueSpecialties:   number;
  goldenCasesGenerated: number;
  rarePatterns:        number;
  valueScore:          number;   // computed composite
  switchingCostLabel:  "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  lastUpdated:         string;
}

function computeScore(record: Omit<ClinicValueRecord, "valueScore" | "switchingCostLabel" | "lastUpdated">): number {
  return (
    record.totalEncounters        * 1.0 +
    record.uniqueDiagnoses        * 5.0 +
    record.uniqueSpecialties      * 20.0 +
    record.goldenCasesGenerated   * 10.0 +
    record.rarePatterns           * 50.0
  );
}

function scoreToCostLabel(score: number): ClinicValueRecord["switchingCostLabel"] {
  if (score > 5000) return "VERY_HIGH";
  if (score > 1000) return "HIGH";
  if (score > 200)  return "MODERATE";
  return "LOW";
}

export async function updateClinicValue(
  clinicId: string,
  delta: {
    encounters?:       number;
    diagnoses?:        string[];
    specialties?:      string[];
    goldenCases?:      number;
    rarePatterns?:     number;
  }
): Promise<ClinicValueRecord> {
  const r = await getRedisAsync();

  // Load existing record
  let existing: Omit<ClinicValueRecord, "valueScore" | "switchingCostLabel" | "lastUpdated"> = {
    clinicId,
    totalEncounters:     0,
    uniqueDiagnoses:     0,
    uniqueSpecialties:   0,
    goldenCasesGenerated: 0,
    rarePatterns:        0,
  };

  if (r) {
    try {
      const raw = await r.hget(REDIS_CLINIC_VALUE_KEY, clinicId);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        existing = { ...existing, ...parsed };
      }
    } catch { /* use default */ }
  }

  const updated = {
    ...existing,
    totalEncounters:      existing.totalEncounters     + (delta.encounters   ?? 0),
    uniqueDiagnoses:      existing.uniqueDiagnoses      + (delta.diagnoses?.length   ?? 0),
    uniqueSpecialties:    existing.uniqueSpecialties    + (delta.specialties?.length ?? 0),
    goldenCasesGenerated: existing.goldenCasesGenerated + (delta.goldenCases  ?? 0),
    rarePatterns:         existing.rarePatterns         + (delta.rarePatterns ?? 0),
  };

  const valueScore        = computeScore(updated);
  const switchingCostLabel = scoreToCostLabel(valueScore);
  const record: ClinicValueRecord = { ...updated, valueScore, switchingCostLabel, lastUpdated: new Date().toISOString() };

  if (r) {
    try {
      await r.hset(REDIS_CLINIC_VALUE_KEY, { [clinicId]: JSON.stringify(record) });
    } catch { /* non-blocking */ }
  }

  return record;
}

export async function getAllClinicValues(): Promise<ClinicValueRecord[]> {
  const r = await getRedisAsync();
  if (!r) return [];

  try {
    const hash = await r.hgetall(REDIS_CLINIC_VALUE_KEY);
    return Object.values(hash ?? {}).map(v => {
      const parsed = typeof v === "string" ? JSON.parse(v) : v;
      return parsed as ClinicValueRecord;
    }).sort((a, b) => b.valueScore - a.valueScore);
  } catch {
    return [];
  }
}

export async function getClinicValue(clinicId: string): Promise<ClinicValueRecord | null> {
  const r = await getRedisAsync();
  if (!r) return null;

  try {
    const raw = await r.hget(REDIS_CLINIC_VALUE_KEY, clinicId);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
