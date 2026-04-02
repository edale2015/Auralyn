import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Zap, ShieldAlert, DollarSign, FlaskConical, Database, Cpu,
  GitBranch, Clock, TrendingUp, TrendingDown, Minus, Settings,
  PlayCircle, RotateCcw, ChevronRight
} from "lucide-react";

function StatusBadge({ state }: { state: string }) {
  if (state === "closed" || state === "healthy") return <Badge data-testid="badge-status-closed" className="bg-green-500/20 text-green-300 border-green-500/30">Closed</Badge>;
  if (state === "half-open") return <Badge data-testid="badge-status-halfopen" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Half-Open</Badge>;
  if (state === "open") return <Badge data-testid="badge-status-open" className="bg-red-500/20 text-red-300 border-red-500/30">Open</Badge>;
  return <Badge>{state}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Critical</Badge>;
  if (severity === "warning") return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Warning</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Info</Badge>;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (trend === "degrading") return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function ms(v: number) { return `${v}ms`; }

export default function EngineMaintenancePage() {
  const { toast } = useToast();
  const [selfTestResult, setSelfTestResult] = useState<any>(null);

  const reportQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/report"], refetchInterval: 30_000 });
  const cbQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/circuit-breakers"], refetchInterval: 15_000 });
  const sloQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/slos"], refetchInterval: 30_000 });
  const costQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/cost-profile"] });
  const staleQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/stale-engines"] });
  const topologyQ = useQuery<any>({ queryKey: ["/api/engine-maintenance/topology"] });

  const resetAllBreakers = useMutation({
    mutationFn: () => apiRequest("POST", "/api/engine-maintenance/circuit-breakers/reset", { target: "all" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] });
      toast({ title: "All system circuit breakers reset" });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e?.message, variant: "destructive" }),
  });

  const resetBreaker = useMutation({
    mutationFn: (target: string) => apiRequest("POST", "/api/engine-maintenance/circuit-breakers/reset", { target }),
    onSuccess: (_d, target) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] });
      toast({ title: `Circuit breaker "${target}" reset` });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e?.message, variant: "destructive" }),
  });

  const resetEngineCB = useMutation({
    mutationFn: (engineId: string) => apiRequest("POST", `/api/engine-maintenance/engine/${engineId}/reset-breaker`, {}),
    onSuccess: (_d, engineId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] });
      toast({ title: `Engine "${engineId}" circuit breaker reset` });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e?.message, variant: "destructive" }),
  });

  const reloadKB = useMutation({
    mutationFn: () => apiRequest("POST", "/api/engine-maintenance/kb/reload", {}),
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] });
      toast({ title: "KB caches reloaded", description: d?.components?.join(", ") });
    },
    onError: (e: any) => toast({ title: "KB reload failed", description: e?.message, variant: "destructive" }),
  });

  const runSelfTest = useMutation({
    mutationFn: () => apiRequest("POST", "/api/engine-maintenance/self-test", {}),
    onSuccess: (d: any) => {
      setSelfTestResult(d);
      queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] });
      if (d?.ok) toast({ title: `Self-test passed — ${(d.passRate * 100).toFixed(0)}% pass rate` });
      else toast({ title: "Self-test FAILURES detected", description: d?.summary, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Self-test failed", description: e?.message, variant: "destructive" }),
  });

  const report = reportQ.data;
  const status = report?.overallStatus ?? "unknown";

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Engine Maintenance Console</h1>
            <p className="text-sm text-slate-400">Monitor, diagnose, and control all clinical AI engines</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "healthy" && <Badge data-testid="badge-overall-healthy" className="bg-green-500/20 text-green-300 border-green-500/30 text-sm px-3 py-1">System Healthy</Badge>}
          {status === "degraded" && <Badge data-testid="badge-overall-degraded" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-sm px-3 py-1">Degraded</Badge>}
          {status === "critical" && <Badge data-testid="badge-overall-critical" className="bg-red-500/20 text-red-300 border-red-500/30 text-sm px-3 py-1 animate-pulse">Critical</Badge>}
          <Button data-testid="button-refresh-report" variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/engine-maintenance"] })} className="border-slate-600 text-slate-300">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {report?.recommendations && report.recommendations.filter((r: string) => r.toLowerCase().startsWith("critical")).length > 0 && (
        <Alert className="border-red-500/40 bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <AlertDescription className="text-red-300">
            {report.recommendations.filter((r: string) => r.toLowerCase().startsWith("critical")).join(" | ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Cpu className="w-3.5 h-3.5" /> Registered Engines</div>
            <div data-testid="text-engine-count" className="text-2xl font-bold text-white">{report?.engineScan?.totalEngines ?? "—"}</div>
            <div className="text-xs text-green-400">{report?.engineScan?.healthyEngines ?? 0} healthy</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Zap className="w-3.5 h-3.5" /> Open Circuit Breakers</div>
            <div data-testid="text-open-breakers" className={`text-2xl font-bold ${(report?.engineScan?.openCircuitBreakers ?? 0) > 0 ? "text-red-400" : "text-white"}`}>{report?.engineScan?.openCircuitBreakers ?? 0}</div>
            <div className="text-xs text-slate-400">system + engine breakers</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><ShieldAlert className="w-3.5 h-3.5" /> SLO Breaches</div>
            <div data-testid="text-slo-breaches" className={`text-2xl font-bold ${(report?.sloBreaches ?? 0) > 0 ? "text-yellow-400" : "text-white"}`}>{report?.sloBreaches ?? 0}</div>
            <div className="text-xs text-slate-400">of {sloQ.data?.sloCount ?? "—"} SLOs</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Clock className="w-3.5 h-3.5" /> Stale Engines</div>
            <div data-testid="text-stale-engines" className={`text-2xl font-bold ${(staleQ.data?.staleCount ?? 0) > 0 ? "text-yellow-400" : "text-white"}`}>{staleQ.data?.staleCount ?? "—"}</div>
            <div className="text-xs text-slate-400">no invocations &gt;1h</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakers">Circuit Breakers</TabsTrigger>
          <TabsTrigger value="slos">SLO Compliance</TabsTrigger>
          <TabsTrigger value="topology">Engine Topology</TabsTrigger>
          <TabsTrigger value="costs">Cost Profiles</TabsTrigger>
          <TabsTrigger value="actions">Maintenance Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {report?.recommendations && (
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Activity className="w-4 h-4" /> Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {report.recommendations.map((r: string, i: number) => (
                    <li key={i} data-testid={`text-recommendation-${i}`} className={`text-sm flex items-start gap-2 ${r.toLowerCase().startsWith("critical") ? "text-red-300" : r.toLowerCase().startsWith("slo") || r.toLowerCase().startsWith("elevated") ? "text-yellow-300" : "text-green-300"}`}>
                      <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Active Issues ({report?.engineScan?.issues?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {!report?.engineScan?.issues?.length ? (
                <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> No issues detected</p>
              ) : (
                <div className="space-y-2">
                  {report.engineScan.issues.map((issue: any, i: number) => (
                    <div key={i} data-testid={`card-issue-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700">
                      <SeverityBadge severity={issue.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-slate-400">{issue.engineId} · {issue.code}</div>
                        <div className="text-sm text-white">{issue.message}</div>
                        {issue.detail && <div className="text-xs text-slate-400">{issue.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Cpu className="w-4 h-4" /> Engine Health Metrics</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Engine</TableHead>
                      <TableHead className="text-slate-400">Circuit</TableHead>
                      <TableHead className="text-slate-400">Error 1h</TableHead>
                      <TableHead className="text-slate-400">Error 24h</TableHead>
                      <TableHead className="text-slate-400">p50</TableHead>
                      <TableHead className="text-slate-400">p95</TableHead>
                      <TableHead className="text-slate-400">Invocations 24h</TableHead>
                      <TableHead className="text-slate-400">Red Flag Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report?.engineScan?.metrics ?? []).map((m: any) => (
                      <TableRow key={m.engineId} data-testid={`row-engine-${m.engineId}`} className="border-slate-700">
                        <TableCell className="text-xs font-mono text-white">{m.engineId}</TableCell>
                        <TableCell><StatusBadge state={m.circuitBreakerOpen ? "open" : "closed"} /></TableCell>
                        <TableCell className={`text-xs ${m.errorRate1h > 0.10 ? "text-red-400" : "text-slate-300"}`}>{pct(m.errorRate1h)}</TableCell>
                        <TableCell className={`text-xs ${m.errorRate24h > 0.05 ? "text-yellow-400" : "text-slate-300"}`}>{pct(m.errorRate24h)}</TableCell>
                        <TableCell className="text-xs text-slate-300">{ms(m.p50LatencyMs)}</TableCell>
                        <TableCell className={`text-xs ${m.p95LatencyMs > 5000 ? "text-red-400" : "text-slate-300"}`}>{ms(m.p95LatencyMs)}</TableCell>
                        <TableCell className="text-xs text-slate-300">{m.invocationCount24h}</TableCell>
                        <TableCell className="text-xs text-slate-300">{pct(m.redFlagDetectionRate)}</TableCell>
                      </TableRow>
                    ))}
                    {!(report?.engineScan?.metrics?.length) && (
                      <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-6">No engines registered yet — invoke the pipeline to populate</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakers" className="space-y-4">
          <div className="flex justify-end">
            <Button data-testid="button-reset-all-breakers" onClick={() => resetAllBreakers.mutate()} disabled={resetAllBreakers.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              <RotateCcw className="w-4 h-4 mr-2" /> Reset All System Breakers
            </Button>
          </div>

          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">System Circuit Breakers</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(cbQ.data?.system ?? []).map((cb: any) => (
                  <div key={cb.name} data-testid={`card-breaker-${cb.name}`} className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-slate-700">
                    <div>
                      <div className="text-sm font-semibold text-white capitalize">{cb.name}</div>
                      <div className="text-xs text-slate-400">{cb.failures} failures · Last fail: {cb.lastFailAt ? new Date(cb.lastFailAt).toLocaleTimeString() : "never"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge state={cb.state} />
                      {cb.state !== "closed" && (
                        <Button data-testid={`button-reset-breaker-${cb.name}`} size="sm" variant="outline" onClick={() => resetBreaker.mutate(cb.name)} disabled={resetBreaker.isPending} className="border-slate-600 text-slate-300 text-xs">
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {cbQ.data?.engines?.length > 0 && (
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 text-red-300">Open Engine Circuit Breakers</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cbQ.data.engines.map((e: any) => (
                    <div key={e.name} data-testid={`card-engine-breaker-${e.name}`} className="flex items-center justify-between p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                      <div>
                        <div className="text-sm font-mono text-white">{e.name}</div>
                        <div className="text-xs text-slate-400">Opened at {e.openedAt ?? "unknown"} · Trigger: {e.triggeredBy ?? "unknown"}</div>
                      </div>
                      <Button data-testid={`button-reset-engine-breaker-${e.name}`} size="sm" variant="outline" onClick={() => resetEngineCB.mutate(e.name)} disabled={resetEngineCB.isPending} className="border-red-600 text-red-300 text-xs">
                        Reset
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {cbQ.data?.engines?.length === 0 && (
            <Card className="bg-slate-800/60 border-slate-700">
              <CardContent className="py-6 text-center text-green-400 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> No engine circuit breakers open
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="slos" className="space-y-4">
          {sloQ.data?.haltRisk?.length > 0 && (
            <Alert className="border-red-500/40 bg-red-500/10">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <AlertDescription className="text-red-300">
                HALT_SYSTEM SLOs breached: {sloQ.data.haltRisk.join(", ")} — immediate action required, FDA audit triggered.
              </AlertDescription>
            </Alert>
          )}

          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Clinical SLO Compliance
                <span className="ml-auto text-xs text-slate-400">{sloQ.data?.sloCount ?? 0} SLOs · {sloQ.data?.breachedCount ?? 0} breached</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">SLO</TableHead>
                      <TableHead className="text-slate-400">Category</TableHead>
                      <TableHead className="text-slate-400">Target</TableHead>
                      <TableHead className="text-slate-400">Current</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Trend</TableHead>
                      <TableHead className="text-slate-400">On Breach</TableHead>
                      <TableHead className="text-slate-400">FDA Audit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sloQ.data?.statuses ?? []).map((s: any) => (
                      <TableRow key={s.slo.id} data-testid={`row-slo-${s.slo.id}`} className="border-slate-700">
                        <TableCell className="text-xs">
                          <div className="font-semibold text-white">{s.slo.name}</div>
                          <div className="text-slate-500">{s.slo.id}</div>
                        </TableCell>
                        <TableCell><Badge className="bg-slate-700 text-slate-300 text-xs">{s.slo.category}</Badge></TableCell>
                        <TableCell className="text-xs text-slate-300">{s.slo.unit === "seconds" ? `${s.slo.target}s` : pct(s.slo.target)}</TableCell>
                        <TableCell className="text-xs font-semibold">
                          {s.currentValue !== null
                            ? <span className={s.breached ? "text-red-400" : "text-green-400"}>{s.slo.unit === "seconds" ? `${s.currentValue}s` : pct(s.currentValue)}</span>
                            : <span className="text-slate-500">No data</span>}
                        </TableCell>
                        <TableCell>
                          {s.breached ? <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">Breached</Badge> : <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">OK</Badge>}
                        </TableCell>
                        <TableCell><TrendIcon trend={s.trend} /></TableCell>
                        <TableCell className="text-xs">
                          <Badge className={
                            s.slo.breachAction === "halt_system" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                            s.slo.breachAction === "circuit_break" ? "bg-orange-500/20 text-orange-300" :
                            "bg-yellow-500/20 text-yellow-300"
                          }>{s.slo.breachAction}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{s.slo.fdaAuditRequired ? <span className="text-orange-400">Required</span> : <span className="text-slate-500">No</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topology" className="space-y-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><GitBranch className="w-4 h-4" /> Clinical Brain Pipeline Topology ({topologyQ.data?.totalStages ?? 0} stages)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(topologyQ.data?.topology ?? []).map((node: any, idx: number) => (
                  <div key={node.id} data-testid={`card-topology-${node.id}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700/40 transition-colors">
                    <div className="text-xs font-mono text-slate-500 w-6 text-right">{node.stage}</div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${node.health?.circuitBreakerOpen ? "bg-red-400" : node.registered ? "bg-green-400" : "bg-slate-600"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{node.label}</span>
                      <span className="ml-2 text-xs font-mono text-slate-500">{node.id}</span>
                    </div>
                    {node.registered ? <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">Registered</Badge> : <Badge className="bg-slate-700 text-slate-400 text-xs">Not Registered</Badge>}
                    {node.cost && <span className="text-xs text-slate-400">{node.cost.latencyMs}ms · {node.cost.costUnits} cu · {pct(node.cost.reliability)} rel</span>}
                    {node.health?.circuitBreakerOpen && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">CB Open</Badge>}
                    {node.feeds?.length > 0 && (
                      <span className="text-xs text-slate-500 hidden xl:block">→ {node.feeds.join(", ")}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Engine Cost Profiles
                <span className="ml-auto text-xs text-slate-400">Sorted by composite score (lower = cheaper)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Engine</TableHead>
                    <TableHead className="text-slate-400">Latency</TableHead>
                    <TableHead className="text-slate-400">Cost Units</TableHead>
                    <TableHead className="text-slate-400">Reliability</TableHead>
                    <TableHead className="text-slate-400">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(costQ.data?.engines ?? []).map((e: any, i: number) => (
                    <TableRow key={e.engine} data-testid={`row-cost-${e.engine}`} className="border-slate-700">
                      <TableCell className="text-xs font-mono text-white">{e.engine}</TableCell>
                      <TableCell className={`text-xs ${e.latencyMs > 300 ? "text-yellow-400" : "text-slate-300"}`}>{ms(e.latencyMs)}</TableCell>
                      <TableCell className="text-xs text-slate-300">{e.costUnits}</TableCell>
                      <TableCell className="text-xs text-slate-300">{pct(e.reliability)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-semibold text-slate-200">{e.score.toFixed(1)}</div>
                          {i === 0 && <Badge className="bg-green-500/20 text-green-300 text-xs">Best Value</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {report?.costSummary && (
                <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-slate-400">Full Pipeline Latency</div>
                    <div className="text-lg font-bold text-white">{ms(report.costSummary.totalLatencyMs)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Total Cost Units</div>
                    <div className="text-lg font-bold text-white">{report.costSummary.totalCostUnits.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Avg Reliability</div>
                    <div className="text-lg font-bold text-white">{pct(report.costSummary.avgReliability)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Database className="w-4 h-4" /> KB Cache Reload</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">Force-invalidates the Google Sheets flow loader and clinical rules cache. The next request will re-pull fresh data from Sheets. Use after publishing sheet changes to ensure immediate propagation.</p>
                <Button data-testid="button-reload-kb" onClick={() => reloadKB.mutate()} disabled={reloadKB.isPending} className="w-full bg-blue-600 hover:bg-blue-700">
                  <RefreshCw className={`w-4 h-4 mr-2 ${reloadKB.isPending ? "animate-spin" : ""}`} />
                  {reloadKB.isPending ? "Reloading..." : "Reload KB Caches"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Golden Case Self-Test</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">Runs 4 standard golden cases through the clinical brain pipeline. Tests ER_NOW sensitivity for chest pain, sudden headache, pediatric fever, and sore throat. Use after any engine updates or config changes.</p>
                <Button data-testid="button-run-self-test" onClick={() => runSelfTest.mutate()} disabled={runSelfTest.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
                  <PlayCircle className={`w-4 h-4 mr-2 ${runSelfTest.isPending ? "animate-spin" : ""}`} />
                  {runSelfTest.isPending ? "Running tests..." : "Run Golden Case Test"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Zap className="w-4 h-4" /> Reset All Breakers</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">Resets all system-level circuit breakers (OpenAI, database, Twilio, scoring). Use only after confirming the underlying service has recovered — do not reset during an active outage.</p>
                <Button data-testid="button-reset-all-system" onClick={() => resetAllBreakers.mutate()} disabled={resetAllBreakers.isPending} className="w-full bg-red-600 hover:bg-red-700">
                  <RotateCcw className={`w-4 h-4 mr-2 ${resetAllBreakers.isPending ? "animate-spin" : ""}`} />
                  {resetAllBreakers.isPending ? "Resetting..." : "Reset All System Breakers"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {selfTestResult && (
            <Card className={`border ${selfTestResult.ok ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {selfTestResult.ok ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  <span className={selfTestResult.ok ? "text-green-300" : "text-red-300"}>
                    Self-Test Results — {(selfTestResult.passRate * 100).toFixed(0)}% pass rate · {selfTestResult.durationMs}ms
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-300 mb-3">{selfTestResult.summary}</p>
                <div className="space-y-2">
                  {(selfTestResult.cases ?? []).map((c: any, i: number) => (
                    <div key={i} data-testid={`card-selftest-${i}`} className={`flex items-start gap-3 p-3 rounded-lg border ${c.passed ? "border-green-500/20 bg-green-900/10" : "border-red-500/20 bg-red-900/10"}`}>
                      {c.passed ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{c.name}</div>
                        <div className="text-xs text-slate-400">
                          Expected: <span className="text-white">{c.expectedDisposition}</span>
                          {" · "}Actual: <span className={c.passed ? "text-green-300" : "text-red-300"}>{c.actualDisposition ?? "none"}</span>
                          {c.safetyHardStop && <span className="ml-2 text-orange-400">· Safety HardStop triggered</span>}
                          {c.confidence !== undefined && <span className="ml-2 text-slate-400">· Confidence: {pct(c.confidence)}</span>}
                        </div>
                        {c.error && <div className="text-xs text-red-400 mt-1">{c.error}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {staleQ.data?.staleEngines?.length > 0 && (
            <Card className="bg-slate-800/60 border-yellow-500/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-300 flex items-center gap-2"><Clock className="w-4 h-4" /> Stale / Missing Engines ({staleQ.data.staleEngines.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {staleQ.data.staleEngines.map((id: string) => (
                    <Badge key={id} data-testid={`badge-stale-${id}`} className={id.startsWith("MISSING:") ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"}>
                      {id}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-3">Engines with MISSING: prefix are in the expected pipeline but not registered. Stale engines have not been invoked in the past {staleQ.data.thresholdHours}h.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
