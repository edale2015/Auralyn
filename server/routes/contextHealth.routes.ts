/**
 * Context Health API — T024
 *
 * Exposes live telemetry from the context engineering layer:
 *   GET /api/context-health/summary      — 24-hour ring-buffer summary
 *   GET /api/context-health/memory       — recent clinical_memory writes
 *   GET /api/context-health/violations   — contract violations from buffer
 *   GET /api/context-health/prefix-hashes — stable prefix hashes per role
 *   GET /api/context-health/daily        — DB-persisted daily aggregates
 */

import { Router }       from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { requireRole }  from "../middleware/requireRole";
import {
  summarize24h,
  getRecentMetrics,
} from "../context/telemetry";
import { db }           from "../db";
import { sql }          from "drizzle-orm";

const router = Router();
const auth   = [requireReviewAuth, requireRole(["admin", "physician"])];

// ── 24-hour summary from in-process ring buffer ───────────────────────────────

router.get("/summary", ...auth, (_req, res) => {
  try {
    res.json({ ok: true, summary: summarize24h() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Raw recent metrics (last N) ───────────────────────────────────────────────

router.get("/recent", ...auth, (req, res) => {
  try {
    const windowMs = Number(req.query.window_ms ?? 60 * 60 * 1000); // default 1 h
    const metricFilter = req.query.metric ? String(req.query.metric) : null;
    let metrics = getRecentMetrics(windowMs);
    if (metricFilter) metrics = metrics.filter(m => m.metric.includes(metricFilter));
    res.json({ ok: true, count: metrics.length, metrics: metrics.slice(-500) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Contract violations ───────────────────────────────────────────────────────

router.get("/violations", ...auth, (_req, res) => {
  try {
    const all = getRecentMetrics();
    const violations = all
      .filter(m => m.metric === "auralyn.context.bus_contract_violation")
      .slice(-200)
      .map(m => ({
        role:          m.tags.role ?? "unknown",
        artifact_type: m.tags.artifact_type ?? "unknown",
        encounterId:   m.encounterId ?? null,
        occurredAt:    m.timestamp,
      }));
    res.json({ ok: true, count: violations.length, violations });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Recent clinical_memory writes ─────────────────────────────────────────────

router.get("/memory", ...auth, async (_req, res) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT id, scope, key, confidence, status, source,
             retrieved_count, created_at, updated_at
      FROM   clinical_memory
      ORDER  BY updated_at DESC
      LIMIT  100
    `);
    res.json({ ok: true, count: rows.length, entries: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DB-persisted daily aggregates ─────────────────────────────────────────────

router.get("/daily", ...auth, async (req, res) => {
  try {
    const days = Number(req.query.days ?? 7);
    const { rows } = await db.execute(sql`
      SELECT metric_date, metric_name,
             metric_value_p50, metric_value_p95, metric_value_p99, count
      FROM   context_metrics_daily
      WHERE  metric_date >= CURRENT_DATE - ${days}::int
      ORDER  BY metric_date DESC, metric_name
      LIMIT  500
    `);
    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
