import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TowerState {
  patients: any[];
  errors: any[];
  engines: Record<string, string>;
  alerts: any[];
  lastUpdated: number;
}

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/control-tower`;
}

export default function ControlTowerPage() {
  const [state, setState] = useState<TowerState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
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

  const runStress = async () => {
    await fetch("/api/stress/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 5, requests: 20 }) });
    toast({ title: "Stress test started", description: "Check results at /stress-test" });
  };

  const runLearning = async () => {
    await fetch("/api/outcome/learning/run", { method: "POST" });
    toast({ title: "Learning cycle triggered" });
  };

  const avgLatency = state
    ? Math.round(state.patients.reduce((a, p) => a + (p.latency ?? p.latencyMs ?? 0), 0) / (state.patients.length || 1))
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="control-tower-title">Control Tower</h1>
        <Badge variant={connected ? "default" : "destructive"} data-testid="ws-status">
          {connected ? "🟢 Live" : "🔴 Disconnected"}
        </Badge>
      </div>

      {/* System Metrics */}
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
              <p className="text-sm text-muted-foreground">No engine data yet — system events will appear here in real time.</p>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
          <CardContent>
            {state?.alerts.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {state.alerts.slice(-10).reverse().map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20" data-testid={`alert-${i}`}>
                    <span className="text-yellow-600">⚠</span>
                    <div>
                      <p className="text-sm font-medium">{alert.message}</p>
                      {alert.category && <p className="text-xs text-muted-foreground">{alert.category}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No alerts — all systems nominal.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader><CardTitle>Recent Patient Flows</CardTitle></CardHeader>
          <CardContent>
            {state?.patients.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {state.patients.slice(-8).reverse().map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30" data-testid={`patient-flow-${i}`}>
                    <div>
                      <p className="text-xs font-mono">{p.patientId ?? "anon"}</p>
                      <p className="text-xs text-muted-foreground">{p.complaint?.slice(0, 40)}</p>
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
              <p className="text-sm text-muted-foreground">No patient flows yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Command Panel */}
        <Card>
          <CardHeader><CardTitle>Command Panel</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" variant="outline" onClick={runStress} data-testid="btn-stress-test">
              Run Stress Test
            </Button>
            <Button className="w-full" variant="outline" onClick={runLearning} data-testid="btn-learning-cycle">
              Run Learning Cycle
            </Button>
            <Button className="w-full" variant="outline" onClick={() => window.open("/api/monitoring/health", "_blank")} data-testid="btn-health-check">
              Health Check
            </Button>
            <Button className="w-full" variant="outline" onClick={() => window.open("/api/queue/stats", "_blank")} data-testid="btn-queue-stats">
              Queue Stats
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
