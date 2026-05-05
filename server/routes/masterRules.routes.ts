import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { exportMasterRulesToSheets } from "../scripts/exportMasterRulesToSheets";
import { syncSourceTablesToMasterRules } from "../scripts/syncSourceTablesToMasterRules";
import { executePipeline } from "../clinical/ruleExecutionEngine";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey:   process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL:  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

// Clinical decision tree — AI-generated flowchart per complaint (cached in DB)
// NOTE: must be registered BEFORE /:rule_id to avoid route capture
router.get("/flowchart/:complaint_id", ...auth, async (req, res) => {
  try {
    const { complaint_id } = req.params;
    const refresh = req.query.refresh === "true";

    // Ensure cache table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kb_clinical_flowcharts (
        complaint_id  TEXT PRIMARY KEY,
        title         TEXT,
        flowchart_json JSONB,
        generated_at  TIMESTAMPTZ DEFAULT NOW(),
        rule_count    INT
      )
    `);

    // Serve from cache unless refresh requested
    if (!refresh) {
      const cached = await db.execute(sql`
        SELECT flowchart_json, title, generated_at
        FROM   kb_clinical_flowcharts
        WHERE  complaint_id = ${complaint_id}
      `);
      if (cached.rows.length > 0) {
        return res.json({ flowchart: cached.rows[0].flowchart_json, cached: true, generated_at: cached.rows[0].generated_at });
      }
    }

    // Fetch the complaint's rules from the master rule table
    const { rows: rules } = await db.execute(sql`
      SELECT rule_name, rule_type, logic_description, logic_type,
             input_fields, disposition_impact, safety_level, priority,
             question_dependencies
      FROM   kb_master_rules
      WHERE  (complaint_id = ${complaint_id} OR complaint_id = 'ALL')
        AND  active = true
      ORDER  BY priority ASC, safety_level DESC
      LIMIT  50
    `);

    if (rules.length === 0) {
      return res.status(404).json({ error: `No active rules found for complaint: ${complaint_id}` });
    }

    const rulesText = rules
      .map(r => `[${String(r.rule_type).toUpperCase()}] ${r.rule_name}: ${r.logic_description ?? ""} | Disp: ${r.disposition_impact ?? "N/A"} | Safety: ${r.safety_level}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.15,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a clinical decision-tree architect for an emergency urgent-care triage system.
Generate accurate, medically rigorous decision flowcharts based on the rules provided.
Output ONLY valid JSON matching the exact schema requested — no prose, no markdown.`,
        },
        {
          role: "user",
          content: `Generate a clinical decision flowchart for complaint: "${complaint_id}"

Clinical rules from the knowledge base:
${rulesText}

Return strict JSON with this schema:
{
  "title": "Clinical Decision: [Human-readable complaint name]",
  "start_id": "n1",
  "nodes": [
    {
      "id": "n1",
      "type": "start",
      "label": "Patient presents with [chief complaint]",
      "next_id": "n2"
    }
  ]
}

Node type rules:
- "start"    — entry point (exactly 1). Has next_id.
- "decision" — yes/no clinical question (e.g. "Fever ≥38.5°C?"). Has yes_id (positive path) and no_id (negative path).
- "process"  — evaluation or workup step (e.g. "Obtain CBC, CMP, UA"). Has next_id. Optional detail:[].
- "action"   — treatment or recommendation. Has next_id if more steps follow, otherwise omit. Optional detail:[] for bullet points.
- "terminal" — final disposition. No next_id. Include disposition in label (e.g. "Discharge: treat and follow up in 3 days").

Requirements:
1. Follow the exact clinical pipeline step order:
   Step 1 → Complaint Identification (start node)
   Step 2 → Differential Diagnosis / Rule-Out Targets (process nodes laying out candidate diagnoses)
   Step 3A → Modifier Collection (decision nodes for patient-context modifiers, e.g. "Age > 65?", "Immunocompromised?")
   Step 3B → Question Engine (decision nodes for symptom details, e.g. "Fever ≥ 38.5°C?", "Productive cough?")
   Step 4 → Workup Selection (process node: labs/imaging to order)
   Step 5 → Medication Selection / Safety (action node: treatment options)
   Step 6 → Safety Screen — Red Flags (DECISION node, yes/no: critical red flag present?) → YES branches to ER escalation terminal, NO continues
   Step 7 → Cluster Scoring (process node: scoring the working diagnosis clusters)
   Step 8 → Diagnosis Ranking / Differential Refinement (process node: rank top diagnoses)
   Step 9 → Disposition + Plan (terminal nodes per path, e.g. "Discharge with 5-day Azithromycin", "Admit for IV antibiotics")
   Step 13 → Audit Trail (terminal: chart note summary)
2. The Safety Screen (Step 6) MUST be a decision node with yes_id (→ escalate/ER terminal) and no_id (→ continues to Cluster Scoring).
3. Modifiers and Question nodes (Steps 3A/3B) come BEFORE workup and medications.
4. End each path with a specific disposition terminal node.
5. Keep 12–18 nodes total. Be concise and medically accurate.
6. Base the tree on the actual rules provided above.`,
        },
      ],
    });

    let flowchart: any;
    try {
      flowchart = JSON.parse(completion.choices[0].message.content ?? "{}");
    } catch {
      return res.status(500).json({ error: "OpenAI returned invalid JSON" });
    }

    // Cache result
    await db.execute(sql`
      INSERT INTO kb_clinical_flowcharts (complaint_id, title, flowchart_json, rule_count)
      VALUES (${complaint_id}, ${flowchart.title ?? complaint_id}, ${JSON.stringify(flowchart)}, ${rules.length})
      ON CONFLICT (complaint_id) DO UPDATE SET
        flowchart_json = EXCLUDED.flowchart_json,
        title          = EXCLUDED.title,
        rule_count     = EXCLUDED.rule_count,
        generated_at   = NOW()
    `);

    res.json({ flowchart, cached: false });
  } catch (e: any) {
    console.error("[Flowchart]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Complaint coverage — all complaint_ids with per-type rule counts
// NOTE: must be registered BEFORE /:rule_id to avoid route capture
router.get("/complaints", ...auth, async (_req, res) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT
        complaint_id,
        COUNT(*)                                               AS rule_cnt,
        COUNT(*) FILTER (WHERE rule_type = 'red_flag')        AS red_flags,
        COUNT(*) FILTER (WHERE rule_type = 'question')        AS questions,
        COUNT(*) FILTER (WHERE rule_type = 'diagnosis')       AS diagnoses,
        COUNT(*) FILTER (WHERE rule_type = 'medication')      AS medications,
        COUNT(*) FILTER (WHERE rule_type = 'disposition')     AS dispositions,
        COUNT(*) FILTER (WHERE rule_type = 'workup')          AS workups,
        COUNT(*) FILTER (WHERE rule_type = 'modifier')        AS modifiers,
        COUNT(*) FILTER (WHERE rule_type = 'cluster_scoring') AS cluster_scoring,
        COUNT(*) FILTER (WHERE safety_level = 'CRITICAL')     AS critical
      FROM kb_master_rules
      WHERE complaint_id IS NOT NULL
        AND complaint_id != 'ALL'
        AND active = true
      GROUP BY complaint_id
      ORDER BY complaint_id
    `);
    res.json({ complaints: rows, total: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Pipeline view — rules ordered by 13-step execution for a complaint
// NOTE: must be registered BEFORE /:rule_id to avoid route capture
router.get("/pipeline/:complaint_id", ...auth, async (req, res) => {
  try {
    const { complaint_id } = req.params;
    // Corrected step order per clinical pipeline spec
    const PIPELINE_DEFS = [
      { step:  1,  ruleType: null,              stepName: "Complaint Identification"                  },
      { step:  2,  ruleType: "diagnosis",       stepName: "Differential Diagnosis / Rule-Out Targets" },
      { step:  3,  ruleType: "modifier",        stepName: "Modifier Collection"                       },
      { step:  4,  ruleType: "question",        stepName: "Question Engine"                           },
      { step:  5,  ruleType: "workup",          stepName: "Workup Selection"                          },
      { step:  6,  ruleType: "medication",      stepName: "Medication Selection / Safety"             },
      { step:  7,  ruleType: "red_flag",        stepName: "Safety Screen — Red Flags"                },
      { step:  8,  ruleType: "cluster_scoring", stepName: "Cluster Scoring"                           },
      { step:  9,  ruleType: "diagnosis",       stepName: "Diagnosis Ranking / Differential Refinement"},
      { step: 10,  ruleType: "disposition",     stepName: "Disposition + Plan"                        },
      { step: 11,  ruleType: "plan",            stepName: "Plan Generation"                           },
      { step: 13,  ruleType: null,              stepName: "Audit Trail"                               },
    ];

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

    // Group rules by type
    const grouped: Record<string, any[]> = {
      diagnosis: [], modifier: [], question: [], workup: [],
      medication: [], red_flag: [], cluster_scoring: [], disposition: [], plan: [],
    };
    for (const r of rows.rows as any[]) {
      if (grouped[r.rule_type] !== undefined) grouped[r.rule_type].push(r);
    }

    const pipeline = PIPELINE_DEFS.map(def => ({
      step:     def.step,
      ruleType: def.ruleType,
      stepName: def.stepName,
      rules:    def.ruleType ? grouped[def.ruleType] ?? [] : [],
      count:    def.ruleType ? (grouped[def.ruleType]?.length ?? 0) : 0,
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

// Sync source tables → kb_master_rules
router.post("/sync-from-source", ...auth, async (_req, res) => {
  try {
    const result = await syncSourceTablesToMasterRules();
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
