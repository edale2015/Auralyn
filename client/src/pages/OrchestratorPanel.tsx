import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, CheckCircle, XCircle,
  RotateCcw, Zap, RefreshCw, Search, Clock, Cpu
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BreakerState {
  agent:         string;
  state:         "closed" | "open" | "half-open";
  failureCount:  number;
  lastFailureAt: number;
  source:        "redis" | "in-memory";
}

interface AgentHealth {
  agent:       string;
  success:     number;
  failures:    number;
  timeouts:    number;
  total:       number;
  successRate: number;
  score:       number;
  lastUpdated: number;
}

interface OrchestratorMetrics {
  registered: string[];
  metrics:    Record<string, {
    totalRuns:    number;
    successes:    number;
    failures:     number;
    timeouts:     number;
    successRate:  number;
    p50Ms:        number;
    p95Ms:        number;
    breakerState: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function breakerColor(state: string) {
  if (state === "closed")    return "bg-emerald-500";
  if (state === "half-open") return "bg-amber-400";
  return "bg-red-500";
}

function scoreColor(score: number) {
  if (score >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 0.5) return "text-amber-600 dark:text-amber-400";
  if (score >= 0)   return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function fmt(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString();
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrchestratorPanel() {
  const { toast }  = useToast();
  const qc         = useQueryClient();
  const [replayId, setReplayId] = useState("");
  const [tab, setTab] = useState<"breakers" | "health" | "replay">("breakers");

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/circuit-breakers"] });
    qc.invalidateQueries({ queryKey: ["/api/agents/health"] });
    qc.invalidateQueries({ queryKey: ["/api/agents/metrics"] });
  };

  // ── Queries ─────────────────────────────────────────────────────────────────
  const breakerQ = useQuery<{ breakers: BreakerState[] }>({
    queryKey: ["/api/circuit-breakers"],
    refetchInterval: 5_000,
  });

  const healthQ = useQuery<{ agents: AgentHealth[] }>({
    queryKey: ["/api/agents/health"],
    refetchInterval: 5_000,
  });

  const metricsQ = useQuery<OrchestratorMetrics>({
    queryKey: ["/api/agents/metrics"],
    refetchInterval: 10_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const resetBreaker = useMutation({
    mutationFn: (agent: string) =>
      apiRequest("POST", `/api/circuit-breakers/reset/${encodeURIComponent(agent)}`),
    onSuccess: () => {
      toast({ title: "Circuit breaker reset" });
      qc.invalidateQueries({ queryKey: ["/api/circuit-breakers"] });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const forceOpen = useMutation({
    mutationFn: (agent: string) =>
      apiRequest("POST", `/api/circuit-breakers/force-open/${encodeURIComponent(agent)}`),
    onSuccess: () => {
      toast({ title: "Circuit breaker forced open" });
      qc.invalidateQueries({ queryKey: ["/api/circuit-breakers"] });
    },
    onError: (e: any) => toast({ title: "Force-open failed", description: e.message, variant: "destructive" }),
  });

  const resetHealth = useMutation({
    mutationFn: (agent: string) =>
      apiRequest("POST", `/api/agents/health/reset/${encodeURIComponent(agent)}`),
    onSuccess: () => {
      toast({ title: "Health counters reset" });
      qc.invalidateQueries({ queryKey: ["/api/agents/health"] });
    },
  });

  const runReplay = useMutation({
    mutationFn: (traceId: string) => apiRequest("POST", `/api/replay/${encodeURIComponent(traceId)}`),
    onSuccess: () => toast({ title: "Replay complete — check results below" }),
    onError: (e: any) => toast({ title: "Replay failed", description: e.message, variant: "destructive" }),
  });

  // ── Tab nav ──────────────────────────────────────────────────────────────
  const tabs = [
    { id: "breakers", label: "Circuit Breakers", icon: Zap },
    { id: "health",   label: "Agent Health",     icon: Activity },
    { id: "replay",   label: "Case Replay",      icon: RotateCcw },
  ] as const;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="orchestrator-panel">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orchestrator Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Distributed circuit breakers · Agent health scoring · Case replay
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} data-testid="btn-refresh-all">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Zap className="w-3.5 h-3.5" /> Circuit Breakers
            </div>
            <div className="text-2xl font-bold" data-testid="stat-breakers-total">
              {breakerQ.data?.breakers.length ?? "—"}
            </div>
            <div className="text-xs text-red-500 mt-0.5" data-testid="stat-breakers-open">
              {breakerQ.data?.breakers.filter(b => b.state === "open").length ?? 0} open
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" /> Agents Tracked
            </div>
            <div className="text-2xl font-bold" data-testid="stat-agents-total">
              {healthQ.data?.agents.length ?? "—"}
            </div>
            <div className="text-xs text-amber-500 mt-0.5" data-testid="stat-agents-degraded">
              {healthQ.data?.agents.filter(a => a.score < 0.5).length ?? 0} degraded
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Cpu className="w-3.5 h-3.5" /> Registered Agents
            </div>
            <div className="text-2xl font-bold" data-testid="stat-registered-agents">
              {metricsQ.data?.registered.length ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">in orchestrator</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b pb-0">
        {tabs.map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: CIRCUIT BREAKERS
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "breakers" && (
        <div className="space-y-3">
          {breakerQ.isLoading && (
            <div className="text-sm text-muted-foreground">Loading breakers…</div>
          )}
          {breakerQ.data?.breakers.length === 0 && (
            <div className="text-sm text-muted-foreground">No circuit breaker state recorded yet.</div>
          )}
          {breakerQ.data?.breakers.map(b => (
            <Card key={b.agent} data-testid={`card-breaker-${b.agent}`}>
              <CardContent className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${breakerColor(b.state)}`}
                    data-testid={`dot-breaker-${b.agent}`}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" data-testid={`text-breaker-agent-${b.agent}`}>
                      {b.agent}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-breaker-detail-${b.agent}`}>
                      {b.failureCount} failure{b.failureCount !== 1 ? "s" : ""} ·{" "}
                      last {fmt(b.lastFailureAt)} · {b.source}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    variant={b.state === "closed" ? "outline" : b.state === "open" ? "destructive" : "secondary"}
                    data-testid={`badge-breaker-state-${b.agent}`}
                  >
                    {b.state}
                  </Badge>
                  <Button
                    size="sm" variant="outline"
                    data-testid={`btn-reset-breaker-${b.agent}`}
                    onClick={() => resetBreaker.mutate(b.agent)}
                    disabled={resetBreaker.isPending}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset
                  </Button>
                  <Button
                    size="sm" variant="destructive"
                    data-testid={`btn-force-open-${b.agent}`}
                    onClick={() => forceOpen.mutate(b.agent)}
                    disabled={forceOpen.isPending || b.state === "open"}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Force Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: AGENT HEALTH
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "health" && (
        <div className="space-y-3">
          {healthQ.isLoading && (
            <div className="text-sm text-muted-foreground">Loading agent health…</div>
          )}
          {healthQ.data?.agents.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No agent health data yet — health scores populate after the first orchestrator run.
            </div>
          )}
          {healthQ.data?.agents
            .sort((a, b) => a.score - b.score)
            .map(a => (
              <Card key={a.agent} data-testid={`card-health-${a.agent}`}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm" data-testid={`text-health-agent-${a.agent}`}>
                      {a.agent}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ✓ {a.success} · ✗ {a.failures} · ⏱ {a.timeouts} timeouts
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${scoreColor(a.score)}`}
                         data-testid={`text-health-score-${a.agent}`}>
                        {a.score.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground"
                         data-testid={`text-success-rate-${a.agent}`}>
                        {(a.successRate * 100).toFixed(0)}% success
                      </p>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      data-testid={`btn-reset-health-${a.agent}`}
                      onClick={() => resetHealth.mutate(a.agent)}
                      disabled={resetHealth.isPending}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {/* Orchestrator metrics */}
          {metricsQ.data && Object.keys(metricsQ.data.metrics).length > 0 && (
            <>
              <Separator className="my-4" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Latency Metrics
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-latency-metrics">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Agent</th>
                      <th className="text-right pr-3">Runs</th>
                      <th className="text-right pr-3">P50</th>
                      <th className="text-right pr-3">P95</th>
                      <th className="text-right pr-3">Success%</th>
                      <th className="text-right">Breaker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metricsQ.data.metrics).map(([name, m]) => (
                      <tr key={name} className="border-b last:border-0"
                          data-testid={`row-metric-${name}`}>
                        <td className="py-2 pr-4 font-mono">{name}</td>
                        <td className="text-right pr-3 tabular-nums">{m.totalRuns}</td>
                        <td className="text-right pr-3 tabular-nums">{m.p50Ms}ms</td>
                        <td className="text-right pr-3 tabular-nums">{m.p95Ms}ms</td>
                        <td className="text-right pr-3 tabular-nums">{m.successRate}%</td>
                        <td className="text-right">
                          <Badge variant={m.breakerState === "closed" ? "outline" : "destructive"}>
                            {m.breakerState}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: CASE REPLAY
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "replay" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Frozen Case Replay</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Re-execute any historical case using its audit trace ID. The replay
                returns the original trace alongside a live re-run — any execution plan
                changes are surfaced automatically.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter trace ID…"
                  value={replayId}
                  onChange={e => setReplayId(e.target.value)}
                  data-testid="input-replay-trace-id"
                  className="font-mono text-sm"
                />
                <Button
                  onClick={() => replayId.trim() && runReplay.mutate(replayId.trim())}
                  disabled={!replayId.trim() || runReplay.isPending}
                  data-testid="btn-run-replay"
                >
                  <Search className="w-3.5 h-3.5 mr-1.5" />
                  {runReplay.isPending ? "Running…" : "Replay"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {runReplay.data && (() => {
            const data = runReplay.data as any;
            return (
              <Card data-testid="card-replay-results">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Replay Results</CardTitle>
                    {data.planChanged ? (
                      <Badge variant="destructive" data-testid="badge-plan-changed">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Plan changed
                      </Badge>
                    ) : (
                      <Badge variant="outline" data-testid="badge-plan-unchanged">
                        <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> Plan unchanged
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Original fingerprint</span>
                      <p className="break-all mt-0.5" data-testid="text-original-fingerprint">
                        {data.originalFingerprint ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Replay fingerprint</span>
                      <p className="break-all mt-0.5" data-testid="text-replay-fingerprint">
                        {data.replayFingerprint}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Original trace ({data.originalTrace?.length ?? 0} steps)
                    </p>
                    <div className="space-y-1 max-h-60 overflow-y-auto pr-1"
                         data-testid="list-original-trace">
                      {(data.originalTrace ?? []).map((row: any, i: number) => (
                        <div key={i}
                             className="flex gap-2 text-xs py-1 border-b last:border-0"
                             data-testid={`trace-step-${i}`}>
                          <Clock className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                          <span className="font-mono font-medium w-40 flex-shrink-0">{row.step}</span>
                          <span className="text-muted-foreground truncate">
                            {JSON.stringify(row.output ?? row.input).slice(0, 120)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}
    </div>
  );
}
