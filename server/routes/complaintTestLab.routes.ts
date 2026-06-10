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

// ── GET /systems ─────────────────────────────────────────────────────────────
// All 1,025 complaints grouped by medical system, alphabetical within each system

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

    // Group by system
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

    // Sort each system's complaints alphabetically
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
// All question rules for a complaint, organised into L1 / L2 / L3

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
      ORDER BY priority ASC, safety_level DESC
    `);

    const l1: QuestionRule[] = [];
    const l2: QuestionRule[] = [];
    const l3: QuestionRule[] = [];

    for (const r of rows as any[]) {
      const p = Number(r.priority);
      const q: QuestionRule = {
        rule_id:               r.rule_id,
        rule_name:             r.rule_name,
        logic_description:     r.logic_description,
        question_dependencies: r.question_dependencies,
        safety_level:          r.safety_level,
        priority:              p,
        complaint_id:          r.complaint_id,
      };
      if (p <= 3) l1.push(q);
      else if (p <= 6) l2.push(q);
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

// ── POST /simulate ────────────────────────────────────────────────────────────
// Simulate patient responses + run 13-step pipeline

router.post("/simulate", async (req, res) => {
  try {
    const { complaintId, scenario = "high_risk", customAnswers } = req.body as {
      complaintId:   string;
      scenario:      Scenario;
      customAnswers?: Record<string, string>;
    };

    if (!complaintId) return res.status(400).json({ ok: false, error: "complaintId required" });

    // 1. Fetch questions
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

    // 2. Simulate patient answers (MedDialog / HealthCareMagic patterns)
    const answers = simulateAnswers(questions, scenario, customAnswers);

    // 3. Build pipeline inputs from answers
    const derivedInputs = buildPipelineInputs(answers);

    // 4. Add persona-level context
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

    // 5. Run pipeline
    const started = Date.now();
    let pipelineResult: any = null;
    let hardStop = false;
    let errorMsg: string | null = null;

    try {
      pipelineResult = await executePipeline(complaintId, inputs as any);
    } catch (e: any) {
      if (e?.type === "FORCED_ESCALATION" || e?.reason) {
        hardStop = true;
        pipelineResult = {
          escalated: true,
          disposition: "ER_NOW",
          reason: e.reason ?? "FORCED_ESCALATION",
        };
      } else {
        errorMsg = e.message;
      }
    }

    const durationMs = Date.now() - started;

    // 6. Extract summary
    const result = pipelineResult ?? {};
    // Extract from PipelineResult shape: finalDisposition, totalRulesFired, criticalFlagsHit
    const firedRules: string[] = [];
    let rulesEvaluated = 0;
    if (Array.isArray(result.steps)) {
      for (const step of result.steps) {
        rulesEvaluated += step.rulesEvaluated ?? 0;
        if (Array.isArray(step.firedRules)) firedRules.push(...step.firedRules.map((r: any) => r.rule_id ?? r));
      }
    }

    const summary = {
      disposition:     result.finalDisposition ?? result.disposition ?? (hardStop ? "ER_NOW" : "UNKNOWN"),
      hardStop:        result.hardStop ?? hardStop,
      escalated:       result.hardStop ?? hardStop,
      stepsExecuted:   Array.isArray(result.steps) ? result.steps.length : 0,
      rulesEvaluated,
      rulesFired:      result.totalRulesFired ?? firedRules.length,
      topDiagnoses:    extractTopDiagnoses(result.steps ?? []),
      redFlagsHit:     result.criticalFlagsHit ?? [],
      confidence:      result.confidence ?? null,
      durationMs,
    };

    res.json({
      ok: true,
      complaintId,
      scenario,
      persona,
      answers,
      inputs,
      pipelineResult: result,
      summary,
      error: errorMsg,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /run-system ──────────────────────────────────────────────────────────
// Run all complaints in a system, return aggregate pass rates

router.post("/run-system", async (req, res) => {
  try {
    const { systemKey, scenario = "high_risk" } = req.body as {
      systemKey: string;
      scenario:  Scenario;
    };

    if (!systemKey) return res.status(400).json({ ok: false, error: "systemKey required" });

    // Get all complaints in this system
    const { rows: allComplaints } = await db.execute(sql`
      SELECT DISTINCT complaint_id FROM kb_master_rules
      WHERE complaint_id IS NOT NULL
      ORDER BY complaint_id
    `);

    const inSystem = (allComplaints as any[])
      .map(r => r.complaint_id as string)
      .filter(id => classifyComplaint(id) === systemKey);

    const results: Array<{
      complaintId:  string;
      disposition:  string;
      hardStop:     boolean;
      rulesFired:   number;
      durationMs:   number;
      error?:       string;
    }> = [];

    for (const complaintId of inSystem) {
      const { rows: qRows } = await db.execute(sql`
        SELECT rule_id, rule_name, logic_description, question_dependencies,
               safety_level, priority, complaint_id
        FROM kb_master_rules
        WHERE complaint_id = ${complaintId}
          AND rule_type     = 'question'
          AND active        = true
        ORDER BY priority ASC
      `);

      const answers = simulateAnswers(qRows as unknown as QuestionRule[], scenario);
      const inputs  = buildPipelineInputs(answers);
      const persona = PERSONAS[scenario];
      const fullInputs = {
        ...inputs,
        patientAge: persona.age,
        patientSex: persona.sex,
        smoker:     persona.smoker,
      };

      const started = Date.now();
      try {
        const r = await executePipeline(complaintId, fullInputs as any);
        results.push({
          complaintId,
          disposition: (r as any).disposition ?? "UNKNOWN",
          hardStop:    false,
          rulesFired:  (r as any).rulesFired ?? 0,
          durationMs:  Date.now() - started,
        });
      } catch (e: any) {
        if (e?.type === "FORCED_ESCALATION" || e?.reason) {
          results.push({
            complaintId,
            disposition: "ER_NOW",
            hardStop:    true,
            rulesFired:  0,
            durationMs:  Date.now() - started,
          });
        } else {
          results.push({
            complaintId,
            disposition: "ERROR",
            hardStop:    false,
            rulesFired:  0,
            durationMs:  Date.now() - started,
            error:       e.message,
          });
        }
      }
    }

    const erNow    = results.filter(r => r.disposition === "ER_NOW").length;
    const homeCare = results.filter(r => r.disposition === "HOME_CARE").length;
    const errors   = results.filter(r => r.error).length;

    res.json({
      ok: true,
      systemKey,
      scenario,
      total:     results.length,
      erNow,
      homeCare,
      errors,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /question/:ruleId ───────────────────────────────────────────────────
// Update question text or dependencies inline

router.patch("/question/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    const {
      logic_description,
      question_dependencies,
      priority,
      safety_level,
    } = req.body;

    await db.execute(sql`
      UPDATE kb_master_rules
      SET
        logic_description     = COALESCE(${logic_description     ?? null}, logic_description),
        question_dependencies = COALESCE(${question_dependencies ?? null}, question_dependencies),
        priority              = COALESCE(${priority              ?? null}, priority),
        safety_level          = COALESCE(${safety_level          ?? null}, safety_level),
        last_updated          = NOW()
      WHERE rule_id = ${ruleId}
    `);

    const { rows } = await db.execute(sql`
      SELECT rule_id, rule_name, logic_description, question_dependencies,
             safety_level, priority, complaint_id
      FROM kb_master_rules
      WHERE rule_id = ${ruleId}
    `);

    res.json({ ok: true, rule: rows[0] ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
