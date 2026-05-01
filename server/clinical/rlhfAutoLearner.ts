/**
 * rlhfAutoLearner.ts
 * Reinforcement Learning from Human Feedback — auto-learning loop.
 *
 * Processes physician overrides (from kb_physician_overrides) and:
 *   1. Determines which kb_diagnosis_rules fired for the case
 *   2. Compares fired rules to physician's actual decision
 *   3. Reinforces correct rules (↑ base_probability by REINFORCE_DELTA)
 *   4. Penalizes incorrect rules   (↓ base_probability by PENALIZE_DELTA)
 *   5. Writes audit events to kb_weight_events
 *   6. Updates kb_diagnosis_rules.base_probability
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

const REINFORCE_DELTA = 0.03;
const PENALIZE_DELTA  = 0.02;
const MIN_PROB        = 0.01;
const MAX_PROB        = 0.95;
const BATCH_SIZE      = 100;

export interface WeightChange {
  rule_id:      string;
  diagnosis_id: string;
  direction:    "reinforce" | "penalize";
  delta:        number;
  old_prob:     number;
  new_prob:     number;
}

export interface LearningBatchResult {
  ok:              boolean;
  processedCases:  number;
  weightChanges:   WeightChange[];
  reinforced:      number;
  penalized:       number;
  topReinforced:   { rule_id: string; new_prob: number }[];
  topPenalized:    { rule_id: string; new_prob: number }[];
  error?:          string;
}

export interface LearningStatus {
  ok:                 boolean;
  totalLearningEvents: number;
  totalWeightEvents:  number;
  recentReinforced:   { rule_id: string; diagnosis_label: string; base_probability: number }[];
  recentPenalized:    { rule_id: string; diagnosis_label: string; base_probability: number }[];
  avgProbabilityBySystem: { system: string; avg_prob: number }[];
}

export async function processPhysicianFeedback(): Promise<LearningBatchResult> {
  const weightChanges: WeightChange[] = [];
  let processedCases = 0;

  try {
    // Fetch unprocessed physician overrides
    const overrides = await db.execute(sql`
      SELECT id, case_id, physician_id, override_type,
             original_value, override_value, created_at
      FROM kb_physician_overrides
      WHERE processed_for_rlhf IS NOT TRUE
        AND override_type IN ('diagnosis', 'disposition', 'treatment')
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
    `).catch(() => ({ rows: [] }));

    if ((overrides.rows as any[]).length === 0) {
      return {
        ok: true, processedCases: 0, weightChanges: [],
        reinforced: 0, penalized: 0, topReinforced: [], topPenalized: [],
      };
    }

    for (const ov of overrides.rows as any[]) {
      processedCases++;

      if (ov.override_type === "diagnosis") {
        const originalDx = String(ov.original_value ?? "");
        const chosenDx   = String(ov.override_value  ?? "");

        if (originalDx && originalDx !== chosenDx) {
          // Penalize the rule that fired the wrong diagnosis
          const [penalized, reinforced] = await Promise.all([
            adjustDiagnosisProb(originalDx, "penalize"),
            adjustDiagnosisProb(chosenDx,   "reinforce"),
          ]);
          if (penalized)  weightChanges.push(penalized);
          if (reinforced) weightChanges.push(reinforced);
        }
      }

      // Mark override as processed
      await db.execute(sql`
        UPDATE kb_physician_overrides
        SET processed_for_rlhf = true,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ${ov.id}
      `).catch(() => {});
    }

    // Also learn from golden cases that passed/failed
    const goldenResults = await db.execute(sql`
      SELECT gc.complaint_slug, gc.expected_diagnosis_id, gc.last_result_pass
      FROM kb_golden_cases gc
      WHERE gc.last_result_pass IS NOT NULL
        AND gc.expected_diagnosis_id IS NOT NULL
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    for (const gc of goldenResults.rows as any[]) {
      const delta = gc.last_result_pass ? "reinforce" : "penalize";
      const change = await adjustDiagnosisProb(gc.expected_diagnosis_id, delta);
      if (change) weightChanges.push(change);
    }

    // Write batch weight events
    if (weightChanges.length > 0) {
      for (const wc of weightChanges) {
        await db.execute(sql`
          INSERT INTO kb_weight_events
            (rule_id, event_type, delta, old_value, new_value, reason, created_at)
          VALUES
            (${wc.rule_id}, ${wc.direction}, ${wc.delta}, ${wc.old_prob}, ${wc.new_prob},
             'rlhf_auto_learner', CURRENT_TIMESTAMP)
        `).catch(() => {});
      }
    }

    const reinforced = weightChanges.filter(w => w.direction === "reinforce").length;
    const penalized  = weightChanges.filter(w => w.direction === "penalize").length;

    const topReinforced = weightChanges
      .filter(w => w.direction === "reinforce")
      .sort((a, b) => b.new_prob - a.new_prob)
      .slice(0, 5)
      .map(w => ({ rule_id: w.rule_id, new_prob: w.new_prob }));

    const topPenalized = weightChanges
      .filter(w => w.direction === "penalize")
      .sort((a, b) => a.new_prob - b.new_prob)
      .slice(0, 5)
      .map(w => ({ rule_id: w.rule_id, new_prob: w.new_prob }));

    console.log(`[RLHF] Batch complete — processed ${processedCases} overrides, ${weightChanges.length} weight changes`);

    return { ok: true, processedCases, weightChanges, reinforced, penalized, topReinforced, topPenalized };
  } catch (e: any) {
    console.error("[RLHF] Error:", e.message);
    return {
      ok: false, processedCases, weightChanges: [],
      reinforced: 0, penalized: 0, topReinforced: [], topPenalized: [],
      error: e.message,
    };
  }
}

async function adjustDiagnosisProb(
  diagnosis_id: string,
  direction: "reinforce" | "penalize"
): Promise<WeightChange | null> {
  try {
    const rows = await db.execute(sql`
      SELECT rule_id, diagnosis_id, base_probability
      FROM kb_diagnosis_rules
      WHERE diagnosis_id = ${diagnosis_id}
      LIMIT 1
    `);
    const rule = (rows.rows as any[])[0];
    if (!rule) return null;

    const delta   = direction === "reinforce" ? REINFORCE_DELTA : -PENALIZE_DELTA;
    const old_prob = rule.base_probability;
    const new_prob = Math.max(MIN_PROB, Math.min(MAX_PROB, old_prob + delta));

    await db.execute(sql`
      UPDATE kb_diagnosis_rules
      SET base_probability = ${new_prob}, updated_at = CURRENT_TIMESTAMP
      WHERE rule_id = ${rule.rule_id}
    `);

    return {
      rule_id:      rule.rule_id,
      diagnosis_id,
      direction,
      delta:        Math.abs(delta),
      old_prob,
      new_prob,
    };
  } catch { return null; }
}

export async function getRlhfStatus(): Promise<LearningStatus> {
  try {
    const [eventsRes, weightRes, reinforcedRes, penalizedRes, avgRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) cnt FROM kb_learning_events`).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute(sql`SELECT COUNT(*) cnt FROM kb_weight_events`).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute(sql`
        SELECT dr.rule_id, dr.diagnosis_label, dr.base_probability
        FROM kb_diagnosis_rules dr
        JOIN kb_weight_events we ON we.rule_id = dr.rule_id
        WHERE we.event_type = 'reinforce'
        ORDER BY we.created_at DESC LIMIT 5
      `).catch(() => ({ rows: [] })),
      db.execute(sql`
        SELECT dr.rule_id, dr.diagnosis_label, dr.base_probability
        FROM kb_diagnosis_rules dr
        JOIN kb_weight_events we ON we.rule_id = dr.rule_id
        WHERE we.event_type = 'penalize'
        ORDER BY we.created_at DESC LIMIT 5
      `).catch(() => ({ rows: [] })),
      db.execute(sql`
        SELECT
          COALESCE(feature_likelihoods->>'system', 'UNKNOWN') AS system,
          ROUND(AVG(base_probability)::numeric, 3) AS avg_prob
        FROM kb_diagnosis_rules WHERE active
        GROUP BY 1 ORDER BY 2 DESC
      `).catch(() => ({ rows: [] })),
    ]);

    return {
      ok: true,
      totalLearningEvents:  Number((eventsRes.rows[0] as any)?.cnt ?? 0),
      totalWeightEvents:    Number((weightRes.rows[0] as any)?.cnt ?? 0),
      recentReinforced:     reinforcedRes.rows as any[],
      recentPenalized:      penalizedRes.rows as any[],
      avgProbabilityBySystem: avgRes.rows as any[],
    };
  } catch (e: any) {
    return {
      ok: false,
      totalLearningEvents: 0,
      totalWeightEvents:   0,
      recentReinforced:    [],
      recentPenalized:     [],
      avgProbabilityBySystem: [],
    };
  }
}
