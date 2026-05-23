/**
 * routingTelemetry.routes.ts — T019
 *
 * GET /api/model-telemetry  — returns last 200 routing decisions as JSON
 *   Query params:
 *     ?agent=<name>     filter by agent name
 *     ?pinned=true|false filter by pinned status
 *     ?limit=<n>        default 200, max 1000
 */

import { Router } from "express";
import { Pool } from "pg";

export const routingTelemetryRouter = Router();

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

routingTelemetryRouter.get("/api/model-telemetry", async (req, res) => {
  try {
    const agent  = typeof req.query.agent  === "string" ? req.query.agent  : null;
    const pinned = typeof req.query.pinned === "string" ? req.query.pinned : null;
    const limit  = Math.min(1000, parseInt(String(req.query.limit ?? "200"), 10) || 200);

    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (agent) {
      conditions.push(`agent = $${params.length + 1}`);
      params.push(agent);
    }
    if (pinned !== null) {
      conditions.push(`pinned = $${params.length + 1}`);
      params.push(pinned === "true");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);

    const { rows } = await getPool().query(
      `SELECT id, agent, chosen_model, pinned, score, encounter_id, created_at
       FROM routing_telemetry
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json(rows);
  } catch (err: any) {
    console.error("[RoutingTelemetry] GET /api/model-telemetry error:", err.message);
    res.status(500).json({ error: "Failed to fetch routing telemetry" });
  }
});
