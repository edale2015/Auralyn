import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, AlertTriangle, TrendingDown, TrendingUp, Lock, Unlock,
  Rocket, BarChart2, CheckCircle2, XCircle, RefreshCw, Brain,
  FlaskConical, Flame, Clock,
} from "lucide-react";

// ─── Mini helpers ─────────────────────────────────────────────────────────
function Pct({ value, color = "bg-blue-500" }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.round((value ?? 0) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border/30">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <Pct value={value} color={color} />
    </div>
  );
}

function healthBadge(h: string) {
  if (h === "green")  return <Badge className="bg-green-700/80 text-green-200 text-[10px]">✅ Healthy</Badge>;
  if (h === "yellow") return <Badge className="bg-yellow-700/80 text-yellow-200 text-[10px]">⚠ Caution</Badge>;
  return                     <Badge className="bg-red-700/80 text-red-200 text-[10px]">🔴 At Risk</Badge>;
}

function severityColor(s: string) {
  return s === "none" ? "text-green-400" : s === "mild" ? "text-yellow-400" : s === "moderate" ? "text-orange-400" : "text-red-400";
}

function versionStatusBadge(status: string) {
  const map: Record<string, string> = {
    live:         "bg-green-700/80 text-green-200",
    locked:       "bg-indigo-700/80 text-indigo-200",
    experimental: "bg-yellow-700/80 text-yellow-200",
    deprecated:   "bg-zinc-700/80 text-zinc-400",
  };
  return map[status] ?? "bg-zinc-700/80 text-zinc-400";
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function FDAValidationPage() {
  const { toast } = useToast();

  const [status,      setStatus]      = useState<any>(null);
  const [drift,       setDrift]       = useState<any>(null);
  const [safety,      setSafety]      = useState<any>(null);
  const [validation,  setValidation]  = useState<any>(null);
  const [versions,    setVersions]    = useState<any>(null);
  const [audit,       setAudit]       = useState<any[]>([]);
  const [learning,    setLearning]    = useState<any>(null);

  const [loadingStatus,    setLoadingStatus]    = useState(false);
  const [loadingValidate,  setLoadingValidate]  = useState(false);
  const [loadingLock,      setLoadingLock]      = useState(false);
  const [loadingFreeze,    setLoadingFreeze]    = useState(false);
  const [loadingExp,       setLoadingExp]       = useState(false);

  // ── Fetch everything ──────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [s, d, sa, v, au, l] = await Promise.all([
        fetch("/api/fda-dashboard/status").then(r => r.json()),
        fetch("/api/fda-dashboard/drift").then(r => r.json()),
        fetch("/api/fda-dashboard/safety").then(r => r.json()),
        fetch("/api/fda-dashboard/release/versions").then(r => r.json()),
        fetch("/api/fda-dashboard/audit?limit=15").then(r => r.json()),
        fetch("/api/fda-dashboard/learning").then(r => r.json()),
      ]);
      if (s.ok)  setStatus(s);
      if (d.ok)  setDrift(d);
      if (sa.ok) setSafety(sa);
      if (v.ok)  setVersions(v);
      if (au.ok) setAudit(au.entries ?? []);
      if (l.ok)  setLearning(l);
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally { setLoadingStatus(false); }
  }, [toast]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // ── Run FDA Validation ────────────────────────────────────────────────
  const runValidation = async () => {
    setLoadingValidate(true);
    try {
      const r = await fetch("/api/fda-dashboard/validate", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Validation failed");
      setValidation(j);
      await fetchAll(); // refresh versions after potential auto-promote
      toast({
        title: j.promoted ? `✅ Promoted to ${j.promotedVersion}` : "Validation complete",
        description: `Accuracy ${(j.metrics?.accuracy * 100).toFixed(1)}% — F1 ${(j.metrics?.f1Score * 100).toFixed(1)}%`,
      });
    } catch (e: any) {
      toast({ title: "Validation failed", description: e.message, variant: "destructive" });
    } finally { setLoadingValidate(false); }
  };

  // ── Release actions ───────────────────────────────────────────────────
  const lockCurrent = async () => {
    setLoadingLock(true);
    try {
      const r = await fetch("/api/fda-dashboard/release/lock", { method: "POST" });
      const j = await r.json();
      toast({ title: j.message ?? "Locked", description: `Version ${j.version}` });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Lock failed", description: e.message, variant: "destructive" });
    } finally { setLoadingLock(false); }
  };

  const freezeLearning = async () => {
    setLoadingFreeze(true);
    try {
      const r = await fetch("/api/fda-dashboard/release/freeze", { method: "POST" });
      const j = await r.json();
      toast({ title: "Learning frozen", description: j.message });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Freeze failed", description: e.message, variant: "destructive" });
    } finally { setLoadingFreeze(false); }
  };

  const createExperimental = async () => {
    setLoadingExp(true);
    try {
      const r = await fetch("/api/fda-dashboard/release/experimental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Experimental — ${new Date().toLocaleTimeString()}` }),
      });
      const j = await r.json();
      toast({ title: `Branch created: ${j.release?.version}`, description: j.release?.label });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setLoadingExp(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Top status bar ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/30 bg-background px-4 py-3 flex flex-wrap items-center gap-3">
        <Shield className="h-5 w-5 text-indigo-400 shrink-0" />
        <h1 className="text-sm font-semibold">FDA Validation Dashboard</h1>

        {status && (
          <>
            <div className="flex items-center gap-1.5 rounded-md border border-border/30 px-2 py-1 text-[10px]">
              {status.isLocked
                ? <Lock className="h-3 w-3 text-indigo-400" />
                : <Unlock className="h-3 w-3 text-green-400" />}
              <span className="font-mono">{status.version}</span>
              {status.isLocked
                ? <span className="text-indigo-400 ml-1">LOCKED</span>
                : <span className="text-green-400 ml-1">LIVE</span>}
            </div>

            {healthBadge(status.systemHealth)}

            <div className="flex gap-2">
              <div className={`text-[10px] px-2 py-0.5 rounded ${status.driftDetected ? "bg-red-900/60 text-red-300" : "bg-green-900/40 text-green-300"}`}>
                {status.driftDetected ? "⚠ Drift" : "✓ Stable"}
              </div>
              <div className={`text-[10px] px-2 py-0.5 rounded ${status.safetyBlocks > 0 ? "bg-orange-900/60 text-orange-300" : "bg-green-900/40 text-green-300"}`}>
                {status.safetyBlocks} blocks (24h)
              </div>
              <div className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 text-purple-300">
                {status.weightCount} weights
              </div>
            </div>
          </>
        )}

        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[10px]"
          onClick={fetchAll} disabled={loadingStatus}
          data-testid="btn-refresh-status">
          <RefreshCw className={`h-3 w-3 mr-1 ${loadingStatus ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── 1. Safety Guard Panel ──────────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10" data-testid="panel-safety">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-red-400" /> Safety Guard
              {safety?.summary && (
                <Badge className={`ml-auto text-[10px] ${safety.summary.criticalBlocks > 0 ? "bg-red-700/80 text-red-200" : "bg-green-700/80 text-green-200"}`}>
                  {safety.summary.criticalBlocks > 0 ? `${safety.summary.criticalBlocks} critical` : "No critical blocks"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {safety?.summary ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Total Blocks", value: safety.summary.totalBlocks,    color: "text-white" },
                    { label: "Critical",     value: safety.summary.criticalBlocks, color: "text-red-400" },
                    { label: "Last 24h",     value: safety.summary.last24hBlocks,  color: "text-orange-400" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border border-border/20 bg-black/20 p-2 text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Recent Block Log</p>
                  {safety.log?.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> No safety blocks recorded
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {(safety.log ?? []).map((b: any, i: number) => (
                        <div key={i} className={`rounded-md border p-2 text-[10px] flex items-start gap-2 ${
                          b.level === "critical" ? "border-red-700/40 bg-red-950/30" :
                          b.level === "high"     ? "border-orange-700/40 bg-orange-950/30" :
                          "border-border/20 bg-muted/10"
                        }`}>
                          <XCircle className={`h-3 w-3 mt-0.5 shrink-0 ${b.level === "critical" ? "text-red-400" : "text-orange-400"}`} />
                          <div>
                            <span className="font-medium capitalize">[{b.level}]</span>{" "}
                            <span className="text-muted-foreground">{b.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground animate-pulse">Loading safety data…</div>
            )}
          </CardContent>
        </Card>

        {/* ── 2. Drift Detector Panel ────────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10" data-testid="panel-drift">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <TrendingDown className="h-3.5 w-3.5 text-yellow-400" /> Drift Detector
              {drift && (
                <Badge className={`ml-auto text-[10px] ${drift.driftDetected ? "bg-red-700/80 text-red-200" : "bg-green-700/80 text-green-200"}`}>
                  {drift.driftDetected ? "⚠ DRIFT DETECTED" : "✅ Stable"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {drift ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/20 bg-black/20 p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Baseline Accuracy</p>
                    <p className="text-xl font-bold text-green-400">{(drift.baselineAccuracy * 100).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">{drift.baselineSize} samples</p>
                  </div>
                  <div className="rounded-lg border border-border/20 bg-black/20 p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Recent Accuracy</p>
                    <p className={`text-xl font-bold ${drift.recentAccuracy < drift.baselineAccuracy - 0.05 ? "text-red-400" : "text-green-400"}`}>
                      {(drift.recentAccuracy * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">{drift.recentSize} samples</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/20 bg-black/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Accuracy Drop</span>
                    <span className={`text-xs font-mono font-medium ${drift.driftDetected ? "text-red-400" : "text-green-400"}`}>
                      {drift.delta > 0 ? "-" : "+"}{(Math.abs(drift.delta) * 100).toFixed(1)}pp
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Severity</span>
                    <span className={`text-xs font-medium capitalize ${severityColor(drift.severity)}`}>{drift.severity}</span>
                  </div>
                </div>

                <div className={`rounded-lg border p-3 text-[10px] ${
                  drift.severity === "none"     ? "border-green-700/30 bg-green-950/20 text-green-300" :
                  drift.severity === "mild"     ? "border-yellow-700/30 bg-yellow-950/20 text-yellow-300" :
                  drift.severity === "moderate" ? "border-orange-700/30 bg-orange-950/20 text-orange-300" :
                  "border-red-700/30 bg-red-950/20 text-red-300"
                }`}>
                  <p className="font-medium mb-0.5">Recommended Action</p>
                  <p>{drift.recommendedAction}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Baseline vs Recent</p>
                  <div className="h-1.5 w-full rounded-full bg-border/30 relative">
                    <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${drift.baselineAccuracy * 100}%` }} />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border/30">
                    <div className={`h-1.5 rounded-full ${drift.driftDetected ? "bg-red-500" : "bg-green-400"}`}
                      style={{ width: `${drift.recentAccuracy * 100}%` }} />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground animate-pulse">Loading drift data…</div>
            )}
          </CardContent>
        </Card>

        {/* ── 3. FDA Validation Panel ────────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10" data-testid="panel-validation">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <BarChart2 className="h-3.5 w-3.5 text-blue-400" /> FDA Validation
              {validation?.metrics && (
                <Badge className={`ml-auto text-[10px] ${validation.metrics.passesThreshold ? "bg-green-700/80 text-green-200" : "bg-red-700/80 text-red-200"}`}>
                  {validation.metrics.passesThreshold ? "PASS" : "FAIL"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Button
              className="w-full h-9 text-xs bg-blue-700 hover:bg-blue-600"
              onClick={runValidation} disabled={loadingValidate}
              data-testid="btn-run-validation"
            >
              <FlaskConical className={`h-3.5 w-3.5 mr-2 ${loadingValidate ? "animate-pulse" : ""}`} />
              {loadingValidate ? "Running Validation…" : "Run FDA Validation"}
            </Button>

            {validation?.metrics ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-center">
                  {[
                    { label: "Accuracy",  v: validation.metrics.accuracy,    c: "text-green-400" },
                    { label: "F1 Score",  v: validation.metrics.f1Score,     c: "text-blue-400" },
                    { label: "Precision", v: validation.metrics.precision,   c: "text-cyan-400" },
                    { label: "Recall",    v: validation.metrics.sensitivity, c: "text-purple-400" },
                  ].map(m => (
                    <div key={m.label} className="rounded-lg border border-border/20 bg-black/20 p-2">
                      <p className={`text-base font-bold ${m.c}`}>{(m.v * 100).toFixed(1)}%</p>
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <MetricRow label="Accuracy"  value={validation.metrics.accuracy}    color="bg-green-500" />
                  <MetricRow label="Precision" value={validation.metrics.precision}   color="bg-cyan-500" />
                  <MetricRow label="Recall"    value={validation.metrics.sensitivity} color="bg-purple-500" />
                  <MetricRow label="F1 Score"  value={validation.metrics.f1Score}     color="bg-blue-500" />
                </div>

                {/* Stratified groups */}
                {validation.groupMetrics && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">Stratified Performance</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(validation.groupMetrics).map(([k, m]: [string, any]) => (
                        <div key={k} className={`rounded-md border p-2 text-[10px] ${m.passesThreshold ? "border-green-700/30 bg-green-950/20" : "border-red-700/30 bg-red-950/20"}`}>
                          <p className="font-medium capitalize">{k}</p>
                          <p className={m.passesThreshold ? "text-green-400" : "text-red-400"}>
                            Acc {(m.accuracy * 100).toFixed(1)}% · n={m.total}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground">
                  {validation.promoted
                    ? <span className="text-green-400">✅ Auto-promoted to {validation.promotedVersion}</span>
                    : <span className="text-yellow-400">ℹ {validation.promotionReason}</span>
                  }
                  <span className="ml-2">· {validation.totalCases} cases · {validation.ranAt?.slice(11, 19)}</span>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border/20 bg-muted/5 p-6 text-center">
                <FlaskConical className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Click "Run FDA Validation" to evaluate all golden cases</p>
                <p className="text-[10px] text-muted-foreground mt-1">Requires ≥85% accuracy to auto-promote</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 4. Release Manager Panel ───────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10" data-testid="panel-release">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <Rocket className="h-3.5 w-3.5 text-purple-400" /> Release Manager
              {versions?.summary && (
                <Badge className={`ml-auto text-[10px] ${versions.summary.isLocked ? "bg-indigo-700/80 text-indigo-200" : "bg-green-700/80 text-green-200"}`}>
                  {versions.summary.currentVersion}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline"
                className="h-8 text-[10px] border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                onClick={lockCurrent} disabled={loadingLock || versions?.summary?.isLocked}
                data-testid="btn-lock-version"
              >
                <Lock className="h-3 w-3 mr-1" />
                {loadingLock ? "…" : versions?.summary?.isLocked ? "Locked" : "Lock"}
              </Button>
              <Button size="sm" variant="outline"
                className="h-8 text-[10px] border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={freezeLearning} disabled={loadingFreeze}
                data-testid="btn-freeze-learning"
              >
                <Brain className="h-3 w-3 mr-1" />
                {loadingFreeze ? "…" : "Freeze"}
              </Button>
              <Button size="sm" variant="outline"
                className="h-8 text-[10px] border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                onClick={createExperimental} disabled={loadingExp}
                data-testid="btn-create-experimental"
              >
                <Flame className="h-3 w-3 mr-1" />
                {loadingExp ? "…" : "Branch"}
              </Button>
            </div>

            {/* Stats row */}
            {versions?.summary && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Releases", v: versions.summary.totalReleases },
                  { label: "Locked",   v: versions.summary.lockedCount,  c: "text-indigo-400" },
                  { label: "Threshold", v: `${(versions.summary.promotionThreshold * 100).toFixed(0)}%`, c: "text-green-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-border/20 bg-black/20 p-2">
                    <p className={`text-sm font-bold ${s.c ?? "text-white"}`}>{s.v}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Version timeline */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Version Timeline</p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {(versions?.releases ?? []).slice().reverse().map((r: any) => (
                  <div key={r.version} className={`rounded-md border p-2 flex items-center justify-between ${
                    r.status === "live"   ? "border-green-700/30 bg-green-950/20" :
                    r.status === "locked" ? "border-indigo-700/30 bg-indigo-950/20" :
                    r.status === "experimental" ? "border-yellow-700/30 bg-yellow-950/20" :
                    "border-border/20 bg-muted/5"
                  }`} data-testid={`version-${r.version}`}>
                    <div>
                      <p className="text-[10px] font-mono font-medium">{r.version}</p>
                      <p className="text-[10px] text-muted-foreground">{r.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.metrics && (
                        <span className="text-[10px] text-green-400">{(r.metrics.accuracy * 100).toFixed(0)}%</span>
                      )}
                      <Badge className={`text-[10px] ${versionStatusBadge(r.status)}`}>{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Learning guard status */}
            {learning && (
              <div className={`rounded-lg border p-2 text-[10px] ${learning.frozen ? "border-indigo-700/30 bg-indigo-950/20" : "border-green-700/30 bg-green-950/20"}`}>
                <div className="flex items-center gap-2">
                  {learning.frozen
                    ? <Lock className="h-3 w-3 text-indigo-400" />
                    : <Unlock className="h-3 w-3 text-green-400" />}
                  <span className={learning.frozen ? "text-indigo-300" : "text-green-300"}>
                    Learning {learning.frozen ? "FROZEN" : "ACTIVE"} — {learning.weightCount} weights tracked
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Audit Log ──────────────────────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10 md:col-span-2" data-testid="panel-audit">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-cyan-400" /> CFR-11 Audit Log
              <span className="ml-1 text-muted-foreground text-[10px]">({audit.length} entries)</span>
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px]"
                onClick={fetchAll} data-testid="btn-refresh-audit">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {audit.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-400" /> No audit entries yet — they appear when cases are processed
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/20 text-muted-foreground">
                      <th className="text-left pb-1.5 pr-3">Time</th>
                      <th className="text-left pb-1.5 pr-3">Event</th>
                      <th className="text-left pb-1.5 pr-3">User</th>
                      <th className="text-left pb-1.5 pr-3">Action</th>
                      <th className="text-left pb-1.5">Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {audit.map((e: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/10" data-testid={`audit-entry-${i}`}>
                        <td className="py-1 pr-3 font-mono text-muted-foreground">
                          {e.timestamp?.slice(11, 19) ?? "—"}
                        </td>
                        <td className="py-1 pr-3 text-cyan-400">{e.eventType ?? "—"}</td>
                        <td className="py-1 pr-3">{e.userId ?? e.actor ?? "system"}</td>
                        <td className="py-1 pr-3 text-muted-foreground max-w-48 truncate">{e.action ?? JSON.stringify(e.data ?? {}).slice(0, 40)}</td>
                        <td className="py-1 font-mono text-[9px] text-muted-foreground">{e.hash?.slice(0, 12) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
