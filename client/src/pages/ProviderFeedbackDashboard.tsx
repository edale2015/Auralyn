/**
 * ProviderFeedbackDashboard.tsx
 *
 * Personal physician performance dashboard. Shows:
 *   1. National benchmark comparison (letter grade + per-metric status)
 *   2. Personal activity feed from audit chain (SOAP / eConsult / Discharge events)
 *   3. Case volume + approval rate trend (last 30 days)
 *   4. Outlier flags — where physician deviates from their own recent baseline
 */

import { useQuery } from "@tanstack/react-query";
import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Activity,
  FileSignature,
  Stethoscope,
  ClipboardList,
  Clock,
  BarChart2,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkMetric {
  label:          string;
  physicianValue: number;
  nationalValue:  number;
  status:         "above" | "at" | "below";
  unit:           string;
  higherIsBetter: boolean;
  interpretation: string;
}

interface OutlierFlag {
  metric:         string;
  deviation:      number;
  direction:      "higher" | "lower";
  interpretation: string;
  severity:       "warning" | "info";
}

interface FeedbackSummary {
  physicianId:      string;
  physicianName:    string;
  grade:            "A" | "B" | "C" | "D" | "F";
  gradeLabel:       string;
  totalCases:       number;
  approvalRate:     number;
  modificationRate: number;
  overrideRate:     number;
  avgResponseMs:    number;
  outlierFlags:     OutlierFlag[];
  metrics:          BenchmarkMetric[];
}

interface ActivityEvent {
  id:        number;
  action:    string;
  entityId:  string;
  timestamp: string;
  details:   Record<string, unknown>;
}

interface TrendPoint {
  date:         string;
  caseVolume:   number;
  approvalRate: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case "A": return "bg-green-600";
    case "B": return "bg-blue-600";
    case "C": return "bg-yellow-500";
    case "D": return "bg-orange-500";
    case "F": return "bg-red-600";
    default:  return "bg-gray-500";
  }
}

function statusIcon(status: string, higherIsBetter: boolean) {
  const isGood = status === "above" ? higherIsBetter : !higherIsBetter;
  if (status === "at") return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  return isGood
    ? <TrendingUp   className="h-3.5 w-3.5 text-green-600" />
    : <TrendingDown className="h-3.5 w-3.5 text-red-500"   />;
}

function statusBadgeClass(status: string, higherIsBetter: boolean) {
  const isGood = status === "above" ? higherIsBetter : !higherIsBetter;
  if (status === "at") return "bg-gray-100 text-gray-600 border-gray-300";
  return isGood
    ? "bg-green-50 text-green-700 border-green-300"
    : "bg-red-50 text-red-700 border-red-300";
}

function actionIcon(action: string) {
  switch (action) {
    case "SOAP_NOTE_GENERATED":          return <FileSignature className="h-3.5 w-3.5 text-blue-500"   />;
    case "ECONSULT_ORDER_PLACED":        return <Stethoscope   className="h-3.5 w-3.5 text-indigo-500" />;
    case "DISCHARGE_INSTRUCTIONS_SENT":  return <ClipboardList className="h-3.5 w-3.5 text-green-500"  />;
    case "CASE_APPROVED":                return <CheckCircle2  className="h-3.5 w-3.5 text-green-600"  />;
    case "CASE_MODIFIED":                return <Activity      className="h-3.5 w-3.5 text-amber-500"  />;
    case "CASE_REJECTED":                return <AlertTriangle className="h-3.5 w-3.5 text-red-500"    />;
    default:                             return <Activity      className="h-3.5 w-3.5 text-gray-400"   />;
  }
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    SOAP_NOTE_GENERATED:         "SOAP note generated",
    ECONSULT_ORDER_PLACED:       "eConsult referral submitted",
    DISCHARGE_INSTRUCTIONS_SENT: "Discharge instructions sent",
    CASE_APPROVED:               "Case approved",
    CASE_MODIFIED:               "Case modified",
    CASE_REJECTED:               "Case rejected",
    CASE_ESCALATED:              "Case escalated",
    CASE_SIGNED_OFF:             "Case signed off",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase();
}

function formatTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMs(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── CSS-only sparkline ───────────────────────────────────────────────────────

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (!points.length) return (
    <p className="text-xs text-gray-400 text-center py-4">No activity in the last 30 days.</p>
  );

  const maxVol = Math.max(...points.map(p => p.caseVolume), 1);

  return (
    <div className="flex items-end gap-0.5 h-12 w-full" aria-label="30-day case volume trend">
      {points.map((p, i) => {
        const heightPct     = Math.max((p.caseVolume / maxVol) * 100, 4);
        const approvalColor =
          p.approvalRate >= 0.8 ? "bg-green-400" :
          p.approvalRate >= 0.6 ? "bg-yellow-400" : "bg-red-400";
        return (
          <div
            key={i}
            title={`${p.date}: ${p.caseVolume} cases, ${Math.round(p.approvalRate * 100)}% approval`}
            className={`rounded-t flex-1 ${approvalColor} opacity-80 hover:opacity-100 transition-opacity`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="py-6 space-y-3">
            <div className="h-4 bg-gray-100 rounded w-1/3" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProviderFeedbackDashboard() {

  const summaryQuery  = useQuery<FeedbackSummary>({
    queryKey:     ["/api/provider/feedback"],
    refetchInterval: 60_000,
  });

  const activityQuery = useQuery<{ events: ActivityEvent[] }>({
    queryKey:     ["/api/provider/feedback/activity"],
    refetchInterval: 30_000,
  });

  const trendQuery    = useQuery<{ points: TrendPoint[] }>({
    queryKey:     ["/api/provider/feedback/trend"],
    refetchInterval: 60_000,
  });

  const isLoading = summaryQuery.isLoading || activityQuery.isLoading || trendQuery.isLoading;
  const summary   = summaryQuery.data;
  const events    = activityQuery.data?.events ?? [];
  const trend     = trendQuery.data?.points ?? [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6" data-testid="page-provider-feedback">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              My Performance Dashboard
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Personal clinical activity · national benchmark comparison · last 30 days
            </p>
          </div>
          <button
            onClick={() => {
              summaryQuery.refetch();
              activityQuery.refetch();
              trendQuery.refetch();
            }}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            data-testid="btn-refresh-dashboard"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {isLoading && <DashboardSkeleton />}

        {!isLoading && summary && (
          <DashboardContextPrompt
            context="performance"
            data={{
              grade:        summary.grade,
              overrideRate: summary.overrideRate,
              totalCases:   summary.totalCases,
            }}
          />
        )}

        {!isLoading && summary && (
          <>
            {/* 1. Grade + outlier flags */}
            <Section
              title="Performance Grade"
              icon={<BarChart2 className="h-4 w-4 text-gray-500" />}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`${gradeColor(summary.grade)} text-white rounded-xl w-16 h-16 flex items-center justify-center shrink-0`}
                  data-testid="grade-badge"
                >
                  <span className="text-3xl font-bold">{summary.grade}</span>
                </div>

                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-800">{summary.gradeLabel}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
                    <span data-testid="stat-total-cases">{summary.totalCases} cases reviewed</span>
                    <span>·</span>
                    <span data-testid="stat-approval-rate">{Math.round(summary.approvalRate * 100)}% approval rate</span>
                    <span>·</span>
                    <span data-testid="stat-override-rate">{Math.round(summary.overrideRate * 100)}% AI override rate</span>
                    <span>·</span>
                    <span data-testid="stat-response-time">Avg response {formatMs(summary.avgResponseMs)}</span>
                  </div>

                  {summary.outlierFlags?.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {summary.outlierFlags.map((flag, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-1.5 text-xs rounded p-1.5 border ${
                            flag.severity === "warning"
                              ? "bg-amber-50 border-amber-200 text-amber-800"
                              : "bg-blue-50 border-blue-200 text-blue-800"
                          }`}
                          data-testid={`outlier-flag-${i}`}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>
                            <span className="font-medium">{flag.metric}: </span>
                            {flag.interpretation}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {summary.outlierFlags?.length === 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      No outlier patterns detected in your recent decisions.
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* 2. National benchmark metrics */}
            <Section
              title="National Benchmark Comparison"
              icon={<Activity className="h-4 w-4 text-gray-500" />}
            >
              <div className="space-y-2">
                {summary.metrics.map((metric, i) => (
                  <div key={i} data-testid={`metric-row-${i}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {statusIcon(metric.status, metric.higherIsBetter)}
                        <span className="text-xs text-gray-700 truncate">{metric.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-gray-900">
                          {metric.unit === "ms"
                            ? formatMs(metric.physicianValue)
                            : `${Math.round(metric.physicianValue * 100)}%`
                          }
                        </span>
                        <span className="text-[10px] text-gray-400">
                          vs {metric.unit === "ms"
                            ? formatMs(metric.nationalValue)
                            : `${Math.round(metric.nationalValue * 100)}%`
                          } national
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${statusBadgeClass(metric.status, metric.higherIsBetter)}`}
                        >
                          {metric.status}
                        </Badge>
                      </div>
                    </div>
                    {metric.interpretation && (
                      <p className="text-[10px] text-gray-400 pl-5 mt-0.5">
                        {metric.interpretation}
                      </p>
                    )}
                    {i < summary.metrics.length - 1 && <Separator className="mt-2" />}
                  </div>
                ))}
              </div>
            </Section>

            {/* 3. 30-day volume trend */}
            <Section
              title="30-Day Case Volume"
              icon={<BarChart2 className="h-4 w-4 text-gray-500" />}
            >
              <Sparkline points={trend} />
              <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-green-400" />
                  ≥80% approval
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-yellow-400" />
                  60–79% approval
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-red-400" />
                  &lt;60% approval
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Hover over bars for daily detail. Bar height = case volume. Color = approval rate.
              </p>
            </Section>

            {/* 4. Personal activity feed */}
            <Section
              title="My Recent Activity"
              icon={<Clock className="h-4 w-4 text-gray-500" />}
            >
              {events.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  No audit events found for your account yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 20).map((event, i) => (
                    <div
                      key={event.id ?? i}
                      className="flex items-start gap-2 text-xs"
                      data-testid={`activity-event-${i}`}
                    >
                      <span className="shrink-0 mt-0.5">{actionIcon(event.action)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-800 font-medium">
                            {actionLabel(event.action)}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {formatTs(event.timestamp)}
                          </span>
                        </div>
                        <div className="text-gray-500 text-[10px] mt-0.5 flex flex-wrap gap-2">
                          {event.entityId && <span>Case {event.entityId}</span>}
                          {event.details?.specialty && (
                            <span>· {String(event.details.specialty).replace(/_/g, " ")}</span>
                          )}
                          {event.details?.charCount && (
                            <span>· {String(event.details.charCount)} chars</span>
                          )}
                          {event.details?.channel && (
                            <span>· via {String(event.details.channel)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {/* Error state */}
        {!isLoading && summaryQuery.isError && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Failed to load performance data.</p>
              <button
                onClick={() => summaryQuery.refetch()}
                className="text-xs text-blue-600 underline mt-2"
                data-testid="btn-retry"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
