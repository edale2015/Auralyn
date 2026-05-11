/**
 * AURALYN — Longevity Intelligence Routes
 * Mount at: /api/longevity
 */

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { query } from "../db";
import { LongevityIntelligenceAgent } from "../agents/LongevityIntelligenceAgent";
import { appendAuditEvent } from "../audit/hashChain";

const router = Router();

// ── GET /api/longevity/findings ───────────────────────────────────────────────
// List findings. Filter: ?relevance=high&reviewed=false&limit=50
router.get("/findings", requireRole(["physician", "admin"]), async (req, res) => {
  try {
    const { relevance, reviewed, search, limit = "50" } = req.query;

    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let n = 0;

    if (relevance) {
      conditions.push(`clinical_relevance = $${++n}`);
      params.push(relevance);
    }
    if (reviewed !== undefined) {
      conditions.push(`physician_reviewed = $${++n}`);
      params.push(reviewed === "true");
    }
    if (search) {
      conditions.push(`(treatment ILIKE $${++n} OR summary ILIKE $${n})`);
      params.push(`%${search}%`);
    }

    params.push(Math.min(Number(limit) || 50, 200));
    const sql = `
      SELECT * FROM longevity_findings
      WHERE ${conditions.join(" AND ")}
      ORDER BY evidence_score DESC, scan_date DESC
      LIMIT $${++n}
    `;

    const result = await query(sql, params);
    res.json({ findings: result.rows, total: result.rowCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/longevity/findings/high-evidence ─────────────────────────────────
// RCT-level and above (score ≥ 0.85)
router.get("/findings/high-evidence", requireRole(["physician", "admin"]), async (_req, res) => {
  try {
    const result = await query(
      `SELECT * FROM longevity_findings
       WHERE evidence_score >= 0.85
       ORDER BY evidence_score DESC, scan_date DESC
       LIMIT 20`
    );
    res.json({ findings: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/longevity/stats ──────────────────────────────────────────────────
// Aggregate stats for dashboard cards
router.get("/stats", requireRole(["physician", "admin"]), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE evidence_score >= 0.85)        AS high_evidence,
        COUNT(*) FILTER (WHERE physician_reviewed = FALSE)    AS unreviewed,
        COUNT(*) FILTER (WHERE clinical_relevance = 'high')   AS high_relevance,
        ROUND(AVG(evidence_score)::numeric, 3)               AS avg_score,
        MAX(scan_date)                                        AS last_scan
      FROM longevity_findings
    `);
    res.json(result.rows[0] ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/longevity/findings/:id/review ──────────────────────────────────
// Physician marks a finding as reviewed with optional notes
router.patch("/findings/:id/review", requireRole(["physician", "admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const user = (req as any).authUser;

    await query(
      `UPDATE longevity_findings
       SET physician_reviewed = TRUE,
           physician_notes    = $1,
           reviewed_by        = $2,
           reviewed_at        = NOW()
       WHERE id = $3`,
      [notes ?? null, user?.email ?? user?.id ?? "physician", id]
    );

    await appendAuditEvent({
      event_type: "LONGEVITY_FINDING_REVIEWED",
      userId:     user?.id,
      findingId:  id,
      notes,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/longevity/scan/trigger ──────────────────────────────────────────
// Admin triggers a manual scan (async — returns immediately)
router.post("/scan/trigger", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).authUser;
  const agent = new LongevityIntelligenceAgent();

  agent.run().catch((err: any) => {
    console.error("[LongevityAgent] Manual scan failed:", err?.message);
  });

  await appendAuditEvent({
    event_type: "LONGEVITY_SCAN_TRIGGERED",
    triggeredBy: user?.email ?? user?.id ?? "admin",
    startedAt: new Date().toISOString(),
  });

  res.json({
    message:   "Longevity scan started. Results appear in /api/longevity/findings within 10–15 minutes.",
    startedAt: new Date().toISOString(),
  });
});

// ── GET /api/longevity/scan/history ───────────────────────────────────────────
// Last 10 scan runs from audit trail
router.get("/scan/history", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const result = await query(
      `SELECT data, created_at FROM audit_logs
       WHERE data->>'event_type' = 'LONGEVITY_SCAN_COMPLETE'
       ORDER BY created_at DESC
       LIMIT 10`
    );
    res.json({ history: result.rows });
  } catch (err: any) {
    // Graceful fallback — audit_logs schema may vary
    res.json({ history: [] });
  }
});

export default router;
