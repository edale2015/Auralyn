import type { Router, Request, Response } from "express";
import { z } from "zod";
import { requireProviderAuth } from "../auth";
import { runRcSuite, DEFAULT_VARIANTS, type RcVariant } from "../rc/rcRunner";
import { replayRun, replayFromPack } from "../rc/replayRunner";
import { exportReplayPack, getReplayPackStore } from "../rc/replayPacks";
import { runWeeklyImprovement } from "../rc/weeklyImprovement";
import { getAllComplaintDataSets, validateMinimumDataSet } from "../rules/minimumDataSet";
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

  router.post("/api/replay-packs/export/:runId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const pack = await exportReplayPack(req.params.runId);
      res.json({ ok: true, pack });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/replay-packs/:packId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const pack = await getReplayPackStore().getById(req.params.packId);
      if (!pack) {
        return res.status(404).json({ ok: false, error: "Replay pack not found" });
      }
      res.json({ ok: true, pack });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/replay-packs", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const packs = await getReplayPackStore().list(50);
      res.json({ ok: true, packs });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/replay-packs/:packId/run", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const pack = await getReplayPackStore().getById(req.params.packId);
      if (!pack) {
        return res.status(404).json({ ok: false, error: "Replay pack not found" });
      }

      const parsed = ReplayBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid replay config", details: parsed.error.issues });
      }

      const snapshot = pack.caseStateSnapshot || {};
      const packData = {
        packId: pack.id,
        sourceRunId: pack.sourceRunId,
        chiefComplaint: (snapshot.chiefComplaint as string) || pack.chiefComplaint || "unknown",
        answers: pack.answers,
        scenarioId: pack.scenarioId || undefined,
        originalNormalized: (snapshot.normalized as any) || {
          disposition: (snapshot.disposition as string) || "unknown",
          diagnosis: (snapshot.dx as string[]) || [],
          scores: (snapshot.scores as Record<string, number>) || {},
          redFlags: (snapshot.redFlags as string[]) || [],
        },
      };

      const result = await replayFromPack(packData, parsed.data);
      res.json({ ok: true, packId: pack.id, ...result });
    } catch (err: any) {
      console.error("[ReplayPack] Run error:", err);
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/mds/registry", requireProviderAuth, async (_req: Request, res: Response) => {
    res.json({ ok: true, dataSets: getAllComplaintDataSets() });
  });

  router.post("/api/rc/weekly-improvement", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const report = await runWeeklyImprovement();
      res.json({ ok: true, report });
    } catch (err: any) {
      console.error("[WeeklyImprovement] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}
