// ── Replay Routes ──────────────────────────────────────────────────────────────
//
// POST /api/replay/:traceId  — re-execute a historical case and compare outputs
// GET  /api/replay/:traceId/trace — fetch the original audit trace only

import { Router }       from "express";
import { replayEngine } from "../replay/replayEngine";
import { pool }         from "../db";
import { requireRole }  from "../middleware/requireRole";

export const replayRouter = Router();

// ── POST /:traceId — full replay ──────────────────────────────────────────────
replayRouter.post(
  "/:traceId",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const { traceId } = req.params;
    if (!traceId || traceId.length < 4) {
      res.status(400).json({ error: "Invalid traceId" });
      return;
    }

    try {
      const result = await replayEngine.replay(traceId);
      res.json(result);
    } catch (err: any) {
      const is404 = err.message?.includes("No audit trace found");
      res.status(is404 ? 404 : 500).json({ error: err.message });
    }
  }
);

// ── GET /:traceId/trace — raw audit trace ─────────────────────────────────────
replayRouter.get(
  "/:traceId/trace",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const { traceId } = req.params;
    try {
      const result = await pool.query(
        `SELECT id, trace_id, step, input, output, metadata, created_at, hash
         FROM audit_logs WHERE trace_id = $1 ORDER BY id ASC`,
        [traceId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: `No trace found for traceId: ${traceId}` });
        return;
      }
      res.json({ traceId, steps: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
