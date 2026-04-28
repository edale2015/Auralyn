/**
 * FollowUpMonitoringDashboard.tsx
 * Route: /follow-up-monitoring
 *
 * Shows all enrolled patients + their latest follow-up response status.
 */

import { useQuery } from "@tanstack/react-query";
import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  User,
  Activity,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatestResponse {
  id:                 number;
  checkInIndex:       number;
  responseType:       "responded" | "no_response" | "partial";
  deteriorationScore: number | null;
  escalated:          boolean;
  sentAt:             string;
  respondedAt:        string | null;
}

interface Enrollment {
  id:               number;
  caseId:           string;
  patientName:      string;
  complaintSlug:    string;
  status:           "active" | "completed" | "escalated" | "unresponsive" | "withdrawn";
  currentCheckIn:   number;
  totalCheckIns:    number;
  dischargedAt:     string;
  lastResponseAt:   string | null;
  latestResponse:   LatestResponse | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "active":      return <Badge className="text-[10px] bg-blue-600 text-white">Active</Badge>;
    case "completed":   return <Badge className="text-[10px] bg-green-600 text-white">Completed</Badge>;
    case "escalated":   return <Badge className="text-[10px] bg-red-600 text-white animate-pulse">Escalated</Badge>;
    case "unresponsive":return <Badge className="text-[10px] bg-orange-500 text-white">Unresponsive</Badge>;
    case "withdrawn":   return <Badge variant="outline" className="text-[10px]">Withdrawn</Badge>;
    default:            return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

function responseTypeBadge(type: string) {
  switch (type) {
    case "responded":   return <Badge className="text-[10px] bg-green-100 text-green-800 border border-green-300">Responded</Badge>;
    case "no_response": return <Badge className="text-[10px] bg-gray-100 text-gray-600 border border-gray-300">No response</Badge>;
    case "partial":     return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border border-yellow-300">Partial</Badge>;
    default:            return null;
  }
}

function deteriorationBar(score: number | null) {
  if (score === null) return null;
  const pct   = Math.round(score * 100);
  const color = pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-6">{pct}%</span>
    </div>
  );
}

function formatDate(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + " " + new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function complaintLabel(slug: string) {
  return slug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Enrollment card ──────────────────────────────────────────────────────────

function EnrollmentCard({ e }: { e: Enrollment }) {
  const isEscalated  = e.status === "escalated" || e.latestResponse?.escalated;
  const progressPct  = e.totalCheckIns > 0
    ? Math.round((e.currentCheckIn / e.totalCheckIns) * 100)
    : 0;

  return (
    <Card
      className={`border ${isEscalated ? "border-red-300 bg-red-50/30" : "border-gray-200"}`}
      data-testid={`enrollment-card-${e.id}`}
    >
      <CardContent className="py-3 px-4 space-y-2">

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <div>
              <span className="text-xs font-medium text-gray-800">{e.patientName}</span>
              <span className="text-[10px] text-gray-400 ml-2">Case {e.caseId}</span>
            </div>
          </div>
          {statusBadge(e.status)}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="font-medium text-gray-700">{complaintLabel(e.complaintSlug)}</span>
          <span>·</span>
          <span>Discharged {formatDate(e.dischargedAt)}</span>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <span>Check-in progress</span>
            <span>{e.currentCheckIn} / {e.totalCheckIns}</span>
          </div>
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {e.latestResponse && (
          <div className="bg-white border border-gray-100 rounded p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-gray-400" />
                <span className="text-[10px] text-gray-500">
                  Check-in {e.latestResponse.checkInIndex + 1} · {formatDate(e.latestResponse.sentAt)}
                </span>
              </div>
              {responseTypeBadge(e.latestResponse.responseType)}
            </div>

            {e.latestResponse.responseType === "responded" && (
              <div>
                <span className="text-[10px] text-gray-500">Deterioration score</span>
                {deteriorationBar(e.latestResponse.deteriorationScore)}
              </div>
            )}

            {e.latestResponse.escalated && (
              <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5 mt-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="font-medium">Escalation triggered — review required</span>
              </div>
            )}

            {e.latestResponse.respondedAt && (
              <div className="flex items-center gap-1 text-[10px] text-green-700">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Responded {formatDate(e.latestResponse.respondedAt)}
              </div>
            )}
          </div>
        )}

        {!e.latestResponse && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Clock className="h-3 w-3" />
            Awaiting first check-in
          </div>
        )}

      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FollowUpMonitoringDashboard() {
  const { data, isLoading, isError, refetch } = useQuery<{ ok: boolean; enrollments: Enrollment[] }>({
    queryKey: ["/api/followup/enrollments"],
    refetchInterval: 60_000,
  });

  const enrollments = data?.enrollments ?? [];
  const escalated   = enrollments.filter(e => e.status === "escalated" || e.latestResponse?.escalated);
  const active      = enrollments.filter(e => e.status === "active" && !e.latestResponse?.escalated);
  const completed   = enrollments.filter(e => e.status === "completed");

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Follow-Up Monitoring</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Chronic disease + post-acute follow-up · {enrollments.length} enrolled patients
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            data-testid="btn-refresh-followup"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <DashboardContextPrompt
          context="followup"
          data={{
            escalated: escalated.length,
            active:    active.length,
            completed: completed.length,
          }}
        />

        {enrollments.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Escalated", count: escalated.length, color: "text-red-600",   bg: "bg-red-50 border-red-200" },
              { label: "Active",    count: active.length,    color: "text-blue-600",  bg: "bg-blue-50 border-blue-200" },
              { label: "Completed", count: completed.length, color: "text-green-600", bg: "bg-green-50 border-green-200" },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={`border rounded p-2 text-center ${bg}`}>
                <div className={`text-lg font-bold ${color}`}>{count}</div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="py-4 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Failed to load enrollments.</p>
              <button onClick={() => refetch()} className="text-xs text-blue-600 underline mt-2">
                Retry
              </button>
            </CardContent>
          </Card>
        )}

        {escalated.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                Requires Attention ({escalated.length})
              </h2>
            </div>
            <div className="space-y-2">
              {escalated.map(e => <EnrollmentCard key={e.id} e={e} />)}
            </div>
          </section>
        )}

        {active.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Active Follow-Ups ({active.length})
              </h2>
            </div>
            <div className="space-y-2">
              {active.map(e => <EnrollmentCard key={e.id} e={e} />)}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Completed ({completed.length})
              </h2>
            </div>
            <div className="space-y-2">
              {completed.map(e => <EnrollmentCard key={e.id} e={e} />)}
            </div>
          </section>
        )}

        {!isLoading && !isError && enrollments.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No enrolled patients yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Patients are enrolled automatically when a case with a chronic protocol is approved.
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
