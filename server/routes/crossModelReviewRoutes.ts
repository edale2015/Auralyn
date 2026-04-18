/**
 * server/routes/crossModelReviewRoutes.ts
 * Cross-model review endpoints (non-slice, full-article path):
 *
 *   POST /api/cross-model/review            — run Claude → OpenAI review
 *   GET  /api/cross-model/reviews           — list all cross-model reviews
 *   GET  /api/cross-model/reviews/:id       — get one review
 *   POST /api/cross-model/convert/:id       — convert review to proposed_upgrades
 *   POST /api/cross-model/export-replit/:proposalId — export proposal → GitHub + Replit
 */

import express                               from "express";
import { db }                                from "../db";
import { crossModelReviews }                 from "../../shared/schema";
import { eq }                                from "drizzle-orm";
import { sendClaudeFindingsToOpenAI, convertOpenAIReviewToProposals } from "../research/crossModelCoordinator";
import { exportProposalForGitHubThenReplit } from "../research/exportToGitHubAndReplit";

const router = express.Router();

/* ── Trigger Claude → OpenAI review ───────────────────────────────────── */
router.post("/review", async (req, res) => {
  try {
    const { articleId, claudeRecommendations, relevantCode, articleSummary } = req.body;

    if (!claudeRecommendations?.trim()) {
      return res.status(400).json({ ok: false, error: "claudeRecommendations is required" });
    }

    const inserted = await sendClaudeFindingsToOpenAI({
      articleId:             articleId ? Number(articleId) : undefined,
      claudeRecommendations: claudeRecommendations.trim(),
      relevantCode:          relevantCode ?? {},
      articleSummary:        articleSummary ?? undefined,
    });

    res.json({ ok: true, review: inserted });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── List all cross-model reviews ──────────────────────────────────────── */
router.get("/reviews", async (_req, res) => {
  try {
    const reviews = await db
      .select()
      .from(crossModelReviews);
    res.json({ ok: true, reviews });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Get one cross-model review (singular alias for UI) ───────────────── */
router.get("/review/:id", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(crossModelReviews)
      .where(eq(crossModelReviews.id, Number(req.params.id)));
    if (!rows.length) return res.status(404).json({ ok: false, error: "Review not found" });
    res.json({ ok: true, review: rows[0] });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Get one cross-model review ────────────────────────────────────────── */
router.get("/reviews/:id", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(crossModelReviews)
      .where(eq(crossModelReviews.id, Number(req.params.id)));

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Review not found" });
    }
    res.json({ ok: true, review: rows[0] });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Convert OAI review → proposed_upgrades ───────────────────────────── */
router.post("/convert/:id", async (req, res) => {
  try {
    const proposals = await convertOpenAIReviewToProposals(Number(req.params.id));
    res.json({ ok: true, proposals });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Export proposal to GitHub then Replit ─────────────────────────────── */
router.post("/export-replit/:proposalId", async (req, res) => {
  try {
    const result = await exportProposalForGitHubThenReplit(
      Number(req.params.proposalId),
    );
    res.json({ ok: true, export: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

export default router;
