import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Clock, Zap,
  MessageSquare, Phone, Database, Brain, RefreshCw, ShieldAlert,
  Wifi, WifiOff, BarChart3, Lock, Unlock,
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  ok: "text-green-600 dark:text-green-400",
  degraded: "text-yellow-600 dark:text-yellow-400",
  error: "text-red-600 dark:text-red-400",
  pending: "text-gray-400",
};

const STATUS_BG: Record<string, string> = {
  ok: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
  degraded: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800",
  error: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
  pending: "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700",
};

const BREAKER_COLOR: Record<string, string> = {
  closed: "bg-green-100 text-green-700",
  "half-open": "bg-yellow-100 text-yellow-700",
  open: "bg-red-100 text-red-700",
};

function StatusIcon({ status }: { status: string }) {
  const cls = `w-4 h-4 ${STATUS_COLOR[status] ?? "text-gray-400"}`;
  if (status === "ok") return <CheckCircle className={cls} />;
  if (status === "error") return <XCircle className={cls} />;
  if (status === "degraded") return <AlertTriangle className={cls} />;
  return <Clock className={cls} />;
}

function ServiceCard({ svc }: { svc: any }) {
  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${STATUS_BG[svc.status] ?? STATUS_BG.pending}`}>
      <StatusIcon status={svc.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm" data-testid={`service-name-${svc.name}`}>{svc.name}</span>
          <Badge variant="outline" className={`text-xs ${STATUS_COLOR[svc.status]}`} data-testid={`service-status-${svc.name}`}>
            {svc.status.toUpperCase()}
          </Badge>
          {svc.latencyMs !== null && (
            <span className="text-xs text-muted-foreground">{svc.latencyMs}ms</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{svc.detail}</p>
      </div>
    </div>
  );
}

function BreakerBadge({ state }: { state: string }) {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${BREAKER_COLOR[state] ?? "bg-gray-100 text-gray-600"}`}>
      {state === "closed" ? <Lock className="inline w-3 h-3 mr-1" /> : <Unlock className="inline w-3 h-3 mr-1" />}
      {state}
    </span>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">
        {value}
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </span>
    </div>
  );
}

export default function IntegrationHealthPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/integrations/health-dashboard"],
    refetchInterval: 30_000,
  });

  const health = data as any;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Integration Health Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time status of all external integrations, circuit breakers, and agentic subsystems
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-health"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading integration health data...
        </div>
      )}
      {isError && (
        <div className="flex items-center gap-2 text-red-600">
          <XCircle className="w-4 h-4" />
          Failed to load health data. Backend may be unreachable.
        </div>
      )}

      {health && (
        <>
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(health.timestamp).toLocaleTimeString()}
          </div>

          {/* Base connectivity — all external services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="w-4 h-4 text-blue-500" />
                External Service Connectivity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(health.base ?? []).map((svc: any) => (
                  <ServiceCard key={svc.name} svc={svc} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* OpenAI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  OpenAI / ChatGPT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Circuit Breaker</span>
                  <BreakerBadge state={health.openai?.breakerState?.state ?? "unknown"} />
                </div>
                <MetricRow label="Token budget used today"
                  value={`${health.openai?.tokenBudget?.pctUsed ?? 0}%`} />
                <Progress
                  value={health.openai?.tokenBudget?.pctUsed ?? 0}
                  className="h-1.5 mb-2"
                />
                <MetricRow label="Tokens used" value={(health.openai?.tokenBudget?.usedToday ?? 0).toLocaleString()} sub={`/ ${(health.openai?.tokenBudget?.budgetLimit ?? 0).toLocaleString()}`} />
                <MetricRow label="Error rate (last 100)" value={`${health.openai?.gptErrorRate ?? 0}%`} />
                <MetricRow label="Cache hit rate" value={`${health.openai?.gptCacheHitRate ?? 0}%`} />
                <MetricRow label="PHI events (24h)" value={health.openai?.phiEventsLast24h ?? 0} />
                <MetricRow label="Total calls tracked" value={(health.openai?.totalCallsTracked ?? 0).toLocaleString()} />
                {(health.openai?.phiEventsLast24h ?? 0) > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-amber-600 text-xs bg-amber-50 rounded p-2">
                    <ShieldAlert className="w-3 h-3" />
                    PHI detected and redacted in {health.openai.phiEventsLast24h} call(s) today
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Database */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  PostgreSQL Pool
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Circuit Breaker</span>
                  <BreakerBadge state={health.database?.breakerState?.state ?? "closed"} />
                </div>
                <MetricRow label="Total connections" value={health.database?.poolMetrics?.totalConnections ?? 0} sub="/ 20" />
                <MetricRow label="Idle connections" value={health.database?.poolMetrics?.idleConnections ?? 0} />
                <MetricRow label="Waiting clients" value={health.database?.poolMetrics?.waitingClients ?? 0} />
                <Separator className="my-2" />
                <MetricRow label="Total queries" value={(health.database?.poolMetrics?.totalQueries ?? 0).toLocaleString()} />
                <MetricRow label="Slow queries (>500ms)" value={health.database?.poolMetrics?.slowQueries ?? 0} />
                <MetricRow label="Query errors" value={health.database?.poolMetrics?.errors ?? 0} />
                <MetricRow label="Avg latency" value={health.database?.poolMetrics?.avgLatencyMs ?? 0} sub="ms" />
              </CardContent>
            </Card>
          </div>

          {/* Telegram + WhatsApp side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  Telegram
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <MetricRow label="Webhook updates received" value={(health.telegram?.webhookCount ?? 0).toLocaleString()} />
                <MetricRow label="PHI detected (inbound)" value={health.telegram?.phiDetectionsTotal ?? 0} />
                <MetricRow label="Rate-limited updates" value={health.telegram?.rateLimitedTotal ?? 0} />
                <Separator className="my-2" />
                <MetricRow label="Send success rate" value={`${health.telegram?.sendSuccessRate ?? 100}%`} />
                {(health.telegram?.phiDetectionsTotal ?? 0) > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-amber-600 text-xs bg-amber-50 rounded p-2">
                    <ShieldAlert className="w-3 h-3" />
                    PHI found in {health.telegram.phiDetectionsTotal} inbound message(s)
                  </div>
                )}
                {health.telegram?.recentSends?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">Recent sends</p>
                    {health.telegram.recentSends.slice(-5).map((s: any, i: number) => (
                      <div key={i} className="text-xs flex gap-2 font-mono" data-testid={`tg-send-${i}`}>
                        <span className={s.ok ? "text-green-600" : "text-red-500"}>{s.ok ? "✓" : "✗"}</span>
                        <span className="text-muted-foreground">{s.chatId}</span>
                        {s.retries > 0 && <span className="text-amber-500">{s.retries}r</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-500" />
                  WhatsApp / Twilio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Twilio Circuit Breaker</span>
                  <BreakerBadge state={
                    health.circuitBreakers?.find((b: any) => b.name === "twilio")?.state ?? "closed"
                  } />
                </div>
                <MetricRow label="Meta API success rate" value={`${health.whatsapp?.metaSuccessRate ?? 100}%`} />
                <MetricRow label="PHI redaction events" value={health.whatsapp?.phiRedactionEvents ?? 0} />
                <MetricRow label="Rate-limited (blocked)" value={health.whatsapp?.rateLimitedBlocked ?? 0} />
                <MetricRow label="Duplicates blocked" value={health.whatsapp?.duplicatesBlocked ?? 0} />
                {(health.whatsapp?.phiRedactionEvents ?? 0) > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-amber-600 text-xs bg-amber-50 rounded p-2">
                    <ShieldAlert className="w-3 h-3" />
                    PHI redacted from {health.whatsapp.phiRedactionEvents} outbound message(s)
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Agentic Framework */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                Agentic Framework — Per-Agent Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {health.agents?.registered?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents registered yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4">Agent</th>
                        <th className="text-right pr-4">Runs</th>
                        <th className="text-right pr-4">Success%</th>
                        <th className="text-right pr-4">p50ms</th>
                        <th className="text-right pr-4">p95ms</th>
                        <th className="text-right pr-4">Timeouts</th>
                        <th className="text-right pr-4">Breaker</th>
                        <th className="text-right">Enabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(health.agents?.registered ?? []).map((name: string) => {
                        const m = health.agents?.metrics?.[name];
                        const cfg = health.agents?.config?.[name];
                        return (
                          <tr key={name} className="border-b last:border-0" data-testid={`agent-row-${name}`}>
                            <td className="py-2 pr-4 font-mono font-semibold">{name}</td>
                            <td className="text-right pr-4">{m?.totalRuns ?? 0}</td>
                            <td className="text-right pr-4">
                              <span className={m?.successRate >= 95 ? "text-green-600" : m?.successRate >= 80 ? "text-yellow-600" : "text-red-600"}>
                                {m?.successRate ?? 100}%
                              </span>
                            </td>
                            <td className="text-right pr-4">{m?.p50Ms ?? "—"}</td>
                            <td className="text-right pr-4">{m?.p95Ms ?? "—"}</td>
                            <td className="text-right pr-4 text-amber-600">{m?.timeouts ?? 0}</td>
                            <td className="text-right pr-4">
                              <BreakerBadge state={m?.breakerState ?? "closed"} />
                            </td>
                            <td className="text-right">
                              {cfg?.enabled !== false
                                ? <CheckCircle className="w-3 h-3 text-green-500 inline" />
                                : <XCircle className="w-3 h-3 text-red-500 inline" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Circuit Breaker summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Circuit Breaker Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(health.circuitBreakers ?? []).map((b: any) => (
                  <div key={b.name} className="flex flex-col gap-1 rounded-lg border p-3" data-testid={`breaker-${b.name}`}>
                    <span className="text-xs font-mono font-semibold truncate">{b.name}</span>
                    <BreakerBadge state={b.state} />
                    <span className="text-xs text-muted-foreground">{b.failures} failures</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
