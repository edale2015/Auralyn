import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { executePipeline } from "../clinical/ruleExecutionEngine";
import {
  classifyComplaint,
  MEDICAL_SYSTEMS,
  simulateAnswers,
  buildPipelineInputs,
  PERSONAS,
  type Scenario,
  type QuestionRule,
} from "../test/patientResponseSimulator";
import { runNarrativeIntake, getIntakePrompt, INTAKE_PROMPTS } from "../clinical/narrativeIntakeEngine";

const router = Router();

// Extract top diagnoses from pipeline step results
function extractTopDiagnoses(steps: any[]): Array<{ label: string; probability?: number }> {
  for (const step of steps) {
    if (step.ruleType === "diagnosis" && Array.isArray(step.firedRules) && step.firedRules.length > 0) {
      return step.firedRules.slice(0, 5).map((r: any) => ({
        label: r.rule_name ?? r.rule_id ?? String(r),
        probability: r.confidence_weight ?? r.weight ?? undefined,
      }));
    }
  }
  return [];
}

// Classify priority into L1/L2/L3 based on actual data distribution
// p33=2, p66=10 across all question rules
function priorityToLevel(p: number | null): 1 | 2 | 3 {
  if (!p || p <= 2)  return 1;
  if (p <= 10)       return 2;
  return 3;
}

// ── GET /systems ─────────────────────────────────────────────────────────────

router.get("/systems", async (_req, res) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT
        complaint_id,
        COUNT(*)                                               AS total_rules,
        SUM(CASE WHEN rule_type = 'question' THEN 1 ELSE 0 END) AS question_count,
        SUM(CASE WHEN rule_type = 'red_flag' THEN 1 ELSE 0 END) AS red_flag_count
      FROM kb_master_rules
      WHERE complaint_id IS NOT NULL
      GROUP BY complaint_id
      ORDER BY complaint_id
    `);

    const bySystem: Record<string, { id: string; totalRules: number; questionCount: number; redFlagCount: number }[]> = {};
    for (const r of rows as any[]) {
      const sys = classifyComplaint(r.complaint_id as string);
      if (!bySystem[sys]) bySystem[sys] = [];
      bySystem[sys].push({
        id:            r.complaint_id as string,
        totalRules:    Number(r.total_rules),
        questionCount: Number(r.question_count),
        redFlagCount:  Number(r.red_flag_count),
      });
    }
    for (const sys of Object.keys(bySystem)) {
      bySystem[sys].sort((a, b) => a.id.localeCompare(b.id));
    }

    const systems = MEDICAL_SYSTEMS.map(s => ({
      ...s,
      complaints:     bySystem[s.key] ?? [],
      complaintCount: (bySystem[s.key] ?? []).length,
    }));

    res.json({ ok: true, systems, totalComplaints: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /questions/:complaintId ───────────────────────────────────────────────

router.get("/questions/:complaintId", async (req, res) => {
  try {
    const { complaintId } = req.params;

    const { rows } = await db.execute(sql`
      SELECT rule_id, rule_name, logic_description, question_dependencies,
             safety_level, priority, complaint_id, active, confidence_weight
      FROM kb_master_rules
      WHERE complaint_id = ${complaintId}
        AND rule_type     = 'question'
        AND active        = true
      ORDER BY priority ASC NULLS LAST, rule_id ASC
    `);

    const l1: QuestionRule[] = [];
    const l2: QuestionRule[] = [];
    const l3: QuestionRule[] = [];

    for (const r of rows as any[]) {
      const p   = r.priority != null ? Number(r.priority) : null;
      const lvl = priorityToLevel(p);
      const q: QuestionRule = {
        rule_id:               r.rule_id,
        rule_name:             r.rule_name,
        logic_description:     r.logic_description,
        question_dependencies: r.question_dependencies,
        safety_level:          r.safety_level ?? "STANDARD",
        priority:              p ?? 99,
        complaint_id:          r.complaint_id,
      };
      if (lvl === 1) l1.push(q);
      else if (lvl === 2) l2.push(q);
      else l3.push(q);
    }

    res.json({
      ok: true,
      complaintId,
      levels: { l1, l2, l3 },
      total: rows.length,
      system: classifyComplaint(complaintId),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /question ─────────────────────────────────────────────────────────────
// Create a new question rule for a complaint

router.post("/question", async (req, res) => {
  try {
    const {
      complaint_id,
      rule_name,
      logic_description,
      question_dependencies,
      safety_level = "STANDARD",
      level = 2,
    } = req.body as {
      complaint_id:          string;
      rule_name:             string;
      logic_description?:    string;
      question_dependencies?: string;
      safety_level?:         string;
      level?:                1 | 2 | 3;
    };

    if (!complaint_id || !rule_name) {
      return res.status(400).json({ ok: false, error: "complaint_id and rule_name required" });
    }

    // Generate a new rule_id
    const prefix = complaint_id.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 10);
    const { rows: existing } = await db.execute(sql`
      SELECT rule_id FROM kb_master_rules
      WHERE complaint_id = ${complaint_id} AND rule_type = 'question'
      ORDER BY priority DESC NULLS LAST LIMIT 1
    `);

    // Pick a priority in the target level range
    const basePriority = level === 1 ? 1 : level === 2 ? 5 : 15;
    const { rows: maxRow } = await db.execute(sql`
      SELECT MAX(priority) as max_p FROM kb_master_rules
      WHERE complaint_id = ${complaint_id} AND rule_type = 'question'
        AND priority BETWEEN ${level === 1 ? 1 : level === 2 ? 3 : 11}
                         AND ${level === 1 ? 2 : level === 2 ? 10 : 999}
    `);
    const maxPriority = maxRow[0] ? (Number((maxRow[0] as any).max_p) || basePriority - 1) : basePriority - 1;
    const newPriority = maxPriority + 1;

    // Generate unique rule_id
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const newRuleId = `MR_Q_${prefix}_${timestamp}`;

    await db.execute(sql`
      INSERT INTO kb_master_rules (
        rule_id, complaint_id, rule_type, rule_name, logic_description,
        question_dependencies, safety_level, priority, active,
        created_at, last_updated
      ) VALUES (
        ${newRuleId}, ${complaint_id}, 'question', ${rule_name},
        ${logic_description ?? rule_name},
        ${question_dependencies ?? null},
        ${safety_level}, ${newPriority}, true,
        NOW(), NOW()
      )
    `);

    const { rows } = await db.execute(sql`
      SELECT rule_id, rule_name, logic_description, question_dependencies,
             safety_level, priority, complaint_id
      FROM kb_master_rules WHERE rule_id = ${newRuleId}
    `);

    res.json({ ok: true, rule: rows[0] ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /question/:ruleId ───────────────────────────────────────────────────

router.patch("/question/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    const {
      logic_description,
      rule_name,
      question_dependencies,
      priority,
      safety_level,
    } = req.body;

    await db.execute(sql`
      UPDATE kb_master_rules
      SET
        logic_description     = COALESCE(${logic_description     ?? null}, logic_description),
        rule_name             = COALESCE(${rule_name             ?? null}, rule_name),
        question_dependencies = COALESCE(${question_dependencies ?? null}, question_dependencies),
        priority              = COALESCE(${priority              ?? null}, priority),
        safety_level          = COALESCE(${safety_level          ?? null}, safety_level),
        last_updated          = NOW()
      WHERE rule_id = ${ruleId}
    `);

    const { rows } = await db.execute(sql`
      SELECT rule_id, rule_name, logic_description, question_dependencies,
             safety_level, priority, complaint_id
      FROM kb_master_rules WHERE rule_id = ${ruleId}
    `);

    res.json({ ok: true, rule: rows[0] ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /question/:ruleId ──────────────────────────────────────────────────

router.delete("/question/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    await db.execute(sql`
      UPDATE kb_master_rules SET active = false, last_updated = NOW()
      WHERE rule_id = ${ruleId} AND rule_type = 'question'
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /simulate ────────────────────────────────────────────────────────────

router.post("/simulate", async (req, res) => {
  try {
    const { complaintId, scenario = "high_risk", customAnswers } = req.body as {
      complaintId:   string;
      scenario:      Scenario;
      customAnswers?: Record<string, string>;
    };

    if (!complaintId) return res.status(400).json({ ok: false, error: "complaintId required" });

    const { rows } = await db.execute(sql`
      SELECT rule_id, rule_name, logic_description, question_dependencies,
             safety_level, priority, complaint_id
      FROM kb_master_rules
      WHERE complaint_id = ${complaintId}
        AND rule_type     = 'question'
        AND active        = true
      ORDER BY priority ASC
    `);

    const questions = rows as unknown as QuestionRule[];
    const answers   = simulateAnswers(questions, scenario, customAnswers);
    const derivedInputs = buildPipelineInputs(answers);

    const persona = PERSONAS[scenario];
    const inputs  = {
      ...derivedInputs,
      patientAge:    persona.age,
      patientSex:    persona.sex,
      smoker:        persona.smoker,
      hasDiabetes:   persona.pmh.includes("type 2 diabetes"),
      hasHTN:        persona.pmh.includes("hypertension"),
      hasCAD:        persona.pmh.includes("CAD"),
      hasHyperlipid: persona.pmh.includes("hyperlipidemia"),
    };

    const started = Date.now();
    let pipelineResult: any = null;
    let hardStop = false;
    let errorMsg: string | null = null;

    try {
      pipelineResult = await executePipeline(complaintId, inputs as any);
    } catch (e: any) {
      if (e?.type === "FORCED_ESCALATION" || e?.reason) {
        hardStop = true;
        pipelineResult = { escalated: true, disposition: "ER_NOW", reason: e.reason ?? "FORCED_ESCALATION" };
      } else {
        errorMsg = e.message;
      }
    }

    const durationMs = Date.now() - started;
    const result = pipelineResult ?? {};

    const firedRules: string[] = [];
    let rulesEvaluated = 0;
    if (Array.isArray(result.steps)) {
      for (const step of result.steps) {
        rulesEvaluated += step.rulesEvaluated ?? 0;
        if (Array.isArray(step.firedRules)) firedRules.push(...step.firedRules.map((r: any) => r.rule_id ?? r));
      }
    }

    const summary = {
      disposition:    result.finalDisposition ?? result.disposition ?? (hardStop ? "ER_NOW" : "UNKNOWN"),
      hardStop:       result.hardStop ?? hardStop,
      escalated:      result.hardStop ?? hardStop,
      stepsExecuted:  Array.isArray(result.steps) ? result.steps.length : 0,
      rulesEvaluated,
      rulesFired:     result.totalRulesFired ?? firedRules.length,
      topDiagnoses:   extractTopDiagnoses(result.steps ?? []),
      redFlagsHit:    result.criticalFlagsHit ?? [],
      confidence:     result.confidence ?? null,
      durationMs,
    };

    res.json({ ok: true, complaintId, scenario, persona, answers, inputs, pipelineResult: result, summary, error: errorMsg });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /run-system ──────────────────────────────────────────────────────────

router.post("/run-system", async (req, res) => {
  try {
    const { systemKey, scenario = "high_risk" } = req.body as { systemKey: string; scenario: Scenario };
    if (!systemKey) return res.status(400).json({ ok: false, error: "systemKey required" });

    const { rows: allComplaints } = await db.execute(sql`
      SELECT DISTINCT complaint_id FROM kb_master_rules
      WHERE complaint_id IS NOT NULL ORDER BY complaint_id
    `);

    const inSystem = (allComplaints as any[])
      .map(r => r.complaint_id as string)
      .filter(id => classifyComplaint(id) === systemKey);

    const results: Array<{ complaintId: string; disposition: string; hardStop: boolean; rulesFired: number; durationMs: number; error?: string }> = [];

    for (const complaintId of inSystem) {
      const { rows: qRows } = await db.execute(sql`
        SELECT rule_id, rule_name, logic_description, question_dependencies,
               safety_level, priority, complaint_id
        FROM kb_master_rules
        WHERE complaint_id = ${complaintId} AND rule_type = 'question' AND active = true
        ORDER BY priority ASC
      `);

      const answers    = simulateAnswers(qRows as unknown as QuestionRule[], scenario);
      const inputs     = buildPipelineInputs(answers);
      const persona    = PERSONAS[scenario];
      const fullInputs = { ...inputs, patientAge: persona.age, patientSex: persona.sex, smoker: persona.smoker };

      const started = Date.now();
      try {
        const r = await executePipeline(complaintId, fullInputs as any);
        results.push({
          complaintId,
          disposition: (r as any).finalDisposition ?? (r as any).disposition ?? "UNKNOWN",
          hardStop:    (r as any).hardStop ?? false,
          rulesFired:  (r as any).totalRulesFired ?? 0,
          durationMs:  Date.now() - started,
        });
      } catch (e: any) {
        if (e?.type === "FORCED_ESCALATION" || e?.reason) {
          results.push({ complaintId, disposition: "ER_NOW", hardStop: true, rulesFired: 0, durationMs: Date.now() - started });
        } else {
          results.push({ complaintId, disposition: "ERROR", hardStop: false, rulesFired: 0, durationMs: Date.now() - started, error: e.message });
        }
      }
    }

    res.json({
      ok: true, systemKey, scenario,
      total:    results.length,
      erNow:    results.filter(r => r.disposition === "ER_NOW").length,
      homeCare: results.filter(r => r.disposition === "HOME_CARE").length,
      errors:   results.filter(r => r.error).length,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /narrative-intake ────────────────────────────────────────────────────
// Pass a free-text patient narrative; get back structured clinical entities,
// complaint detection, and a map of which questions are already answered.

router.post("/narrative-intake", async (req, res) => {
  try {
    const { narrative, complaintId } = req.body as {
      narrative:    string;
      complaintId?: string;
    };
    if (!narrative?.trim()) {
      return res.status(400).json({ ok: false, error: "narrative is required" });
    }
    const extraction = await runNarrativeIntake(narrative.trim(), complaintId);
    res.json({ ok: true, extraction });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /narrative-run ───────────────────────────────────────────────────────
// Extract from narrative AND immediately run the 13-step pipeline with
// the pre-filled inputs. Returns extraction + full pipeline result.

router.post("/narrative-run", async (req, res) => {
  try {
    const { narrative, complaintId } = req.body as {
      narrative:    string;
      complaintId?: string;
    };
    if (!narrative?.trim()) {
      return res.status(400).json({ ok: false, error: "narrative is required" });
    }

    const extraction = await runNarrativeIntake(narrative.trim(), complaintId);
    const targetId   = extraction.detectedComplaint;

    const started = Date.now();
    let pipelineResult: any = null;
    let hardStop = false;
    let errorMsg: string | null = null;

    try {
      pipelineResult = await executePipeline(targetId, extraction.pipelineInputs as any);
    } catch (e: any) {
      if (e?.type === "FORCED_ESCALATION" || e?.reason) {
        hardStop = true;
        pipelineResult = { finalDisposition: "ER_NOW", hardStop: true };
      } else {
        errorMsg = e.message;
      }
    }

    const durationMs = Date.now() - started;
    const result     = pipelineResult ?? {};

    const firedRules: string[] = [];
    let rulesEvaluated = 0;
    if (Array.isArray(result.steps)) {
      for (const step of result.steps) {
        rulesEvaluated += step.rulesEvaluated ?? 0;
        if (Array.isArray(step.firedRules)) {
          firedRules.push(...step.firedRules.map((r: any) => r.rule_id ?? r));
        }
      }
    }

    const summary = {
      disposition:    result.finalDisposition ?? (hardStop ? "ER_NOW" : "UNKNOWN"),
      hardStop:       result.hardStop ?? hardStop,
      stepsExecuted:  Array.isArray(result.steps) ? result.steps.length : 0,
      rulesEvaluated,
      rulesFired:     result.totalRulesFired ?? firedRules.length,
      topDiagnoses:   extractTopDiagnoses(result.steps ?? []),
      redFlagsHit:    result.criticalFlagsHit ?? [],
      pipelineDurationMs: durationMs,
    };

    res.json({
      ok: true,
      extraction,
      summary,
      pipelineResult: result,
      error: errorMsg,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /intake-prompts ───────────────────────────────────────────────────────
router.get("/intake-prompts", (_req, res) => {
  res.json({ ok: true, prompts: INTAKE_PROMPTS });
});

export default router;
