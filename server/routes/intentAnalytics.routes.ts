/**
 * intentAnalytics.routes.ts
 * server/routes/intentAnalytics.routes.ts
 *
 * Backend for the Intent Analytics Dashboard.
 * Reads COMMAND_INTENT_LOGGED events from the audit chain and aggregates them.
 *
 * Also serves /api/command/suggestions — the four suggested commands
 * that appear when the command interface opens idle. Updates based on
 * what physicians actually use (the adaptation loop).
 */

import { Router }           from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { db }               from "../db";
import { sql }              from "drizzle-orm";

export const intentAnalyticsRouter = Router();

const ALL_INTENT_CATEGORIES = [
  "QUEUE_VIEW", "CASE_ACTION", "FOLLOWUP_VIEW", "PERFORMANCE",
  "EHR_CONTEXT", "PRIOR_AUTH", "TELEMED_VIEW", "DISCHARGE", "ECONSULT",
  "FOLLOWUP_ENROLL", "CLINICAL_SKILLS", "RESEARCH_RADAR", "INFRA_STATUS",
  "KB_VALIDATION", "SPEC_STATUS", "DRIFT_STATUS", "CME_QUIZ", "DESIGN_AUDIT",
];

// GET /api/command/analytics
intentAnalyticsRouter.get(
  "/api/command/analytics",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          event_data->>'category'  AS category,
          COUNT(*)::integer         AS total_calls,
          SUM(CASE WHEN (event_data->>'succeeded')::boolean THEN 1 ELSE 0 END)::integer AS succeeded,
          SUM(CASE WHEN timestamp::timestamptz >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::integer AS last_7,
          SUM(CASE WHEN timestamp::timestamptz BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::integer AS prev_7
        FROM audit_hash_chain
        WHERE event_type = 'COMMAND_INTENT_LOGGED'
          AND timestamp::timestamptz >= NOW() - INTERVAL '30 days'
          AND event_data->>'category' IS NOT NULL
          AND event_data->>'category' != 'UNKNOWN'
        GROUP BY 1
        ORDER BY total_calls DESC
        LIMIT 20
      `).catch(() => ({ rows: [] }));

      const stats = (rows.rows as any[]).map(r => {
        const total     = Number(r.total_calls);
        const succeeded = Number(r.succeeded);
        const last7     = Number(r.last_7);
        const prev7     = Number(r.prev_7);
        const trend: "up" | "down" | "stable" =
          last7 > prev7 * 1.2 ? "up" :
          last7 < prev7 * 0.8 ? "down" : "stable";

        return {
          category:    r.category,
          totalCalls:  total,
          succeeded,
          failed:      total - succeeded,
          successRate: total > 0 ? succeeded / total : 0,
          trend,
        };
      });

      const usedCategories   = new Set(stats.map(s => s.category));
      const unusedCategories = ALL_INTENT_CATEGORIES.filter(c => !usedCategories.has(c));

      const totalRow = await db.execute(sql`
        SELECT COUNT(*)::integer AS total
        FROM audit_hash_chain
        WHERE event_type = 'COMMAND_INTENT_LOGGED'
          AND timestamp::timestamptz >= NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ total: 0 }] }));

      return res.json({
        period:               "Last 30 days",
        totalCommands:        Number((totalRow.rows[0] as any)?.total ?? 0),
        uniqueCategories:     usedCategories.size,
        topCategories:        stats.filter(s => s.successRate >= 0.7).slice(0, 8),
        lowSuccessCategories: stats.filter(s => s.successRate < 0.7 && s.totalCalls >= 3),
        unusedCategories,
      });

    } catch (e: any) {
      return res.status(500).json({ error: e?.message });
    }
  }
);

// GET /api/command/suggestions
// Returns dynamically ordered suggestions based on recent usage.
intentAnalyticsRouter.get(
  "/api/command/suggestions",
  requireReviewAuth,
  async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT event_data->>'category' AS category, COUNT(*) AS cnt
        FROM audit_hash_chain
        WHERE event_type = 'COMMAND_INTENT_LOGGED'
          AND timestamp::timestamptz >= NOW() - INTERVAL '7 days'
          AND event_data->>'category' IS NOT NULL
          AND event_data->>'category' != 'UNKNOWN'
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 4
      `).catch(() => ({ rows: [] }));

      const CATEGORY_EXAMPLE_COMMANDS: Record<string, { label: string; icon: string; command: string }> = {
        QUEUE_VIEW:      { label: "Show urgent cases",          icon: "🔴", command: "show me all urgent cases waiting for review" },
        FOLLOWUP_VIEW:   { label: "Follow-up escalations",      icon: "⚠️",  command: "show follow-up patients who need attention" },
        PERFORMANCE:     { label: "My performance this week",   icon: "📊", command: "how am I doing this week vs benchmarks" },
        INFRA_STATUS:    { label: "System health",              icon: "🔧", command: "is everything running" },
        CLINICAL_SKILLS: { label: "Pending clinical skills",    icon: "🧠", command: "show pending clinical skills" },
        DRIFT_STATUS:    { label: "Drift canary results",       icon: "📡", command: "did the drift canaries pass last night" },
        CASE_ACTION:     { label: "Review async cases",         icon: "📋", command: "show async safe cases I can batch review" },
        CME_QUIZ:        { label: "Start CME quiz",             icon: "🎓", command: "quiz me on red flag recognition" },
        RESEARCH_RADAR:  { label: "Research readiness",         icon: "🔬", command: "check research radar status" },
      };

      const DEFAULT_SUGGESTIONS = [
        { label: "Show urgent queue",          icon: "🔴", command: "show me all urgent cases waiting for review" },
        { label: "Async cases only",           icon: "📋", command: "show async safe cases I can batch review" },
        { label: "My performance this week",   icon: "📊", command: "how am I doing this week vs benchmarks" },
        { label: "Follow-up escalations",      icon: "⚠️",  command: "show follow-up patients who need attention" },
      ];

      const topCategories = (rows.rows as any[]).map(r => r.category);

      if (topCategories.length < 4) {
        return res.json({ suggestions: DEFAULT_SUGGESTIONS });
      }

      const suggestions = topCategories
        .map(cat => CATEGORY_EXAMPLE_COMMANDS[cat])
        .filter(Boolean)
        .slice(0, 4);

      return res.json({
        suggestions: suggestions.length >= 4 ? suggestions : DEFAULT_SUGGESTIONS,
      });

    } catch {
      return res.json({ suggestions: [] });
    }
  }
);
