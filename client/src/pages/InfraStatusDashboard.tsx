/**
 * InfraStatusDashboard.tsx
 * client/src/pages/InfraStatusDashboard.tsx
 *
 * Real-time view of Auralyn's six critical services.
 * Shows health status, failure counts, last heartbeat, and incident history.
 *
 * Route: /infra-status (admin only)
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Activity, Database, Wifi,
  Clock, Brain, Radar, Zap,
} from "lucide-react";

interface ServiceHealth {
  service:      string;
  status:       "healthy" | "degraded" | "down" | "unknown";
  lastChecked:  string;
  lastHealthy:  string | null;
  failureCount: number;
  details:      string;
  error?:       string;
}

interface InfraStatus {
  services:   Record<string, ServiceHealth>;
  lastRunAt:  string;
  allHealthy: boolean;
  incidents:  Array<{
    incidentId:       string;
    service:          string;
    detectedAt:       string;
    resolvedAt?:      string;
    succeeded:        boolean;
    requiresHuman:    boolean;
    diagnosisSummary: string;
  }>;
}

function statusIcon(status: string) {
  switch (status) {
    case "healthy":  return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "degraded": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "down":     return <XCircle className="h-4 w-4 text-red-500" />;
    default:         return <Activity className="h-4 w-4 text-gray-400" />;
  }
}

function serviceIcon(name: string) {
  if (name.includes("postgres"))  return <Database className="h-3.5 w-3.5" />;
  if (name.includes("bullmq"))    return <Zap className="h-3.5 w-3.5" />;
  if (name.includes("websocket")) return <Wifi className="h-3.5 w-3.5" />;
  if (name.includes("drift"))     return <Activity className="h-3.5 w-3.5" />;
  if (name.includes("radar"))     return <Radar className="h-3.5 w-3.5" />;
  if (name.includes("skill"))     return <Brain className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

function serviceLabel(name: string): string {
  const labels: Record<string, string> = {
    postgres_pool:            "PostgreSQL Connection Pool",
    bullmq_follow_up_worker:  "Follow-Up Message Worker",
    websocket_multimodal:     "WebSocket Multimodal Gateway",
    drift_canary_scheduler:   "Drift Canary Scheduler",
    research_radar_scheduler: "Research Radar Scheduler",
    skill_nudge_scheduler:    "Skill Nudge Scheduler",
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "healthy":  return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700";
    case "degraded": return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700";
    case "down":     return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700";
    default:         return "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600";
  }
}

function formatTime(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1)    return "Just now";
  if (diffMin < 60)   return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function InfraStatusDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey:        ["/api/infra/status"],
    queryFn:         () => apiRequest<InfraStatus>("GET", "/api/infra/status"),
    refetchInterval: 60_000,
  });

  const services        = data ? Object.values(data.services) : [];
  const healthyCount    = services.filter(s => s.status === "healthy").length;
  const degradedCount   = services.filter(s => s.status === "degraded").length;
  const downCount       = services.filter(s => s.status === "down").length;
  const recentIncidents = (data?.incidents ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Infrastructure Status
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Self-healing monitor · 6 critical services · checks every 5 minutes
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 text-xs"
            data-testid="button-refresh-infra"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Overall status banner */}
        {!isLoading && (
          <Card className={`border ${
            data?.allHealthy
              ? "border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20"
              : downCount > 0
              ? "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20"
              : "border-yellow-200 bg-yellow-50/30 dark:border-yellow-800 dark:bg-yellow-950/20"
          }`}>
            <CardContent className="py-3 flex items-center gap-3">
              {data?.allHealthy
                ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                : downCount > 0
                ? <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                : <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
              }
              <div>
                <p className={`text-sm font-semibold ${
                  data?.allHealthy ? "text-green-800 dark:text-green-300"
                    : downCount > 0 ? "text-red-800 dark:text-red-300"
                    : "text-yellow-800 dark:text-yellow-300"
                }`}>
                  {data?.allHealthy
                    ? "All systems operational"
                    : downCount > 0
                    ? `${downCount} service${downCount !== 1 ? "s" : ""} down — auto-remediation attempted`
                    : `${degradedCount} service${degradedCount !== 1 ? "s" : ""} degraded`
                  }
                </p>
                <p className="text-xs text-gray-500">
                  {healthyCount}/{services.length} healthy · Last check: {formatTime(data?.lastRunAt ?? null)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service grid */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              {[1,2,3,4,5,6].map(i => (
                <Card key={i}><CardContent className="py-4"><div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-2/3" /></CardContent></Card>
              ))}
            </div>
          ) : services.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Activity className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Health checks starting up…</p>
                <p className="text-xs text-gray-400 mt-1">First check runs 30 seconds after server start.</p>
              </CardContent>
            </Card>
          ) : (
            services.map(svc => (
              <Card
                key={svc.service}
                className={`border ${svc.status === "down" ? "border-red-200 dark:border-red-800" : svc.status === "degraded" ? "border-yellow-200 dark:border-yellow-800" : "border-gray-200 dark:border-gray-700"}`}
                data-testid={`service-card-${svc.service}`}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {statusIcon(svc.status)}
                      <span className="text-xs text-gray-500">{serviceIcon(svc.service)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                          {serviceLabel(svc.service)}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">{svc.details}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {svc.failureCount > 0 && (
                        <span className="text-[10px] text-red-500">{svc.failureCount} failures</span>
                      )}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeClass(svc.status)}`}>
                        {svc.status}
                      </Badge>
                    </div>
                  </div>
                  {svc.error && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 pl-6">{svc.error}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 pl-6 text-[10px] text-gray-400">
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Checked {formatTime(svc.lastChecked)}
                    </span>
                    {svc.lastHealthy && (
                      <span>Last healthy: {formatTime(svc.lastHealthy)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recent incidents */}
        {recentIncidents.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Recent Self-Healing Activity
            </h2>
            <div className="space-y-1.5">
              {recentIncidents.map(inc => (
                <div
                  key={inc.incidentId}
                  className={`border rounded px-3 py-2 text-xs ${
                    inc.succeeded
                      ? "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20"
                      : "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20"
                  }`}
                  data-testid={`incident-${inc.incidentId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {inc.succeeded
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      }
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {serviceLabel(inc.service)}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">{formatTime(inc.detectedAt)}</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5 pl-5">
                    {inc.succeeded ? "✓ Auto-resolved" : "⚠ Requires manual intervention"}{" "}
                    — {inc.diagnosisSummary?.slice(0, 120)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
