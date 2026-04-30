/**
 * IntentAnalyticsDashboard.tsx
 * client/src/pages/IntentAnalyticsDashboard.tsx
 *
 * Architecture 7 analytics — shows which intents physicians actually express
 * vs which ones they try and abandon. Feeds:
 *   1. Command interface prioritization (which intents need better NL coverage)
 *   2. Clinical Skills loop (what physicians ask about = what skills to prioritize)
 *   3. DashboardContextPrompt optimization (which pre-filled commands get clicked)
 *
 * Route: /intent-analytics (admin only)
 */

import { useQuery }   from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }      from "@/components/ui/badge";
import {
  Terminal, TrendingUp, TrendingDown,
  BarChart3, CheckCircle2, XCircle,
} from "lucide-react";

interface IntentStat {
  category:    string;
  totalCalls:  number;
  succeeded:   number;
  failed:      number;
  successRate: number;
  trend:       "up" | "down" | "stable";
}

interface IntentAnalytics {
  period:               string;
  totalCommands:        number;
  uniqueCategories:     number;
  topCategories:        IntentStat[];
  lowSuccessCategories: IntentStat[];
  unusedCategories:     string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  QUEUE_VIEW:       "Show review queue",
  CASE_ACTION:      "Case approve/reject",
  FOLLOWUP_VIEW:    "Follow-up patients",
  PERFORMANCE:      "My performance",
  EHR_CONTEXT:      "Patient EHR context",
  PRIOR_AUTH:       "Prior authorization",
  TELEMED_VIEW:     "Telemedicine sessions",
  DISCHARGE:        "Discharge instructions",
  ECONSULT:         "eConsult referral",
  FOLLOWUP_ENROLL:  "Follow-up enrollment",
  CLINICAL_SKILLS:  "Clinical skills",
  RESEARCH_RADAR:   "Research radar",
  INFRA_STATUS:     "Infrastructure status",
  KB_VALIDATION:    "KB validation",
  SPEC_STATUS:      "Development specs",
  DRIFT_STATUS:     "Drift canaries",
  CME_QUIZ:         "CME quiz",
  DESIGN_AUDIT:     "Design audit",
  UNKNOWN:          "Unrecognized intent",
};

function IntentBar({ stat }: { stat: IntentStat }) {
  const label      = CATEGORY_LABELS[stat.category] ?? stat.category;
  const successPct = Math.round(stat.successRate * 100);
  const barColor   =
    stat.successRate >= 0.8 ? "bg-green-500" :
    stat.successRate >= 0.5 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-1.5" data-testid={`intent-bar-${stat.category}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-700 font-medium">{label}</span>
        <div className="flex items-center gap-2 text-gray-500">
          <span data-testid={`calls-${stat.category}`}>{stat.totalCalls} calls</span>
          <span
            className={`font-semibold ${successPct >= 80 ? "text-green-600" : successPct >= 50 ? "text-yellow-600" : "text-red-600"}`}
            data-testid={`rate-${stat.category}`}
          >
            {successPct}%
          </span>
          {stat.trend === "up"   && <TrendingUp   className="h-3 w-3 text-green-500" />}
          {stat.trend === "down" && <TrendingDown  className="h-3 w-3 text-red-500"   />}
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, (stat.totalCalls / 50) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function IntentAnalyticsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey:        ["/api/command/analytics"],
    queryFn:         () => apiRequest<IntentAnalytics>("GET", "/api/command/analytics"),
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Intent Analytics
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Which commands physicians actually use · Feeds the Clinical Skills learning loop
          </p>
        </div>

        {!isLoading && data && (
          <div className="grid grid-cols-3 gap-2" data-testid="summary-grid">
            {[
              { label: "Total Commands",          value: data.totalCommands,                 color: "text-blue-600"  },
              { label: "Intent Categories Used",  value: data.uniqueCategories,              color: "text-green-600" },
              { label: "Unused Categories",       value: data.unusedCategories?.length ?? 0, color: "text-gray-500"  },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
                <div className={`text-xl font-bold ${color}`} data-testid={`stat-${label.replace(/\s+/g, "-").toLowerCase()}`}>{value}</div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Most Used Commands
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
              </div>
            ) : data?.topCategories?.length ? (
              data.topCategories.map(stat => <IntentBar key={stat.category} stat={stat} />)
            ) : (
              <p className="text-xs text-gray-500" data-testid="empty-state">
                No command analytics yet. Start using ⌘K and check back.
              </p>
            )}
          </CardContent>
        </Card>

        {(data?.lowSuccessCategories?.length ?? 0) > 0 && (
          <Card className="border-amber-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-amber-500" />
                Commands Needing Improvement
              </CardTitle>
              <p className="text-xs text-amber-600 mt-0.5">
                These intents are being expressed but the system isn't routing them well.
                Add better natural language coverage or surface them as suggestions.
              </p>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {data!.lowSuccessCategories.map(stat => <IntentBar key={stat.category} stat={stat} />)}
            </CardContent>
          </Card>
        )}

        {(data?.unusedCategories?.length ?? 0) > 0 && (
          <Card className="border-gray-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-gray-400" />
                Unused Intent Categories
              </CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                These capabilities exist but physicians haven't discovered them.
                Consider adding them to suggestions or onboarding.
              </p>
            </CardHeader>
            <CardContent className="pb-3 flex flex-wrap gap-1.5">
              {data!.unusedCategories.map(cat => (
                <Badge key={cat} variant="outline" className="text-[10px] text-gray-400" data-testid={`unused-${cat}`}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="py-3">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Architecture 7 adaptation loop:</strong> Intent analytics show which commands
              physicians naturally express. Low-success categories surface gaps in natural language
              coverage. Unused categories surface discoverability gaps. Both feed the Clinical Skills
              learning loop — the system learns which intents matter most from actual physician behavior,
              not from assumptions.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
