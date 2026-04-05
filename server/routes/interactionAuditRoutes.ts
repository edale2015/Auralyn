import { Router } from "express";
import {
  getInteractionFeed,
  getSessionMetricsList,
  getAuditStats,
  flagInteraction,
} from "../services/interactionAuditService";

const router = Router();

router.get("/api/audit/stats", async (_req, res) => {
  try {
    const stats = await getAuditStats();
    res.json({ ok: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/audit/interactions", async (req, res) => {
  try {
    const { limit, offset, channel, direction, flagged, since, sessionId } =
      req.query as Record<string, string>;

    const rows = await getInteractionFeed({
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      channel: channel || undefined,
      direction: direction || undefined,
      flaggedOnly: flagged === "true",
      since: since || undefined,
      sessionId: sessionId || undefined,
    });

    res.json({ ok: true, count: rows.length, interactions: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/audit/sessions", async (req, res) => {
  try {
    const { limit, channel, since } = req.query as Record<string, string>;
    const rows = await getSessionMetricsList({
      limit: limit ? parseInt(limit) : 50,
      channel: channel || undefined,
      since: since || undefined,
    });
    res.json({ ok: true, count: rows.length, sessions: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/audit/flag/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body as { reason: string };
    if (!reason) return res.status(400).json({ ok: false, error: "reason required" });
    await flagInteraction(id, reason);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
