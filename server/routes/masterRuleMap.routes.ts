import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { validateRuleMap } from "../clinical/ruleMapValidator";
import { exportRuleMapToSheets } from "../scripts/exportRuleMapToSheets";

const router = Router();
const auth = [requireReviewAuth, requireRole(["admin", "physician"])];

// Refresh the materialized view
router.post("/refresh", ...auth, async (_req, res) => {
  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_master_rule_map`);
    res.json({ ok: true, message: "Rule map refreshed" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Summary — all complaints with coverage metrics, grouped by system
router.get("/summary", ...auth, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT complaint_id, system, label, enabled,
             red_flag_count, diagnosis_count, treatment_count,
             question_count, disposition_count, cannot_miss_count,
             completeness_score, gap_flags
      FROM mv_master_rule_map
      ORDER BY system, completeness_score DESC
    `);

    const bySystem: Record<string, any> = {};
    for (const r of rows.rows as any[]) {
      if (!bySystem[r.system]) {
        bySystem[r.system] = {
          system: r.system,
          complaints: [],
          avgScore: 0,
          totalComplaints: 0,
          completeCount: 0,
        };
      }
      bySystem[r.system].complaints.push(r);
      bySystem[r.system].totalComplaints++;
      if (r.completeness_score === 100) bySystem[r.system].completeCount++;
    }

    for (const sys of Object.values(bySystem) as any[]) {
      sys.avgScore = Math.round(
        sys.complaints.reduce((s: number, c: any) => s + c.completeness_score, 0) / sys.complaints.length
      );
    }

    const systems = Object.values(bySystem).sort((a: any, b: any) => b.avgScore - a.avgScore);
    const total   = (rows.rows as any[]).length;
    const fullyComplete = (rows.rows as any[]).filter((r: any) => r.completeness_score === 100).length;
    const avgScore = Math.round(
      (rows.rows as any[]).reduce((s, r: any) => s + r.completeness_score, 0) / (total || 1)
    );

    res.json({ ok: true, total, fullyComplete, avgScore, systems });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Gaps — complaints with lowest completeness
router.get("/gaps", ...auth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const minScore = parseInt(String(req.query.maxScore ?? "79"), 10);

    const rows = await db.execute(sql`
      SELECT complaint_id, system, label, completeness_score, gap_flags,
             red_flag_count, diagnosis_count, treatment_count,
             question_count, disposition_count
      FROM mv_master_rule_map
      WHERE completeness_score <= ${minScore}
      ORDER BY completeness_score ASC, system
      LIMIT ${limit}
    `);

    res.json({ ok: true, count: (rows.rows as any[]).length, gaps: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Full rule chain for a single complaint
router.get("/complaint/:id", ...auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [coverageRes, rfRes, dxRes, txRes, qRes, dpRes] = await Promise.all([
      db.execute(sql`
        SELECT * FROM mv_master_rule_map WHERE complaint_id = ${id}
      `),
      db.execute(sql`
        SELECT rule_id, label, severity, trigger_expr, action, rationale
        FROM kb_red_flag_rules WHERE complaint_id = ${id} AND active ORDER BY severity DESC
      `),
      db.execute(sql`
        SELECT rule_id, diagnosis_id, diagnosis_label, icd_code,
               cannot_miss, base_probability, feature_likelihoods
        FROM kb_diagnosis_rules WHERE complaint_id = ${id} AND active
        ORDER BY cannot_miss DESC, base_probability DESC
      `),
      db.execute(sql`
        SELECT rule_id, medication_name, medication_group, is_first_line,
               adult_dose, pediatric_dose, route, contraindications
        FROM kb_treatment_rules WHERE complaint_id = ${id} AND active
        ORDER BY is_first_line DESC
      `),
      db.execute(sql`
        SELECT question_id, prompt, type, required, priority
        FROM kb_questions WHERE complaint_id = ${id} AND active
        ORDER BY priority ASC
      `),
      db.execute(sql`
        SELECT rule_id, priority, when_expr, disposition_level, confidence_hint
        FROM kb_disposition_rules WHERE complaint_id = ${id} AND active
        ORDER BY priority DESC
      `),
    ]);

    const coverage = (coverageRes.rows as any[])[0];
    if (!coverage) return res.status(404).json({ ok: false, error: "Complaint not found" });

    res.json({
      ok: true,
      coverage,
      redFlags:    rfRes.rows,
      diagnoses:   dxRes.rows,
      treatments:  txRes.rows,
      questions:   qRes.rows,
      dispositions: dpRes.rows,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Run full auto-validator and write to VALIDATION_REPORT sheet
router.post("/validate", ...auth, async (_req, res) => {
  try {
    const result = await validateRuleMap();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Export DB → MASTER_RULE_MAP sheet tab
router.post("/export-to-sheets", ...auth, async (_req, res) => {
  try {
    const result = await exportRuleMapToSheets();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
