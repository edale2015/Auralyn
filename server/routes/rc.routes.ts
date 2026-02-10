import type { Router, Request, Response } from "express";
import { z } from "zod";
import { requireProviderAuth } from "../auth";
import { runRcSuite, DEFAULT_VARIANTS, type RcVariant } from "../rc/rcRunner";
import { replayRun } from "../rc/replayRunner";
import {
  getQualityReviewStore,
  QualityRatingSchema,
  REVIEW_REASONS,
} from "../analytics/qualityReview";

const ReplayBodySchema = z.object({
  toneProfile: z.string().optional(),
  llmEnabled: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  seed: z.number().optional(),
});

const VALID_REASONS = new Set(REVIEW_REASONS);

const ReviewBodySchema = z.object({
  rating: QualityRatingSchema,
  reason: z.string().optional().refine(
    (r) => !r || VALID_REASONS.has(r as any),
    { message: `Reason must be one of: ${REVIEW_REASONS.join(", ")}` }
  ),
});

export function registerRcRoutes(router: Router) {
  router.post("/api/rc/run", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const report = await runRcSuite();
      res.json({ ok: true, report });
    } catch (err: any) {
      console.error("[RC] Suite run error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/rc/variants", requireProviderAuth, async (_req: Request, res: Response) => {
    res.json({ ok: true, variants: DEFAULT_VARIANTS });
  });

  router.post("/api/replay/:runId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const parsed = ReplayBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid replay config", details: parsed.error.issues });
      }

      const result = await replayRun(req.params.runId, parsed.data);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Replay] Error:", err);
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/traces/:runId/review", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const parsed = ReviewBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid review", details: parsed.error.issues });
      }

      const review = {
        runId: req.params.runId,
        rating: parsed.data.rating,
        reason: parsed.data.reason,
        reviewedAt: new Date().toISOString(),
      };

      await getQualityReviewStore().save(review);
      res.json({ ok: true, review });
    } catch (err: any) {
      console.error("[Review] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/traces/:runId/review", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const review = await getQualityReviewStore().getByRunId(req.params.runId);
      res.json({ ok: true, review });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/quality-reviews", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const summary = await getQualityReviewStore().getSummary();
      res.json({ ok: true, ...summary });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/review-reasons", requireProviderAuth, async (_req: Request, res: Response) => {
    res.json({ ok: true, reasons: REVIEW_REASONS });
  });
}
