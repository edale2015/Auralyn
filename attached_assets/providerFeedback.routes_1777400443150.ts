// ─────────────────────────────────────────────────────────────────────────────
// NEW FILE — server/routes/providerFeedback.routes.ts
//
// Three endpoints powering ProviderFeedbackDashboard.tsx:
//   GET /api/provider/feedback           → grade + benchmark comparison + outlier flags
//   GET /api/provider/feedback/activity  → audit chain events for logged-in physician
//   GET /api/provider/feedback/trend     → 30-day volume + approval rate series
//
// Auth: requireReviewAuth on all routes — physician sees only their own data.
// Multi-tenant: all queries scoped to req.user.id (the actor field in audit chain).
// ─────────────────────────────────────────────────────────────────────────────

import { Router }           from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { db }               from "../db";
import { sql }              from "drizzle-orm";

// compareBenchmarks() is already built in benchmarkEngine.ts
// It accepts localMetrics and returns { grade, gradeLabel, metrics[], outlierFlags[] }
import { compareBenchmarks } from "../quality/benchmarkEngine";

export const providerFeedbackRouter = Router();


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 1 — GET /api/provider/feedback
// Returns: grade, gradeLabel, personal stats, benchmark metrics, outlier flags
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = req.user?.id ?? "phys1";

      // ── Pull physician's review actions from audit chain ──────────────────
      // actor is a top-level text column — direct filter, no jsonb needed
      const reviewEvents = await db.execute(sql`
        SELECT event_type, event_data, timestamp
        FROM   audit_hash_chain
        WHERE  actor = ${physicianId}
          AND  event_type IN (
            'CASE_APPROVED', 'CASE_MODIFIED', 'CASE_REJECTED',
            'CASE_ESCALATED', 'CASE_SIGNED_OFF'
          )
          AND  timestamp >= NOW() - INTERVAL '30 days'
        ORDER  BY timestamp DESC
      `);

      const rows = reviewEvents.rows as Array<{
        event_type: string;
        event_data: Record<string, unknown>;
        timestamp:  string;
      }>;

      // ── Compute personal metrics ──────────────────────────────────────────
      const total         = rows.length;
      const approvals     = rows.filter(r => r.event_type === "CASE_APPROVED").length;
      const modifications = rows.filter(r => r.event_type === "CASE_MODIFIED").length;
      const escalations   = rows.filter(r => r.event_type === "CASE_ESCALATED").length;
      const rejections    = rows.filter(r => r.event_type === "CASE_REJECTED").length;

      const approvalRate     = total ? approvals / total : 0;
      const modificationRate = total ? modifications / total : 0;
      const overrideRate     = total ? (modifications + rejections) / total : 0;

      // Average response time — stored in event_data.responseMs if present
      const responseTimes = rows
        .map(r => Number(r.event_data?.responseMs ?? 0))
        .filter(Boolean);
      const avgResponseMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

      // ── Pull AI accuracy signal ───────────────────────────────────────────
      // "physician agreed with AI" = CASE_APPROVED without modification
      const aiAgreements = rows.filter(r =>
        r.event_type === "CASE_APPROVED" &&
        !r.event_data?.modified
      ).length;
      const physicianAgree = total ? aiAgreements / total : 0;

      // ── Build localMetrics for compareBenchmarks() ────────────────────────
      // Shape must match what benchmarkEngine.compareBenchmarks() expects
      const localMetrics = {
        accuracy:            approvalRate,       // proxy: cases approved without modification
        responseTimeMs:      avgResponseMs,
        safetyRate:          1 - (rejections / Math.max(total, 1)),
        firstCallResolution: approvalRate,
        physicianAgree,
        denialRate:          rejections / Math.max(total, 1),
      };

      // ── Get grade + benchmark comparison ─────────────────────────────────
      const benchmarkResult = compareBenchmarks(localMetrics);

      // ── Detect outlier flags vs physician's own prior 30-day baseline ─────
      // Compare last 7 days vs days 8–30 for each metric
      const recentRows = rows.filter(r =>
        new Date(r.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
      const olderRows = rows.filter(r =>
        new Date(r.timestamp) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      const outlierFlags: Array<{
        metric: string;
        deviation: number;
        direction: "higher" | "lower";
        interpretation: string;
        severity: "warning" | "info";
      }> = [];

      if (recentRows.length >= 3 && olderRows.length >= 5) {
        const recentApproval = recentRows.filter(r => r.event_type === "CASE_APPROVED").length / recentRows.length;
        const olderApproval  = olderRows.filter(r => r.event_type === "CASE_APPROVED").length / olderRows.length;
        const approvalDelta  = recentApproval - olderApproval;

        if (Math.abs(approvalDelta) > 0.15) {
          outlierFlags.push({
            metric:        "Approval rate",
            deviation:     Math.round(Math.abs(approvalDelta) * 100),
            direction:     approvalDelta > 0 ? "higher" : "lower",
            interpretation: approvalDelta > 0
              ? `Your approval rate is ${Math.round(Math.abs(approvalDelta) * 100)}% higher than your own recent baseline — review for AI over-reliance.`
              : `Your approval rate is ${Math.round(Math.abs(approvalDelta) * 100)}% lower than your own recent baseline — increased case complexity or AI calibration issue.`,
            severity: "warning",
          });
        }

        const recentOverride = (
          recentRows.filter(r => ["CASE_MODIFIED","CASE_REJECTED"].includes(r.event_type)).length
        ) / recentRows.length;
        const olderOverride = (
          olderRows.filter(r => ["CASE_MODIFIED","CASE_REJECTED"].includes(r.event_type)).length
        ) / olderRows.length;
        const overrideDelta = recentOverride - olderOverride;

        if (Math.abs(overrideDelta) > 0.12) {
          outlierFlags.push({
            metric:        "AI override rate",
            deviation:     Math.round(Math.abs(overrideDelta) * 100),
            direction:     overrideDelta > 0 ? "higher" : "lower",
            interpretation: overrideDelta > 0
              ? `Override rate up ${Math.round(Math.abs(overrideDelta) * 100)}% vs your baseline — consider whether AI calibration needs adjustment.`
              : `Override rate down ${Math.round(Math.abs(overrideDelta) * 100)}% vs baseline — consistent with improved AI accuracy or case mix change.`,
            severity: overrideDelta > 0.2 ? "warning" : "info",
          });
        }
      }

      // ── Pull physician name ───────────────────────────────────────────────
      const physicianRow = await db.execute(sql`
        SELECT name FROM physicians WHERE id = ${physicianId} LIMIT 1
      `).catch(() => ({ rows: [] }));
      const physicianName = (physicianRow.rows[0] as any)?.name ?? "Physician";

      return res.json({
        physicianId,
        physicianName,
        grade:            benchmarkResult.grade,
        gradeLabel:       benchmarkResult.gradeLabel,
        totalCases:       total,
        approvalRate,
        modificationRate,
        overrideRate,
        avgResponseMs,
        outlierFlags,
        metrics:          benchmarkResult.metrics,
      });

    } catch (e: any) {
      console.error("[ProviderFeedback] summary failed", e?.message);
      return res.status(500).json({ error: e?.message ?? "Failed to load feedback" });
    }
  }
);


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 2 — GET /api/provider/feedback/activity
// Returns last 50 audit events for the logged-in physician
// Includes: case actions + SOAP/eConsult/Discharge events from Wins 1–4
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback/activity",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = req.user?.id ?? "phys1";

      const result = await db.execute(sql`
        SELECT
          id,
          event_type   AS action,
          event_data   AS details,
          timestamp,
          event_data->>'entityId' AS "entityId"
        FROM   audit_hash_chain
        WHERE  actor = ${physicianId}
          AND  event_type IN (
            'CASE_APPROVED', 'CASE_MODIFIED', 'CASE_REJECTED',
            'CASE_ESCALATED', 'CASE_SIGNED_OFF',
            'SOAP_NOTE_GENERATED',
            'ECONSULT_ORDER_PLACED',
            'DISCHARGE_INSTRUCTIONS_SENT'
          )
        ORDER  BY timestamp DESC
        LIMIT  50
      `);

      return res.json({ events: result.rows });

    } catch (e: any) {
      console.error("[ProviderFeedback] activity failed", e?.message);
      return res.status(500).json({ error: e?.message ?? "Failed to load activity" });
    }
  }
);


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 3 — GET /api/provider/feedback/trend
// Returns 30 daily data points: { date, caseVolume, approvalRate }
// Used for the sparkline chart in the dashboard
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback/trend",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = req.user?.id ?? "phys1";

      // Aggregate by day using Postgres date_trunc
      const result = await db.execute(sql`
        SELECT
          DATE_TRUNC('day', timestamp::timestamptz) AS date,
          COUNT(*)                                  AS case_volume,
          SUM(CASE WHEN event_type = 'CASE_APPROVED' THEN 1 ELSE 0 END)::float
            / NULLIF(COUNT(*), 0)                   AS approval_rate
        FROM   audit_hash_chain
        WHERE  actor = ${physicianId}
          AND  event_type IN (
            'CASE_APPROVED', 'CASE_MODIFIED', 'CASE_REJECTED',
            'CASE_ESCALATED', 'CASE_SIGNED_OFF'
          )
          AND  timestamp >= NOW() - INTERVAL '30 days'
        GROUP  BY 1
        ORDER  BY 1 ASC
      `);

      const points = (result.rows as any[]).map(row => ({
        date:         new Date(row.date).toISOString().split("T")[0],
        caseVolume:   Number(row.case_volume),
        approvalRate: Number(row.approval_rate ?? 0),
      }));

      return res.json({ points });

    } catch (e: any) {
      console.error("[ProviderFeedback] trend failed", e?.message);
      return res.status(500).json({ error: e?.message ?? "Failed to load trend" });
    }
  }
);
