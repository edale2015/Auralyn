# Diagnosis Engine — Clinical Bayesian Engine (Part 2)

## Review Prompt

Continue reviewing the diagnosis engine (Part 2 of 2).
Focus on: clinical Bayesian engine logic, prior service reliability,
whether the Bayesian net correctly represents clinical uncertainty,
and whether the priors are clinically validated and update-safe.

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this part.

### server/clinical/bayesianEngine.ts

```ts
/**
 * Bayesian Differential Diagnosis Engine
 *
 * Implements a Naive Bayes classifier for differential diagnosis.
 * Can be used standalone or as a scoring layer within the
 * hybrid-reasoning/hybridController.ts ensemble.
 *
 * The existing server/core/engines/bayesianEngine.ts handles training
 * on outcomes. This module provides:
 *  1. A symptom-to-diagnosis prior probability table (clinical literature)
 *  2. Bayesian posterior update given observed symptoms
 *  3. Ranked differential output with confidence bands
 *
 * Rewritten in this version (Packet 6):
 *  - Symptoms are deduplicated before scoring to prevent accidental double-counting
 *  - Globally unknown symptoms (absent from every prior) are skipped entirely
 *    rather than applying a fake log(0.3) penalty that distorts rankings without
 *    providing real clinical signal
 *  - The missing-symptom floor was changed from 0.3 (original) to 0.01: if a
 *    symptom is known somewhere in the model but absent for a specific diagnosis,
 *    that diagnosis gets a small floor penalty, not a near-neutral one
 *  - Priors with non-finite or zero baseProbability are skipped rather than
 *    producing NaN log scores
 *  - Correlation dampening: co-occurring symptoms in the same clinical cluster
 *    (e.g. "fever" + "chills") get diminishing weight beyond the first feature
 *    to mitigate naive Bayes over-confidence from correlated evidence
 *  - If normalization fails (all exponents underflow), the engine falls back to
 *    prior-only ranking instead of returning 0/NaN posteriors
 *  - Confidence thresholds raised (0.7 high, 0.35 moderate) and now require
 *    minimum matched feature counts — a single-symptom match cannot be "high"
 *  - All existing exports (runDifferential, topDifferentials, setRuntimePriors,
 *    bayesianUpdate, getSourceTrace, etc.) are backward-compatible
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagnosisPrior {
  diagnosis:          string;
  baseProbability:    number;                     // P(D) — unconditional prevalence
  featureLikelihoods: Record<string, number>;    // P(symptom | D)
  // Provenance — populated when loaded from kb_diagnosis_rules
  ruleId?:    string;
  version?:   number;
  tableName?: string;
}

export interface DifferentialResult {
  diagnosis:        string;
  posterior:        number;                     // P(D | symptoms), normalized
  confidence:       "high" | "moderate" | "low";
  matchedFeatures:  string[];
  featureLikelihoods?: Record<string, number>;  // full likelihood map (for trace)
  source?:          "KB_DB" | "FALLBACK_HARDCODED";
  // Full provenance chain
  ruleId?:    string;
  version?:   number;
  tableName?: string;
}

/** Source trace — which prior table is currently active in the Bayesian engine */
export interface SourceTrace {
  source:                "KB_DB" | "FALLBACK_HARDCODED";
  priorCount:            number;
  priorsWithLikelihoods: number;
  fallbackReason:        string | null;
  activatedAt:           string | null;
}

/**
 * Options for the differential engine.
 * All fields are optional — defaults are safe for production use.
 */
export interface RunDifferentialOptions {
  /**
   * Likelihood floor used when a symptom is known somewhere in the model
   * but missing for a particular diagnosis.
   *
   * FIXED from original: was 0.3 (barely a penalty) → now 0.01 (realistic floor).
   * 0.01 means "this symptom is very rare given this diagnosis" rather than "about
   * 30% chance" which the original implied.
   */
  unseenLikelihood?: number;

  /** Floor for clampProbability — prevents log(0) on edge-case priors. */
  minBaseProbability?: number;

  /**
   * Clinical correlation groups. Symptoms in the same group get diminishing
   * log-likelihood weight after the first: 1st = full, 2nd = dampening^1, etc.
   *
   * Example: [["fever", "chills", "rigors"], ["nausea", "vomiting"]]
   */
  correlatedFeatureGroups?: string[][];

  /**
   * Dampening factor for subsequent features in the same correlation group.
   * 1.0 = no dampening. 0.6 = moderate (default, recommended for clinical use).
   */
  correlationDampening?: number;

  /**
   * Posterior threshold for "high" confidence.
   * Default 0.7 — more conservative than original 0.35 (which was too low for
   * a two-class model to produce "high" from a single symptom match).
   */
  highConfidencePosterior?: number;

  /**
   * Posterior threshold for "moderate" confidence.
   * Default 0.35 — matches the old "high" threshold but now gated on >= 1 match.
   */
  moderateConfidencePosterior?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps a probability to [floor, 1-floor] and replaces non-finite values with floor.
 * Prevents log(0) and log(negative) in the scoring loop.
 */
function clampProbability(value: number, floor: number): number {
  if (!Number.isFinite(value)) return floor;
  return Math.min(Math.max(value, floor), 1 - floor);
}

function inferSource(prior: DiagnosisPrior): "KB_DB" | "FALLBACK_HARDCODED" {
  return prior.ruleId || prior.tableName || prior.version !== undefined
    ? "KB_DB"
    : "FALLBACK_HARDCODED";
}

/** Builds a feature → groupKey map for O(1) group membership lookup. */
function buildFeatureGroupMap(groups: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  groups.forEach((group, idx) => {
    const key = `group_${idx}`;
    for (const feature of group) map.set(feature, key);
  });
  return map;
}

/**
 * Assigns a confidence band.
 *
 * FIXED from original: "high" now requires >= 2 matched features.
 * A single-symptom match in a 12-diagnosis model should not produce "high"
 * confidence — that is a display artefact, not a clinical signal.
 *
 * Note: These are heuristic display bands, not calibrated probabilities.
 * They need validation against outcome data before clinical use.
 */
function classifyConfidence(
  posterior:         number,
  matchedCount:      number,
  usedFeatureCount:  number,
  highThreshold:     number,
  moderateThreshold: number
): "high" | "moderate" | "low" {
  if (usedFeatureCount === 0) return "low";
  if (posterior >= highThreshold    && matchedCount >= 2) return "high";
  if (posterior >= moderateThreshold && matchedCount >= 1) return "moderate";
  return "low";
}

/**
 * Fallback when evidence normalization fails.
 * Returns prior-only ranking (normalized baseProbabilities) so callers
 * always get a ranked list rather than an empty result or NaN posteriors.
 */
function normalizeByBaseProbability(
  priors: DiagnosisPrior[],
  opts:   Required<Pick<RunDifferentialOptions, "minBaseProbability" | "highConfidencePosterior" | "moderateConfidencePosterior">>,
  sourceTag?: "KB_DB" | "FALLBACK_HARDCODED"
): DifferentialResult[] {
  const usable = priors
    .filter(p => Number.isFinite(p.baseProbability) && p.baseProbability > 0)
    .map(p => ({
      prior: p,
      base:  clampProbability(p.baseProbability, opts.minBaseProbability),
    }));

  const total = usable.reduce((sum, x) => sum + x.base, 0);
  if (total <= 0 || !Number.isFinite(total)) return [];

  return usable
    .map(({ prior, base }) => {
      const posterior = base / total;
      return {
        diagnosis:        prior.diagnosis,
        posterior:        Number(posterior.toFixed(4)),
        confidence:       classifyConfidence(posterior, 0, 0, opts.highConfidencePosterior, opts.moderateConfidencePosterior),
        matchedFeatures:  [],
        featureLikelihoods: prior.featureLikelihoods,
        source:           sourceTag ?? inferSource(prior),
        ruleId:           prior.ruleId,
        version:          prior.version,
        tableName:        prior.tableName,
      } satisfies DifferentialResult;
    })
    .sort((a, b) => b.posterior - a.posterior);
}

// ── Core scoring ──────────────────────────────────────────────────────────────

interface InternalScore {
  diagnosis:         string;
  logScore:          number;
  matchedFeatures:   string[];
  prior:             DiagnosisPrior;
  source:            "KB_DB" | "FALLBACK_HARDCODED";
}

/**
 * Core Bayesian scoring function.
 * Takes an explicit priors list and symptoms — the public API wrappers
 * (bayesianUpdate, runDifferential) select the active priors and merge options.
 */
function runDifferentialCore(
  rawSymptoms: string[],
  priors:      DiagnosisPrior[],
  options:     RunDifferentialOptions = {},
  sourceTag?:  "KB_DB" | "FALLBACK_HARDCODED"
): DifferentialResult[] {
  if (!Array.isArray(rawSymptoms) || !Array.isArray(priors) || priors.length === 0) {
    return [];
  }

  const unseenLikelihood         = options.unseenLikelihood         ?? 0.01;
  const minBaseProbability       = options.minBaseProbability       ?? 1e-6;
  const correlationDampening     = options.correlationDampening     ?? 0.6;
  const highConfidencePosterior  = options.highConfidencePosterior  ?? 0.7;
  const moderateConfidencePosterior = options.moderateConfidencePosterior ?? 0.35;

  const fallbackOpts = { minBaseProbability, highConfidencePosterior, moderateConfidencePosterior };

  // Deduplicate and sanitize — trim whitespace, lowercase for case-insensitive match,
  // remove blanks. Prevents the same symptom entered twice from doubling its evidence.
  const uniqueSymptoms = Array.from(
    new Set(
      rawSymptoms
        .map(s => s?.toLowerCase().trim())
        .filter((s): s is string => Boolean(s))
    )
  );

  if (uniqueSymptoms.length === 0) {
    return normalizeByBaseProbability(priors, fallbackOpts, sourceTag);
  }

  // Build the global vocabulary of symptoms that the model knows about.
  // FIXED: symptoms absent from every prior are skipped entirely — they carry
  // no information (neither for nor against any diagnosis) and only introduce
  // numeric noise via the fake log(0.01) penalty applied uniformly.
  const globallyKnownSymptoms = new Set<string>();
  for (const prior of priors) {
    for (const feature of Object.keys(prior.featureLikelihoods ?? {})) {
      globallyKnownSymptoms.add(feature.toLowerCase());
    }
  }

  const modeledSymptoms = uniqueSymptoms.filter(s => globallyKnownSymptoms.has(s));

  // None of the entered symptoms appear anywhere in the KB →
  // return prior-only ranking (honest: we have no evidence to update on).
  if (modeledSymptoms.length === 0) {
    return normalizeByBaseProbability(priors, fallbackOpts, sourceTag);
  }

  const groupMap = buildFeatureGroupMap(options.correlatedFeatureGroups ?? []);

  const scored: InternalScore[] = [];

  for (const prior of priors) {
    // Skip degenerate priors rather than producing NaN log scores.
    if (!Number.isFinite(prior.baseProbability) || prior.baseProbability <= 0) continue;

    let logScore = Math.log(clampProbability(prior.baseProbability, minBaseProbability));
    const matchedFeatures: string[] = [];
    const seenPerGroup = new Map<string, number>();

    // Normalize likelihood keys to lowercase for case-insensitive comparison.
    const likelihoods: Record<string, number> = {};
    for (const [k, v] of Object.entries(prior.featureLikelihoods ?? {})) {
      likelihoods[k.toLowerCase()] = v;
    }

    for (const symptom of modeledSymptoms) {
      const rawLikelihood = likelihoods[symptom];

      // Use configured floor when symptom is globally known but not in this prior.
      const likelihood = rawLikelihood !== undefined
        ? clampProbability(rawLikelihood, unseenLikelihood)
        : unseenLikelihood;

      // Correlation dampening: symptoms in the same clinical group get
      // diminishing weight after the first to prevent over-confidence from
      // correlated evidence (e.g. fever + chills both amplifying Flu).
      let weight = 1;
      const groupKey = groupMap.get(symptom);
      if (groupKey) {
        const alreadySeen = seenPerGroup.get(groupKey) ?? 0;
        weight = alreadySeen === 0 ? 1 : Math.pow(correlationDampening, alreadySeen);
        seenPerGroup.set(groupKey, alreadySeen + 1);
      }

      logScore += Math.log(likelihood) * weight;

      if (rawLikelihood !== undefined) {
        matchedFeatures.push(symptom);
      }
    }

    if (Number.isFinite(logScore)) {
      scored.push({
        diagnosis:       prior.diagnosis,
        logScore,
        matchedFeatures,
        prior,
        source:          sourceTag ?? inferSource(prior),
      });
    }
  }

  if (scored.length === 0) {
    return normalizeByBaseProbability(priors, fallbackOpts, sourceTag);
  }

  // Log-sum-exp: subtract maxLog before exp to prevent underflow.
  // The subtraction cancels in the final ratio so it does not affect posteriors.
  const maxLog = Math.max(...scored.map(s => s.logScore));
  if (!Number.isFinite(maxLog)) {
    return normalizeByBaseProbability(priors, fallbackOpts, sourceTag);
  }

  const withExp = scored.map(s => ({
    ...s,
    expScore: Math.exp(s.logScore - maxLog),
  }));

  const total = withExp.reduce((sum, s) => sum + (Number.isFinite(s.expScore) ? s.expScore : 0), 0);

  // If normalization denominator is 0 or NaN, fall back to prior-only ranking.
  if (!Number.isFinite(total) || total <= Number.EPSILON) {
    return normalizeByBaseProbability(priors, fallbackOpts, sourceTag);
  }

  return withExp
    .map(s => {
      const posterior = Number.isFinite(s.expScore) ? s.expScore / total : 0;
      return {
        diagnosis:          s.diagnosis,
        posterior:          Number(posterior.toFixed(4)),
        confidence:         classifyConfidence(
          posterior,
          s.matchedFeatures.length,
          modeledSymptoms.length,
          highConfidencePosterior,
          moderateConfidencePosterior
        ),
        matchedFeatures:    s.matchedFeatures,
        featureLikelihoods: s.prior.featureLikelihoods,
        source:             s.source,
        ruleId:             s.prior.ruleId,
        version:            s.prior.version,
        tableName:          s.prior.tableName,
      } satisfies DifferentialResult;
    })
    .sort((a, b) => b.posterior - a.posterior);
}

// ── Prior probability table (ENT/Flu-slice + Musculoskeletal scope) ──────────

export const PRIORS_COUNT = 12;  // updated when new entries are added to PRIORS below

const PRIORS: DiagnosisPrior[] = [
  {
    diagnosis: "Influenza A",
    baseProbability: 0.18,
    featureLikelihoods: {
      "fever":            0.92, "body aches":        0.85,
      "headache":         0.75, "cough":             0.80,
      "fatigue":          0.88, "sore throat":       0.50,
      "runny nose":       0.55, "chills":            0.78,
    },
  },
  {
    diagnosis: "COVID-19",
    baseProbability: 0.14,
    featureLikelihoods: {
      "fever":              0.88, "cough":              0.75,
      "loss of smell":      0.65, "loss of taste":      0.60,
      "fatigue":            0.82, "shortness of breath": 0.45,
      "headache":           0.60, "sore throat":        0.52,
    },
  },
  {
    diagnosis: "Strep Pharyngitis",
    baseProbability: 0.12,
    featureLikelihoods: {
      "sore throat":       0.96, "fever":              0.78,
      "tonsillar exudate": 0.70, "lymphadenopathy":    0.75,
      "headache":          0.45, "absence of cough":   0.80,
    },
  },
  {
    diagnosis: "Viral URI",
    baseProbability: 0.25,
    featureLikelihoods: {
      "runny nose":        0.90, "congestion":         0.88,
      "sore throat":       0.70, "cough":              0.65,
      "mild fever":        0.35, "sneezing":           0.80,
    },
  },
  {
    diagnosis: "Sinusitis",
    baseProbability: 0.10,
    featureLikelihoods: {
      "sinus pressure":     0.88, "facial pain":        0.75,
      "congestion":         0.82, "headache":           0.65,
      "purulent discharge": 0.70, "fever":              0.30,
      "post-nasal drip":    0.72,
    },
  },
  {
    diagnosis: "Otitis Media",
    baseProbability: 0.08,
    featureLikelihoods: {
      "ear pain":      0.95, "fever":        0.65,
      "hearing loss":  0.55, "ear fullness": 0.72,
      "discharge":     0.35,
    },
  },
  {
    diagnosis: "Pneumonia",
    baseProbability: 0.06,
    featureLikelihoods: {
      "fever":               0.88, "productive cough":   0.82,
      "shortness of breath": 0.72, "chest pain":         0.55,
      "fatigue":             0.78, "rigors":             0.60,
    },
  },
  {
    diagnosis: "Allergic Rhinitis",
    baseProbability: 0.07,
    featureLikelihoods: {
      "sneezing":        0.88, "runny nose":       0.85,
      "itchy eyes":      0.80, "congestion":       0.78,
      "no fever":        0.90, "seasonal pattern": 0.70,
    },
  },

  // ── Musculoskeletal / Shoulder ────────────────────────────────────────────
  {
    diagnosis: "Rotator Cuff Injury",
    baseProbability: 0.30,
    featureLikelihoods: {
      "shoulder pain":             0.95, "painful arc":               0.82,
      "weakness":                  0.75, "lateral pain":              0.78,
      "no trauma":                 0.60, "gradual onset":             0.70,
      "night pain":                0.68, "overhead activity pain":    0.80,
      "age over 40":               0.72, "loss of external rotation": 0.55,
    },
  },
  {
    diagnosis: "Shoulder Dislocation",
    baseProbability: 0.08,
    featureLikelihoods: {
      "trauma":                    0.92, "deformity":                 0.85,
      "arm held at side":          0.80, "severe pain":               0.90,
      "loss of external rotation": 0.75, "young male":                0.55,
      "shoulder pain":             0.95, "inability to move arm":     0.88,
    },
  },
  {
    diagnosis: "AC Joint Injury",
    baseProbability: 0.12,
    featureLikelihoods: {
      "trauma":                       0.88, "top of shoulder tender":     0.92,
      "step deformity":               0.70, "direct fall onto shoulder":  0.80,
      "shoulder pain":                0.95, "arm adduction pain":         0.72,
      "cross-body pain":              0.68,
    },
  },
  {
    diagnosis: "Cervical Radiculopathy",
    baseProbability: 0.15,
    featureLikelihoods: {
      "neck pain":         0.85, "arm pain":          0.82,
      "tingling":          0.78, "numbness fingers":  0.75,
      "shoulder pain":     0.70, "weakness arm":      0.65,
      "radiation to hand": 0.72, "no trauma":         0.60,
    },
  },
];

// ── Default correlation groups for the embedded PRIORS table ────────────────
//
// These groups dampen over-confident posteriors when co-occurring syndrome
// symptoms are entered together. Each group is a set of symptoms that often
// co-occur in the same clinical presentation.

const CLINICAL_CORRELATION_GROUPS: string[][] = [
  ["fever", "chills", "rigors"],             // systemic infection cluster
  ["runny nose", "congestion"],              // upper airway cluster
  ["loss of smell", "loss of taste"],        // COVID-specific cluster
  ["shortness of breath", "chest pain"],     // cardiorespiratory cluster
  ["shoulder pain", "arm pain"],             // shoulder/radiculopathy overlap
  ["nausea", "vomiting"],                    // GI cluster (future-proof)
];

// ── Runtime prior management (KB hot-swap) ────────────────────────────────────

let _runtimePriors:     DiagnosisPrior[] | null = null;
let _priorsActivatedAt: string | null = null;

export function setRuntimePriors(priors: DiagnosisPrior[]): void {
  const withLikelihoods = priors.filter(p => Object.keys(p.featureLikelihoods || {}).length > 0);
  if (withLikelihoods.length > 0) {
    _runtimePriors = withLikelihoods;
    _priorsActivatedAt = new Date().toISOString();
    (global as any).__kbPriorsCount = withLikelihoods.length;
    console.info(
      `[BayesianEngine] Runtime priors set from KB: ${withLikelihoods.length} ` +
      `(${priors.length - withLikelihoods.length} skipped — no featureLikelihoods)`
    );
  } else {
    _runtimePriors = null;
    _priorsActivatedAt = null;
    console.warn(
      `[BayesianEngine] KB priors have no featureLikelihoods — FALLBACK to hardcoded PRIORS table. ` +
      `Seed via POST /api/kb/seed to restore KB authority.`
    );
  }
}

export function clearRuntimePriors(): void {
  _runtimePriors = null;
  _priorsActivatedAt = null;
}

export function getActivePriors(): DiagnosisPrior[] {
  return _runtimePriors && _runtimePriors.length > 0 ? _runtimePriors : PRIORS;
}

export function getSourceTrace(): SourceTrace {
  if (_runtimePriors && _runtimePriors.length > 0) {
    return {
      source:                "KB_DB",
      priorCount:            _runtimePriors.length,
      priorsWithLikelihoods: _runtimePriors.length,
      fallbackReason:        null,
      activatedAt:           _priorsActivatedAt,
    };
  }
  return {
    source:                "FALLBACK_HARDCODED",
    priorCount:            PRIORS.length,
    priorsWithLikelihoods: PRIORS.filter(p => Object.keys(p.featureLikelihoods).length > 0).length,
    fallbackReason:        _runtimePriors === null
      ? "KB priors not yet loaded — call POST /api/kb/seed + POST /api/kb/cache-reload"
      : "No KB priors had featureLikelihoods — run kbSeeder.upsertBayesianPriors()",
    activatedAt:           null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Perform a Bayesian posterior update across all diagnoses
 * given a list of observed symptoms.
 *
 * This function is kept for backward compatibility.
 * Internally calls the improved runDifferentialCore.
 */
export function bayesianUpdate(
  priors:   DiagnosisPrior[],
  evidence: string[],
  options?: RunDifferentialOptions
): DifferentialResult[] {
  return runDifferentialCore(evidence, priors, options);
}

/**
 * Run the differential engine against the active prior table (KB or fallback).
 * Accepts optional options for correlation dampening and confidence tuning.
 *
 * When using the embedded PRIORS table, clinical correlation groups are
 * applied automatically. When using KB-loaded priors, pass custom
 * correlatedFeatureGroups via options.
 */
export function runDifferential(
  symptoms: string[],
  options?: RunDifferentialOptions
): DifferentialResult[] {
  const usingKb    = Boolean(_runtimePriors && _runtimePriors.length > 0);
  const sourceTag: "KB_DB" | "FALLBACK_HARDCODED" = usingKb ? "KB_DB" : "FALLBACK_HARDCODED";

  if (!usingKb) {
    console.warn("[BayesianEngine] FALLBACK — differential using hardcoded PRIORS, not KB_DB");
  }

  const mergedOptions: RunDifferentialOptions = {
    // Apply built-in correlation groups when using embedded PRIORS — KB priors
    // may have their own correlation topology (future work: infer from KB data).
    correlatedFeatureGroups: usingKb
      ? (options?.correlatedFeatureGroups ?? [])
      : (options?.correlatedFeatureGroups ?? CLINICAL_CORRELATION_GROUPS),
    ...options,
  };

  return runDifferentialCore(symptoms, getActivePriors(), mergedOptions, sourceTag);
}

/**
 * Return the top N differentials above a minimum confidence threshold.
 * Preserves existing caller contract: topDifferentials(symptoms, n, minPosterior).
 */
export function topDifferentials(
  symptoms:    string[],
  n            = 5,
  minPosterior = 0.03,
  options?:    RunDifferentialOptions
): DifferentialResult[] {
  return runDifferential(symptoms, options)
    .filter(d => d.posterior >= minPosterior)
    .slice(0, n);
}
```

### server/clinical/bayesianPriorService.ts

```ts
import { pool } from "../db/pool";
import { ClinicalPopulationFlags } from "../db/sharedTypes";

type PriorShiftMap = Record<string, number>;

const priorCache = new Map<string, { value: PriorShiftMap; expiresAt: number }>();
const TTL_MS = 5 * 60_000;

function flagsKey(flags: ClinicalPopulationFlags): string {
  return (
    Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort()
      .join("|") || "default"
  );
}

export async function getPopulationPriorMultipliers(
  flags: ClinicalPopulationFlags
): Promise<PriorShiftMap> {
  const key = flagsKey(flags);
  const hit = priorCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const activeFlags = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (!activeFlags.length) {
    const empty: PriorShiftMap = {};
    priorCache.set(key, { value: empty, expiresAt: Date.now() + TTL_MS });
    return empty;
  }

  try {
    const { rows } = await pool.query(
      `SELECT population_flag, diagnosis_key, multiplier
       FROM kb_population_priors
       WHERE population_flag = ANY($1::text[])
         AND active = true`,
      [activeFlags]
    );

    const map: PriorShiftMap = {};
    for (const row of rows) {
      const current = map[row.diagnosis_key] ?? 1;
      map[row.diagnosis_key] = current * Number(row.multiplier);
    }

    priorCache.set(key, { value: map, expiresAt: Date.now() + TTL_MS });
    return map;
  } catch (e: any) {
    console.error("[BayesianPriorService] Failed to load population priors:", e?.message);
    return {};
  }
}

export function invalidatePriorCache(): void {
  priorCache.clear();
  console.log("[BayesianPriorService] Prior cache invalidated");
}

export function getPriorCacheStats(): { size: number; keys: string[] } {
  return { size: priorCache.size, keys: [...priorCache.keys()] };
}
```
