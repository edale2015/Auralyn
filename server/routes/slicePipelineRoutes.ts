/**
 * server/routes/slicePipelineRoutes.ts
 * Slice pipeline orchestration endpoints:
 *
 *   POST /api/slice-pipeline/openai-review/:sliceId      — run OpenAI review on Claude findings
 *   POST /api/slice-pipeline/build-proposals/:sliceId    — create slice proposals from OAI review
 *   POST /api/slice-pipeline/validate-proposal/:id       — validate a proposal
 *   POST /api/slice-pipeline/approve-proposal/:id        — human approve a proposal
 *   POST /api/slice-pipeline/reject-proposal/:id         — reject a proposal
 *   POST /api/slice-pipeline/export-proposal/:id         — export to GitHub + Replit
 *   GET  /api/slice-pipeline/proposals/:sliceId          — list proposals for a slice
 *   GET  /api/slice-pipeline/proposal/:id                — get a single proposal
 */

import express                               from "express";
import { reviewClaudeSliceWithOpenAI }       from "../research/openaiSliceReview";
import { buildSliceProposals }               from "../research/sliceProposalBuilder";
import { validateSliceProposal }             from "../research/sliceValidation";
import { approveSliceProposal, rejectSliceProposal } from "../research/sliceApproval";
import { exportSliceProposalToGitHubAndReplit } from "../research/sliceGitHubReplitExport";
import { db }                                from "../db";
import { sliceProposals, reviewSlices }      from "../../shared/schema";
import { eq }                                from "drizzle-orm";

const router = express.Router();

/* ── OpenAI review for a slice ─────────────────────────────────────────── */
router.post("/openai-review/:sliceId", async (req, res) => {
  try {
    const result = await reviewClaudeSliceWithOpenAI(req.params.sliceId);
    res.json({ ok: true, review: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Build proposals from OAI review ──────────────────────────────────── */
router.post("/build-proposals/:sliceId", async (req, res) => {
  try {
    const proposals = await buildSliceProposals(req.params.sliceId);
    res.json({ ok: true, proposals });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Validate a proposal ───────────────────────────────────────────────── */
router.post("/validate-proposal/:proposalId", async (req, res) => {
  try {
    const result = await validateSliceProposal(Number(req.params.proposalId));
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Approve a proposal ────────────────────────────────────────────────── */
router.post("/approve-proposal/:proposalId", async (req, res) => {
  try {
    const result = await approveSliceProposal(
      Number(req.params.proposalId),
      String(req.body.approvedBy || ""),
    );
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Reject a proposal ─────────────────────────────────────────────────── */
router.post("/reject-proposal/:proposalId", async (req, res) => {
  try {
    const result = await rejectSliceProposal(
      Number(req.params.proposalId),
      String(req.body.rejectedBy || ""),
      String(req.body.reason || ""),
    );
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Export to GitHub + Replit ─────────────────────────────────────────── */
router.post("/export-proposal/:proposalId", async (req, res) => {
  try {
    const result = await exportSliceProposalToGitHubAndReplit(
      Number(req.params.proposalId),
    );
    res.json({ ok: true, export: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── List proposals for a slice ────────────────────────────────────────── */
router.get("/proposals/:sliceId", async (req, res) => {
  try {
    const sliceRows = await db
      .select()
      .from(reviewSlices)
      .where(eq(reviewSlices.sliceId, req.params.sliceId));

    if (!sliceRows.length) {
      return res.status(404).json({ ok: false, error: "Slice not found" });
    }

    const proposals = await db
      .select()
      .from(sliceProposals)
      .where(eq(sliceProposals.reviewSliceId, sliceRows[0].id));

    res.json({ ok: true, proposals });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Get a single proposal ─────────────────────────────────────────────── */
router.get("/proposal/:proposalId", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(sliceProposals)
      .where(eq(sliceProposals.id, Number(req.params.proposalId)));

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Proposal not found" });
    }
    res.json({ ok: true, proposal: rows[0] });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

export default router;
