/**
 * Outcome Learning Engine
 *
 * Three responsibilities:
 *  1. Record real-world outcomes (predicted vs actual)
 *  2. Generate learning event suggestions from error patterns
 *  3. Apply approved learning events to kb_diagnosis_rules / kb_feature_models
 *
 * SAFETY: No auto-deploy. All events require status='approved' set by a human
 * before applyApprovedLearningEvents() picks them up.
 *
 * Source: KB_DB only.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutcomeRecord {
  caseId: string;
  predictedDx: string | null;
  actualDx: string | null;
  predictedDisposition: string | null;
  actualDisposition: string | null;
  correct: boolean;
  clinicianOverride: boolean;
  outcomeSeverity?: string;
}

export interface LearningEvent {
  id: number;
  ruleId: string;
  featureKey: string;
  delta: number;
  confidence: number;
  source: string;
  status: "pending" | "approved" | "rejected" | "deployed";
  rationale: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  deployedAt: Date | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ── 1. Record outcome ─────────────────────────────────────────────────────────

export async function recordOutcome(outcome: OutcomeRecord): Promise<void> {
  await db.execute(sql`
    INSERT INTO kb_outcomes
      (case_id, predicted_dx, actual_dx, predicted_disposition, actual_disposition,
       correct, clinician_override, outcome_severity)
    VALUES (
      ${outcome.caseId},
      ${outcome.predictedDx},
      ${outcome.actualDx},
      ${outcome.predictedDisposition},
      ${outcome.actualDisposition},
      ${outcome.correct},
      ${outcome.clinicianOverride},
      ${outcome.outcomeSeverity ?? null}
    )
  `);
}

// ── 2. Generate learning suggestions ─────────────────────────────────────────

export async function generateLearningEvents(options: {
  source?: string;
  minErrors?: number;
  errorRateThreshold?: number;
  lookbackDays?: number;
} = {}): Promise<{
  generated: number;
  suggestions: Array<{ ruleId: string; errorRate: number; delta: number; confidence: number }>;
}> {
  const {
    source = "real_world",
    errorRateThreshold = 0.15,
    lookbackDays = 30,
  } = options;

  // Count errors per predicted diagnosis within lookback window
  const rows = extractRows(await db.execute(sql`
    SELECT predicted_dx,
           COUNT(*)::int AS total,
           SUM(CASE WHEN correct = false THEN 1 ELSE 0 END)::int AS errors
    FROM kb_outcomes
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(lookbackDays))} days'
      AND predicted_dx IS NOT NULL
    GROUP BY predicted_dx
    HAVING COUNT(*) >= 5
    ORDER BY errors DESC
  `));

  const suggestions: Array<{ ruleId: string; errorRate: number; delta: number; confidence: number }> = [];

  for (const r of rows) {
    const errRate = Number(r.errors) / Math.max(1, Number(r.total));
    if (errRate <= errorRateThreshold) continue;

    const ruleId = `DX_BAY_${String(r.predicted_dx).toUpperCase().replace(/\s+/g, "_")}`;
    const delta = -0.05 * Math.min(3, Math.floor(errRate / 0.15)); // proportional downweight
    const confidence = Math.min(0.95, errRate + 0.5);

    suggestions.push({ ruleId, errorRate: errRate, delta, confidence });

    // Check if event already pending
    const existing = extractRows(await db.execute(sql`
      SELECT id FROM kb_learning_events
      WHERE rule_id = ${ruleId} AND feature_key = '__base__' AND status = 'pending'
      LIMIT 1
    `));
    if (existing.length > 0) continue;

    await db.execute(sql`
      INSERT INTO kb_learning_events (rule_id, feature_key, delta, confidence, source, status, rationale)
      VALUES (
        ${ruleId}, '__base__', ${delta}, ${confidence}, ${source}, 'pending',
        ${'Error rate ' + (errRate * 100).toFixed(1) + '% over ' + r.total + ' cases — proposed base_probability reduction'}
      )
    `);
  }

  return { generated: suggestions.length, suggestions };
}

// ── 3. Apply approved learning events ────────────────────────────────────────

export async function applyApprovedLearningEvents(reviewedBy?: string): Promise<{
  applied: number;
  skipped: number;
  errors: string[];
  events: Array<{ id: number; ruleId: string; featureKey: string; delta: number; newValue: number }>;
}> {
  const approved = extractRows(await db.execute(sql`
    SELECT id, rule_id, feature_key, delta, confidence, source
    FROM kb_learning_events
    WHERE status = 'approved'
    ORDER BY confidence DESC, created_at ASC
  `));

  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];
  const events: Array<{ id: number; ruleId: string; featureKey: string; delta: number; newValue: number }> = [];

  for (const e of approved) {
    try {
      if (e.feature_key === "__base__") {
        // Adjust base_probability on kb_diagnosis_rules
        const rule = extractRows(await db.execute(sql`
          SELECT base_probability FROM kb_diagnosis_rules WHERE rule_id = ${e.rule_id} LIMIT 1
        `));
        if (rule.length === 0) { skipped++; continue; }

        const newVal = Math.max(0.001, Number(rule[0].base_probability) + Number(e.delta));
        await db.execute(sql`
          UPDATE kb_diagnosis_rules
          SET base_probability = ${newVal}, updated_at = CURRENT_TIMESTAMP
          WHERE rule_id = ${e.rule_id}
        `);
        events.push({ id: e.id, ruleId: e.rule_id, featureKey: "__base__", delta: Number(e.delta), newValue: newVal });
      } else {
        // Adjust p_present on kb_feature_models
        const feat = extractRows(await db.execute(sql`
          SELECT id, p_present FROM kb_feature_models
          WHERE rule_id = ${e.rule_id} AND feature_key = ${e.feature_key} LIMIT 1
        `));
        if (feat.length === 0) { skipped++; continue; }

        const newVal = Math.min(0.999, Math.max(0.001, Number(feat[0].p_present ?? 0.5) + Number(e.delta)));
        await db.execute(sql`
          UPDATE kb_feature_models SET p_present = ${newVal} WHERE id = ${feat[0].id}
        `);
        events.push({ id: e.id, ruleId: e.rule_id, featureKey: e.feature_key, delta: Number(e.delta), newValue: newVal });
      }

      // Mark event as deployed
      await db.execute(sql`
        UPDATE kb_learning_events
        SET status = 'deployed',
            deployed_at = CURRENT_TIMESTAMP,
            reviewed_by = ${reviewedBy ?? "system"}
        WHERE id = ${e.id}
      `);

      // Append to audit log
      await db.execute(sql`
        INSERT INTO kb_knowledge_changes
          (change_id, domain, record_id, action, changed_by, new_value, rationale, status, deployed_at)
        VALUES (
          ${'learn_' + e.id + '_' + Date.now()},
          'kb_learning_events',
          ${String(e.rule_id)},
          'apply_learning_event',
          ${reviewedBy ?? 'system'},
          ${JSON.stringify({ ruleId: e.rule_id, featureKey: e.feature_key, delta: e.delta }) as any},
          ${'Approved learning event applied'},
          'deployed',
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (change_id) DO NOTHING
      `);

      applied++;
    } catch (err: any) {
      errors.push(`Event ${e.id} (${e.rule_id}): ${err.message}`);
      skipped++;
    }
  }

  return { applied, skipped, errors, events };
}

// ── 4. Get pending events (for review queue) ──────────────────────────────────

export async function getPendingLearningEvents(): Promise<LearningEvent[]> {
  const rows = extractRows(await db.execute(sql`
    SELECT id, rule_id, feature_key, delta, confidence, source, status,
           rationale, reviewed_by, reviewed_at, deployed_at, created_at
    FROM kb_learning_events
    WHERE status = 'pending'
    ORDER BY confidence DESC, created_at DESC
    LIMIT 100
  `));
  return rows.map(r => ({
    id: r.id,
    ruleId: r.rule_id,
    featureKey: r.feature_key,
    delta: Number(r.delta),
    confidence: Number(r.confidence),
    source: r.source,
    status: r.status,
    rationale: r.rationale,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    deployedAt: r.deployed_at,
    createdAt: r.created_at,
  }));
}

// ── 5. Get outcome accuracy stats ─────────────────────────────────────────────

export async function getOutcomeStats(lookbackDays = 30): Promise<{
  total: number;
  correct: number;
  accuracy: number;
  overrideRate: number;
  byDx: Array<{ dx: string; total: number; errors: number; errorRate: number }>;
}> {
  const summary = extractRows(await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN correct = true THEN 1 ELSE 0 END)::int AS correct_count,
      SUM(CASE WHEN clinician_override = true THEN 1 ELSE 0 END)::int AS overrides
    FROM kb_outcomes
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(lookbackDays))} days'
  `));

  const byDx = extractRows(await db.execute(sql`
    SELECT predicted_dx AS dx,
           COUNT(*)::int AS total,
           SUM(CASE WHEN correct = false THEN 1 ELSE 0 END)::int AS errors
    FROM kb_outcomes
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(lookbackDays))} days'
      AND predicted_dx IS NOT NULL
    GROUP BY predicted_dx
    HAVING COUNT(*) >= 3
    ORDER BY errors DESC
    LIMIT 20
  `));

  const s = summary[0] ?? { total: 0, correct_count: 0, overrides: 0 };
  return {
    total: Number(s.total),
    correct: Number(s.correct_count),
    accuracy: s.total > 0 ? Number(s.correct_count) / Number(s.total) : 0,
    overrideRate: s.total > 0 ? Number(s.overrides) / Number(s.total) : 0,
    byDx: byDx.map(r => ({
      dx: r.dx,
      total: Number(r.total),
      errors: Number(r.errors),
      errorRate: Number(r.errors) / Number(r.total),
    })),
  };
}
