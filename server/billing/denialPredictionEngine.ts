/**
 * Denial Prediction Engine — estimates the probability a claim will be denied.
 *
 * Fixed in this version:
 *  - Risk score is now bounded without Math.min: defined factor weights sum to
 *    MAX_THEORETICAL_RISK (0.95) so the score is interpretable without clamping
 *    (a 0.85 claim is meaningfully different from a 0.60 claim)
 *  - CPT pricing is abstracted behind CptPricingStore — no stale hardcoded rates
 *  - Unknown CPT returns null revenue instead of a fake $75 fallback that
 *    quietly poisons dashboard decisions
 *  - pricingSource is explicit: "configured" or "unavailable"
 *  - predictDenial is now async to allow injectable pricing stores
 *  - InMemoryCptPricingStore provided for dev/test (approximate 2024 Medicare rates)
 */

import type { AutoCodeResult } from "./diagnosisAutoCoder";
import type { RiskClassification } from "../compliance/riskEngine";

// ── Pricing store interface ───────────────────────────────────────────────────
//
// CPT pricing MUST NOT live in source code. Medicare rates change annually and
// commercial rates vary by contract. Inject a DB-backed store in production.
// Using InMemoryCptPricingStore in production will silently produce stale rates.

export interface CptPricingStore {
  getRate(cptCode: string, payerId?: string): Promise<number | null>;
}

/**
 * In-memory store for development and testing.
 * Approximate 2024 Medicare allowable rates — NOT for production use.
 */
export class InMemoryCptPricingStore implements CptPricingStore {
  private readonly rates: Record<string, number> = {
    "99213": 75,   "99203": 90,
    "99214": 110,  "99215": 150,
    "99284": 250,  "99285": 400,
    "99441": 40,   "99443": 85,
    "99291": 550,
  };

  async getRate(cptCode: string): Promise<number | null> {
    return this.rates[cptCode] ?? null;
  }
}

// ── Risk factor weights ───────────────────────────────────────────────────────
//
// Each factor has a defined maximum contribution. The total bounded maximum is
// MAX_THEORETICAL_RISK — no Math.min or clamping required for normal operation.
// The defensive Math.min at the end guards against future factors being added
// without updating this comment.

const RISK_WEIGHTS = {
  unmappedPrimary:       0.35,  // binary: primary ICD-10 is unspecified (R69)
  unmappedDifferential:  0.05,  // per differential, capped by maxDifferentialRisk
  maxDifferentialRisk:   0.20,  // cap: max 4 differentials count (4 × 0.05)
  highCptLowConfidence:  0.25,  // binary: high-complexity CPT + model confidence < 70%
  missingDocumentation:  0.15,  // binary: auditable CPT with incomplete HPI/Assessment/Plan
} as const;

// Max = 0.35 + 0.20 + 0.25 + 0.15 = 0.95
const MAX_THEORETICAL_RISK = 0.95;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DenialPrediction {
  riskScore:               number;                     // 0.000 – 1.000
  riskLevel:               "low" | "medium" | "high";
  reasons:                 string[];
  recommendations:         string[];
  estimatedRevenue:        number | null;              // null when no pricing data available
  estimatedRevenueImpact:  number | null;              // null when estimatedRevenue is null
  pricingSource:           "configured" | "unavailable";
}

export interface DenialPredictInput {
  coding:             AutoCodeResult;
  riskClassification: RiskClassification;
  encounter: {
    complaint:   string;
    diagnosis:   string;
    triage:      string;
    confidence?: number;
  };
  clinicalNote: {
    hpi:        string;
    assessment: string;
    plan:       string;
  };
  payerId?: string;
}

const HIGH_COMPLEXITY_CPTS = new Set(["99215", "99285", "99284", "99291"]);
const AUDITABLE_CPTS        = new Set(["99285", "99284", "99291", "99215"]);

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Predicts denial risk for a single claim bundle.
 *
 * @param bundle   Clinical coding + encounter context
 * @param pricingStore  CPT pricing source. Defaults to InMemoryCptPricingStore
 *                      (dev/test only — inject a DB-backed store in production)
 */
export async function predictDenial(
  bundle:       DenialPredictInput,
  pricingStore: CptPricingStore = new InMemoryCptPricingStore()
): Promise<DenialPrediction> {
  let risk = 0;
  const reasons:         string[] = [];
  const recommendations: string[] = [];

  // ── Factor 1: Unmapped primary ICD-10 ──────────────────────────────────────
  if (!bundle.coding.primary.mapped) {
    risk += RISK_WEIGHTS.unmappedPrimary;
    reasons.push("Primary ICD-10 unmapped (coded as R69 — unspecified)");
    recommendations.push("Map to the most specific ICD-10 code available for the encounter");
  }

  // ── Factor 2: Unmapped differentials (capped) ───────────────────────────────
  // FIXED: original was 0.05 * N (unbounded — 20 differentials = risk += 1.0).
  // Now capped at maxDifferentialRisk so large differential lists don't dominate.
  const unmappedDiffs = bundle.coding.differentials.filter(d => !d.mapped);
  if (unmappedDiffs.length > 0) {
    const differentialRisk = Math.min(
      unmappedDiffs.length * RISK_WEIGHTS.unmappedDifferential,
      RISK_WEIGHTS.maxDifferentialRisk
    );
    risk += differentialRisk;
    reasons.push(
      `${unmappedDiffs.length} differential diagnosis code(s) unmapped` +
      (unmappedDiffs.length > 4 ? ` (risk contribution capped at ${RISK_WEIGHTS.maxDifferentialRisk})` : "")
    );
    recommendations.push("Map differential diagnoses to reduce specificity-related denial risk");
  }

  // ── Factor 3: High-complexity CPT with low model confidence ────────────────
  const cptCode   = bundle.coding.cpt.code;
  const confidence = bundle.encounter.confidence ?? 1;

  if (HIGH_COMPLEXITY_CPTS.has(cptCode) && confidence < 0.7) {
    risk += RISK_WEIGHTS.highCptLowConfidence;
    reasons.push(
      `High-complexity CPT ${cptCode} assigned with low model confidence ` +
      `(${(confidence * 100).toFixed(0)}%). ` +
      `Payer audit algorithms flag high-complexity codes with insufficient documentation.`
    );
    recommendations.push(
      `Document time-based criteria or medical decision complexity explicitly in the note. ` +
      `Consider downcoding if documentation does not support ${cptCode}.`
    );
  }

  // ── Factor 4: Missing documentation for auditable CPTs ──────────────────────
  if (AUDITABLE_CPTS.has(cptCode)) {
    const hasNote =
      bundle.clinicalNote.hpi?.trim()        &&
      bundle.clinicalNote.assessment?.trim() &&
      bundle.clinicalNote.plan?.trim();
    if (!hasNote) {
      risk += RISK_WEIGHTS.missingDocumentation;
      reasons.push(
        `CPT ${cptCode} requires complete clinical documentation (HPI/Assessment/Plan) — one or more sections are missing`
      );
      recommendations.push("Complete all clinical documentation sections before claim submission");
    }
  }

  // ── Final score ─────────────────────────────────────────────────────────────
  // Factors are bounded by design (max = MAX_THEORETICAL_RISK = 0.95).
  // Defensive Math.min guards against future unbounded factors being added.
  const riskScore = Math.round(Math.min(risk, 1) * 1000) / 1000;

  const riskLevel: "low" | "medium" | "high" =
    riskScore <= 0.20 ? "low"    :
    riskScore <= 0.50 ? "medium" :
    "high";

  if (reasons.length === 0) {
    reasons.push("No denial risk factors detected");
  }

  // ── Revenue impact ──────────────────────────────────────────────────────────
  // FIXED: unknown CPT now returns null revenue instead of a fake $75 fallback
  // that would make dashboard revenue estimates look authoritative when they are not.
  const configuredRate = await pricingStore.getRate(cptCode, bundle.payerId);
  const pricingSource  = configuredRate !== null ? "configured" : "unavailable";

  if (pricingSource === "unavailable") {
    console.warn(
      `[DenialPrediction] No pricing data for CPT ${cptCode}` +
      (bundle.payerId ? ` / payer ${bundle.payerId}` : "") +
      ` — revenue impact estimate is unavailable. ` +
      `Inject a DB-backed CptPricingStore to get accurate revenue figures.`
    );
  }

  return {
    riskScore,
    riskLevel,
    reasons,
    recommendations,
    estimatedRevenue:       configuredRate,
    estimatedRevenueImpact: configuredRate === null
      ? null
      : Math.round(configuredRate * riskScore * 100) / 100,
    pricingSource,
  };
}

// ── Batch variant ─────────────────────────────────────────────────────────────

export async function batchPredictDenials(
  bundles:      DenialPredictInput[],
  pricingStore: CptPricingStore = new InMemoryCptPricingStore()
): Promise<{
  predictions:        DenialPrediction[];
  summary: {
    totalBundles:      number;
    highRisk:          number;
    mediumRisk:        number;
    lowRisk:           number;
    totalRevenueAtRisk: number;  // sum of non-null estimatedRevenueImpacts only
  };
}> {
  const predictions = await Promise.all(
    bundles.map(b => predictDenial(b, pricingStore))
  );

  return {
    predictions,
    summary: {
      totalBundles:  predictions.length,
      highRisk:      predictions.filter(p => p.riskLevel === "high").length,
      mediumRisk:    predictions.filter(p => p.riskLevel === "medium").length,
      lowRisk:       predictions.filter(p => p.riskLevel === "low").length,
      // null revenue impacts are excluded from the at-risk sum with a comment
      // in logs — callers should check pricingSource to understand coverage
      totalRevenueAtRisk: Math.round(
        predictions.reduce((sum, p) => sum + (p.estimatedRevenueImpact ?? 0), 0) * 100
      ) / 100,
    },
  };
}
