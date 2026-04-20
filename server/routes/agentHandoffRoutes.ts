/**
 * server/routes/agentHandoffRoutes.ts
 * REST API for the Agent Handoff pipeline.
 *
 * Routes:
 *   GET  /api/agent-handoffs               — list all handoffs (with summary)
 *   GET  /api/agent-handoffs/pending-count  — badge count for sidebar
 *   GET  /api/agent-handoffs/:id            — full detail for one handoff
 *   POST /api/agent-handoffs/:id/approve    — human approves → status = approved
 *   POST /api/agent-handoffs/:id/reject     — human rejects → status = rejected
 *   POST /api/agent-handoffs/:id/implemented — agent marks as done
 */

import { Router }            from "express";
import { db }                from "../db";
import { agentHandoffs }     from "../../shared/schema";
import { eq, desc }          from "drizzle-orm";
import {
  approveHandoff,
  rejectHandoff,
  markHandoffImplemented,
  countPendingApprovals,
  countApprovedForAgent,
} from "../research/agentHandoffBuilder";

const router = Router();

// ── Badge count (sidebar) ─────────────────────────────────────────────────
router.get("/pending-count", async (_req, res) => {
  try {
    const pendingApproval = await countPendingApprovals();
    const approvedForAgent = await countApprovedForAgent();
    res.json({ pendingApproval, approvedForAgent, total: pendingApproval + approvedForAgent });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── List all handoffs ─────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id:             agentHandoffs.id,
        articleId:      agentHandoffs.articleId,
        articleTitle:   agentHandoffs.articleTitle,
        articleUrl:     agentHandoffs.articleUrl,
        pipelineStatus: agentHandoffs.pipelineStatus,
        humanApprovedBy: agentHandoffs.humanApprovedBy,
        humanApprovedAt: agentHandoffs.humanApprovedAt,
        createdAt:      agentHandoffs.createdAt,
      })
      .from(agentHandoffs)
      .orderBy(desc(agentHandoffs.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Full detail (everything for one handoff — used by approval page) ──────
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(agentHandoffs).where(eq(agentHandoffs.id, id));
    if (!row) return res.status(404).json({ error: "Handoff not found" });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Approve ───────────────────────────────────────────────────────────────
router.post("/:id/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const approvedBy = (req.body?.approvedBy as string) || "admin";
    const updated = await approveHandoff(id, approvedBy);
    res.json({ success: true, handoff: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Reject ────────────────────────────────────────────────────────────────
router.post("/:id/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reason = (req.body?.reason as string) || "Rejected by admin";
    const updated = await rejectHandoff(id, reason);
    res.json({ success: true, handoff: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Agent marks as implemented ────────────────────────────────────────────
router.post("/:id/implemented", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agentNotes = (req.body?.agentNotes as string) || "Implemented by agent";
    const updated = await markHandoffImplemented(id, agentNotes);
    res.json({ success: true, handoff: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
