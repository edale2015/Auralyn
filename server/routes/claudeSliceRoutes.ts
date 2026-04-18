/**
 * server/routes/claudeSliceRoutes.ts
 * Endpoints for Claude slice management:
 *   GET  /api/claude-slices/              — list all review slices
 *   GET  /api/claude-slices/:sliceId      — get one slice + its Claude + OpenAI reviews
 *   POST /api/claude-slices/submit-findings — store Claude findings for a slice
 *   POST /api/claude-slices/create        — create a new review slice definition
 */

import express            from "express";
import { db }             from "../db";
import {
  reviewSlices,
  claudeSliceReviews,
  openaiSliceReviews,
  sliceProposals,
}                         from "../../shared/schema";
import { eq }             from "drizzle-orm";

const router = express.Router();

/* ── List all review slices ────────────────────────────────────────────── */
router.get("/", async (_req, res) => {
  try {
    const slices = await db.select().from(reviewSlices);

    // Attach summary counts per slice
    const enriched = await Promise.all(
      slices.map(async (s) => {
        const [claudeCount]   = await db
          .select()
          .from(claudeSliceReviews)
          .where(eq(claudeSliceReviews.reviewSliceId, s.id));
        const [openaiCount]   = await db
          .select()
          .from(openaiSliceReviews)
          .where(eq(openaiSliceReviews.reviewSliceId, s.id));
        const proposals        = await db
          .select()
          .from(sliceProposals)
          .where(eq(sliceProposals.reviewSliceId, s.id));

        return {
          ...s,
          claudeReviewCount:  claudeCount ? 1 : 0,
          openaiReviewCount:  openaiCount ? 1 : 0,
          proposalCount:      proposals.length,
        };
      }),
    );

    res.json({ ok: true, slices: enriched });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Get one slice with all associated reviews ─────────────────────────── */
router.get("/:sliceId", async (req, res) => {
  try {
    const sliceRows = await db
      .select()
      .from(reviewSlices)
      .where(eq(reviewSlices.sliceId, req.params.sliceId));

    if (!sliceRows.length) {
      return res.status(404).json({ ok: false, error: "Slice not found" });
    }

    const slice       = sliceRows[0];
    const claudeReviews = await db
      .select()
      .from(claudeSliceReviews)
      .where(eq(claudeSliceReviews.reviewSliceId, slice.id));
    const oaiReviews  = await db
      .select()
      .from(openaiSliceReviews)
      .where(eq(openaiSliceReviews.reviewSliceId, slice.id));
    const proposals   = await db
      .select()
      .from(sliceProposals)
      .where(eq(sliceProposals.reviewSliceId, slice.id));

    res.json({ ok: true, slice, claudeReviews, openaiReviews: oaiReviews, proposals });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Create a new review slice definition ──────────────────────────────── */
router.post("/create", async (req, res) => {
  try {
    const { sliceId, title, prompt, files, exportPath } = req.body;
    if (!sliceId || !title || !prompt) {
      return res.status(400).json({ ok: false, error: "sliceId, title, and prompt are required" });
    }

    const [inserted] = await db
      .insert(reviewSlices)
      .values({ sliceId, title, prompt, files: files ?? [], exportPath: exportPath ?? null })
      .returning();

    res.json({ ok: true, slice: inserted });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Submit Claude findings for a slice ────────────────────────────────── */
router.post("/submit-findings", async (req, res) => {
  try {
    const { sliceId, claudeFindings } = req.body;
    if (!sliceId || !claudeFindings) {
      return res.status(400).json({ ok: false, error: "sliceId and claudeFindings are required" });
    }

    const sliceRows = await db
      .select()
      .from(reviewSlices)
      .where(eq(reviewSlices.sliceId, sliceId));

    if (!sliceRows.length) {
      return res.status(404).json({ ok: false, error: `Slice not found: ${sliceId}` });
    }

    const [inserted] = await db
      .insert(claudeSliceReviews)
      .values({
        reviewSliceId:  sliceRows[0].id,
        claudeFindings: claudeFindings.trim(),
        status:         "completed",
      })
      .returning();

    res.json({ ok: true, review: inserted });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

export default router;
