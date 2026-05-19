/**
 * Ingestion API routes.
 * POST /api/ingestion/dailymed       — on-demand DailyMed drug label lookup
 * POST /api/ingestion/cdc/sync       — manual CDC respiratory sync trigger
 * POST /api/ingestion/openfda/sync   — manual openFDA safety sync trigger
 * POST /api/ingestion/uspstf/sync    — manual USPSTF sync trigger
 * GET  /api/ingestion/audit          — last N audit log entries
 */

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();
const auth   = requireRole(["admin", "physician"]);

// ── DailyMed on-demand lookup ──────────────────────────────────────────────────
router.post("/dailymed", auth, async (req: any, res: any) => {
  try {
    const { rxcui, drugName, force } = req.body ?? {};
    if (!rxcui && !drugName) {
      return res.status(400).json({ error: "rxcui or drugName required" });
    }
    const { runDailyMedSync } = await import("../jobs/dailyMedSync");
    const result = await runDailyMedSync({ rxcui, drugName, force: !!force });
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── CDC respiratory manual trigger ────────────────────────────────────────────
router.post("/cdc/sync", auth, async (req: any, res: any) => {
  try {
    const { week } = req.body ?? {};
    const { runCdcRespiratorySync } = await import("../jobs/cdcRespiratorySync");
    const result = await runCdcRespiratorySync(week);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── openFDA safety manual trigger ─────────────────────────────────────────────
router.post("/openfda/sync", auth, async (req: any, res: any) => {
  try {
    const { runOpenFdaSafetySync } = await import("../jobs/openFdaSafetySync");
    const result = await runOpenFdaSafetySync();
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── USPSTF manual trigger ──────────────────────────────────────────────────────
router.post("/uspstf/sync", auth, async (req: any, res: any) => {
  try {
    const { runUspstfSync } = await import("../jobs/uspstfSync");
    const result = await runUspstfSync();
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Audit log viewer ───────────────────────────────────────────────────────────
router.get("/audit", auth, async (req: any, res: any) => {
  try {
    const limit    = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const sourceId = req.query.source_id as string | undefined;

    const rows = await db.execute(sql`
      SELECT id, source_id, fetched_at, url, http_status,
             payload_hash, payload_bytes, error, duration_ms
      FROM ingestion_audit
      ${sourceId ? sql`WHERE source_id = ${sourceId}` : sql``}
      ORDER BY fetched_at DESC
      LIMIT ${limit}
    `);

    return res.json({ ok: true, count: rows.rows.length, entries: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
