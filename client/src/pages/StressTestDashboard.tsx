import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Zap, Activity, AlertTriangle, CheckCircle, Clock, BarChart3, RefreshCw } from "lucide-react";

interface StressResult {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSecond: number;
  durationMs: number;
  safetyBlocked: number;
  breakdown: Record<string, number>;
}

interface SystemMetrics {
  totalLogs: number;
  errorRate: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  engineBreakdown: Record<string, { total: number; errors: number; avgLatency: number; errorRate: number }>;
  statusSummary: Record<string, number>;
  recentErrors: string[];
  analyzedAt: string;
}

export default function StressTestDashboard() {
  const { toast } = useToast();
  const [total, setTotal] = useState("20");
  const [concurrency, setConcurrency] = useState("5");
  const [lastResult, setLastResult] = useState<StressResult | null>(null);

  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<{ ok: boolean; metrics: SystemMetrics }>({
    queryKey: ["/api/stress/analyze"],
    refetchInterval: 15_000,
  });

  const syncRunMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/stress/run-sync", {
        total: parseInt(total) || 20,
        concurrency: parseInt(concurrency) || 5,
      }),
    onSuccess: (data: any) => {
      setLastResult(data.result);
      toast({ title: "Stress test complete", description: `${data.result?.completed}/${data.result?.total} passed, avg ${data.result?.avgLatencyMs}ms` });
      queryClient.invalidateQueries({ queryKey: ["/api/stress/analyze"] });
    },
    onError: (e: any) => toast({ title: "Test failed", description: e?.message, variant: "destructive" }),
  });

  const metrics = metricsData?.metrics;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-stress-title">
            <Zap className="h-6 w-6" /> Stress Test & Observability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Load generator · Latency profiler · Engine failure analysis · Real-time DB metrics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchMetrics()} data-testid="button-refresh-metrics">
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Run Load Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <label className="text-xs text-muted-foreground">Patients (max 100)</label>
              <Input value={total} onChange={e => setTotal(e.target.value)} className="w-28 h-8 text-sm" type="number" data-testid="input-total" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Concurrency</label>
              <Input value={concurrency} onChange={e => setConcurrency(e.target.value)} className="w-24 h-8 text-sm" type="number" data-testid="input-concurrency" />
            </div>
            <Button
              onClick={() => syncRunMutation.mutate()}
              disabled={syncRunMutation.isPending}
              data-testid="button-run-stress"
            >
              <Zap className="h-3 w-3 mr-1" />
              {syncRunMutation.isPending ? "Running..." : "Run Test"}
            </Button>
          </div>
          {syncRunMutation.isPending && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Running {total} patients at concurrency {concurrency}...</p>
              <Progress value={undefined} className="h-1" />
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Success Rate", value: `${lastResult.successRate}%`, icon: CheckCircle, color: lastResult.successRate > 90 ? "text-green-600" : "text-red-600" },
            { label: "Avg Latency", value: `${lastResult.avgLatencyMs}ms`, icon: Clock, color: "text-blue-600" },
            { label: "P95 Latency", value: `${lastResult.p95LatencyMs}ms`, icon: Activity, color: "text-orange-600" },
            { label: "Throughput", value: `${lastResult.throughputPerSecond}/s`, icon: Zap, color: "text-purple-600" },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <m.icon className="h-3 w-3" /> {m.label}
                </div>
                <div className={`text-2xl font-bold ${m.color}`} data-testid={`text-metric-${m.label.toLowerCase().replace(/\s/g, "-")}`}>{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {lastResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Test Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Patients</span><span className="font-medium" data-testid="text-total">{lastResult.total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><Badge className="bg-green-100 text-green-700" data-testid="text-completed">{lastResult.completed}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Failed</span><Badge className="bg-red-100 text-red-700" data-testid="text-failed">{lastResult.failed}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Safety Blocked</span><Badge className="bg-orange-100 text-orange-700">{lastResult.safetyBlocked}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{(lastResult.durationMs / 1000).toFixed(1)}s</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Latency</span><span className="font-medium">{lastResult.maxLatencyMs}ms</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Complaint Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(lastResult.breakdown).map(([complaint, count]) => (
                <div key={complaint} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-32 truncate">{complaint}</span>
                  <Progress value={(count / lastResult.total) * 100} className="flex-1 h-2" />
                  <span className="text-xs font-medium w-6 text-right">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Live System Metrics (Last 60 min)
            {metricsLoading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!metrics ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading metrics...</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Engine Logs</p>
                  <p className="text-xl font-bold" data-testid="text-total-logs">{metrics.totalLogs}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Error Rate</p>
                  <p className={`text-xl font-bold ${metrics.errorRate > 10 ? "text-red-600" : "text-green-600"}`} data-testid="text-error-rate">{metrics.errorRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Latency</p>
                  <p className="text-xl font-bold text-blue-600" data-testid="text-avg-latency">{metrics.avgLatencyMs}ms</p>
                </div>
              </div>

              {Object.keys(metrics.engineBreakdown).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Engine Breakdown</p>
                  <div className="space-y-1">
                    {Object.entries(metrics.engineBreakdown).map(([engine, stats]) => (
                      <div key={engine} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                        <span className="font-medium">{engine}</span>
                        <div className="flex gap-3 text-muted-foreground">
                          <span>{stats.total} calls</span>
                          <span>{stats.avgLatency}ms avg</span>
                          <Badge className={stats.errorRate > 10 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                            {stats.errorRate}% err
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {metrics.recentErrors.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-red-500" /> Recent Errors
                  </p>
                  <div className="space-y-1">
                    {metrics.recentErrors.map((err, i) => (
                      <div key={i} className="text-xs bg-red-50 border border-red-100 text-red-700 rounded px-2 py-1 truncate">
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
