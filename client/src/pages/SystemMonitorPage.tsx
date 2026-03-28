import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ───────────────────────────────────────────────── */
type HealthStatus = "green" | "yellow" | "red" | "gray";

interface EngineHealth {
  name: string;
  status: HealthStatus;
  lastHeartbeat: number;
  lastSuccess?: number;
  lastFailure?: number;
  latencyMs?: number;
  errorCount: number;
  notes?: string;
}

interface SkillHealth {
  name: string;
  status: HealthStatus;
  lastCalled?: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs?: number;
  lastError?: string;
}

interface DegradationAlert {
  name: string;
  avgLatencyMs: number;
  trend: "rising" | "stable" | "falling";
  samples: number;
}

interface SkillTrace {
  skill: string;
  status: "success" | "failed" | "skipped";
  latencyMs?: number;
  reason?: string;
}

interface CaseTrace {
  caseId: string;
  startedAt: number;
  steps: SkillTrace[];
}

interface HealEntry {
  ts: number;
  engine: string;
  action: string;
}

/* ─── Helpers ─────────────────────────────────────────────── */
function getWsUrl(path: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function statusDot(s: HealthStatus) {
  if (s === "green")  return "🟢";
  if (s === "yellow") return "🟡";
  if (s === "red")    return "🔴";
  return "⚫";
}

function statusBadge(s: HealthStatus) {
  if (s === "green")  return "default" as const;
  if (s === "red")    return "destructive" as const;
  return "secondary" as const;
}

function relTime(ts?: number): string {
  if (!ts) return "—";
  const d = Math.round((Date.now() - ts) / 1000);
  if (d < 60)   return `${d}s ago`;
  if (d < 3600) return `${Math.round(d/60)}m ago`;
  return `${Math.round(d/3600)}h ago`;
}

function trendIcon(t: string) {
  if (t === "rising")  return "↑";
  if (t === "falling") return "↓";
  return "→";
}

/* ─── Pulse dot ───────────────────────────────────────────── */
function PulseDot({ alive }: { alive: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {alive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${alive ? "bg-green-500" : "bg-red-500"}`} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════ */
export default function SystemMonitorPage() {
  const [engines, setEngines]         = useState<EngineHealth[]>([]);
  const [skills, setSkills]           = useState<SkillHealth[]>([]);
  const [degradation, setDegradation] = useState<DegradationAlert[]>([]);
  const [healLog, setHealLog]         = useState<HealEntry[]>([]);
  const [wsLive, setWsLive]           = useState(false);
  const [lastUpdate, setLastUpdate]   = useState<number | null>(null);
  const [traceId, setTraceId]         = useState("");
  const [trace, setTrace]             = useState<CaseTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [healing, setHealing]         = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  /* ── WebSocket (live 2s push) ─────────────────────────── */
  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(getWsUrl("/ws/monitor"));
        wsRef.current = ws;
        ws.onopen  = () => setWsLive(true);
        ws.onclose = () => { setWsLive(false); setTimeout(connect, 5000); };
        ws.onerror = () => ws.close();
        ws.onmessage = (msg) => {
          try {
            const d = JSON.parse(msg.data);
            if (d.engines)     setEngines(d.engines);
            if (d.skills)      setSkills(d.skills);
            if (d.degradation) setDegradation(d.degradation);
            setLastUpdate(Date.now());
          } catch {}
        };
      } catch {}
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  /* ── REST fallback poll (5s) ──────────────────────────── */
  const poll = useCallback(async () => {
    try {
      const [re, rs] = await Promise.allSettled([
        fetch("/api/monitoring/engines"),
        fetch("/api/monitoring/skills"),
      ]);
      if (re.status === "fulfilled" && re.value.ok) {
        const j = await re.value.json();
        if (j.engines) setEngines(j.engines);
      }
      if (rs.status === "fulfilled" && rs.value.ok) {
        const j = await rs.value.json();
        if (j.skills) setSkills(j.skills);
      }
      setLastUpdate(Date.now());
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  /* ── Fetch heal log ───────────────────────────────────── */
  const fetchHealLog = useCallback(async () => {
    try {
      const r = await fetch("/api/monitoring/heal-log");
      const j = await r.json();
      if (j.log) setHealLog(j.log.slice(0, 20));
    } catch {}
  }, []);

  useEffect(() => { fetchHealLog(); }, [fetchHealLog]);

  /* ── Trigger manual heal ──────────────────────────────── */
  const runHeal = async () => {
    setHealing(true);
    try {
      const r = await fetch("/api/monitoring/heal", { method: "POST" });
      const j = await r.json();
      const actions: string[] = j.actions ?? [];
      toast({
        title: `Auto-Heal Complete`,
        description: actions.length
          ? actions.slice(0, 3).join(" · ")
          : "All engines healthy — nothing to heal",
      });
      await fetchHealLog();
      await poll();
    } catch (e: any) {
      toast({ title: "Heal failed", description: e.message, variant: "destructive" });
    } finally { setHealing(false); }
  };

  /* ── Fetch case trace ─────────────────────────────────── */
  const lookupTrace = async () => {
    if (!traceId.trim()) return;
    setTraceLoading(true);
    try {
      const r = await fetch(`/api/monitoring/trace/${encodeURIComponent(traceId.trim())}`);
      const j = await r.json();
      setTrace(j.trace ?? null);
      if (!j.trace) toast({ title: "No trace found", description: `No recorded trace for case: ${traceId}` });
    } catch (e: any) {
      toast({ title: "Trace lookup failed", description: e.message, variant: "destructive" });
    } finally { setTraceLoading(false); }
  };

  /* ── Derived ──────────────────────────────────────────── */
  const greenEngines  = engines.filter(e => e.status === "green").length;
  const yellowEngines = engines.filter(e => e.status === "yellow").length;
  const redEngines    = engines.filter(e => e.status === "red").length;
  const greenSkills   = skills.filter(s => s.status === "green").length;
  const redSkills     = skills.filter(s => s.status === "red").length;

  /* ═══════════════════════════════════════════════════════
     Render
  ═══════════════════════════════════════════════════════ */
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="sysmon-title">System Monitor</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live engine · skill · case trace observatory — auto-healing enabled
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
            style={{ borderColor: wsLive ? "#22c55e44" : "#71717a44" }}>
            <PulseDot alive={wsLive} />
            <span className={wsLive ? "text-green-400" : "text-muted-foreground"}>
              {wsLive ? "WS Live" : "REST Polling"}
            </span>
          </div>
          {lastUpdate && (
            <span className="text-xs text-muted-foreground font-mono">
              Updated {relTime(lastUpdate)}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={runHeal} disabled={healing} data-testid="btn-heal">
            {healing ? "Healing…" : "🔧 Auto-Heal"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.open("/api/monitoring/engines", "_blank")}
            data-testid="btn-engines-json">Engines JSON</Button>
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Healthy Engines</p>
            <p className="text-3xl font-bold text-green-500" data-testid="stat-green-engines">{greenEngines}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Degraded Engines</p>
            <p className={`text-3xl font-bold ${yellowEngines > 0 ? "text-yellow-400" : "text-muted-foreground"}`}
              data-testid="stat-yellow-engines">{yellowEngines}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed Engines</p>
            <p className={`text-3xl font-bold ${redEngines > 0 ? "text-red-500" : "text-muted-foreground"}`}
              data-testid="stat-red-engines">{redEngines}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Skill Health</p>
            <p className="text-3xl font-bold" data-testid="stat-skills">
              <span className="text-green-500">{greenSkills}</span>
              <span className="text-muted-foreground text-lg font-normal"> / </span>
              <span className={redSkills > 0 ? "text-red-500" : "text-muted-foreground"}>{skills.length}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Engine Health Grid ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              🧠 Engine Health
              <Badge variant="outline" className="font-mono text-xs">{engines.length} engines</Badge>
            </CardTitle>
            {redEngines > 0 && (
              <Badge variant="destructive" className="animate-pulse">{redEngines} DOWN</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {engines.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Loading engine registry…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {engines.map((e) => (
                <div
                  key={e.name}
                  data-testid={`engine-card-${e.name}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors
                    ${e.status === "red"    ? "border-red-500/40 bg-red-950/20" :
                      e.status === "yellow" ? "border-yellow-400/40 bg-yellow-950/10" :
                      e.status === "green"  ? "border-green-600/30 bg-green-950/10" :
                      "border-border/40 bg-muted/10"}`}
                >
                  <span className="text-lg leading-none mt-0.5">{statusDot(e.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold truncate">{e.name}</p>
                      <Badge variant={statusBadge(e.status)} className="text-[10px] h-4 px-1.5 shrink-0">
                        {e.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      {e.latencyMs != null && (
                        <span className={e.latencyMs > 2000 ? "text-yellow-400" : "text-green-400"}>
                          {e.latencyMs}ms
                        </span>
                      )}
                      <span>errors: {e.errorCount}</span>
                      <span>hb: {relTime(e.lastHeartbeat)}</span>
                    </div>
                    {e.notes && (
                      <p className="text-[10px] text-red-400 mt-1 truncate" title={e.notes}>{e.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Skill Health Grid ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              🧩 Skill Health
              <Badge variant="outline" className="font-mono text-xs">{skills.length} skills</Badge>
            </CardTitle>
            {redSkills > 0 && (
              <Badge variant="destructive">{redSkills} failing</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Loading skill registry…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {skills.map((s) => (
                <div
                  key={s.name}
                  data-testid={`skill-card-${s.name}`}
                  className={`p-2.5 rounded-lg border transition-colors
                    ${s.status === "red"    ? "border-red-500/40 bg-red-950/20" :
                      s.status === "yellow" ? "border-yellow-400/40 bg-yellow-950/10" :
                      s.status === "green"  ? "border-green-600/30 bg-green-950/10" :
                      "border-border/40 bg-muted/10"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold truncate">{s.name}</span>
                    <span>{statusDot(s.status)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="text-green-400">✓{s.successCount}</span>
                    {s.failureCount > 0 && <span className="text-red-400">✗{s.failureCount}</span>}
                    {s.avgLatencyMs != null && <span>{Math.round(s.avgLatencyMs)}ms</span>}
                  </div>
                  {s.lastError && (
                    <p className="text-[10px] text-red-400 mt-1 truncate" title={s.lastError}>{s.lastError}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Degradation Alerts + Heal Log ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>📊 Trend Degradation Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {degradation.length === 0 ? (
              <p className="text-sm text-green-500/80 italic" data-testid="degrade-empty">
                ✓ No degradation detected — latencies nominal
              </p>
            ) : (
              <div className="space-y-2" data-testid="degrade-list">
                {degradation.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border border-yellow-500/30 bg-yellow-950/20">
                    <div>
                      <p className="text-sm font-semibold">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.samples} samples</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-yellow-400">{d.avgLatencyMs}ms avg</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {trendIcon(d.trend)} {d.trend}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>🔧 Auto-Heal Log</CardTitle>
              <Button size="sm" variant="ghost" onClick={fetchHealLog} data-testid="btn-refresh-heal">Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            {healLog.length === 0 ? (
              <p className="text-sm text-muted-foreground italic" data-testid="heal-log-empty">
                No heal actions yet — system stable
              </p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto font-mono text-xs" data-testid="heal-log-list">
                {healLog.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 border border-border/30">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(h.ts).toLocaleTimeString()}
                    </span>
                    <span className="text-blue-400 font-semibold shrink-0">{h.engine}</span>
                    <span className="text-green-300 truncate">{h.action}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Case Execution Trace ─────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>🔍 Per-Case Execution Trace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter case ID (e.g. case-001)"
              value={traceId}
              onChange={e => setTraceId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookupTrace()}
              className="font-mono text-sm"
              data-testid="input-trace-id"
            />
            <Button onClick={lookupTrace} disabled={traceLoading || !traceId.trim()} data-testid="btn-lookup-trace">
              {traceLoading ? "Looking up…" : "Look Up"}
            </Button>
          </div>

          {trace && (
            <div className="space-y-2" data-testid="trace-result">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono font-bold text-foreground">{trace.caseId}</span>
                <span>·</span>
                <span>{trace.steps.length} steps</span>
                <span>·</span>
                <span>started {relTime(trace.startedAt)}</span>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
                {trace.steps.map((step, i) => (
                  <div
                    key={i}
                    data-testid={`trace-step-${i}`}
                    className={`flex items-center gap-3 p-2 rounded border
                      ${step.status === "success" ? "border-green-600/30 bg-green-950/10" :
                        step.status === "failed"  ? "border-red-500/30 bg-red-950/20" :
                        "border-border/30 bg-muted/10"}`}
                  >
                    <span className="shrink-0">
                      {step.status === "success" ? "✅" : step.status === "failed" ? "❌" : "⏭"}
                    </span>
                    <span className="font-semibold text-foreground shrink-0">{step.skill}</span>
                    <Badge variant={step.status === "success" ? "default" : step.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] h-4 px-1 shrink-0">
                      {step.status}
                    </Badge>
                    {step.latencyMs != null && (
                      <span className="text-muted-foreground">{step.latencyMs}ms</span>
                    )}
                    {step.reason && (
                      <span className="text-red-400 truncate" title={step.reason}>{step.reason}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!trace && !traceLoading && traceId && (
            <p className="text-xs text-muted-foreground italic">
              No trace found. Traces are recorded when cases pass through the clinical pipeline.
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
