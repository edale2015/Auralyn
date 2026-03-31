/**
 * Advanced Reasoning Routes
 *
 * Exposes the three-stage pipeline (base → co-morbid → temporal),
 * outcome recording, learning queue management, and CRUD for all
 * new reasoning KB tables.
 */

import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { runAdvancedDiagnosis } from "../kb/kbAdvancedDiagnosisEngine";
import { applyCoMorbidityAdjustments, invalidateCoMorbidityCache, getCoMorbidityStats } from "../engine/coMorbidityEngine";
import { applyTemporalAdjustments, seedTemporalPatterns, invalidateTemporalCache, detectPattern } from "../engine/temporalEngine";
import {
  recordOutcome,
  generateLearningEvents,
  applyApprovedLearningEvents,
  getPendingLearningEvents,
  getOutcomeStats,
} from "../engine/outcomeLearningEngine";

const router = Router();

function xRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/advanced/trace
// Full pipeline: base Bayesian → co-morbidity → temporal
// ─────────────────────────────────────────────────────────────────────────────

router.post("/trace", async (req, res) => {
  try {
    const { symptoms = [], answers = {}, complaintId, caseId, timeSeries } = req.body;

    // Stage 1: Advanced Bayesian base
    const base = await runAdvancedDiagnosis({ symptoms, answers, complaintId });

    // Stage 2: Co-morbidity adjustments
    const inputMap: Record<string, unknown> = {};
    for (const s of symptoms) inputMap[String(s).toLowerCase().trim()] = true;
    Object.assign(inputMap, answers);
    const withCoMorbid = await applyCoMorbidityAdjustments(inputMap, base.results);

    // Stage 3: Temporal adjustments
    const withTemporal = await applyTemporalAdjustments(
      caseId ?? "anonymous",
      withCoMorbid,
      timeSeries,
    );

    const top = withTemporal[0];

    res.json({
      engineSource: "KB_DB",
      stages: {
        base: base.results.length,
        afterCoMorbid: withCoMorbid.length,
        afterTemporal: withTemporal.length,
      },
      featureModelRows: base.featureModelRows,
      uniqueRules: base.uniqueRules,
      coMorbidityStats: getCoMorbidityStats(),
      top: top
        ? {
            diagnosis: top.diagnosis,
            posterior: top.posterior,
            score: top.score,
            ruleId: top.ruleId,
            interactions: top.interactions ?? [],
            temporalHits: (top as any).temporalHits ?? [],
          }
        : null,
      results: withTemporal.slice(0, 10).map(r => ({
        diagnosis: r.diagnosis,
        posterior: r.posterior,
        ruleId: r.ruleId,
        source: r.source,
        interactionCount: r.interactions?.length ?? 0,
        temporalHits: (r as any).temporalHits ?? [],
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CO-MORBIDITY: CRUD for kb_diagnosis_interactions
// ─────────────────────────────────────────────────────────────────────────────

router.get("/interactions", async (req, res) => {
  try {
    const { dxA, dxB, type, limit = "100" } = req.query;
    let q = "SELECT * FROM kb_diagnosis_interactions WHERE 1=1";
    const params: unknown[] = [];
    if (dxA) { params.push(dxA); q += ` AND dx_a ILIKE '%' || $${params.length} || '%'`; }
    if (dxB) { params.push(dxB); q += ` AND dx_b ILIKE '%' || $${params.length} || '%'`; }
    if (type) { params.push(type); q += ` AND interaction_type = $${params.length}`; }
    q += ` ORDER BY id DESC LIMIT ${Number(limit)}`;
    const rows = xRows(await db.execute(sql.raw(q, params)));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/interactions", async (req, res) => {
  try {
    const { dxA, dxB, interactionType, strength, conditions, notes } = req.body;
    if (!dxA || !dxB || !interactionType) {
      return res.status(422).json({ error: "dxA, dxB, interactionType required" });
    }
    const rows = xRows(await db.execute(sql`
      INSERT INTO kb_diagnosis_interactions (dx_a, dx_b, interaction_type, strength, conditions, notes)
      VALUES (${dxA}, ${dxB}, ${interactionType}, ${strength ?? 0.0}, ${conditions ? JSON.stringify(conditions) : null}, ${notes ?? null})
      RETURNING *
    `));
    invalidateCoMorbidityCache();
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/interactions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { strength, interactionType, conditions, notes, isActive } = req.body;
    const rows = xRows(await db.execute(sql`
      UPDATE kb_diagnosis_interactions SET
        strength = COALESCE(${strength}, strength),
        interaction_type = COALESCE(${interactionType}, interaction_type),
        conditions = COALESCE(${conditions ? JSON.stringify(conditions) : null}, conditions),
        notes = COALESCE(${notes ?? null}, notes),
        is_active = COALESCE(${isActive ?? null}, is_active)
      WHERE id = ${id} RETURNING *
    `));
    invalidateCoMorbidityCache();
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/interactions/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM kb_diagnosis_interactions WHERE id = ${Number(req.params.id)}`);
    invalidateCoMorbidityCache();
    res.json({ deleted: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Seed canonical co-morbidity interactions
router.post("/interactions/seed", async (req, res) => {
  try {
    const SEEDS = [
      // Synergies
      { dxA: "CHF", dxB: "Pneumonia", type: "synergy", strength: 0.3, notes: "Combined cardiopulmonary failure raises both" },
      { dxA: "COVID-19", dxB: "Bacterial Sinusitis", type: "synergy", strength: 0.25, notes: "COVID weakens mucosal barriers" },
      { dxA: "Influenza A", dxB: "Bacterial Sinusitis", type: "risk_boost", strength: 0.2, notes: "Post-viral sinusitis common" },
      { dxA: "Influenza A", dxB: "Pneumonia", type: "risk_boost", strength: 0.35, notes: "Influenza predisposes to secondary pneumonia" },
      // Exclusions (bacterial vs viral)
      { dxA: "Viral URI", dxB: "Strep Pharyngitis", type: "exclusion", strength: -0.4, notes: "Viral URI and bacterial strep are competing hypotheses" },
      { dxA: "Viral URI", dxB: "Bacterial Sinusitis", type: "exclusion", strength: -0.3, notes: "Viral vs bacterial sinusitis distinction" },
      { dxA: "Allergic Rhinitis", dxB: "Bacterial Sinusitis", type: "exclusion", strength: -0.3, notes: "Allergy vs infection distinction" },
      // Musculoskeletal
      { dxA: "Rotator Cuff Injury", dxB: "Shoulder Dislocation", type: "exclusion", strength: -0.5, notes: "Structural injury vs rotator cuff tear — imaging differentiates" },
      { dxA: "Rotator Cuff Injury", dxB: "AC Joint Injury", type: "conditional", strength: 0.15, notes: "Can co-occur from same mechanism" },
      // Cervical
      { dxA: "Cervical Radiculopathy", dxB: "Rotator Cuff Injury", type: "conditional", strength: 0.1, notes: "Referred pain can coexist with local pathology" },
    ];

    let seeded = 0;
    let skipped = 0;
    for (const s of SEEDS) {
      try {
        await db.execute(sql`
          INSERT INTO kb_diagnosis_interactions (dx_a, dx_b, interaction_type, strength, notes)
          VALUES (${s.dxA}, ${s.dxB}, ${s.type}, ${s.strength}, ${s.notes})
          ON CONFLICT (dx_a, dx_b, interaction_type) DO UPDATE
            SET strength = EXCLUDED.strength, notes = EXCLUDED.notes, is_active = true
        `);
        seeded++;
      } catch { skipped++; }
    }
    invalidateCoMorbidityCache();
    res.json({ seeded, skipped, total: SEEDS.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORAL: CRUD for kb_temporal_patterns
// ─────────────────────────────────────────────────────────────────────────────

router.get("/temporal-patterns", async (req, res) => {
  try {
    const { diagnosis, featureKey } = req.query;
    let q = "SELECT * FROM kb_temporal_patterns WHERE 1=1";
    const params: unknown[] = [];
    if (diagnosis) { params.push(diagnosis); q += ` AND diagnosis ILIKE '%' || $${params.length} || '%'`; }
    if (featureKey) { params.push(featureKey); q += ` AND feature_key = $${params.length}`; }
    q += " ORDER BY diagnosis, feature_key";
    const rows = xRows(await db.execute(sql.raw(q, params)));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/temporal-patterns", async (req, res) => {
  try {
    const { diagnosis, featureKey, patternType, likelihood, durationHours } = req.body;
    if (!diagnosis || !featureKey || !patternType) {
      return res.status(422).json({ error: "diagnosis, featureKey, patternType required" });
    }
    const rows = xRows(await db.execute(sql`
      INSERT INTO kb_temporal_patterns (diagnosis, feature_key, pattern_type, likelihood, duration_hours)
      VALUES (${diagnosis}, ${featureKey}, ${patternType}, ${likelihood ?? 1.0}, ${durationHours ?? null})
      RETURNING *
    `));
    invalidateTemporalCache();
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/temporal-patterns/:id", async (req, res) => {
  try {
    const rows = xRows(await db.execute(sql`
      UPDATE kb_temporal_patterns SET
        likelihood = COALESCE(${req.body.likelihood ?? null}, likelihood),
        pattern_type = COALESCE(${req.body.patternType ?? null}, pattern_type),
        is_active = COALESCE(${req.body.isActive ?? null}, is_active)
      WHERE id = ${Number(req.params.id)} RETURNING *
    `));
    invalidateTemporalCache();
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/temporal-patterns/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM kb_temporal_patterns WHERE id = ${Number(req.params.id)}`);
    invalidateTemporalCache();
    res.json({ deleted: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/temporal-patterns/seed", async (req, res) => {
  try {
    const result = await seedTemporalPatterns();
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Time series: record + query
router.post("/time-series", async (req, res) => {
  try {
    const { caseId, featureKey, value, unit } = req.body;
    if (!caseId || !featureKey || value == null) {
      return res.status(422).json({ error: "caseId, featureKey, value required" });
    }
    await db.execute(sql`
      INSERT INTO patient_time_series (case_id, feature_key, value, unit)
      VALUES (${caseId}, ${featureKey}, ${Number(value)}, ${unit ?? null})
    `);
    res.status(201).json({ recorded: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/time-series/:caseId", async (req, res) => {
  try {
    const rows = xRows(await db.execute(sql`
      SELECT feature_key, t, value, unit FROM patient_time_series
      WHERE case_id = ${req.params.caseId}
      ORDER BY feature_key, t DESC
    `));
    const byFeature: Record<string, unknown[]> = {};
    for (const r of rows) {
      if (!byFeature[r.feature_key]) byFeature[r.feature_key] = [];
      byFeature[r.feature_key].push({ t: r.t, v: Number(r.value), unit: r.unit });
    }
    res.json(byFeature);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Detect pattern from inline data
router.post("/time-series/detect", async (req, res) => {
  try {
    const { series } = req.body; // [{t, v}]
    if (!Array.isArray(series)) return res.status(422).json({ error: "series array required" });
    const pattern = detectPattern(series);
    res.json({ pattern, points: series.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME LEARNING: record + queue + approve + apply
// ─────────────────────────────────────────────────────────────────────────────

// Record outcome
router.post("/outcomes", async (req, res) => {
  try {
    const { caseId, predictedDx, actualDx, predictedDisposition, actualDisposition, clinicianOverride, outcomeSeverity } = req.body;
    if (!caseId) return res.status(422).json({ error: "caseId required" });
    const correct = !!actualDx && actualDx === predictedDx;
    await recordOutcome({ caseId, predictedDx, actualDx, predictedDisposition, actualDisposition, correct, clinicianOverride: !!clinicianOverride, outcomeSeverity });
    res.status(201).json({ recorded: true, correct });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Outcome stats
router.get("/outcomes/stats", async (req, res) => {
  try {
    const lookback = Number(req.query.lookbackDays ?? 30);
    res.json(await getOutcomeStats(lookback));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// List outcomes
router.get("/outcomes", async (req, res) => {
  try {
    const { caseId, limit = "50" } = req.query;
    const rows = caseId
      ? xRows(await db.execute(sql`SELECT * FROM kb_outcomes WHERE case_id = ${caseId} ORDER BY created_at DESC LIMIT ${Number(limit)}`))
      : xRows(await db.execute(sql`SELECT * FROM kb_outcomes ORDER BY created_at DESC LIMIT ${Number(limit)}`));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generate learning suggestions
router.post("/learning/generate", async (req, res) => {
  try {
    const { source, errorRateThreshold, lookbackDays } = req.body;
    const result = await generateLearningEvents({ source, errorRateThreshold, lookbackDays });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get pending learning events (review queue)
router.get("/learning/queue", async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const rows = xRows(await db.execute(sql`
      SELECT * FROM kb_learning_events
      WHERE status = ${String(status)}
      ORDER BY confidence DESC, created_at DESC
      LIMIT 100
    `));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Approve / reject a learning event
router.patch("/learning/:id/review", async (req, res) => {
  try {
    const { action, reviewedBy } = req.body; // action: 'approve' | 'reject'
    if (!["approve", "reject"].includes(action)) {
      return res.status(422).json({ error: "action must be 'approve' or 'reject'" });
    }
    const newStatus = action === "approve" ? "approved" : "rejected";
    const rows = xRows(await db.execute(sql`
      UPDATE kb_learning_events
      SET status = ${newStatus},
          reviewed_by = ${reviewedBy ?? "clinician"},
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `));
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Apply all approved events
router.post("/learning/apply", async (req, res) => {
  try {
    const { reviewedBy } = req.body;
    const result = await applyApprovedLearningEvents(reviewedBy);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Manual learning event creation
router.post("/learning", async (req, res) => {
  try {
    const { ruleId, featureKey, delta, confidence, source, rationale } = req.body;
    if (!ruleId || delta == null) return res.status(422).json({ error: "ruleId, delta required" });
    const rows = xRows(await db.execute(sql`
      INSERT INTO kb_learning_events (rule_id, feature_key, delta, confidence, source, rationale)
      VALUES (${ruleId}, ${featureKey ?? '__base__'}, ${Number(delta)}, ${confidence ?? 0.5}, ${source ?? 'manual'}, ${rationale ?? null})
      RETURNING *
    `));
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Health / stats
// ─────────────────────────────────────────────────────────────────────────────

router.get("/health", async (req, res) => {
  try {
    const [interactions, patterns, pending, outcomes] = await Promise.all([
      xRows(await db.execute(sql`SELECT COUNT(*) AS n FROM kb_diagnosis_interactions WHERE is_active = true`)),
      xRows(await db.execute(sql`SELECT COUNT(*) AS n FROM kb_temporal_patterns WHERE is_active = true`)),
      xRows(await db.execute(sql`SELECT COUNT(*) AS n FROM kb_learning_events WHERE status = 'pending'`)),
      xRows(await db.execute(sql`SELECT COUNT(*) AS n, SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS c FROM kb_outcomes WHERE created_at >= NOW() - INTERVAL '7 days'`)),
    ]);
    const o = outcomes[0] ?? { n: 0, c: 0 };
    res.json({
      coMorbidity: { interactions: Number(interactions[0]?.n ?? 0), stats: getCoMorbidityStats() },
      temporal: { patterns: Number(patterns[0]?.n ?? 0) },
      learning: { pendingEvents: Number(pending[0]?.n ?? 0) },
      outcomes7d: { total: Number(o.n), correct: Number(o.c), accuracy: o.n > 0 ? Number(o.c) / Number(o.n) : null },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
