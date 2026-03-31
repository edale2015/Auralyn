/**
 * Advanced KB Diagnosis Engine
 *
 * Full probabilistic Bayesian engine using kb_feature_models table.
 * Supports:
 *  - boolean   → P(present|Dx) and P(absent|Dx)
 *  - categorical → categorical_map: {"mild":0.3,"severe":0.9}
 *  - numeric   → Gaussian likelihood N(mean, std_dev)
 *  - range     → p_present if in [min,max], p_absent otherwise
 *
 * Scoring: log-likelihood (Naive Bayes) to avoid float underflow.
 * Source tag: KB_DB (never falls back to hardcoded values).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureModelRow {
  id: number;
  ruleId: string;
  featureKey: string;
  featureType: string;
  pPresent: number | null;
  pAbsent: number | null;
  categoricalMap: Record<string, number> | null;
  mean: number | null;
  stdDev: number | null;
  minValue: number | null;
  maxValue: number | null;
  weight: number;
  isRequired: boolean;
  source: string;
}

export interface AdvancedDiagnosisResult {
  ruleId: string;
  diagnosisLabel: string;
  diagnosisId: string;
  complaintId: string;
  score: number;           // raw log-likelihood score
  posterior: number;       // softmax-normalized 0–1
  baseProbability: number;
  source: string;
  features: Array<{
    key: string;
    type: string;
    inputValue: unknown;
    logLikelihood: number;
    contribution: "positive" | "negative" | "neutral";
  }>;
}

export interface AdvancedDiagnosisInput {
  symptoms?: string[];
  answers?: Record<string, unknown>;
  complaintId?: string;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function gaussian(x: number, mean: number, stdDev: number): number {
  if (stdDev <= 0) return 0.5;
  const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2));
  return Math.exp(exponent);
}

function safeLog(p: number): number {
  return Math.log(Math.max(p, 1e-9));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ── DB helper ─────────────────────────────────────────────────────────────────

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ── Cache for feature models (5-min TTL) ─────────────────────────────────────

interface FeatureModelCache {
  byRule: Map<string, FeatureModelRow[]>;
  loadedAt: number;
  rowCount: number;
}

let _featureModelCache: FeatureModelCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadFeatureModels(): Promise<FeatureModelCache> {
  if (_featureModelCache && Date.now() - _featureModelCache.loadedAt < CACHE_TTL_MS) {
    return _featureModelCache;
  }

  const result = await db.execute(sql`
    SELECT id, rule_id, feature_key, feature_type,
           p_present, p_absent, categorical_map,
           mean, std_dev, min_value, max_value,
           weight, is_required, source
    FROM kb_feature_models
    WHERE active = true
    ORDER BY rule_id, feature_key
  `);

  const rows = extractRows(result);
  const byRule = new Map<string, FeatureModelRow[]>();

  for (const r of rows) {
    const row: FeatureModelRow = {
      id: r.id,
      ruleId: r.rule_id,
      featureKey: r.feature_key,
      featureType: r.feature_type,
      pPresent: r.p_present != null ? Number(r.p_present) : null,
      pAbsent: r.p_absent != null ? Number(r.p_absent) : null,
      categoricalMap: r.categorical_map ?? null,
      mean: r.mean != null ? Number(r.mean) : null,
      stdDev: r.std_dev != null ? Number(r.std_dev) : null,
      minValue: r.min_value != null ? Number(r.min_value) : null,
      maxValue: r.max_value != null ? Number(r.max_value) : null,
      weight: Number(r.weight ?? 1.0),
      isRequired: Boolean(r.is_required),
      source: r.source ?? "manual",
    };

    if (!byRule.has(row.ruleId)) byRule.set(row.ruleId, []);
    byRule.get(row.ruleId)!.push(row);
  }

  _featureModelCache = { byRule, loadedAt: Date.now(), rowCount: rows.length };
  return _featureModelCache;
}

export function invalidateAdvancedEngineCache(): void {
  _featureModelCache = null;
}

export function getAdvancedEngineCacheInfo(): { rowCount: number; loadedAt: number | null; uniqueRules: number } {
  return {
    rowCount: _featureModelCache?.rowCount ?? 0,
    loadedAt: _featureModelCache?.loadedAt ?? null,
    uniqueRules: _featureModelCache?.byRule.size ?? 0,
  };
}

// ── Score a single feature against input ────────────────────────────────────

function scoreFeature(
  f: FeatureModelRow,
  inputValue: unknown,
): { logLikelihood: number; contribution: "positive" | "negative" | "neutral" } {
  const w = f.weight;

  if (f.featureType === "boolean") {
    const isPresent = inputValue === true || inputValue === "yes" || inputValue === 1;
    const isAbsent = inputValue === false || inputValue === "no" || inputValue === 0;

    if (isPresent) {
      const p = clamp01(f.pPresent ?? 0.5);
      return { logLikelihood: safeLog(p) * w, contribution: p > 0.5 ? "positive" : "negative" };
    } else if (isAbsent) {
      const p = clamp01(f.pAbsent ?? 0.5);
      return { logLikelihood: safeLog(p) * w, contribution: p > 0.5 ? "positive" : "negative" };
    }
    // feature not present in input — neutral
    return { logLikelihood: 0, contribution: "neutral" };
  }

  if (f.featureType === "categorical") {
    if (inputValue == null) return { logLikelihood: 0, contribution: "neutral" };
    const map = f.categoricalMap ?? {};
    const key = String(inputValue).toLowerCase();
    const p = clamp01(map[key] ?? 0.01);
    return { logLikelihood: safeLog(p) * w, contribution: p > 0.1 ? "positive" : "negative" };
  }

  if (f.featureType === "numeric") {
    if (inputValue == null || isNaN(Number(inputValue))) return { logLikelihood: 0, contribution: "neutral" };
    if (f.mean == null || f.stdDev == null) return { logLikelihood: 0, contribution: "neutral" };
    const p = clamp01(gaussian(Number(inputValue), f.mean, f.stdDev));
    return { logLikelihood: safeLog(p) * w, contribution: p > 0.3 ? "positive" : "negative" };
  }

  if (f.featureType === "range") {
    if (inputValue == null || isNaN(Number(inputValue))) return { logLikelihood: 0, contribution: "neutral" };
    const v = Number(inputValue);
    const inRange = v >= (f.minValue ?? -Infinity) && v <= (f.maxValue ?? Infinity);
    const p = clamp01(inRange ? (f.pPresent ?? 0.8) : (f.pAbsent ?? 0.2));
    return { logLikelihood: safeLog(p) * w, contribution: p > 0.5 ? "positive" : "negative" };
  }

  return { logLikelihood: 0, contribution: "neutral" };
}

// ── Main: run advanced diagnosis ──────────────────────────────────────────────

export async function runAdvancedDiagnosis(
  input: AdvancedDiagnosisInput,
): Promise<{
  results: AdvancedDiagnosisResult[];
  engineSource: string;
  featureModelRows: number;
  uniqueRules: number;
}> {
  const cache = await loadFeatureModels();

  // Load diagnosis rules
  let ruleQuery = sql`
    SELECT rule_id, complaint_id, diagnosis_id, diagnosis_label, base_probability
    FROM kb_diagnosis_rules
    WHERE active = true
  `;
  if (input.complaintId) {
    ruleQuery = sql`
      SELECT rule_id, complaint_id, diagnosis_id, diagnosis_label, base_probability
      FROM kb_diagnosis_rules
      WHERE active = true AND (complaint_id = ${input.complaintId} OR complaint_id = 'bayesian_global')
    `;
  }

  const diagnosisRows = extractRows(await db.execute(ruleQuery));
  if (diagnosisRows.length === 0) {
    return { results: [], engineSource: "KB_DB", featureModelRows: cache.rowCount, uniqueRules: cache.byRule.size };
  }

  // Build input lookup: symptoms as boolean true, answers as values
  const inputMap: Record<string, unknown> = {};
  for (const sym of (input.symptoms ?? [])) {
    inputMap[sym.toLowerCase().trim()] = true;
  }
  for (const [k, v] of Object.entries(input.answers ?? {})) {
    inputMap[k.toLowerCase().trim()] = v;
  }

  // Score each diagnosis
  const scored: AdvancedDiagnosisResult[] = [];

  for (const dx of diagnosisRows) {
    const features = cache.byRule.get(dx.rule_id) ?? [];
    const baseProbability = Number(dx.base_probability ?? 0.1);
    let score = safeLog(baseProbability);
    const featureTrace: AdvancedDiagnosisResult["features"] = [];

    for (const f of features) {
      const inputValue = inputMap[f.featureKey.toLowerCase()] ?? null;
      const { logLikelihood, contribution } = scoreFeature(f, inputValue);

      if (logLikelihood !== 0) {
        score += logLikelihood;
        featureTrace.push({
          key: f.featureKey,
          type: f.featureType,
          inputValue,
          logLikelihood,
          contribution,
        });
      }
    }

    scored.push({
      ruleId: dx.rule_id,
      diagnosisLabel: dx.diagnosis_label,
      diagnosisId: dx.diagnosis_id,
      complaintId: dx.complaint_id,
      score,
      posterior: 0, // filled in after softmax
      baseProbability,
      source: "KB_DB",
      features: featureTrace,
    });
  }

  // Softmax normalization over scores
  const maxScore = Math.max(...scored.map(r => r.score));
  const expScores = scored.map(r => Math.exp(r.score - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  scored.forEach((r, i) => { r.posterior = expScores[i] / sumExp; });

  scored.sort((a, b) => b.posterior - a.posterior);

  return {
    results: scored,
    engineSource: "KB_DB",
    featureModelRows: cache.rowCount,
    uniqueRules: cache.byRule.size,
  };
}

// ── Migration: copy kb_feature_likelihoods → kb_feature_models ───────────────

export async function migrateFeatureLikelihoodsToModels(): Promise<{
  migrated: number;
  skipped: number;
  errors: string[];
}> {
  const sourceRows = extractRows(await db.execute(sql`
    SELECT rule_id, feature_key, likelihood, weight, source
    FROM kb_feature_likelihoods
    WHERE active = true
  `));

  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of sourceRows) {
    try {
      await db.execute(sql`
        INSERT INTO kb_feature_models
          (rule_id, feature_key, feature_type, p_present, p_absent, weight, source, active)
        VALUES (
          ${r.rule_id}, ${r.feature_key}, 'boolean',
          ${Number(r.likelihood)}, ${Number(1 - r.likelihood)},
          ${Number(r.weight ?? 1.0)}, ${r.source ?? 'migrated'}, true
        )
        ON CONFLICT (rule_id, feature_key) DO UPDATE SET
          p_present = EXCLUDED.p_present,
          p_absent = EXCLUDED.p_absent,
          weight = EXCLUDED.weight,
          source = EXCLUDED.source
      `);
      migrated++;
    } catch (e: any) {
      errors.push(`${r.rule_id}/${r.feature_key}: ${e.message}`);
      skipped++;
    }
  }

  invalidateAdvancedEngineCache();
  return { migrated, skipped, errors };
}
