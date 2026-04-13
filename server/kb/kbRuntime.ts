/**
 * KB Runtime Cache
 *
 * Loads clinical knowledge from the Postgres KB tables at startup
 * and caches it in memory with a configurable TTL. All pipeline
 * entry-points (Bayesian engine, red-flag evaluator, treatment
 * plan generator) read from this cache — not from hardcoded TS.
 *
 * The cache is automatically invalidated by KB write routes so
 * any UI edit takes effect on the next triage request.
 *
 * FIXED (Bug #3): All three loaders previously caught DB exceptions and returned [].
 * A DB outage caused live triage to run with zero priors, red flags, and treatments
 * with no alert. Loaders now preserve the last-known-good cache on failure and emit
 * a console.error so ops monitors will catch the event.
 *
 * FIXED (Bug #8): reloadAndRewireKbCache was non-atomic — it invalidated all caches
 * before loading completed, leaving a window where any of the three caches could be
 * null while the others were populated. The reload now loads all three into temporaries
 * and swaps them atomically only after all three succeed.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DiagnosisPrior } from "../clinical/bayesianEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KbRedFlagRule {
  ruleId: string;
  complaintId: string;
  label: string;
  triggerExpr: string;
  severity: "HARD" | "SOFT";
  action: string;
  immediateActions?: string | null;
  active: boolean;
}

export interface KbTreatmentRule {
  ruleId: string;
  medicationName: string;
  medicationGroup?: string | null;
  complaintId?: string | null;
  diagnosisId?: string | null;
  isFirstLine: boolean;
  adultDose?: string | null;
  adultMaxDose?: string | null;
  pediatricDose?: string | null;
  route?: string | null;
  renalAdjust?: string | null;
  hepaticAdjust?: string | null;
  pregnancyCategory?: string | null;
  contraindications?: string | null;
  keyInteractions?: string | null;
  commonSideEffects?: string | null;
  notes?: string | null;
  active: boolean;
}

// ── In-memory cache store ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  count: number;
}

let _priors: CacheEntry<DiagnosisPrior[]> | null = null;
let _redFlags: CacheEntry<KbRedFlagRule[]> | null = null;
let _treatments: CacheEntry<KbTreatmentRule[]> | null = null;

function isStale(entry: CacheEntry<any> | null): boolean {
  if (!entry) return true;
  return Date.now() - entry.loadedAt > CACHE_TTL_MS;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// FIXED: On DB failure, throw KBLoadError rather than returning [].
// Callers catch and either serve last-known-good or surface the alert.
class KBLoadError extends Error {
  constructor(section: string, cause: unknown) {
    super(`[KbRuntime] Failed to load ${section} from DB: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "KBLoadError";
  }
}

async function loadPriorsFromDb(): Promise<DiagnosisPrior[]> {
  try {
    const result = await db.execute(sql`
      SELECT
        r.rule_id,
        r.diagnosis_label,
        r.base_probability,
        jsonb_object_agg(f.feature_key, f.likelihood * f.weight) AS feature_likelihoods,
        count(f.id)::int AS feature_count
      FROM kb_diagnosis_rules r
      JOIN kb_feature_likelihoods f
        ON f.rule_id = r.rule_id AND f.active = true
      WHERE r.active = true
      GROUP BY r.rule_id, r.diagnosis_label, r.base_probability, r.cluster_priority
      HAVING count(f.id) > 0
      ORDER BY r.cluster_priority ASC, r.base_probability DESC
    `);

    const normalized = extractRows(result).map((r: any) => ({
      diagnosis: String(r.diagnosis_label ?? ""),
      baseProbability: Number(r.base_probability ?? 0),
      featureLikelihoods: (r.feature_likelihoods ?? {}) as Record<string, number>,
      ruleId: String(r.rule_id ?? ""),
      version: 1,
      tableName: "kb_feature_likelihoods",
    }));

    if (normalized.length > 0) {
      console.info(`[KbRuntime] Loaded ${normalized.length} priors from kb_feature_likelihoods`);
      return normalized;
    }

    // Legacy fallback: kb_diagnosis_rules.featureLikelihoods JSONB (pre-Phase-3 rules)
    console.warn("[KbRuntime] kb_feature_likelihoods empty — falling back to JSONB blob");
    const legacyResult = await db.execute(sql`
      SELECT rule_id, diagnosis_label, base_probability, feature_likelihoods
      FROM kb_diagnosis_rules
      WHERE active = true
        AND feature_likelihoods IS NOT NULL
        AND feature_likelihoods::text != '{}'
      ORDER BY cluster_priority ASC, base_probability DESC
    `);
    return extractRows(legacyResult).map((r: any) => ({
      diagnosis: String(r.diagnosis_label ?? ""),
      baseProbability: Number(r.base_probability ?? 0),
      featureLikelihoods: (r.feature_likelihoods ?? {}) as Record<string, number>,
      ruleId: String(r.rule_id ?? ""),
      version: 1,
      tableName: "kb_diagnosis_rules",
    }));
  } catch (err) {
    throw new KBLoadError("diagnosis priors", err);
  }
}

async function loadRedFlagsFromDb(): Promise<KbRedFlagRule[]> {
  try {
    const result = await db.execute(
      sql`SELECT rule_id, complaint_id, label, trigger_expr, severity, action,
                 immediate_actions, active
          FROM kb_red_flag_rules
          WHERE active = true`
    );
    return extractRows(result).map((r: any) => ({
      ruleId: String(r.rule_id ?? r.ruleId ?? ""),
      complaintId: String(r.complaint_id ?? r.complaintId ?? ""),
      label: String(r.label ?? ""),
      triggerExpr: String(r.trigger_expr ?? r.triggerExpr ?? ""),
      severity: (r.severity ?? "SOFT") as "HARD" | "SOFT",
      action: String(r.action ?? "ESCALATE"),
      immediateActions: (r.immediate_actions ?? r.immediateActions ?? null) as string | null,
      active: Boolean(r.active),
    }));
  } catch (err) {
    throw new KBLoadError("red flag rules", err);
  }
}

async function loadTreatmentsFromDb(): Promise<KbTreatmentRule[]> {
  try {
    const result = await db.execute(
      sql`SELECT rule_id, medication_name, medication_group, complaint_id,
                 diagnosis_id, is_first_line, adult_dose, adult_max_dose,
                 pediatric_dose, route, renal_adjust, hepatic_adjust,
                 pregnancy_category, contraindications, key_interactions,
                 common_side_effects, notes, active
          FROM kb_treatment_rules
          WHERE active = true`
    );
    return extractRows(result).map((r: any) => ({
      ruleId: String(r.rule_id ?? r.ruleId ?? ""),
      medicationName: String(r.medication_name ?? r.medicationName ?? ""),
      medicationGroup: (r.medication_group ?? r.medicationGroup ?? null) as string | null,
      complaintId: (r.complaint_id ?? r.complaintId ?? null) as string | null,
      diagnosisId: (r.diagnosis_id ?? r.diagnosisId ?? null) as string | null,
      isFirstLine: Boolean(r.is_first_line ?? r.isFirstLine),
      adultDose: (r.adult_dose ?? r.adultDose ?? null) as string | null,
      adultMaxDose: (r.adult_max_dose ?? r.adultMaxDose ?? null) as string | null,
      pediatricDose: (r.pediatric_dose ?? r.pediatricDose ?? null) as string | null,
      route: (r.route ?? null) as string | null,
      renalAdjust: (r.renal_adjust ?? r.renalAdjust ?? null) as string | null,
      hepaticAdjust: (r.hepatic_adjust ?? r.hepaticAdjust ?? null) as string | null,
      pregnancyCategory: (r.pregnancy_category ?? r.pregnancyCategory ?? null) as string | null,
      contraindications: (r.contraindications ?? null) as string | null,
      keyInteractions: (r.key_interactions ?? r.keyInteractions ?? null) as string | null,
      commonSideEffects: (r.common_side_effects ?? r.commonSideEffects ?? null) as string | null,
      notes: (r.notes ?? null) as string | null,
      active: Boolean(r.active),
    }));
  } catch (err) {
    throw new KBLoadError("treatment rules", err);
  }
}

// ── Last-known-good helpers ───────────────────────────────────────────────────
// On DB failure, serve the stale cache rather than empty arrays, and alert ops.

function servePriorsOrAlert(err: unknown): DiagnosisPrior[] {
  console.error("[KbRuntime] ALERT: Failed to load KB priors —", err instanceof Error ? err.message : String(err));
  if (_priors) {
    const ageS = ((Date.now() - _priors.loadedAt) / 1000).toFixed(0);
    console.warn(`[KbRuntime] Serving last-known-good priors (${_priors.count} rules, age ${ageS}s)`);
    return _priors.data;
  }
  console.error("[KbRuntime] No prior cache available — returning empty array. ALL TRIAGE WILL USE HARDCODED FALLBACK.");
  return [];
}

function serveRedFlagsOrAlert(err: unknown): KbRedFlagRule[] {
  console.error("[KbRuntime] ALERT: Failed to load KB red flags —", err instanceof Error ? err.message : String(err));
  if (_redFlags) {
    const ageS = ((Date.now() - _redFlags.loadedAt) / 1000).toFixed(0);
    console.warn(`[KbRuntime] Serving last-known-good red flags (${_redFlags.count} rules, age ${ageS}s)`);
    return _redFlags.data;
  }
  console.error("[KbRuntime] No red flag cache available — returning empty array. RED FLAG DETECTION DISABLED.");
  return [];
}

function serveTreatmentsOrAlert(err: unknown): KbTreatmentRule[] {
  console.error("[KbRuntime] ALERT: Failed to load KB treatments —", err instanceof Error ? err.message : String(err));
  if (_treatments) {
    const ageS = ((Date.now() - _treatments.loadedAt) / 1000).toFixed(0);
    console.warn(`[KbRuntime] Serving last-known-good treatments (${_treatments.count} rules, age ${ageS}s)`);
    return _treatments.data;
  }
  console.error("[KbRuntime] No treatment cache available — returning empty array.");
  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getKbPriors(): Promise<DiagnosisPrior[]> {
  if (!isStale(_priors)) return _priors!.data;
  try {
    const data = await loadPriorsFromDb();
    _priors = { data, loadedAt: Date.now(), count: data.length };
    return data;
  } catch (err) {
    return servePriorsOrAlert(err);
  }
}

export async function getKbRedFlags(complaintId: string): Promise<KbRedFlagRule[]> {
  if (!isStale(_redFlags)) {
    return _redFlags!.data.filter(r => r.complaintId === complaintId);
  }
  try {
    const data = await loadRedFlagsFromDb();
    _redFlags = { data, loadedAt: Date.now(), count: data.length };
    return data.filter(r => r.complaintId === complaintId);
  } catch (err) {
    return serveRedFlagsOrAlert(err).filter(r => r.complaintId === complaintId);
  }
}

export async function getKbTreatments(opts?: {
  complaintId?: string;
  diagnosisId?: string;
  firstLineOnly?: boolean;
}): Promise<KbTreatmentRule[]> {
  if (!isStale(_treatments)) {
    return filterTreatments(_treatments!.data, opts);
  }
  try {
    const data = await loadTreatmentsFromDb();
    _treatments = { data, loadedAt: Date.now(), count: data.length };
    return filterTreatments(data, opts);
  } catch (err) {
    return filterTreatments(serveTreatmentsOrAlert(err), opts);
  }
}

function filterTreatments(
  all: KbTreatmentRule[],
  opts?: { complaintId?: string; diagnosisId?: string; firstLineOnly?: boolean }
): KbTreatmentRule[] {
  let out = all;
  if (opts?.complaintId) out = out.filter(t => !t.complaintId || t.complaintId === opts.complaintId);
  if (opts?.diagnosisId) out = out.filter(t => !t.diagnosisId || t.diagnosisId === opts.diagnosisId);
  if (opts?.firstLineOnly) out = out.filter(t => t.isFirstLine);
  return out;
}

export function getKbPriorsSync(): DiagnosisPrior[] | null {
  if (!_priors || isStale(_priors)) return null;
  return _priors.data;
}

export function getKbRedFlagsSync(complaintId?: string): KbRedFlagRule[] {
  if (!_redFlags || isStale(_redFlags)) return [];
  if (complaintId) return _redFlags.data.filter(r => r.complaintId === complaintId);
  return _redFlags.data;
}

export function getKbTreatmentsSync(opts?: {
  complaintId?: string;
  diagnosisId?: string;
  firstLineOnly?: boolean;
}): KbTreatmentRule[] {
  if (!_treatments || isStale(_treatments)) return [];
  return filterTreatments(_treatments.data, opts);
}

/** Force-invalidate all caches (called after KB writes). */
export function invalidateKbCache(): void {
  _priors = null;
  _redFlags = null;
  _treatments = null;
  console.info("[KbRuntime] Cache invalidated — next request will reload from DB");
}

/** Warm up the cache at server startup. Non-blocking. */
export function warmKbCache(): void {
  Promise.all([
    loadPriorsFromDb().catch(err => { console.warn("[KbRuntime] Warm-up priors failed:", err instanceof Error ? err.message : String(err)); return _priors?.data ?? []; }),
    loadRedFlagsFromDb().catch(err => { console.warn("[KbRuntime] Warm-up redFlags failed:", err instanceof Error ? err.message : String(err)); return _redFlags?.data ?? []; }),
    loadTreatmentsFromDb().catch(err => { console.warn("[KbRuntime] Warm-up treatments failed:", err instanceof Error ? err.message : String(err)); return _treatments?.data ?? []; }),
  ]).then(([priors, redFlags, treatments]) => {
    // Only update caches that successfully loaded (non-empty result from DB or no existing cache)
    if (priors.length > 0 || !_priors) _priors = { data: priors, loadedAt: Date.now(), count: priors.length };
    if (redFlags.length > 0 || !_redFlags) _redFlags = { data: redFlags, loadedAt: Date.now(), count: redFlags.length };
    if (treatments.length > 0 || !_treatments) _treatments = { data: treatments, loadedAt: Date.now(), count: treatments.length };

    if (priors.length > 0) {
      import("../clinical/bayesianEngine").then(({ setRuntimePriors }) => {
        setRuntimePriors(priors);
        console.info(`[KbRuntime] Wired ${priors.length} KB diagnosis priors into Bayesian engine`);
      }).catch(() => {});
    }

    console.info(
      `[KbRuntime] Cache warmed — priors:${priors.length}, redFlags:${redFlags.length}, treatments:${treatments.length}`
    );
  }).catch(err => {
    console.warn("[KbRuntime] Warm-up failed (non-fatal):", err);
  });
}

/**
 * FIXED: Reload cache atomically — loads all three into temporaries first,
 * then swaps them all at once. Previously invalidateKbCache() was called first,
 * leaving a window where any failed load left the cache in a partially null state.
 */
export async function reloadAndRewireKbCache(): Promise<void> {
  // Load all three into temporaries — do NOT invalidate yet
  let newPriors: DiagnosisPrior[];
  let newRedFlags: KbRedFlagRule[];
  let newTreatments: KbTreatmentRule[];

  try {
    [newPriors, newRedFlags, newTreatments] = await Promise.all([
      loadPriorsFromDb(),
      loadRedFlagsFromDb(),
      loadTreatmentsFromDb(),
    ]);
  } catch (err) {
    console.error("[KbRuntime] reloadAndRewireKbCache: one or more loaders failed — caches NOT invalidated.", err instanceof Error ? err.message : String(err));
    throw err;  // Let caller decide how to handle
  }

  // Atomic swap — only after all three loaded successfully
  _priors    = { data: newPriors,    loadedAt: Date.now(), count: newPriors.length };
  _redFlags  = { data: newRedFlags,  loadedAt: Date.now(), count: newRedFlags.length };
  _treatments = { data: newTreatments, loadedAt: Date.now(), count: newTreatments.length };

  if (newPriors.length > 0) {
    const { setRuntimePriors } = await import("../clinical/bayesianEngine");
    setRuntimePriors(newPriors);
  }
  console.info(
    `[KbRuntime] Atomically reloaded & rewired — priors:${newPriors.length}, redFlags:${newRedFlags.length}, treatments:${newTreatments.length}`
  );
}

/** Return cache status for ops dashboard */
export function getKbCacheStatus() {
  return {
    priors:     _priors     ? { count: _priors.count,     ageMs: Date.now() - _priors.loadedAt }     : null,
    redFlags:   _redFlags   ? { count: _redFlags.count,   ageMs: Date.now() - _redFlags.loadedAt }   : null,
    treatments: _treatments ? { count: _treatments.count, ageMs: Date.now() - _treatments.loadedAt } : null,
    ttlMs: CACHE_TTL_MS,
  };
}

/**
 * Returns a fingerprint string representing the current KB cache state.
 * Used by the consistency monitor to detect cross-instance version drift.
 * Format: "priorCount:redFlagCount:treatmentCount@loadedAt"
 */
export function getKbVersion(): string {
  const p = _priors?.count ?? -1;
  const r = _redFlags?.count ?? -1;
  const t = _treatments?.count ?? -1;
  const ts = _priors?.loadedAt ?? _redFlags?.loadedAt ?? _treatments?.loadedAt ?? 0;
  return `${p}:${r}:${t}@${ts}`;
}
