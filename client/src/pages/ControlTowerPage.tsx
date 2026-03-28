import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import IncidentTimeline from "@/components/IncidentTimeline";
import { Bot, FlaskConical, ChevronRight } from "lucide-react";

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

/* ─── EKG / Heartbeat animation ─────────────────────────────── */
function Heartbeat({ alive }: { alive: boolean }) {
  return (
    <div className="flex items-center gap-2" data-testid="twin-heartbeat">
      <svg viewBox="0 0 120 40" className="w-28 h-8" fill="none">
        <polyline
          points="0,20 18,20 26,4 34,36 42,20 54,20 60,2 66,38 72,20 84,20 90,14 96,26 102,20 120,20"
          stroke={alive ? "#22c55e" : "#6b7280"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={alive ? "opacity-100" : "opacity-40"}
          style={alive ? { animation: "ekgScroll 1.4s linear infinite" } : {}}
        />
        <style>{`
          @keyframes ekgScroll {
            0%   { stroke-dasharray: 200; stroke-dashoffset: 200; }
            60%  { stroke-dasharray: 200; stroke-dashoffset: 0; }
            100% { stroke-dasharray: 200; stroke-dashoffset: -200; }
          }
        `}</style>
      </svg>
      <span className={`text-xs font-mono font-bold ${alive ? "text-green-400" : "text-muted-foreground"}`}>
        {alive ? "LIVE" : "SYNCING"}
      </span>
    </div>
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
  const [taskAgents, setTaskAgents]       = useState<any[]>([]);
  const [busStats, setBusStats]           = useState<any>(null);
  const [busLog, setBusLog]               = useState<any[]>([]);
  const [evolutionStatus, setEvolutionStatus] = useState<any>(null);
  const [evolutionRunning, setEvolutionRunning] = useState(false);

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

  /* ── Agents + Evolution fetch ─────────────────────────── */
  const fetchAgentsAndBus = useCallback(async () => {
    try {
      const [ra, rb, rl] = await Promise.allSettled([
        fetch("/api/agent-evolution/agents/task"),
        fetch("/api/agent-evolution/bus/stats"),
        fetch("/api/agent-evolution/bus/log"),
      ]);
      if (ra.status === "fulfilled" && ra.value.ok) { const j = await ra.value.json(); setTaskAgents(j.agents ?? []); }
      if (rb.status === "fulfilled" && rb.value.ok) { const j = await rb.value.json(); setBusStats(j.stats); }
      if (rl.status === "fulfilled" && rl.value.ok) { const j = await rl.value.json(); setBusLog(j.log?.slice(0, 6) ?? []); }
    } catch {}
  }, []);

  const fetchEvolution = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-evolution/evolution/status");
      if (!r.ok) return;
      const j = await r.json();
      setEvolutionStatus(j.evolution);
    } catch {}
  }, []);

  const runEvolution = async () => {
    setEvolutionRunning(true);
    try {
      const r = await fetch("/api/agent-evolution/evolution/run", { method: "POST" });
      const j = await r.json();
      const res = j.result;
      toast({
        title: res?.proposed
          ? (res.approved ? `🧬 Evolution promoted: ${res.agent}` : `❌ Evolution rejected: ${res.agent}`)
          : "🧬 No evolution needed — system nominal",
        description: res?.reason ?? "",
        variant: res?.proposed && !res.approved ? "destructive" : "default",
      });
      await fetchEvolution();
    } catch (e: any) {
      toast({ title: "Evolution failed", description: e.message, variant: "destructive" });
    } finally { setEvolutionRunning(false); }
  };

  useEffect(() => {
    fetchAgentsAndBus();
    fetchEvolution();
    const t = setInterval(() => { fetchAgentsAndBus(); fetchEvolution(); }, 5000);
    return () => clearInterval(t);
  }, [fetchAgentsAndBus, fetchEvolution]);

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
          STICKY QUICK COMMANDS
      ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-2 shadow-md"
        data-testid="sticky-command-bar">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 font-medium">Commands:</span>
        <Button size="sm" variant="destructive" onClick={runOutage} disabled={outageLoading} data-testid="quick-btn-outage">
          {outageLoading ? "…" : "💥 NYC Outage"}
        </Button>
        <Button size="sm" variant="outline" onClick={recoverRegion} data-testid="quick-btn-recover">✅ Recover NYC</Button>
        <Button size="sm" variant="outline" onClick={runReplay} disabled={replayLoading} data-testid="quick-btn-replay">
          {replayLoading ? "…" : "▶ Replay"}
        </Button>
        <Button size="sm" variant="outline" onClick={fetchPrediction} data-testid="quick-btn-predict">🔮 Predict</Button>
        <Button size="sm" variant="outline" onClick={runStress} disabled={stressLoading} data-testid="quick-btn-stress">
          {stressLoading ? "…" : "⚡ Stress"}
        </Button>
        <Button size="sm" variant="outline" onClick={runLearning} disabled={learningLoading} data-testid="quick-btn-learning">
          {learningLoading ? "…" : "🧠 Learn"}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => window.open("/api/monitoring/dashboard","_blank")} data-testid="quick-btn-dash">Dashboard</Button>
          <Button size="sm" variant="ghost" onClick={() => window.open("/api/resilient/twin","_blank")} data-testid="quick-btn-twin-json">Twin JSON</Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DIGITAL TWIN LIVE SNAPSHOT PANEL
      ══════════════════════════════════════════════════════ */}
      <div className={`rounded-xl border-2 p-5 space-y-4 transition-all duration-700 ${slaBg(twin.slaStatus)}`}
        data-testid="twin-snapshot-panel">
        {/* Panel header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Digital Twin · Live System Snapshot</span>
            {twin.syncedAt && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {new Date(twin.syncedAt).toLocaleTimeString()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Heartbeat alive={isTwinFresh} />
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

      {/* ── AGENT CONTROLLER ─────────────────────────────────── */}
      <Card className="border border-border/60">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-sm font-semibold">Agent Controller</CardTitle>
            {busStats && (
              <Badge variant="secondary" className="text-[10px]">{busStats.processed ?? 0} tasks processed</Badge>
            )}
            <Badge variant={taskAgents.some(a => a.status === "error") ? "destructive" : "default"} className="text-[10px]">
              {taskAgents.filter(a => a.status === "idle").length}/{taskAgents.length} idle
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={fetchAgentsAndBus} data-testid="btn-refresh-agents">Refresh</Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Agent grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {taskAgents.map(agent => (
              <div key={agent.name}
                className={`rounded-lg px-3 py-2 border text-xs ${
                  agent.status === "idle"  ? "border-green-800/40 bg-green-950/20"
                  : agent.status === "busy"  ? "border-blue-800/40 bg-blue-950/20"
                  : agent.status === "error" ? "border-red-800/40 bg-red-950/20"
                  : "border-border/40 bg-muted/20"
                }`}
                data-testid={`card-agent-${agent.name}`}>
                <p className="font-semibold truncate">{agent.name}</p>
                <p className={`text-[10px] mt-0.5 ${
                  agent.status === "idle" ? "text-green-400" : agent.status === "busy" ? "text-blue-400" : agent.status === "error" ? "text-red-400" : "text-muted-foreground"
                }`}>{agent.status}</p>
                {agent.lastRun && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(agent.lastRun).toLocaleTimeString()}</p>
                )}
              </div>
            ))}
            {taskAgents.length === 0 && (
              <div className="col-span-4 text-xs text-muted-foreground italic py-2">Loading agents…</div>
            )}
          </div>

          {/* Bus stats + recent tasks */}
          {busStats && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/20 rounded px-3 py-2">
              <span>Queue depth: <strong className="text-foreground">{busStats.queueDepth}</strong></span>
              <span>Processed: <strong className="text-foreground">{busStats.processed}</strong></span>
              {Object.entries(busStats.byType ?? {}).slice(0, 4).map(([type, count]) => (
                <span key={type} className="text-[10px]">{type}: {String(count)}</span>
              ))}
            </div>
          )}

          {busLog.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {busLog.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] bg-muted/20 rounded px-2 py-1" data-testid={`row-bus-task-${i}`}>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">{t.type}</Badge>
                  <span className="text-muted-foreground shrink-0">{new Date(t.processedAt).toLocaleTimeString()}</span>
                  <span className="truncate text-muted-foreground">{t.result?.safe ? "safe ✓" : t.result?.blocked ? "blocked" : t.result?.healed ? "healed" : t.result?.routed ? `→ ${t.result.physician ?? "pending"}` : JSON.stringify(t.result).slice(0, 50)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── EVOLUTION ENGINE ──────────────────────────────────── */}
      <Card className="border border-border/60">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold">Evolution Engine</CardTitle>
            {evolutionStatus && (
              <Badge variant="secondary" className="text-[10px]">{evolutionStatus.cycleCount ?? 0} cycles</Badge>
            )}
            {evolutionStatus?.stats && (
              <Badge variant={evolutionStatus.stats.approved > 0 ? "default" : "secondary"} className="text-[10px]">
                {evolutionStatus.stats.approved} promoted · {evolutionStatus.stats.rejected} rejected
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={fetchEvolution} data-testid="btn-refresh-evolution">Refresh</Button>
            <Button size="sm" variant="outline" onClick={runEvolution} disabled={evolutionRunning} data-testid="btn-run-evolution">
              {evolutionRunning ? "Evolving…" : "🧬 Run Cycle"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {evolutionStatus ? (
            <>
              {/* Current proposal */}
              {evolutionStatus.lastProposal?.proposal ? (
                <div className={`rounded-lg px-3 py-2 text-xs border ${evolutionStatus.lastProposal.proposal.urgency === "high" ? "border-red-800/40 bg-red-950/20" : evolutionStatus.lastProposal.proposal.urgency === "medium" ? "border-amber-800/40 bg-amber-950/20" : "border-border/40 bg-muted/20"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{evolutionStatus.lastProposal.proposal.agent}</span>
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1">{evolutionStatus.lastProposal.proposal.urgency}</Badge>
                    <span className="text-muted-foreground">{evolutionStatus.lastProposal.proposal.change}</span>
                  </div>
                  <p className="text-muted-foreground">{evolutionStatus.lastProposal.proposal.reason}</p>
                </div>
              ) : (
                <div className="rounded-lg bg-green-950/20 border border-green-800/30 px-3 py-2 text-xs text-green-400">
                  System nominal — no evolution proposal needed
                </div>
              )}

              {/* Sandbox result */}
              {evolutionStatus.lastSandboxResult && (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="rounded bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Pass Rate</p>
                    <p className="font-bold text-sm">{(evolutionStatus.lastSandboxResult.passRate * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Safety</p>
                    <p className="font-bold text-sm">{(evolutionStatus.lastSandboxResult.safetyAccuracy * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">F1</p>
                    <p className="font-bold text-sm">{evolutionStatus.lastSandboxResult.f1Score?.toFixed(2) ?? "—"}</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Avg Latency</p>
                    <p className="font-bold text-sm">{evolutionStatus.lastSandboxResult.avgLatencyMs}ms</p>
                  </div>
                </div>
              )}

              {/* Promotion history */}
              {evolutionStatus.promotionHistory?.length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Promotion History</p>
                  {evolutionStatus.promotionHistory.map((p: any, i: number) => (
                    <div key={i} className={`flex items-center gap-2 text-[10px] rounded px-2 py-1 ${p.verdict?.approved ? "bg-green-950/20" : "bg-red-950/20"}`} data-testid={`row-evolution-${i}`}>
                      <span>{p.verdict?.approved ? "✅" : "❌"}</span>
                      <span className="font-medium">{p.agent}</span>
                      <span className="text-muted-foreground truncate">{p.proposal?.change}</span>
                      <span className="text-muted-foreground shrink-0">{new Date(p.promotedAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {evolutionStatus.lastCycleAt && (
                <p className="text-[10px] text-muted-foreground">Last cycle: {new Date(evolutionStatus.lastCycleAt).toLocaleString()}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">Evolution engine initializing — first cycle runs in 10 minutes, or trigger manually.</p>
          )}
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
