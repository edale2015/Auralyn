/**
 * goldenCaseRoutes.ts
 * Golden case management + execution against the 13-step rule engine.
 * GET  /api/golden-cases          — list all cases with last run result
 * GET  /api/golden-cases/runs     — recent run history
 * POST /api/golden-cases/run-all  — execute all active cases, write results to DB
 */
import express, { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { executePipeline } from "../clinical/ruleExecutionEngine";

const router = express.Router();

// GET /api/golden-cases
router.get("/", async (_req: Request, res: Response) => {
  try {
    const cases = await db.execute(sql`
      SELECT
        gc.id, gc.case_id, gc.complaint, gc.title,
        gc.expected_disposition, gc.structured_inputs, gc.modifiers,
        gc.expected_red_flags, gc.expected_treatment, gc.status, gc.tags,
        gc.active, gc.created_at,
        lr.passed       AS last_passed,
        lr.score        AS last_score,
        lr.fail_reason  AS last_fail_reason,
        lr.run_at       AS last_run_at,
        lr.result       AS last_result
      FROM kb_golden_cases gc
      LEFT JOIN LATERAL (
        SELECT passed, score, fail_reason, run_at, result
        FROM golden_case_runs
        WHERE golden_case_id = gc.id
        ORDER BY run_at DESC LIMIT 1
      ) lr ON true
      WHERE gc.active = true
      ORDER BY gc.complaint, gc.case_id
    `);
    res.json({ ok: true, cases: cases.rows, total: cases.rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/golden-cases/runs
router.get("/runs", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 200);
    const runs = await db.execute(sql`
      SELECT
        r.id, r.golden_case_id, r.run_batch, r.passed, r.score,
        r.fail_reason, r.run_at,
        gc.complaint, gc.title, gc.case_id, gc.expected_disposition,
        (r.result::jsonb -> 'totalRulesFired')::int   AS rules_fired,
        (r.result::jsonb -> 'hardStop')::boolean       AS hard_stop,
        r.result::jsonb -> 'criticalFlagsHit'          AS critical_flags_hit,
        (
          SELECT jsonb_agg(rule_obj -> 'rule_id')
          FROM jsonb_array_elements(r.result::jsonb -> 'steps') AS step
          CROSS JOIN jsonb_array_elements(step -> 'rulesFired') AS rule_obj
        ) AS fired_rule_ids
      FROM golden_case_runs r
      JOIN kb_golden_cases gc ON gc.id = r.golden_case_id
      ORDER BY r.run_at DESC
      LIMIT ${limit}
    `);
    const summary = await db.execute(sql`
      SELECT
        COUNT(*)                            AS total_runs,
        COUNT(*) FILTER (WHERE passed)      AS total_passed,
        COUNT(*) FILTER (WHERE NOT passed)  AS total_failed,
        ROUND(AVG(score)::numeric, 1)       AS avg_score,
        MAX(run_at)                         AS last_run_at,
        COUNT(DISTINCT run_batch)           AS batches
      FROM golden_case_runs
    `);
    res.json({ ok: true, runs: runs.rows, summary: summary.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/golden-cases/run-all
router.post("/run-all", async (_req: Request, res: Response) => {
  try {
    const cases = await db.execute(sql`
      SELECT id, case_id, complaint, structured_inputs, modifiers,
             expected_disposition, expected_red_flags
      FROM kb_golden_cases WHERE active = true
    `);

    const batchId = `BATCH_${Date.now()}`;
    const results: any[] = [];

    for (const gc of cases.rows as any[]) {
      const inputs: Record<string, any> = {
        ...(gc.structured_inputs && typeof gc.structured_inputs === "object"
          ? gc.structured_inputs : {}),
        ...(Array.isArray(gc.modifiers)
          ? gc.modifiers.reduce((a: any, m: string) => ({ ...a, [m]: true }), {})
          : gc.modifiers && typeof gc.modifiers === "object" ? gc.modifiers : {}),
      };

      let pipelineResult: any = null;
      let passed = false;
      let score = 0;
      let failReason: string | null = null;

      try {
        pipelineResult = await executePipeline(gc.complaint, inputs);

        const expectedDisp = (gc.expected_disposition ?? "").toLowerCase().trim();
        const actualDisp   = (pipelineResult.finalDisposition ?? "").toLowerCase().trim();
        const dispMatch    = actualDisp === expectedDisp
          || actualDisp.includes(expectedDisp)
          || expectedDisp.includes(actualDisp)
          || (expectedDisp === "urgent_care" && actualDisp === "urgentcare")
          || (expectedDisp === "er_now" && (actualDisp.includes("er") || actualDisp.includes("emergency")));

        const expectedRFs: string[] = Array.isArray(gc.expected_red_flags)
          ? gc.expected_red_flags : [];
        const firedRuleIds: string[] = pipelineResult.steps
          .flatMap((s: any) => (s.rulesFired ?? []).map((r: any) => r.rule_id));
        const rfHit = expectedRFs.length === 0
          || expectedRFs.every((rf: string) =>
              firedRuleIds.some((id: string) => id.toLowerCase().includes(rf.toLowerCase())));

        passed = dispMatch && rfHit;
        score  = passed ? 100 : (dispMatch ? 60 : rfHit ? 40 : 0);

        if (!dispMatch)
          failReason = `Disposition: expected "${expectedDisp}", got "${actualDisp}"`;
        else if (!rfHit)
          failReason = `Missing red flags: ${expectedRFs
            .filter((rf: string) => !firedRuleIds.some((id: string) => id.toLowerCase().includes(rf.toLowerCase())))
            .join(", ")}`;
      } catch (err: any) {
        failReason = `Engine error: ${err.message}`;
      }

      await db.execute(sql`
        INSERT INTO golden_case_runs
          (golden_case_id, run_batch, system_version, engine_version,
           result, score, passed, fail_reason, run_at)
        VALUES (
          ${gc.id}, ${batchId}, '1.0', '13-step-pipeline',
          ${pipelineResult ? JSON.stringify(pipelineResult) : null},
          ${score}, ${passed}, ${failReason}, NOW()
        )
      `);

      results.push({
        case_id:       gc.case_id,
        complaint:     gc.complaint,
        passed,
        score,
        failReason,
        rulesFired:    pipelineResult?.totalRulesFired ?? 0,
        firedRuleIds:  pipelineResult?.steps?.flatMap((s: any) =>
          (s.rulesFired ?? []).map((r: any) => r.rule_id)) ?? [],
        hardStop:      pipelineResult?.hardStop ?? false,
        disposition:   pipelineResult?.finalDisposition ?? null,
      });
    }

    const passed    = results.filter(r => r.passed).length;
    const failed    = results.filter(r => !r.passed).length;
    const passRate  = Math.round((passed / Math.max(results.length, 1)) * 100);

    res.json({ ok: true, batchId, total: results.length, passed, failed, passRate, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
