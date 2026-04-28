// ─────────────────────────────────────────────────────────────────────────────
// server/routes/providerFeedback.routes.ts
//
// Three endpoints powering ProviderFeedbackDashboard.tsx:
//   GET /api/provider/feedback           → grade + benchmark comparison + outlier flags
//   GET /api/provider/feedback/activity  → audit chain events for logged-in physician
//   GET /api/provider/feedback/trend     → 30-day volume + approval rate series
//
// Auth: requireReviewAuth on all routes — physician sees only their own data.
// ─────────────────────────────────────────────────────────────────────────────

import { Router }            from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { db }                from "../db";
import { sql }               from "drizzle-orm";
// BUG FIX: patch used "../quality/benchmarkEngine" — actual path is ../analytics/benchmarkEngine
import { compareBenchmarks } from "../analytics/benchmarkEngine";

export const providerFeedbackRouter = Router();

// Metadata for mapping BenchmarkComparison → BenchmarkMetric shape the frontend expects
const METRIC_META: Record<string, { unit: string; higherIsBetter: boolean }> = {
  "Diagnostic Accuracy":    { unit: "%",  higherIsBetter: true  },
  "Avg Response Time (ms)": { unit: "ms", higherIsBetter: false },
  "Safety Check Rate":      { unit: "%",  higherIsBetter: true  },
  "First-Call Resolution":  { unit: "%",  higherIsBetter: true  },
  "Physician Agreement":    { unit: "%",  higherIsBetter: true  },
  "Insurance Denial Rate":  { unit: "%",  higherIsBetter: false },
};


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 1 — GET /api/provider/feedback
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = (req as any).user?.id ?? "phys1";

      // Pull physician's review actions from audit chain
      // actor is a top-level text column — direct filter, no jsonb needed
      const reviewEvents = await db.execute(sql`
        SELECT event_type, event_data, timestamp
        FROM   audit_hash_chain
        WHERE  actor = ${physicianId}
          AND  event_type IN (
            'CASE_APPROVED', 'CASE_MODIFIED', 'CASE_REJECTED',
            'CASE_ESCALATED', 'CASE_SIGNED_OFF'
          )
          AND  timestamp::timestamptz >= NOW() - INTERVAL '30 days'
        ORDER  BY timestamp DESC
      `);

      const rows = (reviewEvents.rows ?? reviewEvents) as Array<{
        event_type: string;
        event_data: Record<string, unknown>;
        timestamp:  string;
      }>;

      // Compute personal metrics
      const total         = rows.length;
      const approvals     = rows.filter(r => r.event_type === "CASE_APPROVED").length;
      const modifications = rows.filter(r => r.event_type === "CASE_MODIFIED").length;
      const escalations   = rows.filter(r => r.event_type === "CASE_ESCALATED").length;
      const rejections    = rows.filter(r => r.event_type === "CASE_REJECTED").length;

      const approvalRate     = total ? approvals / total : 0;
      const modificationRate = total ? modifications / total : 0;
      const overrideRate     = total ? (modifications + rejections) / total : 0;

      const responseTimes = rows
        .map(r => Number(r.event_data?.responseMs ?? 0))
        .filter(Boolean);
      const avgResponseMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

      const aiAgreements = rows.filter(r =>
        r.event_type === "CASE_APPROVED" && !r.event_data?.modified
      ).length;
      const physicianAgree = total ? aiAgreements / total : 0;

      const localMetrics = {
        accuracy:            approvalRate,
        responseTimeMs:      avgResponseMs,
        safetyRate:          1 - (rejections / Math.max(total, 1)),
        firstCallResolution: approvalRate,
        physicianAgree,
        denialRate:          rejections / Math.max(total, 1),
      };

      // BUG FIX: compareBenchmarks() returns { overallGrade, summary, comparisons }
      // NOT { grade, gradeLabel, metrics } — map the shape correctly
      const benchmarkResult = compareBenchmarks(localMetrics);

      const grade      = benchmarkResult.overallGrade;           // "A"|"B"|"C"|"D"|"F"
      const gradeLabel = benchmarkResult.summary;                // human-readable summary string
      const metrics    = benchmarkResult.comparisons.map(c => ({
        label:          c.metric,
        physicianValue: c.local,
        nationalValue:  c.national,
        status:         c.status,
        unit:           METRIC_META[c.metric]?.unit           ?? "%",
        higherIsBetter: METRIC_META[c.metric]?.higherIsBetter ?? true,
        interpretation: c.interpretation,
      }));

      // Outlier detection — last 7 days vs days 8–30 (own baseline)
      const recentRows = rows.filter(r =>
        new Date(r.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
      const olderRows = rows.filter(r =>
        new Date(r.timestamp) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      const outlierFlags: Array<{
        metric:         string;
        deviation:      number;
        direction:      "higher" | "lower";
        interpretation: string;
        severity:       "warning" | "info";
      }> = [];

      if (recentRows.length >= 3 && olderRows.length >= 5) {
        const recentApproval = recentRows.filter(r => r.event_type === "CASE_APPROVED").length / recentRows.length;
        const olderApproval  = olderRows.filter(r => r.event_type === "CASE_APPROVED").length / olderRows.length;
        const approvalDelta  = recentApproval - olderApproval;

        if (Math.abs(approvalDelta) > 0.15) {
          outlierFlags.push({
            metric:         "Approval rate",
            deviation:      Math.round(Math.abs(approvalDelta) * 100),
            direction:      approvalDelta > 0 ? "higher" : "lower",
            interpretation: approvalDelta > 0
              ? `Your approval rate is ${Math.round(Math.abs(approvalDelta) * 100)}% higher than your own recent baseline — review for AI over-reliance.`
              : `Your approval rate is ${Math.round(Math.abs(approvalDelta) * 100)}% lower than your own recent baseline — increased case complexity or AI calibration issue.`,
            severity: "warning",
          });
        }

        const recentOverride = recentRows.filter(r =>
          ["CASE_MODIFIED", "CASE_REJECTED"].includes(r.event_type)
        ).length / recentRows.length;
        const olderOverride = olderRows.filter(r =>
          ["CASE_MODIFIED", "CASE_REJECTED"].includes(r.event_type)
        ).length / olderRows.length;
        const overrideDelta = recentOverride - olderOverride;

        if (Math.abs(overrideDelta) > 0.12) {
          outlierFlags.push({
            metric:         "AI override rate",
            deviation:      Math.round(Math.abs(overrideDelta) * 100),
            direction:      overrideDelta > 0 ? "higher" : "lower",
            interpretation: overrideDelta > 0
              ? `Override rate up ${Math.round(Math.abs(overrideDelta) * 100)}% vs your baseline — consider whether AI calibration needs adjustment.`
              : `Override rate down ${Math.round(Math.abs(overrideDelta) * 100)}% vs baseline — consistent with improved AI accuracy or case mix change.`,
            severity: overrideDelta > 0.2 ? "warning" : "info",
          });
        }
      }

      // Physician name lookup — graceful fallback if id is non-numeric
      const physicianRow = await db.execute(sql`
        SELECT name FROM physicians WHERE id::text = ${String(physicianId)} LIMIT 1
      `).catch(() => ({ rows: [] }));
      const physicianName = ((physicianRow.rows ?? physicianRow) as any[])[0]?.name ?? "Physician";

      return res.json({
        physicianId,
        physicianName,
        grade,
        gradeLabel,
        totalCases:       total,
        approvalRate,
        modificationRate,
        overrideRate,
        avgResponseMs,
        outlierFlags,
        metrics,
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
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback/activity",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = (req as any).user?.id ?? "phys1";

      const result = await db.execute(sql`
        SELECT
          id,
          event_type                      AS action,
          event_data                      AS details,
          timestamp,
          event_data->>'entityId'         AS "entityId"
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

      return res.json({ events: result.rows ?? result });

    } catch (e: any) {
      console.error("[ProviderFeedback] activity failed", e?.message);
      return res.status(500).json({ error: e?.message ?? "Failed to load activity" });
    }
  }
);


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE 3 — GET /api/provider/feedback/trend
// Returns 30 daily data points: { date, caseVolume, approvalRate }
// ═══════════════════════════════════════════════════════════════════════════════

providerFeedbackRouter.get(
  "/api/provider/feedback/trend",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = (req as any).user?.id ?? "phys1";

      const result = await db.execute(sql`
        SELECT
          DATE_TRUNC('day', timestamp::timestamptz)      AS date,
          COUNT(*)                                       AS case_volume,
          SUM(CASE WHEN event_type = 'CASE_APPROVED' THEN 1 ELSE 0 END)::float
            / NULLIF(COUNT(*), 0)                        AS approval_rate
        FROM   audit_hash_chain
        WHERE  actor = ${physicianId}
          AND  event_type IN (
            'CASE_APPROVED', 'CASE_MODIFIED', 'CASE_REJECTED',
            'CASE_ESCALATED', 'CASE_SIGNED_OFF'
          )
          AND  timestamp::timestamptz >= NOW() - INTERVAL '30 days'
        GROUP  BY 1
        ORDER  BY 1 ASC
      `);

      const points = ((result.rows ?? result) as any[]).map(row => ({
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
