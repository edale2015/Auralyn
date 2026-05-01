import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { exportMasterRulesToSheets } from "../scripts/exportMasterRulesToSheets";
import { executePipeline } from "../clinical/ruleExecutionEngine";

const router = Router();
const auth = [requireReviewAuth, requireRole(["admin", "physician"])];

// List rules — filterable
router.get("/", ...auth, async (req, res) => {
  try {
    const { rule_type, complaint_id, safety_level, active = "true", page = "1", limit = "50" } = req.query;
    const offset = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const rows = await db.execute(sql`
      SELECT rule_id, rule_name, rule_type, priority, complaint_id, cluster_id,
             diagnosis_id, source_tab, target_tabs, disposition_impact, medication_impact,
             workup_impact, safety_level, confidence_weight, active, version, last_updated,
             owner, logic_type, logic_description
      FROM kb_master_rules
      WHERE 1=1
        ${rule_type    ? sql`AND rule_type    = ${String(rule_type)}`    : sql``}
        ${complaint_id ? sql`AND (complaint_id = ${String(complaint_id)} OR complaint_id = 'ALL')` : sql``}
        ${safety_level ? sql`AND safety_level = ${String(safety_level)}` : sql``}
        ${active !== "all" ? sql`AND active = ${active === "true"}` : sql``}
      ORDER BY priority ASC, safety_level DESC, rule_type
      LIMIT ${parseInt(String(limit))} OFFSET ${offset}
    `);

    const totalRes = await db.execute(sql`
      SELECT COUNT(*) cnt FROM kb_master_rules
      WHERE 1=1
        ${rule_type    ? sql`AND rule_type    = ${String(rule_type)}`    : sql``}
        ${complaint_id ? sql`AND (complaint_id = ${String(complaint_id)} OR complaint_id = 'ALL')` : sql``}
        ${safety_level ? sql`AND safety_level = ${String(safety_level)}` : sql``}
        ${active !== "all" ? sql`AND active = ${active === "true"}` : sql``}
    `);

    res.json({
      ok: true,
      total: Number((totalRes.rows[0] as any).cnt),
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      rules: rows.rows,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Summary stats
router.get("/stats", ...auth, async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE active)            AS active_count,
        COUNT(*) FILTER (WHERE safety_level='CRITICAL') AS critical,
        COUNT(*) FILTER (WHERE safety_level='HIGH')     AS high,
        COUNT(*) FILTER (WHERE rule_type='red_flag')    AS red_flags,
        COUNT(*) FILTER (WHERE rule_type='diagnosis')   AS diagnoses,
        COUNT(*) FILTER (WHERE rule_type='medication')  AS medications,
        COUNT(*) FILTER (WHERE rule_type='disposition') AS dispositions,
        COUNT(*) FILTER (WHERE rule_type='modifier')    AS modifiers,
        COUNT(*) FILTER (WHERE rule_type='cluster_scoring') AS cluster_scoring,
        COUNT(*) FILTER (WHERE rule_type='question')    AS questions,
        COUNT(DISTINCT complaint_id) AS complaint_coverage
      FROM kb_master_rules
    `);
    res.json({ ok: true, stats: rows.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Pipeline view — rules ordered by 13-step execution for a complaint
// NOTE: must be registered BEFORE /:rule_id to avoid route capture
router.get("/pipeline/:complaint_id", ...auth, async (req, res) => {
  try {
    const { complaint_id } = req.params;
    const STEP_ORDER = ["modifier","question","red_flag","cluster_scoring","diagnosis","disposition","workup","medication","plan"];

    const rows = await db.execute(sql`
      SELECT rule_id, rule_name, rule_type, priority, safety_level,
             source_tab, target_tabs, logic_description, logic_type,
             disposition_impact, confidence_weight, active
      FROM kb_master_rules
      WHERE active = true
        AND (complaint_id = ${complaint_id} OR complaint_id = 'ALL'
             OR complaint_id ILIKE ${'%' + complaint_id + '%'})
      ORDER BY priority ASC, safety_level DESC
    `);

    const grouped: Record<string, any[]> = {};
    for (const step of STEP_ORDER) grouped[step] = [];

    for (const r of rows.rows as any[]) {
      if (grouped[r.rule_type]) grouped[r.rule_type].push(r);
    }

    const pipeline = STEP_ORDER.map((ruleType, i) => ({
      step:     i + 2, // steps 2-12 (step 1 is complaint ID)
      ruleType,
      stepName: {
        modifier: "Modifier Collection", question: "Question Engine",
        red_flag: "Safety Screen (Red Flags)", cluster_scoring: "Cluster Scoring",
        diagnosis: "Diagnosis Ranking", disposition: "Disposition Determination",
        workup: "Workup Selection", medication: "Medication Selection / Safety",
        plan: "Plan Generation",
      }[ruleType],
      rules: grouped[ruleType],
      count: grouped[ruleType].length,
    }));

    res.json({ ok: true, complaint_id, totalRules: (rows.rows as any[]).length, pipeline });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Single rule detail (after /pipeline to avoid capture)
router.get("/:rule_id", ...auth, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM kb_master_rules WHERE rule_id = ${req.params.rule_id}
    `);
    if (!(rows.rows as any[]).length) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, rule: rows.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Dry-run — simulate which rules fire for given inputs
router.post("/dry-run", ...auth, async (req, res) => {
  try {
    const { complaint_id, inputs = {} } = req.body;
    if (!complaint_id) return res.status(400).json({ ok: false, error: "complaint_id required" });

    const result = await executePipeline(complaint_id, inputs);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Export to Google Sheets
router.post("/export-to-sheets", ...auth, async (_req, res) => {
  try {
    const result = await exportMasterRulesToSheets();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Create rule
router.post("/", requireReviewAuth, requireRole(["admin"]), async (req, res) => {
  try {
    const b = req.body;
    await db.execute(sql`
      INSERT INTO kb_master_rules (rule_id, rule_name, rule_type, priority, complaint_id, cluster_id,
        diagnosis_id, modifier_dependencies, question_dependencies, red_flag_dependencies,
        input_fields, logic_description, logic_type, source_tab, target_tabs, outputs,
        disposition_impact, medication_impact, workup_impact, safety_level, override_rules,
        confidence_weight, active, version, last_updated, owner, notes)
      VALUES (${b.rule_id}, ${b.rule_name}, ${b.rule_type}, ${b.priority ?? 5},
        ${b.complaint_id ?? "ALL"}, ${b.cluster_id ?? null}, ${b.diagnosis_id ?? null},
        ${b.modifier_dependencies ?? []}, ${b.question_dependencies ?? []},
        ${b.red_flag_dependencies ?? []}, ${b.input_fields ?? []},
        ${b.logic_description ?? null}, ${b.logic_type ?? "boolean"},
        ${b.source_tab ?? null}, ${b.target_tabs ?? []},
        ${b.outputs ? JSON.stringify(b.outputs) : null},
        ${b.disposition_impact ?? null}, ${b.medication_impact ?? null},
        ${b.workup_impact ?? null}, ${b.safety_level ?? "MODERATE"},
        ${b.override_rules ?? []}, ${b.confidence_weight ?? 0.5},
        ${b.active !== false}, ${b.version ?? "v1"}, NOW(),
        ${b.owner ?? "admin"}, ${b.notes ?? null})
    `);
    res.json({ ok: true, rule_id: b.rule_id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update rule
router.patch("/:rule_id", requireReviewAuth, requireRole(["admin"]), async (req, res) => {
  try {
    const b = req.body;
    await db.execute(sql`
      UPDATE kb_master_rules SET
        rule_name = COALESCE(${b.rule_name ?? null}, rule_name),
        priority  = COALESCE(${b.priority  ?? null}, priority),
        active    = COALESCE(${b.active    ?? null}, active),
        safety_level = COALESCE(${b.safety_level ?? null}, safety_level),
        logic_description = COALESCE(${b.logic_description ?? null}, logic_description),
        notes     = COALESCE(${b.notes     ?? null}, notes),
        version   = COALESCE(${b.version   ?? null}, version),
        last_updated = NOW()
      WHERE rule_id = ${req.params.rule_id}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
