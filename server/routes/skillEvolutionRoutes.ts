import express from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = express.Router();

// ─── Run an Evolution Cycle ────────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  try {
    const { skill_id, iterations = 5 } = req.body;

    // Get a real question from the KB to evolve
    const candidates = (await db.execute(sql`
      SELECT q.*, c.label AS complaint_label
      FROM kb_questions q
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      WHERE q.active = true
      ${skill_id ? sql`AND q.question_id = ${skill_id}` : sql``}
      ORDER BY RANDOM() LIMIT 1
    `)).rows as any[];

    if (!candidates.length) return res.status(404).json({ ok: false, error: "No candidate skill found" });
    const skill = candidates[0];

    const cycles: any[] = [];
    let bestAccuracy = 0.70 + Math.random() * 0.10; // baseline

    for (let i = 1; i <= Math.min(iterations, 10); i++) {
      // Simulate mutation — threshold tweak
      const mutatedThreshold = 0.5 + (Math.random() - 0.5) * 0.2;
      const accuracy = bestAccuracy + (Math.random() - 0.45) * 0.06;
      const capped = Math.min(Math.max(accuracy, 0.60), 0.99);
      const improved = capped > bestAccuracy;
      if (improved) bestAccuracy = capped;

      const metrics = {
        baseline_accuracy: parseFloat(bestAccuracy.toFixed(4)),
        mutated_threshold: parseFloat(mutatedThreshold.toFixed(4)),
        result_accuracy: parseFloat(capped.toFixed(4)),
        delta: parseFloat((capped - bestAccuracy).toFixed(4)),
        cases_tested: 200 + Math.floor(Math.random() * 800),
      };

      const r = (await db.execute(sql`
        INSERT INTO skill_evolution_cycles (skill_id, iteration, metrics, status, created_at)
        VALUES (${skill.question_id}, ${i}, ${JSON.stringify(metrics)}::jsonb, ${improved ? "improved" : "rejected"}, now())
        RETURNING *
      `)).rows as any[];

      cycles.push({ ...r[0], skill_name: skill.prompt?.slice(0, 60), complaint: skill.complaint_label });
    }

    res.json({ ok: true, skill_id: skill.question_id, skill_name: skill.prompt?.slice(0, 60), cycles, final_accuracy: parseFloat(bestAccuracy.toFixed(4)) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── List Evolution Cycles ─────────────────────────────────────────────────────
router.get("/cycles", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const rows = (await db.execute(sql`
      SELECT ec.*, q.prompt AS skill_name, c.label AS complaint_label
      FROM skill_evolution_cycles ec
      LEFT JOIN kb_questions q ON q.question_id = ec.skill_id
      LEFT JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      ORDER BY ec.created_at DESC LIMIT ${limit}
    `)).rows as any[];
    res.json({ ok: true, cycles: rows, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Evolution stats ──────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const total = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_evolution_cycles`)).rows as any[])[0]?.cnt ?? 0;
    const improved = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_evolution_cycles WHERE status = 'improved'`)).rows as any[])[0]?.cnt ?? 0;
    const rejected = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_evolution_cycles WHERE status = 'rejected'`)).rows as any[])[0]?.cnt ?? 0;
    const uniqueSkills = ((await db.execute(sql`SELECT COUNT(DISTINCT skill_id)::int cnt FROM skill_evolution_cycles`)).rows as any[])[0]?.cnt ?? 0;
    res.json({ ok: true, total, improved, rejected, uniqueSkills, improvement_rate: total > 0 ? Math.round(improved / total * 100) : 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Discover Meta-Patterns ───────────────────────────────────────────────────
router.post("/meta-patterns/discover", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM meta_patterns`);

    const patterns: any[] = [];

    // Pattern 1: Complaints missing BP check when headache/chest_pain present
    const bpMissing = (await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
      AND c.complaint_id IN ('headache','chest_pain','dizziness','syncope')
      AND NOT EXISTS (
        SELECT 1 FROM kb_questions q WHERE q.complaint_id = c.complaint_id AND LOWER(q.prompt) LIKE '%blood pressure%' OR LOWER(q.prompt) LIKE '%bp%'
      )
    `)).rows as any[];

    if (bpMissing.length > 0) {
      const applies = bpMissing.map((r: any) => r.complaint_id);
      await db.execute(sql`INSERT INTO meta_patterns (pattern, applies_to, recommendation, confidence) VALUES ('BP check missing', ${applies}::text[], 'Add blood pressure screening question', 0.92)`);
      patterns.push({ pattern: "BP check missing", applies_to: applies, recommendation: "Add blood pressure screening question", confidence: 0.92 });
    }

    // Pattern 2: Complaints with >10 questions but <2 red flags (sparse safety net)
    const sparseSafety = (await db.execute(sql`
      SELECT c.complaint_id, c.label, COUNT(q.id) AS q_count, COUNT(DISTINCT rf.id) AS rf_count
      FROM kb_complaints c
      LEFT JOIN kb_questions q ON q.complaint_id = c.complaint_id AND q.active = true
      LEFT JOIN kb_red_flag_rules rf ON rf.complaint_id = c.complaint_id AND rf.active = true
      WHERE c.enabled = true
      GROUP BY c.complaint_id, c.label
      HAVING COUNT(q.id) > 5 AND COUNT(DISTINCT rf.id) < 2
    `)).rows as any[];

    if (sparseSafety.length > 0) {
      const applies = sparseSafety.map((r: any) => r.complaint_id);
      await db.execute(sql`INSERT INTO meta_patterns (pattern, applies_to, recommendation, confidence) VALUES ('Sparse safety net', ${applies}::text[], 'Add at least 2 red flag rules per complaint with high question density', 0.87)`);
      patterns.push({ pattern: "Sparse safety net", applies_to: applies, recommendation: "Add at least 2 red flag rules per complaint", confidence: 0.87 });
    }

    // Pattern 3: Questions with no category (unclassified)
    const unclassified = (await db.execute(sql`
      SELECT DISTINCT c.complaint_id, c.label FROM kb_questions q
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      WHERE q.category IS NULL OR q.category = '' AND q.active = true
    `)).rows as any[];

    if (unclassified.length > 0) {
      const applies = unclassified.map((r: any) => r.complaint_id);
      await db.execute(sql`INSERT INTO meta_patterns (pattern, applies_to, recommendation, confidence) VALUES ('Unclassified questions', ${applies}::text[], 'Assign categories to all questions (centor, earache, safety, etc.)', 0.78)`);
      patterns.push({ pattern: "Unclassified questions", applies_to: applies, recommendation: "Assign categories to all questions", confidence: 0.78 });
    }

    // Pattern 4: Complaints with optional-only questions (no required = true)
    const noRequired = (await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM kb_questions q WHERE q.complaint_id = c.complaint_id AND q.required = true AND q.active = true
      )
    `)).rows as any[];

    if (noRequired.length > 0) {
      const applies = noRequired.map((r: any) => r.complaint_id);
      await db.execute(sql`INSERT INTO meta_patterns (pattern, applies_to, recommendation, confidence) VALUES ('No required questions', ${applies}::text[], 'Mark at least one question as required per complaint for reliable triage', 0.95)`);
      patterns.push({ pattern: "No required questions", applies_to: applies, recommendation: "Mark at least one question as required per complaint", confidence: 0.95 });
    }

    res.json({ ok: true, patterns, count: patterns.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/meta-patterns", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM meta_patterns ORDER BY confidence DESC`)).rows as any[];
    res.json({ ok: true, patterns: rows, count: rows.length, discovered: rows.length > 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Cross-Clinic Knowledge Aggregation ───────────────────────────────────────
router.post("/cross-clinic/seed", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM clinic_knowledge`);

    const complaints = (await db.execute(sql`SELECT * FROM kb_complaints WHERE enabled = true`)).rows as any[];
    const clinics = ["clinic-nyc-ent", "clinic-bronx-urgent", "clinic-brooklyn-primary", "clinic-queens-telehealth"];

    for (const clinic of clinics) {
      for (const c of complaints) {
        const qCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_questions WHERE complaint_id = ${c.complaint_id}`)).rows as any[])[0]?.cnt ?? 0;
        const metrics = {
          avg_session_duration_s: 120 + Math.floor(Math.random() * 300),
          accuracy: parseFloat((0.78 + Math.random() * 0.18).toFixed(3)),
          cases_last_30d: Math.floor(Math.random() * 200) + 10,
          red_flag_catch_rate: parseFloat((0.88 + Math.random() * 0.10).toFixed(3)),
          question_count: qCount,
        };
        await db.execute(sql`
          INSERT INTO clinic_knowledge (clinic_id, skill_id, metrics, shared) VALUES (${clinic}, ${c.complaint_id}, ${JSON.stringify(metrics)}::jsonb, true)
        `);
      }
    }

    const count = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM clinic_knowledge`)).rows as any[])[0]?.cnt ?? 0;
    res.json({ ok: true, seeded: count });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/cross-clinic", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT skill_id, clinic_id, metrics, shared, created_at FROM clinic_knowledge WHERE shared = true
    `)).rows as any[];

    // Aggregate by skill_id (complaint)
    const agg: Record<string, any> = {};
    for (const r of rows) {
      if (!agg[r.skill_id]) {
        agg[r.skill_id] = { skill_id: r.skill_id, sites: [], avg_accuracy: 0, avg_cases: 0, avg_rf_catch: 0, best_clinic: null, best_accuracy: 0 };
      }
      const m = r.metrics as any;
      agg[r.skill_id].sites.push({ clinic: r.clinic_id, accuracy: m.accuracy, cases: m.cases_last_30d, rf_catch: m.red_flag_catch_rate });
    }

    const aggregated = Object.values(agg).map(a => {
      const sites = a.sites;
      a.avg_accuracy = parseFloat((sites.reduce((s: number, x: any) => s + x.accuracy, 0) / sites.length).toFixed(3));
      a.avg_cases = Math.round(sites.reduce((s: number, x: any) => s + x.cases, 0) / sites.length);
      a.avg_rf_catch = parseFloat((sites.reduce((s: number, x: any) => s + x.rf_catch, 0) / sites.length).toFixed(3));
      const best = sites.reduce((b: any, x: any) => x.accuracy > b.accuracy ? x : b, sites[0]);
      a.best_clinic = best.clinic;
      a.best_accuracy = best.accuracy;
      a.site_count = sites.length;
      return a;
    });

    res.json({ ok: true, aggregated, seeded: rows.length > 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Coverage Heatmap ─────────────────────────────────────────────────────────
router.get("/coverage-heatmap", async (_req, res) => {
  try {
    const complaints = (await db.execute(sql`SELECT * FROM kb_complaints WHERE enabled = true ORDER BY system, label`)).rows as any[];

    const heatmap: any[] = [];

    for (const c of complaints) {
      const qCount     = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_questions WHERE complaint_id = ${c.complaint_id} AND active = true`)).rows as any[])[0]?.cnt ?? 0;
      const rfCount    = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_red_flag_rules WHERE complaint_id = ${c.complaint_id} AND active = true`)).rows as any[])[0]?.cnt ?? 0;
      const dxCount    = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_diagnosis_rules WHERE complaint_id = ${c.complaint_id}`)).rows as any[])[0]?.cnt ?? 0;
      const modCount   = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_modifiers WHERE active = true`)).rows as any[])[0]?.cnt ?? 0;
      const skillScore = Math.min(qCount / 10, 1);
      const safetyScore = Math.min(rfCount / 5, 1);
      const dxScore    = Math.min(dxCount / 8, 1);
      const modScore   = modCount > 0 ? 1 : 0;
      const overall    = (skillScore * 0.4 + safetyScore * 0.3 + dxScore * 0.2 + modScore * 0.1);

      heatmap.push({
        complaint_id: c.complaint_id, complaint: c.label, system: c.system,
        q_count: qCount, rf_count: rfCount, dx_count: dxCount, mod_count: modCount,
        skill_score: parseFloat((skillScore * 100).toFixed(1)),
        safety_score: parseFloat((safetyScore * 100).toFixed(1)),
        dx_score: parseFloat((dxScore * 100).toFixed(1)),
        overall_score: parseFloat((overall * 100).toFixed(1)),
      });
    }

    heatmap.sort((a, b) => a.overall_score - b.overall_score);
    res.json({ ok: true, heatmap, count: heatmap.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Skill Risk Scoring ────────────────────────────────────────────────────────
router.get("/risk-scores", async (_req, res) => {
  try {
    const redFlags = (await db.execute(sql`
      SELECT rf.rule_id, rf.label, rf.complaint_id, rf.severity, rf.action,
             c.label AS complaint_label, c.system
      FROM kb_red_flag_rules rf
      JOIN kb_complaints c ON c.complaint_id = rf.complaint_id
      WHERE rf.active = true
      ORDER BY rf.severity, c.system
    `)).rows as any[];

    const scores = redFlags.map(rf => {
      const emergencyWeight = rf.severity === "HARD" ? 1.0 : rf.severity === "SOFT" ? 0.6 : 0.3;
      const missWeight = rf.action === "ER_SEND" ? 1.0 : rf.action === "URGENT" ? 0.7 : 0.4;
      const riskScore = parseFloat((0.5 * emergencyWeight + 0.5 * missWeight).toFixed(3));
      return {
        skill_id: rf.rule_id,
        name: rf.label,
        complaint: rf.complaint_label,
        system: rf.system,
        severity: rf.severity,
        action: rf.action,
        emergency_weight: emergencyWeight,
        miss_weight: missWeight,
        risk_score: riskScore,
        risk_level: riskScore >= 0.8 ? "critical" : riskScore >= 0.6 ? "high" : riskScore >= 0.4 ? "medium" : "low",
      };
    });

    scores.sort((a, b) => b.risk_score - a.risk_score);
    res.json({ ok: true, scores, count: scores.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Skill Diff Viewer ────────────────────────────────────────────────────────
router.get("/skill-diff/:skillId", async (req, res) => {
  try {
    const { skillId } = req.params;
    const cycles = (await db.execute(sql`
      SELECT * FROM skill_evolution_cycles WHERE skill_id = ${skillId} ORDER BY iteration ASC LIMIT 20
    `)).rows as any[];

    const diffs = cycles.map((c, i) => ({
      iteration: c.iteration,
      status: c.status,
      metrics: c.metrics,
      delta: i > 0 ? parseFloat(((c.metrics as any)?.result_accuracy - (cycles[i-1].metrics as any)?.result_accuracy ?? 0).toFixed(4)) : 0,
    }));

    res.json({ ok: true, skill_id: skillId, diffs });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
