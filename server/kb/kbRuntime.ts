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
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DiagnosisPrior } from "../clinical/bayesianEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KbRedFlagRule {
  ruleId: string;
  complaintId: string;
  label: string;
  triggerExpr: string;    // evaluated by ruleParser or simple question-id check
  severity: "HARD" | "SOFT";
  action: string;         // ER_SEND | ESCALATE | URGENT | CALL_911
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

// Helper: db.execute() returns { rows: [...] } in drizzle-orm/node-postgres
function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadPriorsFromDb(): Promise<DiagnosisPrior[]> {
  try {
    const result = await db.execute(
      sql`SELECT diagnosis_label, base_probability, feature_likelihoods
          FROM kb_diagnosis_rules
          WHERE active = true
          ORDER BY cluster_priority ASC, base_probability DESC`
    );
    return extractRows(result).map((r: any) => ({
      diagnosis: String(r.diagnosis_label ?? r.diagnosisLabel ?? ""),
      baseProbability: Number(r.base_probability ?? r.baseProbability ?? 0),
      featureLikelihoods: (r.feature_likelihoods ?? r.featureLikelihoods ?? {}) as Record<string, number>,
    }));
  } catch (err) {
    console.warn("[KbRuntime] Failed to load diagnosis priors from DB:", err);
    return [];
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
    console.warn("[KbRuntime] Failed to load red flag rules from DB:", err);
    return [];
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
    console.warn("[KbRuntime] Failed to load treatment rules from DB:", err);
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get active diagnosis priors from KB (async, cached). Returns [] if KB is empty. */
export async function getKbPriors(): Promise<DiagnosisPrior[]> {
  if (!isStale(_priors)) return _priors!.data;
  const data = await loadPriorsFromDb();
  _priors = { data, loadedAt: Date.now(), count: data.length };
  if (data.length > 0) {
    console.info(`[KbRuntime] Loaded ${data.length} diagnosis priors from KB`);
  }
  return data;
}

/** Get active red flag rules from KB for a specific complaint (async, cached). */
export async function getKbRedFlags(complaintId: string): Promise<KbRedFlagRule[]> {
  if (!isStale(_redFlags)) {
    return _redFlags!.data.filter(r => r.complaintId === complaintId);
  }
  const data = await loadRedFlagsFromDb();
  _redFlags = { data, loadedAt: Date.now(), count: data.length };
  if (data.length > 0) {
    console.info(`[KbRuntime] Loaded ${data.length} red flag rules from KB`);
  }
  return data.filter(r => r.complaintId === complaintId);
}

/** Get treatment rules from KB, optionally filtered by complaintId or diagnosisId. */
export async function getKbTreatments(opts?: {
  complaintId?: string;
  diagnosisId?: string;
  firstLineOnly?: boolean;
}): Promise<KbTreatmentRule[]> {
  if (!isStale(_treatments)) {
    return filterTreatments(_treatments!.data, opts);
  }
  const data = await loadTreatmentsFromDb();
  _treatments = { data, loadedAt: Date.now(), count: data.length };
  if (data.length > 0) {
    console.info(`[KbRuntime] Loaded ${data.length} treatment rules from KB`);
  }
  return filterTreatments(data, opts);
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

/** Synchronous check — returns cached priors without async. Null if not yet loaded. */
export function getKbPriorsSync(): DiagnosisPrior[] | null {
  if (!_priors || isStale(_priors)) return null;
  return _priors.data;
}

/** Synchronous check — returns cached red flags without async. Empty array if not loaded. */
export function getKbRedFlagsSync(complaintId?: string): KbRedFlagRule[] {
  if (!_redFlags || isStale(_redFlags)) return [];
  if (complaintId) return _redFlags.data.filter(r => r.complaintId === complaintId);
  return _redFlags.data;
}

/** Synchronous check — returns cached treatments without async. Empty array if not loaded. */
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
    loadPriorsFromDb(),
    loadRedFlagsFromDb(),
    loadTreatmentsFromDb(),
  ]).then(([priors, redFlags, treatments]) => {
    _priors = { data: priors, loadedAt: Date.now(), count: priors.length };
    _redFlags = { data: redFlags, loadedAt: Date.now(), count: redFlags.length };
    _treatments = { data: treatments, loadedAt: Date.now(), count: treatments.length };

    // Wire KB priors into the Bayesian differential engine
    if (priors.length > 0) {
      // Lazy import to avoid circular dependency at module-load time
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

/** Reload cache from DB and re-wire all pipeline hooks. Call after any KB write. */
export async function reloadAndRewireKbCache(): Promise<void> {
  invalidateKbCache();
  const [priors, redFlags, treatments] = await Promise.all([
    loadPriorsFromDb(),
    loadRedFlagsFromDb(),
    loadTreatmentsFromDb(),
  ]);
  _priors = { data: priors, loadedAt: Date.now(), count: priors.length };
  _redFlags = { data: redFlags, loadedAt: Date.now(), count: redFlags.length };
  _treatments = { data: treatments, loadedAt: Date.now(), count: treatments.length };

  if (priors.length > 0) {
    const { setRuntimePriors } = await import("../clinical/bayesianEngine");
    setRuntimePriors(priors);
  }
  console.info(
    `[KbRuntime] Reloaded & rewired — priors:${priors.length}, redFlags:${redFlags.length}, treatments:${treatments.length}`
  );
}

/** Return cache status for ops dashboard */
export function getKbCacheStatus() {
  return {
    priors: _priors ? { count: _priors.count, ageMs: Date.now() - _priors.loadedAt } : null,
    redFlags: _redFlags ? { count: _redFlags.count, ageMs: Date.now() - _redFlags.loadedAt } : null,
    treatments: _treatments ? { count: _treatments.count, ageMs: Date.now() - _treatments.loadedAt } : null,
    ttlMs: CACHE_TTL_MS,
  };
}
