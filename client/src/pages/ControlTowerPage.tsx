import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import IncidentTimeline from "@/components/IncidentTimeline";

interface TowerState {
  patients: any[];
  errors: any[];
  engines: Record<string, string>;
  alerts: any[];
  lastUpdated: number;
}

interface TwinState {
  slaStatus?: string;
  avgLatency?: number;
  p95Latency?: number;
  errorRate?: number;
  totalRequests?: number;
  errorBudget?: number;
  openIncidents?: number;
  regionHealth?: Array<{ id: string; name: string; health: string; latencyMs: number }>;
  agentSummary?: { total: number; healthy: number; warning: number; critical: number };
  syncedAt?: string;
}

function getWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function slaColor(status?: string) {
  if (status === "OK") return "text-green-500";
  if (status === "DEGRADED") return "text-yellow-500";
  if (status === "BREACH") return "text-red-500";
  return "text-muted-foreground";
}

function regionDot(health: string) {
  if (health === "healthy") return "🟢";
  if (health === "degraded") return "🟡";
  return "🔴";
}

function severityBadge(severity: string) {
  if (severity === "CRITICAL") return "destructive" as const;
  if (severity === "HIGH") return "secondary" as const;
  return "outline" as const;
}

export default function ControlTowerPage() {
  const [state, setState] = useState<TowerState | null>(null);
  const [twin, setTwin] = useState<TwinState>({});
  const [incidents, setIncidents] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [sreConnected, setSreConnected] = useState(false);
  const [stressLoading, setStressLoading] = useState(false);
  const [learningLoading, setLearningLoading] = useState(false);
  const [outageLoading, setOutageLoading] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [prediction, setPrediction] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sreWsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(getWsUrl("/ws/control-tower"));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          if (parsed.data) setState(parsed.data);
          else if (parsed.state) setState(parsed.state);
        } catch {}
      };
    }
    connect();
    return () => { wsRef.current?.close(); };
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(getWsUrl("/ws/orchestration"));
      sreWsRef.current = ws;
      ws.onopen = () => setSreConnected(true);
      ws.onclose = () => { setSreConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const d = JSON.parse(msg.data);
          if (d.type === "twin") setTwin(d.payload ?? {});
          if (d.type === "incidents") setIncidents(d.payload ?? []);
          if (d.type === "timeline") setTimeline(d.payload ?? []);
        } catch {}
      };
    }
    connect();
    return () => { sreWsRef.current?.close(); };
  }, []);

  const fetchPrediction = async () => {
    try {
      const r = await fetch("/api/resilient/predict");
      const j = await r.json();
      setPrediction(j.prediction);
    } catch {}
  };

  const runStress = async () => {
    setStressLoading(true);
    try {
      await fetch("/api/stress/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 5, requests: 20 }),
      });
      toast({ title: "Stress test started", description: "Check results at /stress-test" });
    } catch (e: any) {
      toast({ title: "Stress test failed", description: e.message, variant: "destructive" });
    } finally {
      setStressLoading(false);
    }
  };

  const runLearning = async () => {
    setLearningLoading(true);
    try {
      await fetch("/api/outcome/learning/run", { method: "POST" });
      toast({ title: "Learning cycle triggered" });
    } catch (e: any) {
      toast({ title: "Learning failed", description: e.message, variant: "destructive" });
    } finally {
      setLearningLoading(false);
    }
  };

  const runOutage = async () => {
    setOutageLoading(true);
    try {
      const r = await fetch("/api/resilient/simulate-outage", { method: "POST" });
      const j = await r.json();
      toast({
        title: "NYC Outage Simulated",
        description: `Fallback: ${j.result?.fallbackRegions?.map((x: any) => x.id).join(", ") ?? "none"}`,
        variant: "destructive",
      });
    } catch (e: any) {
      toast({ title: "Outage simulation failed", description: e.message, variant: "destructive" });
    } finally {
      setOutageLoading(false);
    }
  };

  const recoverRegion = async () => {
    try {
      await fetch("/api/resilient/recover-region", { method: "POST" });
      toast({ title: "NYC Recovered", description: "Region restored to healthy" });
    } catch (e: any) {
      toast({ title: "Recovery failed", description: e.message, variant: "destructive" });
    }
  };

  const runReplay = async () => {
    setReplayLoading(true);
    try {
      const r = await fetch("/api/resilient/replay-incidents");
      const j = await r.json();
      toast({ title: "Replay complete", description: `${j.replayed} events replayed` });
    } catch (e: any) {
      toast({ title: "Replay failed", description: e.message, variant: "destructive" });
    } finally {
      setReplayLoading(false);
    }
  };

  const avgLatency = state
    ? Math.round(state.patients.reduce((a, p) => a + (p.latency ?? p.latencyMs ?? 0), 0) / (state.patients.length || 1))
    : 0;

  const openCount = incidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold" data-testid="control-tower-title">Control Tower</h1>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "default" : "destructive"} data-testid="ws-status">
            {connected ? "🟢 Clinical" : "🔴 Clinical"}
          </Badge>
          <Badge variant={sreConnected ? "default" : "destructive"} data-testid="sre-ws-status">
            {sreConnected ? "🟢 SRE Live" : "🔴 SRE Off"}
          </Badge>
        </div>
      </div>

      {/* ── CLINICAL METRICS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Patients</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold" data-testid="metric-patients">{state?.patients.length ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Errors</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-500" data-testid="metric-errors">{state?.errors.length ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Latency</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold" data-testid="metric-latency">{avgLatency} ms</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Alerts</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-yellow-500" data-testid="metric-alerts">{state?.alerts.length ?? 0}</p></CardContent>
        </Card>
      </div>

      {/* ── SRE GLOBAL HEALTH ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-2" style={{ borderColor: twin.slaStatus === "OK" ? "#22c55e" : twin.slaStatus === "BREACH" ? "#ef4444" : "#eab308" }}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SLA Status</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${slaColor(twin.slaStatus)}`} data-testid="sla-status">
              {twin.slaStatus ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">P95 Latency</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold" data-testid="twin-latency">{twin.p95Latency ?? "—"} ms</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Error Budget</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${twin.errorBudget != null && twin.errorBudget < 0.999 ? "text-red-500" : "text-green-500"}`} data-testid="error-budget">
              {twin.errorBudget != null ? `${(twin.errorBudget * 100).toFixed(1)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Incidents</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${openCount > 0 ? "text-red-500" : "text-green-500"}`} data-testid="open-incidents">
              {openCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── MIDDLE ROW ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Region Health */}
        <Card>
          <CardHeader><CardTitle>Global Regions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(twin.regionHealth ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="regions-empty">Connecting...</p>
            ) : (
              (twin.regionHealth ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded bg-muted/30" data-testid={`region-${r.id}`}>
                  <div className="flex items-center gap-2">
                    <span>{regionDot(r.health)}</span>
                    <span className="font-medium text-sm">{r.name}</span>
                  </div>
                  <div className="text-right">
                    <Badge variant={r.health === "healthy" ? "default" : r.health === "down" ? "destructive" : "secondary"} className="text-xs">
                      {r.health}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.latencyMs}ms</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Active Incidents */}
        <Card>
          <CardHeader><CardTitle>Active Incidents</CardTitle></CardHeader>
          <CardContent>
            {incidents.filter(i => i.status !== "resolved").length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="incidents-empty">No active incidents — all clear</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto" data-testid="incidents-list">
                {incidents.filter(i => i.status !== "resolved").slice(-10).map((inc) => (
                  <div key={inc.id} className="p-2 rounded border text-sm" data-testid={`incident-${inc.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{inc.id}</span>
                      <Badge variant={severityBadge(inc.severity)} className="text-xs">{inc.severity}</Badge>
                    </div>
                    <p className="text-xs mt-1 truncate">{inc.type}</p>
                    <Badge variant="outline" className="text-[10px] mt-1">{inc.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Governance */}
        <Card>
          <CardHeader><CardTitle>Agent Governance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-green-500" data-testid="agents-healthy">{twin.agentSummary?.healthy ?? 0}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500" data-testid="agents-warning">{twin.agentSummary?.warning ?? 0}</p>
                <p className="text-xs text-muted-foreground">Warning</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500" data-testid="agents-critical">{twin.agentSummary?.critical ?? 0}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground border-t pt-2">
              Total agents: <strong>{twin.agentSummary?.total ?? 0}</strong>
            </div>
            {prediction && (
              <div className={`p-2 rounded text-xs ${prediction.predicted ? "bg-red-900/20 border border-red-500" : "bg-green-900/20 border border-green-600"}`} data-testid="prediction-result">
                <span className="font-semibold">{prediction.predicted ? "⚠ Failure Predicted" : "✓ System Stable"}</span>
                {prediction.predicted && <p className="mt-1 text-red-300">{prediction.reason}</p>}
                <p className="text-muted-foreground mt-1">Confidence: {prediction.confidence} · {prediction.history?.latency?.length ?? 0} data pts</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── BOTTOM ROW — Engine + Alerts + Incident Timeline + Command Panel ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Engine Health */}
        <Card>
          <CardHeader><CardTitle>Engine Health</CardTitle></CardHeader>
          <CardContent>
            {state && Object.keys(state.engines).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(state.engines).map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between" data-testid={`engine-${name}`}>
                    <span className="text-sm font-medium">{name}</span>
                    <Badge variant={status === "healthy" ? "default" : "destructive"}>
                      {status === "healthy" ? "🟢" : "🔴"} {status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="engines-empty">No engine data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
          <CardContent>
            {state?.alerts.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto" data-testid="alerts-list">
                {state.alerts.slice(-10).reverse().map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20" data-testid={`alert-item-${i}`}>
                    <span className="text-yellow-600">⚠</span>
                    <div>
                      <p className="text-sm font-medium" data-testid={`alert-message-${i}`}>{alert.message}</p>
                      {alert.category && <p className="text-xs text-muted-foreground">{alert.category}</p>}
                      {alert.severity && (
                        <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-xs mt-1">
                          {alert.severity}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="alerts-empty">No alerts — all systems nominal.</p>
            )}
          </CardContent>
        </Card>

        {/* Incident Timeline */}
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Incident Timeline</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">{timeline.length} events</Badge>
            </div>
          </CardHeader>
          <CardContent className="bg-black/50 rounded-lg p-3">
            <IncidentTimeline events={timeline} />
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader><CardTitle>Recent Patient Flows</CardTitle></CardHeader>
          <CardContent>
            {state?.patients.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto" data-testid="patients-list">
                {state.patients.slice(-8).reverse().map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30" data-testid={`patient-flow-${i}`}>
                    <div>
                      <p className="text-xs font-mono" data-testid={`patient-id-${i}`}>{p.patientId ?? "anon"}</p>
                      <p className="text-xs text-muted-foreground">{p.complaint?.slice(0, 40) ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={p.autonomyMode === "AUTO" ? "default" : p.autonomyMode === "ESCALATE" ? "destructive" : "secondary"}>
                        {p.autonomyMode ?? "REVIEW"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{p.latency ?? p.latencyMs ?? 0}ms</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="patients-empty">No patient flows yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Command Panel */}
        <Card>
          <CardHeader><CardTitle>Command Panel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="destructive"
                onClick={runOutage}
                disabled={outageLoading}
                data-testid="btn-simulate-outage"
              >
                {outageLoading ? "Simulating..." : "💥 NYC Outage"}
              </Button>
              <Button
                variant="outline"
                onClick={recoverRegion}
                data-testid="btn-recover-region"
              >
                ✅ Recover NYC
              </Button>
              <Button
                variant="outline"
                onClick={runReplay}
                disabled={replayLoading}
                data-testid="btn-replay-incidents"
              >
                {replayLoading ? "Replaying..." : "▶ Replay Events"}
              </Button>
              <Button
                variant="outline"
                onClick={fetchPrediction}
                data-testid="btn-predict"
              >
                🔮 Run Prediction
              </Button>
              <Button
                variant="outline"
                onClick={runStress}
                disabled={stressLoading}
                data-testid="btn-stress-test"
              >
                {stressLoading ? "Running..." : "Run Stress Test"}
              </Button>
              <Button
                variant="outline"
                onClick={runLearning}
                disabled={learningLoading}
                data-testid="btn-learning-cycle"
              >
                {learningLoading ? "Running..." : "Run Learning"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t">
              <Button variant="ghost" size="sm" onClick={() => window.open("/api/monitoring/dashboard", "_blank")} data-testid="btn-health-check">
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open("/api/monitoring/prometheus", "_blank")} data-testid="btn-prometheus">
                Prometheus
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open("/api/resilient/twin", "_blank")} data-testid="btn-twin">
                Digital Twin
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open("/api/queue/stats", "_blank")} data-testid="btn-queue-stats">
                Queue Stats
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
