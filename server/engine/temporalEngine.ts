/**
 * Temporal Reasoning Engine
 *
 * Detects symptom patterns over time (rising, falling, persistent,
 * intermittent, acute_onset) and adjusts log-likelihood scores.
 *
 * Reads from:
 *   kb_temporal_patterns   — diagnosis + pattern + feature → likelihood multiplier
 *   patient_time_series    — time-stamped symptom observations per case
 *
 * Source: KB_DB only.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DxScore } from "./coMorbidityEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TemporalPattern =
  | "rising"
  | "falling"
  | "persistent"
  | "intermittent"
  | "acute_onset";

export interface TemporalHit {
  featureKey: string;
  pattern: TemporalPattern;
  patternId: number;
  likelihood: number;
  logAdjustment: number;
}

interface TemporalPatternRow {
  id: number;
  diagnosis: string;
  feature_key: string;
  pattern_type: string;
  duration_hours: number | null;
  likelihood: number;
}

interface TimePoint {
  t: number;   // epoch ms
  v: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _patternCache: TemporalPatternRow[] | null = null;
let _patternCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadPatterns(): Promise<TemporalPatternRow[]> {
  if (_patternCache && Date.now() - _patternCacheAt < CACHE_TTL_MS) return _patternCache;
  const rows = extractRows(await db.execute(sql`
    SELECT id, diagnosis, feature_key, pattern_type, duration_hours, likelihood
    FROM kb_temporal_patterns WHERE is_active = true ORDER BY diagnosis, feature_key
  `));
  _patternCache = rows.map(r => ({
    id: r.id,
    diagnosis: r.diagnosis,
    feature_key: r.feature_key,
    pattern_type: r.pattern_type,
    duration_hours: r.duration_hours != null ? Number(r.duration_hours) : null,
    likelihood: Number(r.likelihood),
  }));
  _patternCacheAt = Date.now();
  return _patternCache;
}

export function invalidateTemporalCache(): void {
  _patternCache = null;
}

// ── Pattern detection ─────────────────────────────────────────────────────────

export function detectPattern(series: TimePoint[]): TemporalPattern {
  if (!series || series.length < 2) return "persistent";

  const sorted = [...series].sort((a, b) => a.t - b.t);
  const first = sorted[0].v;
  const last = sorted[sorted.length - 1].v;
  const diffs = sorted.slice(1).map((p, i) => p.v - sorted[i].v);

  const up = diffs.filter(d => d > 0).length;
  const down = diffs.filter(d => d < 0).length;

  if (sorted.length <= 3 && Math.abs(last - first) > 0.5) return "acute_onset";

  const signChanges = diffs.reduce(
    (c, d, i) => (i > 0 && Math.sign(d) !== Math.sign(diffs[i - 1]) ? c + 1 : c),
    0,
  );
  if (signChanges >= 2) return "intermittent";
  if (last - first > 0 && up > down) return "rising";
  if (last - first < 0 && down > up) return "falling";
  return "persistent";
}

// ── Load time series for a case ───────────────────────────────────────────────

export async function loadTimeSeries(caseId: string): Promise<Map<string, TimePoint[]>> {
  if (!caseId) return new Map();
  const rows = extractRows(await db.execute(sql`
    SELECT feature_key, EXTRACT(EPOCH FROM t) * 1000 AS t_epoch, value
    FROM patient_time_series
    WHERE case_id = ${caseId}
    ORDER BY feature_key, t
  `));

  const map = new Map<string, TimePoint[]>();
  for (const r of rows) {
    if (!map.has(r.feature_key)) map.set(r.feature_key, []);
    map.get(r.feature_key)!.push({ t: Number(r.t_epoch), v: Number(r.value) });
  }
  return map;
}

// ── Record a new time series observation ──────────────────────────────────────

export async function recordTimeSeries(
  caseId: string,
  featureKey: string,
  value: number,
  unit?: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO patient_time_series (case_id, feature_key, value, unit)
    VALUES (${caseId}, ${featureKey}, ${value}, ${unit ?? null})
  `);
}

// ── Main: apply temporal adjustments ─────────────────────────────────────────

export async function applyTemporalAdjustments(
  caseId: string,
  baseResults: DxScore[],
  inlineTimeSeries?: Record<string, TimePoint[]>,
): Promise<(DxScore & { temporalHits?: TemporalHit[] })[]> {
  const patterns = await loadPatterns();
  if (patterns.length === 0) return baseResults;

  // Load time series from DB or use inline
  const seriesMap = inlineTimeSeries
    ? new Map(Object.entries(inlineTimeSeries))
    : await loadTimeSeries(caseId);

  if (seriesMap.size === 0) return baseResults;

  // Detect patterns for each feature
  const detectedPatterns = new Map<string, TemporalPattern>();
  for (const [featureKey, series] of seriesMap.entries()) {
    detectedPatterns.set(featureKey, detectPattern(series));
  }

  // Apply adjustments
  const out = baseResults.map(r => ({ ...r, temporalHits: [] as TemporalHit[] }));
  const dxMap = new Map(out.map(r => [r.diagnosis.toLowerCase(), r]));

  for (const p of patterns) {
    const detectedPat = detectedPatterns.get(p.feature_key);
    if (!detectedPat || detectedPat !== p.pattern_type) continue;

    const dx = dxMap.get(p.diagnosis.toLowerCase());
    if (!dx) continue;

    const logAdj = Math.log(Math.max(0.001, p.likelihood));
    dx.score += logAdj;
    dx.temporalHits!.push({
      featureKey: p.feature_key,
      pattern: detectedPat,
      patternId: p.id,
      likelihood: p.likelihood,
      logAdjustment: logAdj,
    });
  }

  const results = out.sort((a, b) => b.score - a.score);

  // Re-normalize posteriors
  const maxScore = Math.max(...results.map(r => r.score));
  const expScores = results.map(r => Math.exp(r.score - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  results.forEach((r, i) => { r.posterior = expScores[i] / sumExp; });

  return results;
}

// ── Seed canonical temporal patterns ─────────────────────────────────────────

export async function seedTemporalPatterns(): Promise<{ seeded: number; skipped: number }> {
  const SEEDS: Array<{ diagnosis: string; featureKey: string; patternType: string; likelihood: number }> = [
    // Infection patterns
    { diagnosis: "Influenza A",            featureKey: "fever",       patternType: "acute_onset",  likelihood: 2.1 },
    { diagnosis: "Influenza A",            featureKey: "fever",       patternType: "rising",       likelihood: 1.8 },
    { diagnosis: "Influenza A",            featureKey: "fever",       patternType: "falling",      likelihood: 0.6 },
    { diagnosis: "COVID-19",               featureKey: "fever",       patternType: "persistent",   likelihood: 1.7 },
    { diagnosis: "COVID-19",               featureKey: "fever",       patternType: "rising",       likelihood: 1.5 },
    { diagnosis: "Strep Pharyngitis",      featureKey: "sore_throat", patternType: "acute_onset",  likelihood: 1.9 },
    { diagnosis: "Strep Pharyngitis",      featureKey: "fever",       patternType: "acute_onset",  likelihood: 1.8 },
    { diagnosis: "Viral URI",              featureKey: "cough",       patternType: "persistent",   likelihood: 1.6 },
    { diagnosis: "Viral URI",              featureKey: "fever",       patternType: "falling",      likelihood: 1.4 },
    { diagnosis: "Bacterial Sinusitis",    featureKey: "pain",        patternType: "persistent",   likelihood: 1.7 },
    { diagnosis: "Bacterial Sinusitis",    featureKey: "pain",        patternType: "rising",       likelihood: 1.5 },
    // Musculoskeletal
    { diagnosis: "Rotator Cuff Injury",    featureKey: "pain",        patternType: "persistent",   likelihood: 1.6 },
    { diagnosis: "Rotator Cuff Injury",    featureKey: "pain",        patternType: "rising",       likelihood: 0.7 },
    // Cardiac
    { diagnosis: "CHF",                    featureKey: "dyspnea",     patternType: "rising",       likelihood: 1.9 },
    { diagnosis: "CHF",                    featureKey: "dyspnea",     patternType: "persistent",   likelihood: 1.7 },
    // Neurological
    { diagnosis: "Meningitis",             featureKey: "headache",    patternType: "acute_onset",  likelihood: 2.5 },
    { diagnosis: "Meningitis",             featureKey: "headache",    patternType: "rising",       likelihood: 2.0 },
    { diagnosis: "Migraine",               featureKey: "headache",    patternType: "intermittent", likelihood: 1.8 },
    { diagnosis: "Migraine",               featureKey: "pain",        patternType: "intermittent", likelihood: 1.6 },
  ];

  let seeded = 0;
  let skipped = 0;

  for (const s of SEEDS) {
    try {
      await db.execute(sql`
        INSERT INTO kb_temporal_patterns (diagnosis, feature_key, pattern_type, likelihood, is_active)
        VALUES (${s.diagnosis}, ${s.featureKey}, ${s.patternType}, ${s.likelihood}, true)
        ON CONFLICT (diagnosis, feature_key, pattern_type) DO UPDATE
          SET likelihood = EXCLUDED.likelihood, is_active = true
      `);
      seeded++;
    } catch {
      skipped++;
    }
  }

  invalidateTemporalCache();
  return { seeded, skipped };
}
