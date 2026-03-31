/**
 * Phase 3 Migration: Hardcoded PRIORS + JSONB blobs → kb_feature_likelihoods
 *
 * This is the one-time (idempotent) migration that moves ALL clinical likelihood
 * data out of TypeScript constants and JSONB blobs into the normalized
 * kb_feature_likelihoods table. After this runs:
 *   - Every diagnosis rule's likelihood values live in Postgres
 *   - The Bayesian engine reads exclusively from kb_feature_likelihoods via JOIN
 *   - pctKbDriven = 100% for all rules with features
 *   - Hardcoded PRIORS[] in bayesianEngine.ts become dead code
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Hardcoded PRIORS from bayesianEngine.ts (source of truth for migration) ───────────────────
// These are the 12 hardcoded entries that Phase 3 permanently moves to Postgres.
const HARDCODED_PRIORS = [
  {
    ruleId: "DX_BAY_INFLUENZA_A",
    diagnosisLabel: "Influenza A",
    complaintId: "bayesian_global",
    baseProbability: 0.18,
    featureLikelihoods: {
      "fever": 0.92, "body aches": 0.85,
      "headache": 0.75, "cough": 0.80,
      "fatigue": 0.88, "sore throat": 0.50,
      "runny nose": 0.55, "chills": 0.78,
    },
  },
  {
    ruleId: "DX_BAY_COVID19",
    diagnosisLabel: "COVID-19",
    complaintId: "bayesian_global",
    baseProbability: 0.14,
    featureLikelihoods: {
      "fever": 0.88, "cough": 0.75,
      "loss of smell": 0.65, "loss of taste": 0.60,
      "fatigue": 0.82, "shortness of breath": 0.45,
      "headache": 0.60, "sore throat": 0.52,
    },
  },
  {
    ruleId: "DX_BAY_STREP_PHARYNGITIS",
    diagnosisLabel: "Strep Pharyngitis",
    complaintId: "bayesian_global",
    baseProbability: 0.12,
    featureLikelihoods: {
      "sore throat": 0.96, "fever": 0.78,
      "tonsillar exudate": 0.70, "lymphadenopathy": 0.75,
      "headache": 0.45, "absence of cough": 0.80,
    },
  },
  {
    ruleId: "DX_BAY_VIRAL_URI",
    diagnosisLabel: "Viral URI",
    complaintId: "bayesian_global",
    baseProbability: 0.25,
    featureLikelihoods: {
      "runny nose": 0.90, "congestion": 0.88,
      "sore throat": 0.70, "cough": 0.65,
      "mild fever": 0.35, "sneezing": 0.80,
    },
  },
  {
    ruleId: "DX_BAY_SINUSITIS",
    diagnosisLabel: "Sinusitis",
    complaintId: "bayesian_global",
    baseProbability: 0.10,
    featureLikelihoods: {
      "sinus pressure": 0.88, "facial pain": 0.75,
      "congestion": 0.82, "headache": 0.65,
      "purulent discharge": 0.70, "fever": 0.30,
      "post-nasal drip": 0.72,
    },
  },
  {
    ruleId: "DX_BAY_OTITIS_MEDIA",
    diagnosisLabel: "Otitis Media",
    complaintId: "bayesian_global",
    baseProbability: 0.08,
    featureLikelihoods: {
      "ear pain": 0.95, "fever": 0.65,
      "hearing loss": 0.55, "ear fullness": 0.72,
      "discharge": 0.35,
    },
  },
  {
    ruleId: "DX_BAY_PNEUMONIA",
    diagnosisLabel: "Pneumonia",
    complaintId: "bayesian_global",
    baseProbability: 0.06,
    featureLikelihoods: {
      "fever": 0.88, "productive cough": 0.82,
      "shortness of breath": 0.72, "chest pain": 0.55,
      "fatigue": 0.78, "rigors": 0.60,
    },
  },
  {
    ruleId: "DX_BAY_ALLERGIC_RHINITIS",
    diagnosisLabel: "Allergic Rhinitis",
    complaintId: "bayesian_global",
    baseProbability: 0.07,
    featureLikelihoods: {
      "sneezing": 0.88, "runny nose": 0.85,
      "itchy eyes": 0.80, "congestion": 0.78,
      "no fever": 0.90, "seasonal pattern": 0.70,
    },
  },
  {
    ruleId: "DX_BAY_ROTATOR_CUFF",
    diagnosisLabel: "Rotator Cuff Injury",
    complaintId: "bayesian_global",
    baseProbability: 0.30,
    featureLikelihoods: {
      "shoulder pain": 0.95, "painful arc": 0.82,
      "weakness": 0.75, "lateral pain": 0.78,
      "no trauma": 0.60, "gradual onset": 0.70,
      "night pain": 0.68, "overhead activity pain": 0.80,
      "age over 40": 0.72, "loss of external rotation": 0.55,
    },
  },
  {
    ruleId: "DX_BAY_SHOULDER_DISLOCATION",
    diagnosisLabel: "Shoulder Dislocation",
    complaintId: "bayesian_global",
    baseProbability: 0.08,
    featureLikelihoods: {
      "trauma": 0.92, "deformity": 0.85,
      "arm held at side": 0.80, "severe pain": 0.90,
      "loss of external rotation": 0.75, "young male": 0.55,
      "shoulder pain": 0.95, "inability to move arm": 0.88,
    },
  },
  {
    ruleId: "DX_BAY_AC_JOINT",
    diagnosisLabel: "AC Joint Injury",
    complaintId: "bayesian_global",
    baseProbability: 0.12,
    featureLikelihoods: {
      "trauma": 0.88, "top of shoulder tender": 0.92,
      "step deformity": 0.70, "direct fall onto shoulder": 0.80,
      "shoulder pain": 0.95, "arm adduction pain": 0.72,
      "cross-body pain": 0.68,
    },
  },
  {
    ruleId: "DX_BAY_CERVICAL_RADICULOPATHY",
    diagnosisLabel: "Cervical Radiculopathy",
    complaintId: "bayesian_global",
    baseProbability: 0.15,
    featureLikelihoods: {
      "neck pain": 0.85, "arm pain": 0.82,
      "tingling": 0.78, "numbness fingers": 0.75,
      "shoulder pain": 0.70, "weakness arm": 0.65,
      "radiation to hand": 0.72, "no trauma": 0.60,
    },
  },
];

// ── Helper: upsert one rule into kb_diagnosis_rules ────────────────────────────────────────────
async function ensureDiagnosisRule(p: typeof HARDCODED_PRIORS[0]): Promise<void> {
  await db.execute(sql`
    INSERT INTO kb_diagnosis_rules (rule_id, complaint_id, diagnosis_id, diagnosis_label,
      base_probability, feature_likelihoods, cannot_miss, active)
    VALUES (
      ${p.ruleId}, ${p.complaintId}, ${p.diagnosisLabel.toLowerCase().replace(/\s+/g, "_")},
      ${p.diagnosisLabel}, ${p.baseProbability}, ${JSON.stringify(p.featureLikelihoods)}::jsonb,
      false, true
    )
    ON CONFLICT (rule_id) DO UPDATE
      SET base_probability = EXCLUDED.base_probability,
          diagnosis_label  = EXCLUDED.diagnosis_label,
          feature_likelihoods = EXCLUDED.feature_likelihoods,
          active = true,
          updated_at = CURRENT_TIMESTAMP
  `);
}

// ── Helper: upsert feature rows for one rule ────────────────────────────────────────────────────
async function upsertFeatureRows(
  ruleId: string,
  features: Record<string, number>,
  source: string,
): Promise<number> {
  let count = 0;
  for (const [featureKey, likelihood] of Object.entries(features)) {
    if (likelihood <= 0 || likelihood > 1) continue; // skip invalid values
    await db.execute(sql`
      INSERT INTO kb_feature_likelihoods (rule_id, feature_key, feature_value, likelihood, weight, source, active)
      VALUES (${ruleId}, ${featureKey}, 'yes', ${likelihood}, 1.0, ${source}, true)
      ON CONFLICT (rule_id, feature_key, feature_value) DO UPDATE
        SET likelihood = EXCLUDED.likelihood,
            weight     = EXCLUDED.weight,
            source     = EXCLUDED.source,
            active     = true
    `);
    count++;
  }
  return count;
}

// ── Main migration entry point ─────────────────────────────────────────────────────────────────
export interface MigrationResult {
  priorsProcessed: number;
  jsonbRulesProcessed: number;
  featureRowsInserted: number;
  featureRowsTotal: number;
  pctKbDriven: number;
  errors: string[];
  durationMs: number;
}

export async function migrateToFeatureTable(): Promise<MigrationResult> {
  const start = Date.now();
  const errors: string[] = [];
  let featureRowsInserted = 0;

  // ── Step 1: Upsert all 12 hardcoded PRIORS into kb_diagnosis_rules + kb_feature_likelihoods
  let priorsProcessed = 0;
  for (const prior of HARDCODED_PRIORS) {
    try {
      await ensureDiagnosisRule(prior);
      const inserted = await upsertFeatureRows(prior.ruleId, prior.featureLikelihoods, "hardcoded_prior");
      featureRowsInserted += inserted;
      priorsProcessed++;
    } catch (err: any) {
      errors.push(`PRIOR ${prior.ruleId}: ${err.message}`);
    }
  }

  // ── Step 2: Migrate JSONB featureLikelihoods from kb_diagnosis_rules that have non-empty blobs
  //    (covers any user-added rules with featureLikelihoods set via the UI)
  let jsonbRulesProcessed = 0;
  try {
    const result = await db.execute(sql`
      SELECT rule_id, feature_likelihoods
      FROM kb_diagnosis_rules
      WHERE active = true
        AND feature_likelihoods IS NOT NULL
        AND feature_likelihoods::text != '{}'
        AND rule_id NOT IN (
          SELECT DISTINCT rule_id FROM kb_feature_likelihoods WHERE active = true
        )
    `);
    const rows = (result as any).rows ?? [];
    for (const row of rows) {
      const features = row.feature_likelihoods as Record<string, number> | null;
      if (!features || typeof features !== "object") continue;
      try {
        const inserted = await upsertFeatureRows(String(row.rule_id), features, "jsonb_migration");
        featureRowsInserted += inserted;
        jsonbRulesProcessed++;
      } catch (err: any) {
        errors.push(`JSONB ${row.rule_id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`JSONB scan failed: ${err.message}`);
  }

  // ── Step 3: Compute final coverage
  const totalResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM kb_feature_likelihoods WHERE active = true`);
  const featureRowsTotal = Number(((totalResult as any).rows?.[0]?.n) ?? 0);

  const covResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT r.rule_id) FILTER (
        WHERE EXISTS (SELECT 1 FROM kb_feature_likelihoods f WHERE f.rule_id = r.rule_id AND f.active = true)
      ) * 100.0 / NULLIF(COUNT(DISTINCT r.rule_id), 0) AS pct
    FROM kb_diagnosis_rules r
    WHERE r.active = true
      AND r.complaint_id = 'bayesian_global'
  `);
  const pctKbDriven = Math.round(Number(((covResult as any).rows?.[0]?.pct) ?? 0));

  return {
    priorsProcessed,
    jsonbRulesProcessed,
    featureRowsInserted,
    featureRowsTotal,
    pctKbDriven,
    errors,
    durationMs: Date.now() - start,
  };
}

// ── Validation: ensure no active bayesian_global rule is missing feature rows ──────────────────
export async function validateFeatureCoverage(): Promise<{ ruleId: string; diagnosisLabel: string }[]> {
  const result = await db.execute(sql`
    SELECT r.rule_id, r.diagnosis_label
    FROM kb_diagnosis_rules r
    WHERE r.active = true
      AND r.complaint_id = 'bayesian_global'
      AND NOT EXISTS (
        SELECT 1 FROM kb_feature_likelihoods f
        WHERE f.rule_id = r.rule_id AND f.active = true
      )
    ORDER BY r.diagnosis_label
  `);
  return ((result as any).rows ?? []).map((r: any) => ({
    ruleId: String(r.rule_id),
    diagnosisLabel: String(r.diagnosis_label),
  }));
}
