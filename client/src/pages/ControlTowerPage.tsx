import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import IncidentTimeline from "@/components/IncidentTimeline";

/* ─── Types ────────────────────────────────────────────────── */
interface TowerState {
  patients: any[];
  errors: any[];
  engines: Record<string, string>;
  alerts: any[];
  lastUpdated: number;
}

interface TwinState {
  activeCases?: number;
  avgLatency?: number;
  p95Latency?: number;
  errorRate?: number;
  totalRequests?: number;
  errorBudget?: number;
  openIncidents?: number;
  slaStatus?: "OK" | "DEGRADED" | "BREACH";
  regionHealth?: Array<{ id: string; name: string; health: string; latencyMs: number }>;
  agentSummary?: { total: number; healthy: number; warning: number; critical: number };
  syncedAt?: string;
}

/* ─── Helpers ───────────────────────────────────────────────── */
function getWsUrl(path: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function slaColor(status?: string) {
  if (status === "OK") return "text-green-500";
  if (status === "DEGRADED") return "text-yellow-400";
  if (status === "BREACH") return "text-red-500";
  return "text-muted-foreground";
}

function slaBg(status?: string) {
  if (status === "OK") return "border-green-500/60 bg-green-950/20";
  if (status === "DEGRADED") return "border-yellow-400/60 bg-yellow-950/20";
  if (status === "BREACH") return "border-red-500/60 bg-red-950/20";
  return "border-muted";
}

function regionDot(health: string) {
  if (health === "healthy") return "🟢";
  if (health === "degraded") return "🟡";
  return "🔴";
}

function budgetColor(v?: number) {
  if (v == null) return "text-muted-foreground";
  if (v >= 0.999) return "text-green-500";
  if (v >= 0.95) return "text-yellow-400";
  return "text-red-500";
}

function severityBadge(severity: string) {
  if (severity === "CRITICAL") return "destructive" as const;
  if (severity === "HIGH") return "secondary" as const;
  return "outline" as const;
}

function ageSecs(iso?: string) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 1000);
}

/* ─── Pulse dot component ───────────────────────────────────── */
function PulseDot({ alive }: { alive: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {alive && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${alive ? "bg-green-500" : "bg-red-500"}`} />
    </span>
  );
}

/* ─── Mini spark bar ────────────────────────────────────────── */
function SparkBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/40">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════ */
export default function ControlTowerPage() {
  const [state, setState] = useState<TowerState | null>(null);
  const [twin, setTwin] = useState<TwinState>({});
  const [incidents, setIncidents] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [wsLive, setWsLive] = useState(false);
  const [twinLive, setTwinLive] = useState(false);   // REST poll healthy
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncAge, setSyncAge] = useState<number | null>(null);

  const [stressLoading, setStressLoading] = useState(false);
  const [learningLoading, setLearningLoading] = useState(false);
  const [outageLoading, setOutageLoading] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [prediction, setPrediction] = useState<any>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const orchWsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  /* ── REST poll for twin snapshot (primary source) ─────────── */
  const pollTwin = useCallback(async () => {
    try {
      const r = await fetch("/api/resilient/twin");
      if (!r.ok) return;
      const j = await r.json();
      const t: TwinState = j.twin ?? j;
      setTwin(t);
      setLastSync(Date.now());
      setTwinLive(true);
    } catch {
      setTwinLive(false);
    }
  }, []);

  /* ── REST poll for clinical tower state ───────────────────── */
  const pollTower = useCallback(async () => {
    try {
      const r = await fetch("/api/ops/summary");
      if (!r.ok) return;
      // tower state comes from control-tower WS; use incidents/timeline from REST if available
    } catch {}
  }, []);

  /* ── REST poll for incidents ──────────────────────────────── */
  const pollIncidents = useCallback(async () => {
    try {
      const [ri, rt] = await Promise.allSettled([
        fetch("/api/resilient/incidents"),
        fetch("/api/resilient/timeline"),
      ]);
      if (ri.status === "fulfilled" && ri.value.ok) {
        const j = await ri.value.json();
        if (j.incidents) setIncidents(j.incidents);
      }
      if (rt.status === "fulfilled" && rt.value.ok) {
        const j = await rt.value.json();
        if (j.events) setTimeline(j.events);
        else if (j.timeline) setTimeline(j.timeline);
      }
    } catch {}
  }, []);

  /* ── Control-tower WebSocket ──────────────────────────────── */
  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(getWsUrl("/ws/control-tower"));
        wsRef.current = ws;
        ws.onopen = () => setWsLive(true);
        ws.onclose = () => { setWsLive(false); setTimeout(connect, 5000); };
        ws.onerror = () => ws.close();
        ws.onmessage = (msg) => {
          try {
            const d = JSON.parse(msg.data);
            if (d.data) setState(d.data);
            else if (d.state) setState(d.state);
          } catch {}
        };
      } catch {}
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  /* ── Orchestration WebSocket (twin + incidents via WS) ────── */
  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(getWsUrl("/ws/orchestration"));
        orchWsRef.current = ws;
        ws.onopen = () => {};
        ws.onclose = () => setTimeout(connect, 5000);
        ws.onerror = () => ws.close();
        ws.onmessage = (msg) => {
          try {
            const d = JSON.parse(msg.data);
            if (d.type === "twin") {
              setTwin(d.payload ?? {});
              setLastSync(Date.now());
              setTwinLive(true);
            }
            if (d.type === "incidents") setIncidents(d.payload ?? []);
            if (d.type === "timeline")  setTimeline(d.payload ?? []);
          } catch {}
        };
      } catch {}
    }
    connect();
    return () => orchWsRef.current?.close();
  }, []);

  /* ── REST polling fallback (fires every 2.5s) ─────────────── */
  useEffect(() => {
    pollTwin();
    pollIncidents();
    pollRef.current = setInterval(() => {
      pollTwin();
      pollIncidents();
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollTwin, pollIncidents]);

  /* ── Sync-age counter (updates every second) ──────────────── */
  useEffect(() => {
    const t = setInterval(() => {
      setSyncAge(lastSync ? Math.round((Date.now() - lastSync) / 1000) : null);
    }, 1000);
    return () => clearInterval(t);
  }, [lastSync]);

  /* ── Command handlers ─────────────────────────────────────── */
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
      toast({ title: "Stress test started", description: "Results available at /stress-test" });
    } catch (e: any) {
      toast({ title: "Stress test failed", description: e.message, variant: "destructive" });
    } finally { setStressLoading(false); }
  };

  const runLearning = async () => {
    setLearningLoading(true);
    try {
      await fetch("/api/outcome/learning/run", { method: "POST" });
      toast({ title: "Learning cycle triggered" });
    } catch (e: any) {
      toast({ title: "Learning failed", description: e.message, variant: "destructive" });
    } finally { setLearningLoading(false); }
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
    } finally { setOutageLoading(false); }
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
    } finally { setReplayLoading(false); }
  };

  /* ── Derived values ───────────────────────────────────────── */
  const avgLatency = state
    ? Math.round(state.patients.reduce((a, p) => a + (p.latency ?? p.latencyMs ?? 0), 0) / (state.patients.length || 1))
    : 0;
  const openCount = incidents.filter((i) => i.status !== "resolved").length;
  const isTwinFresh = syncAge != null && syncAge <= 5;

  /* ═══════════════════════════════════════════════════════════
     Render
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="control-tower-title">Control Tower War Room</h1>
          <p className="text-xs text-muted-foreground mt-0.5">HIPAA / FDA Clinical Operations · Real-time</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
            style={{ borderColor: isTwinFresh ? "#22c55e44" : "#ef444444", background: isTwinFresh ? "#052e1620" : "#3b000a20" }}>
            <PulseDot alive={isTwinFresh} />
            <span className={isTwinFresh ? "text-green-400" : "text-red-400"}>
              Digital Twin {isTwinFresh ? `· ${syncAge}s ago` : "· Connecting…"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
            style={{ borderColor: wsLive ? "#22c55e44" : "#71717a44" }}>
            <span className={wsLive ? "text-green-400" : "text-muted-foreground"}>
              {wsLive ? "🟢 Clinical WS" : "◌ Clinical REST"}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DIGITAL TWIN LIVE SNAPSHOT PANEL
      ══════════════════════════════════════════════════════ */}
      <div className={`rounded-xl border-2 p-5 space-y-4 transition-all duration-700 ${slaBg(twin.slaStatus)}`}
        data-testid="twin-snapshot-panel">
        {/* Panel header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Digital Twin · Live System Snapshot</span>
            {twin.syncedAt && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {new Date(twin.syncedAt).toLocaleTimeString()}
              </Badge>
            )}
          </div>
          <Badge
            className={`text-sm font-bold px-3 py-0.5 ${
              twin.slaStatus === "OK" ? "bg-green-600 text-white" :
              twin.slaStatus === "BREACH" ? "bg-red-600 text-white" :
              twin.slaStatus === "DEGRADED" ? "bg-yellow-500 text-black" :
              "bg-muted text-muted-foreground"}`}
            data-testid="sla-status">
            {twin.slaStatus ?? "—"} SLA
          </Badge>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Active Cases */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Cases</p>
            <p className="text-2xl font-bold" data-testid="twin-active-cases">{twin.activeCases ?? state?.patients.length ?? 0}</p>
            <SparkBar value={twin.activeCases ?? 0} max={100} colorClass="bg-blue-500" />
          </div>

          {/* Avg Latency */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</p>
            <p className={`text-2xl font-bold ${(twin.avgLatency ?? 0) > 500 ? "text-yellow-400" : "text-green-400"}`}
              data-testid="twin-avg-latency">
              {twin.avgLatency ?? avgLatency}<span className="text-xs font-normal ml-0.5">ms</span>
            </p>
            <SparkBar value={twin.avgLatency ?? 0} max={1000}
              colorClass={(twin.avgLatency ?? 0) > 500 ? "bg-yellow-500" : "bg-green-500"} />
          </div>

          {/* P95 Latency */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">P95 Latency</p>
            <p className={`text-2xl font-bold ${(twin.p95Latency ?? 0) > 800 ? "text-red-400" : "text-foreground"}`}
              data-testid="twin-p95-latency">
              {twin.p95Latency ?? "—"}<span className="text-xs font-normal ml-0.5">ms</span>
            </p>
            <SparkBar value={twin.p95Latency ?? 0} max={1500}
              colorClass={(twin.p95Latency ?? 0) > 800 ? "bg-red-500" : "bg-blue-500"} />
          </div>

          {/* Error Rate */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Rate</p>
            <p className={`text-2xl font-bold ${(twin.errorRate ?? 0) > 0.05 ? "text-red-400" : "text-green-400"}`}
              data-testid="twin-error-rate">
              {twin.errorRate != null ? `${(twin.errorRate * 100).toFixed(1)}` : "0.0"}<span className="text-xs font-normal ml-0.5">%</span>
            </p>
            <SparkBar value={(twin.errorRate ?? 0) * 100} max={20}
              colorClass={(twin.errorRate ?? 0) > 0.05 ? "bg-red-500" : "bg-green-500"} />
          </div>

          {/* Error Budget */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Budget</p>
            <p className={`text-2xl font-bold ${budgetColor(twin.errorBudget)}`} data-testid="error-budget">
              {twin.errorBudget != null ? `${(twin.errorBudget * 100).toFixed(1)}` : "100.0"}<span className="text-xs font-normal ml-0.5">%</span>
            </p>
            <SparkBar value={(twin.errorBudget ?? 1) * 100} max={100}
              colorClass={(twin.errorBudget ?? 1) >= 0.999 ? "bg-green-500" : (twin.errorBudget ?? 1) >= 0.95 ? "bg-yellow-500" : "bg-red-500"} />
          </div>

          {/* Total Requests */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1 border border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Requests</p>
            <p className="text-2xl font-bold" data-testid="twin-total-requests">
              {twin.totalRequests != null ? twin.totalRequests.toLocaleString() : "0"}
            </p>
            <SparkBar value={twin.totalRequests ?? 0} max={10000} colorClass="bg-purple-500" />
          </div>
        </div>

        {/* Region + Agent row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Region Health mini table */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Region Health</p>
            {(twin.regionHealth ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Awaiting region data…</p>
            ) : (
              <div className="space-y-1">
                {(twin.regionHealth ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-background/40 rounded px-2 py-1.5 text-xs"
                    data-testid={`twin-region-${r.id}`}>
                    <span className="flex items-center gap-1.5 font-medium">
                      {regionDot(r.health)} {r.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono">{r.latencyMs}ms</span>
                      <Badge variant={r.health === "healthy" ? "default" : r.health === "down" ? "destructive" : "secondary"}
                        className="text-[10px] h-4 px-1.5">{r.health}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Summary */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Agent Governance</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",    value: twin.agentSummary?.total    ?? 0, color: "text-foreground" },
                { label: "Healthy",  value: twin.agentSummary?.healthy  ?? 0, color: "text-green-400" },
                { label: "Warning",  value: twin.agentSummary?.warning  ?? 0, color: "text-yellow-400" },
                { label: "Critical", value: twin.agentSummary?.critical ?? 0, color: "text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background/40 rounded p-2 text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {prediction && (
              <div className={`rounded p-2 text-xs mt-1 ${prediction.predicted
                ? "bg-red-950/40 border border-red-500/40" : "bg-green-950/40 border border-green-600/40"}`}
                data-testid="prediction-result">
                <span className="font-semibold">{prediction.predicted ? "⚠ Failure Predicted" : "✓ System Stable"}</span>
                {prediction.predicted && <p className="mt-0.5 text-red-300">{prediction.reason}</p>}
                <p className="text-muted-foreground mt-0.5 text-[10px]">
                  Confidence: {prediction.confidence} · {prediction.history?.latency?.length ?? 0} pts
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CLINICAL REAL-TIME METRICS ───────────────────────── */}
      <div>
        <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2 font-medium">Clinical Feed</p>
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
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Incidents</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${openCount > 0 ? "text-red-500" : "text-green-500"}`} data-testid="open-incidents">
                {openCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Alerts</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-yellow-500" data-testid="metric-alerts">{state?.alerts.length ?? 0}</p></CardContent>
          </Card>
        </div>
      </div>

      {/* ── MIDDLE ROW ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <p className="text-sm text-muted-foreground" data-testid="engines-empty">Connecting to clinical feed…</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ALERTS + TIMELINE ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
          <CardContent>
            {state?.alerts.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto" data-testid="alerts-list">
                {state.alerts.slice(-10).reverse().map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20"
                    data-testid={`alert-item-${i}`}>
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

        {/* Recent Patients */}
        <Card>
          <CardHeader><CardTitle>Recent Patient Flows</CardTitle></CardHeader>
          <CardContent>
            {state?.patients.length ? (
              <div className="space-y-2 max-h-60 overflow-y-auto" data-testid="patients-list">
                {state.patients.slice(-8).reverse().map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30"
                    data-testid={`patient-flow-${i}`}>
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
      </div>

      {/* ── INCIDENT TIMELINE (full-width) ───────────────────── */}
      <Card>
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

      {/* ── COMMAND PANEL ────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Command Panel</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Button variant="destructive" onClick={runOutage} disabled={outageLoading} data-testid="btn-simulate-outage">
              {outageLoading ? "Simulating…" : "💥 NYC Outage"}
            </Button>
            <Button variant="outline" onClick={recoverRegion} data-testid="btn-recover-region">
              ✅ Recover NYC
            </Button>
            <Button variant="outline" onClick={runReplay} disabled={replayLoading} data-testid="btn-replay-incidents">
              {replayLoading ? "Replaying…" : "▶ Replay Events"}
            </Button>
            <Button variant="outline" onClick={fetchPrediction} data-testid="btn-predict">
              🔮 Run Prediction
            </Button>
            <Button variant="outline" onClick={runStress} disabled={stressLoading} data-testid="btn-stress-test">
              {stressLoading ? "Running…" : "⚡ Stress Test"}
            </Button>
            <Button variant="outline" onClick={runLearning} disabled={learningLoading} data-testid="btn-learning-cycle">
              {learningLoading ? "Running…" : "🧠 Learning Cycle"}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/monitoring/dashboard", "_blank")} data-testid="btn-health-check">
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/monitoring/prometheus", "_blank")} data-testid="btn-prometheus">
              Prometheus
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/resilient/twin", "_blank")} data-testid="btn-twin">
              Twin JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/queue/stats", "_blank")} data-testid="btn-queue-stats">
              Queue Stats
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
