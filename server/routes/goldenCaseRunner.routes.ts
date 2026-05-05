/**
 * goldenCaseRunner.routes.ts
 * Run golden cases through the rule execution engine and store results.
 * POST /api/golden-cases/run-all   — run every active golden case
 * GET  /api/golden-cases           — list all cases with last run result
 * GET  /api/golden-cases/runs      — recent run history
 */
import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { executePipeline } from "../clinical/ruleExecutionEngine";
import { requireReviewAuth } from "../middleware/auth";

const router = Router();

// GET /api/golden-cases — all cases with last run result
router.get("/", requireReviewAuth, async (_req: Request, res: Response) => {
  try {
    const cases = await db.execute(sql`
      SELECT
        gc.id, gc.case_id, gc.complaint, gc.title,
        gc.expected_disposition, gc.structured_inputs, gc.modifiers,
        gc.expected_red_flags, gc.expected_treatment, gc.status, gc.tags,
        gc.active, gc.created_at,
        lr.passed        AS last_passed,
        lr.score         AS last_score,
        lr.fail_reason   AS last_fail_reason,
        lr.run_at        AS last_run_at,
        lr.result        AS last_result
      FROM kb_golden_cases gc
      LEFT JOIN LATERAL (
        SELECT passed, score, fail_reason, run_at, result
        FROM golden_case_runs
        WHERE golden_case_id = gc.id
        ORDER BY run_at DESC
        LIMIT 1
      ) lr ON true
      WHERE gc.active = true
      ORDER BY gc.complaint, gc.case_id
    `);
    res.json({ ok: true, cases: cases.rows, total: cases.rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/golden-cases/runs — recent run history
router.get("/runs", requireReviewAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit ?? "50"));
    const runs = await db.execute(sql`
      SELECT r.*, gc.complaint, gc.title, gc.case_id, gc.expected_disposition
      FROM golden_case_runs r
      JOIN kb_golden_cases gc ON gc.id = r.golden_case_id
      ORDER BY r.run_at DESC
      LIMIT ${limit}
    `);
    const summary = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE passed) AS total_passed,
        COUNT(*) FILTER (WHERE NOT passed) AS total_failed,
        COUNT(*) AS total_runs,
        MAX(run_at) AS last_run_at
      FROM golden_case_runs
    `);
    res.json({ ok: true, runs: runs.rows, summary: summary.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/golden-cases/run-all — execute all active golden cases
router.post("/run-all", requireReviewAuth, async (_req: Request, res: Response) => {
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
        ...(typeof gc.structured_inputs === "object" ? gc.structured_inputs : {}),
        ...(Array.isArray(gc.modifiers)
          ? gc.modifiers.reduce((a: any, m: string) => ({ ...a, [m]: true }), {})
          : typeof gc.modifiers === "object" ? gc.modifiers : {}),
      };

      let result: any = null;
      let passed = false;
      let score = 0;
      let failReason: string | null = null;

      try {
        result = await executePipeline(gc.complaint, inputs);

        const expectedDisp = (gc.expected_disposition ?? "").toLowerCase();
        const actualDisp   = (result.finalDisposition ?? "").toLowerCase();
        const dispMatch    = actualDisp === expectedDisp || actualDisp.includes(expectedDisp) || expectedDisp.includes(actualDisp);

        // Check if expected red flags were hit
        const expectedRFs: string[] = Array.isArray(gc.expected_red_flags)
          ? gc.expected_red_flags
          : [];
        const firedRuleIds: string[] = result.steps
          .flatMap((s: any) => s.rulesFired.map((r: any) => r.rule_id));
        const rfHit = expectedRFs.length === 0
          || expectedRFs.every((rf: string) => firedRuleIds.some((id: string) => id.includes(rf)));

        passed = dispMatch && rfHit;
        score  = passed ? 100 : dispMatch ? 60 : 0;
        if (!dispMatch) failReason = `Disposition mismatch: expected="${expectedDisp}" got="${actualDisp}"`;
        else if (!rfHit) failReason = `Missing expected red flags: ${expectedRFs.filter((rf: string) => !firedRuleIds.some((id: string) => id.includes(rf))).join(", ")}`;
      } catch (err: any) {
        failReason = `Engine error: ${err.message}`;
        score = 0;
      }

      await db.execute(sql`
        INSERT INTO golden_case_runs
          (golden_case_id, run_batch, system_version, engine_version, result, score, passed, fail_reason, run_at)
        VALUES (
          ${gc.id}, ${batchId}, '1.0', '13-step-pipeline',
          ${result ? JSON.stringify(result) : null},
          ${score}, ${passed}, ${failReason}, NOW()
        )
      `);

      results.push({
        case_id: gc.case_id,
        complaint: gc.complaint,
        passed,
        score,
        failReason,
        rulesFireCount: result?.totalRulesFired ?? 0,
        firedRuleIds: result?.steps?.flatMap((s: any) => s.rulesFired.map((r: any) => r.rule_id)) ?? [],
      });
    }

    const passed  = results.filter(r => r.passed).length;
    const failed  = results.filter(r => !r.passed).length;
    const passRate = Math.round((passed / Math.max(results.length, 1)) * 100);

    res.json({ ok: true, batchId, total: results.length, passed, failed, passRate, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
