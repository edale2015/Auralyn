/**
 * harnessOrchestrator.ts
 * Drop into: server/harness/harnessOrchestrator.ts
 *
 * Registers all three adversarial harness implementations with BullMQ.
 * Surfaces results to the physician review dashboard.
 *
 * SCHEDULES:
 *   KB Validation:     Nightly at 2:00am UTC
 *   Quality Review:    Weekly on Monday at 3:00am UTC
 *   Sprint Contracts:  On-demand via POST /api/harness/sprint
 *
 * REGISTRATION:
 *   Call registerHarnessWorkers() from server/index.ts during startup.
 *
 * API ROUTES (register with app.use(harnessRouter)):
 *   GET  /api/harness/status          → last run status of all three harnesses
 *   GET  /api/harness/kb-report       → latest KB validation report
 *   GET  /api/harness/quality-report  → latest quality review report
 *   POST /api/harness/sprint          → trigger on-demand sprint contract run
 */

import { Router }             from "express";
import { requireReviewAuth }  from "../middleware/reviewAuth";
import { runNightlyKBValidation } from "./adversarialKBValidator";
import { runWeeklyQualityReview } from "./clinicalQualityReviewLoop";
import { SprintContractExecutor } from "./sprintContractSystem";
import { db }                 from "../db";
import { sql }                from "drizzle-orm";

export const harnessRouter = Router();

// ─── BullMQ worker registration ──────────────────────────────────────────────

export async function registerHarnessWorkers(): Promise<void> {
  try {
    const { createDurableQueue } = await import("../queue/queueFactory");
    const { Worker }             = await import("bullmq");
    const { default: IORedis }   = await import("ioredis");

    const connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });

    const harnessQueue = await createDurableQueue("harness");

    // ── Schedule nightly KB validation (2am UTC) ────────────────────────────
    await harnessQueue.add(
      "nightly-kb-validation",
      { type: "kb_validation" },
      { repeat: { cron: "0 2 * * *" }, jobId: "kb-validation-recurring" }
    );

    // ── Schedule weekly quality review (Monday 3am UTC) ─────────────────────
    await harnessQueue.add(
      "weekly-quality-review",
      { type: "quality_review" },
      { repeat: { cron: "0 3 * * 1" }, jobId: "quality-review-recurring" }
    );

    // ── Worker processes jobs ────────────────────────────────────────────────
    new Worker(
      "harness",
      async (job: any) => {
        const { type } = job.data;
        console.log(`[HarnessOrchestrator] Processing job: ${type}`);

        if (type === "kb_validation") {
          // Fetch rules from KB (stub — replace with actual KB query)
          const rules = await fetchKBRulesForValidation();
          await runNightlyKBValidation(rules);
        }

        if (type === "quality_review") {
          await runWeeklyQualityReview();
        }

        if (type === "sprint_contract") {
          const executor = new SprintContractExecutor();
          await executor.run(job.data.goal);
        }
      },
      {
        connection,
        concurrency: 1,   // one harness job at a time — they're expensive
      }
    );

    console.log("[HarnessOrchestrator] Workers registered — KB validation at 2am UTC, Quality review Monday 3am UTC");

  } catch (err: any) {
    console.warn("[HarnessOrchestrator] BullMQ unavailable — harness jobs will not run automatically:", err.message);
  }
}

// ─── KB rules fetcher stub ────────────────────────────────────────────────────
// Replace with actual KB query from your Google Sheets sync or kb_* tables

async function fetchKBRulesForValidation() {
  const rows = await db.execute(sql`
    SELECT id, rule_type, complaint_slug, condition_text, action_text, source_reference, last_reviewed_at
    FROM kb_rules
    WHERE active = true
    ORDER BY rule_type, complaint_slug
    LIMIT 50
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    id:          r.id?.toString() ?? "",
    type:        r.rule_type ?? "diagnosis",
    complaint:   r.complaint_slug ?? "",
    condition:   r.condition_text ?? "",
    action:      r.action_text ?? "",
    source:      r.source_reference,
    lastReviewed: r.last_reviewed_at,
  }));
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET /api/harness/status — last run status of all harnesses
harnessRouter.get(
  "/api/harness/status",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const [kbReport, qualityReport] = await Promise.all([
        db.execute(sql`SELECT run_id, run_at, physician_review_count FROM kb_validation_reports ORDER BY run_at DESC LIMIT 1`).catch(() => ({ rows: [] })),
        db.execute(sql`SELECT run_id, run_at, urgent_count FROM quality_review_reports ORDER BY run_at DESC LIMIT 1`).catch(() => ({ rows: [] })),
      ]);

      return res.json({
        ok: true,
        kbValidation: kbReport.rows[0] ?? null,
        qualityReview: qualityReport.rows[0] ?? null,
        schedule: {
          kbValidation:  "Nightly 2:00am UTC",
          qualityReview: "Monday 3:00am UTC",
          sprintContracts: "On-demand via POST /api/harness/sprint",
        },
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// GET /api/harness/kb-report — latest KB validation report
harnessRouter.get(
  "/api/harness/kb-report",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT report_json FROM kb_validation_reports
        ORDER BY run_at DESC LIMIT 1
      `).catch(() => ({ rows: [] }));

      if (!result.rows[0]) {
        return res.json({ ok: true, report: null, message: "No KB validation report yet — runs nightly at 2am UTC" });
      }

      return res.json({ ok: true, report: (result.rows[0] as any).report_json });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// GET /api/harness/quality-report — latest quality review report
harnessRouter.get(
  "/api/harness/quality-report",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT report_json FROM quality_review_reports
        ORDER BY run_at DESC LIMIT 1
      `).catch(() => ({ rows: [] }));

      if (!result.rows[0]) {
        return res.json({ ok: true, report: null, message: "No quality review report yet — runs Monday at 3am UTC" });
      }

      return res.json({ ok: true, report: (result.rows[0] as any).report_json });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// POST /api/harness/sprint — trigger on-demand sprint contract run
harnessRouter.post(
  "/api/harness/sprint",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { goal, clinicalScope, acceptanceCriteria } = req.body;

      if (!goal || !clinicalScope || !acceptanceCriteria?.length) {
        return res.status(400).json({
          ok:    false,
          error: "goal, clinicalScope, and acceptanceCriteria are required",
        });
      }

      // Queue async — sprint runs are long (minutes to hours)
      const { createDurableQueue } = await import("../queue/queueFactory");
      const harnessQueue = await createDurableQueue("harness");

      const job = await harnessQueue.add("sprint-contract", {
        type: "sprint_contract",
        goal: { goal, clinicalScope, acceptanceCriteria },
      });

      return res.json({
        ok:    true,
        jobId: job.id,
        message: "Sprint contract run queued. Check /api/harness/status for progress.",
      });

    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// POST /api/harness/kb-validate-now — trigger immediate KB validation (admin only)
harnessRouter.post(
  "/api/harness/kb-validate-now",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const rules = await fetchKBRulesForValidation();

      if (rules.length === 0) {
        return res.json({ ok: true, message: "No KB rules found to validate. Check kb_rules table." });
      }

      // Fire async — don't block the HTTP response
      runNightlyKBValidation(rules).catch(console.error);

      return res.json({
        ok:      true,
        message: `KB validation started for ${rules.length} rules. Check /api/harness/kb-report when complete.`,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);
