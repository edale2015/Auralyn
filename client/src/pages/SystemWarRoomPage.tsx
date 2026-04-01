import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, Brain, CheckCircle2, ChevronRight,
  DollarSign, FileText, Loader2, RefreshCw, Shield, ShieldAlert,
  Thermometer, TrendingUp, Users, Zap, XCircle, Eye, RotateCcw,
  BarChart3, Star, Target, Award, ArrowUp, ArrowDown, Minus
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, LineChart, Line
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────────
function StatBox({ label, value, color = "text-foreground", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="text-center p-3 rounded border border-border/40 bg-card/40" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={cn("text-xl font-black", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function HealthPulse({ status }: { status: "GREEN" | "YELLOW" | "ORANGE" | "RED" }) {
  const map = {
    GREEN: { color: "bg-emerald-500", text: "text-emerald-400", label: "OPERATIONAL", ring: "ring-emerald-500/30" },
    YELLOW: { color: "bg-yellow-500", text: "text-yellow-400", label: "DEGRADED", ring: "ring-yellow-500/30" },
    ORANGE: { color: "bg-orange-500", text: "text-orange-400", label: "CRITICAL", ring: "ring-orange-500/30" },
    RED: { color: "bg-red-500", text: "text-red-400", label: "FAILING", ring: "ring-red-500/30" },
  };
  const s = map[status] ?? map.GREEN;
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/40 ring-2", s.ring)} data-testid="system-health-badge">
      <span className={cn("inline-block w-2.5 h-2.5 rounded-full animate-pulse", s.color)} />
      <span className={cn("text-xs font-bold tracking-widest", s.text)}>{status} — {s.label}</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: any }) {
  const statusMap = {
    healthy: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
    degraded: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20" },
    failing: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
    offline: { icon: Shield, color: "text-muted-foreground", bg: "bg-muted/20 border-border/30" },
  };
  const s = statusMap[agent.status as keyof typeof statusMap] ?? statusMap.healthy;
  const Icon = s.icon;
  const riskPct = Math.round(agent.riskScore * 100);
  return (
    <div className={cn("rounded border p-2.5 flex items-center gap-2", s.bg)} data-testid={`agent-card-${agent.agentName}`}>
      <Icon size={12} className={s.color} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{agent.displayName}</div>
        {agent.activeOverride && (
          <div className="text-[9px] text-orange-400 truncate">→ {agent.activeOverride}</div>
        )}
      </div>
      <div className="text-right">
        <div className={cn("text-[11px] font-bold font-mono", riskPct < 25 ? "text-emerald-400" : riskPct < 45 ? "text-yellow-400" : "text-red-400")}>
          {riskPct}%
        </div>
        <div className="text-[9px] text-muted-foreground capitalize">{agent.status}</div>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: any }) {
  const s = alert.severity === "critical"
    ? { icon: XCircle, color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" }
    : alert.severity === "warning"
    ? { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20" }
    : { icon: Activity, color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" };
  const Icon = s.icon;
  return (
    <div className={cn("flex items-start gap-2 rounded border p-2 text-xs", s.bg)} data-testid={`alert-${alert.severity}`}>
      <Icon size={10} className={cn(s.color, "mt-0.5 flex-shrink-0")} />
      <div className="flex-1 min-w-0">
        <span>{alert.message}</span>
        <div className="text-[9px] text-muted-foreground/60 mt-0.5">{alert.source} · {new Date(alert.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

// ─── Tab: System Snapshot ────────────────────────────────────────────────────────
function SystemSnapshotTab() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/war-room/snapshot"],
    refetchInterval: 15_000,
  });

  const rlhfMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/war-room/rlhf/trigger", {}).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/war-room/snapshot"] }),
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)}</div>;

  const agents: any[] = data?.agents ?? [];
  const alerts: any[] = data?.alerts ?? [];
  const rlhf = data?.rlhf ?? {};

  const radarData = [
    { subject: "Diagnosis", value: Math.round(data?.clinicians?.avgAccuracy ?? 88) },
    { subject: "Revenue", value: Math.round(100 - (data?.revenue?.denialRate ?? 9)) },
    { subject: "Quality", value: Math.round(data?.quality?.hedisScore ?? 85) },
    { subject: "Agents", value: Math.round(100 - (agents.filter(a => a.status !== "healthy").length / Math.max(agents.length, 1)) * 100) },
    { subject: "Clinicians", value: Math.round(data?.clinicians?.avgAccuracy ?? 88) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <HealthPulse status={data?.systemHealth ?? "GREEN"} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => rlhfMut.mutate()} disabled={rlhfMut.isPending} data-testid="button-trigger-rlhf">
            {rlhfMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Brain size={10} />} RLHF Update
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => refetch()} data-testid="button-refresh-snapshot">
            <RefreshCw size={10} /> Refresh
          </Button>
        </div>
      </div>

      {data?.systemHealthReason && (
        <div className="text-[10px] text-muted-foreground border border-border/30 rounded px-3 py-1.5 bg-card/30">
          {data.systemHealthReason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
            <DollarSign size={10} className="text-green-400" /> Revenue
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Total Revenue" value={"$" + (data?.revenue?.total ?? 0).toLocaleString()} color="text-green-400" />
            <StatBox label="QA-Adjusted" value={"$" + (data?.revenue?.qualityAdjusted ?? 0).toLocaleString()} color="text-blue-400" />
            <StatBox label="Health Grade" value={data?.revenue?.grade ?? "—"} color={(data?.revenue?.grade ?? "B") === "A+" || data?.revenue?.grade === "A" ? "text-emerald-400" : "text-yellow-400"} />
            <StatBox label="Denial Rate" value={(data?.revenue?.denialRate ?? 0) + "%"} color={(data?.revenue?.denialRate ?? 10) < 8 ? "text-emerald-400" : "text-red-400"} />
          </div>
        </Card>

        <Card className="border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
            <Users size={10} className="text-purple-400" /> Clinicians
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Physicians" value={data?.clinicians?.total ?? 0} />
            <StatBox label="Available" value={data?.clinicians?.available ?? 0} color="text-green-400" />
            <StatBox label="Avg Accuracy" value={(data?.clinicians?.avgAccuracy ?? 0) + "%"} color={(data?.clinicians?.avgAccuracy ?? 0) >= 88 ? "text-green-400" : "text-yellow-400"} />
            <StatBox label="Denial Rate" value={(data?.clinicians?.avgDenialRate ?? 0) + "%"} color={(data?.clinicians?.avgDenialRate ?? 10) < 10 ? "text-green-400" : "text-red-400"} />
          </div>
        </Card>

        <Card className="border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
            <FileText size={10} className="text-blue-400" /> HEDIS Quality
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="HEDIS Score" value={(data?.quality?.hedisScore ?? 0) + "%"} color={(data?.quality?.hedisScore ?? 0) >= 85 ? "text-green-400" : "text-yellow-400"} />
            <StatBox label="Grade" value={data?.quality?.hedisGrade ?? "—"} color="text-blue-400" />
            <StatBox label="Exceeding" value={data?.quality?.metricsExceeding ?? 0} color="text-green-400" />
            <StatBox label="Below" value={data?.quality?.metricsBelow ?? 0} color={(data?.quality?.metricsBelow ?? 0) > 0 ? "text-red-400" : "text-muted-foreground"} />
          </div>
        </Card>

        <Card className="border border-border/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
            <Brain size={10} className="text-violet-400" /> RLHF Engine
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Diag Weight" value={rlhf.diagnosisWeight?.toFixed(3) ?? "1.000"} color="text-violet-400" />
            <StatBox label="Outcome Wt" value={rlhf.outcomeWeight?.toFixed(3) ?? "1.000"} color="text-blue-400" />
            <StatBox label="Escalation Pen" value={rlhf.escalationPenalty?.toFixed(3) ?? "1.000"} color="text-orange-400" />
            <StatBox label="Adjustments" value={rlhf.totalAdjustments ?? 0} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-border/50 p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Agent Health Grid</div>
          <div className="space-y-1.5">
            {agents.map((a: any) => <AgentCard key={a.agentName} agent={a} />)}
            {agents.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No agent data</div>}
          </div>
        </Card>

        <Card className="border border-border/50 p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">System Radar</div>
          <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={radarData} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
              <PolarGrid stroke="hsl(var(--border))" opacity={0.4} />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="border border-border/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase">Active Alerts</div>
          <Badge variant="outline" className="text-[9px] h-4">{alerts.length}</Badge>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {alerts.map((a: any, i: number) => <AlertRow key={i} alert={a} />)}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Agent Governor ──────────────────────────────────────────────────────────
function AgentGovernorTab() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/governor/report"],
    refetchInterval: 20_000,
  });

  const restoreMut = useMutation({
    mutationFn: (agentId: string) => apiRequest("POST", "/api/governor/restore", { agentId }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: "Agent restored", description: d.message });
      queryClient.invalidateQueries({ queryKey: ["/api/governor/report"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)}</div>;

  const agents: any[] = data?.agentStatuses ?? [];
  const overrides: Record<string, string> = data?.activeOverrides ?? {};
  const recommendations: string[] = data?.recommendations ?? [];

  const healthDist = {
    healthy: agents.filter(a => a.health === "healthy").length,
    degraded: agents.filter(a => a.health === "degraded").length,
    failing: agents.filter(a => a.health === "failing").length,
  };

  const riskBarData = agents.map(a => ({
    name: a.displayName.replace(" Engine", "").replace(" Guard", ""),
    risk: Math.round(a.riskScore * 100),
    fill: a.health === "failing" ? "#ef4444" : a.health === "degraded" ? "#eab308" : "#22c55e",
  }));

  return (
    <div className="space-y-4">
      <Card className="border border-border/50 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-violet-400" />
            <span className="text-xs font-semibold">Autonomous Agent Governor</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px]">
              {data?.rerouteEvents ?? 0} reroute events
            </Badge>
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => refetch()} data-testid="button-refresh-governor">
              <RefreshCw size={9} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          <StatBox label="System Risk" value={(Math.round((data?.overallSystemRisk ?? 0) * 100)) + "%"}
            color={(data?.overallSystemRisk ?? 0) < 0.25 ? "text-green-400" : (data?.overallSystemRisk ?? 0) < 0.5 ? "text-yellow-400" : "text-red-400"} />
          <StatBox label="Healthy" value={healthDist.healthy} color="text-green-400" />
          <StatBox label="Degraded" value={healthDist.degraded} color={healthDist.degraded > 0 ? "text-yellow-400" : "text-muted-foreground"} />
          <StatBox label="Failing" value={healthDist.failing} color={healthDist.failing > 0 ? "text-red-400" : "text-muted-foreground"} />
        </div>

        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={riskBarData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={25} domain={[0, 100]} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
              formatter={(v: number) => [`${v}%`, "Risk Score"]} />
            <Bar dataKey="risk" radius={[3, 3, 0, 0]}>
              {riskBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 gap-2">
        {agents.map((agent: any) => {
          const healthColor = agent.health === "healthy" ? "text-emerald-400" : agent.health === "degraded" ? "text-yellow-400" : "text-red-400";
          const rowBg = agent.health === "failing" ? "bg-red-500/5 border-red-500/20" : agent.health === "degraded" ? "bg-yellow-500/5 border-yellow-500/20" : "border-border/30";
          return (
            <div key={agent.agent} className={cn("border rounded p-2.5 flex items-center gap-3", rowBg)} data-testid={`governor-agent-${agent.agent}`}>
              <div className={cn("w-2 h-2 rounded-full flex-shrink-0", agent.health === "healthy" ? "bg-emerald-500" : agent.health === "degraded" ? "bg-yellow-500 animate-pulse" : "bg-red-500 animate-pulse")} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{agent.displayName}</div>
                <div className="text-[9px] text-muted-foreground">
                  Action: <span className="font-mono">{agent.action}</span>
                  {agent.activeOverride && <span className="text-orange-400 ml-2">→ {agent.activeOverride}</span>}
                </div>
              </div>
              <div className={cn("text-[11px] font-bold font-mono", healthColor)}>
                {Math.round(agent.riskScore * 100)}% risk
              </div>
              {overrides[agent.agent] && (
                <Button size="sm" variant="outline" className="h-5 text-[9px] gap-1 border-orange-500/40 text-orange-400"
                  onClick={() => restoreMut.mutate(agent.agent)} disabled={restoreMut.isPending}
                  data-testid={`button-restore-${agent.agent}`}>
                  <RotateCcw size={8} /> Restore
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {recommendations.length > 0 && (
        <Card className="border border-border/50 p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Governor Recommendations</div>
          <div className="space-y-1.5">
            {recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border border-border/30 bg-card/30">
                <ChevronRight size={10} className="text-violet-400 mt-0.5 flex-shrink-0" />
                {r}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: HEDIS Quality ───────────────────────────────────────────────────────────
function HEDISQualityTab() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/quality/hedis"],
    refetchInterval: 60_000,
  });

  const { data: report, isLoading: reportLoading } = useQuery<any>({
    queryKey: ["/api/quality/report"],
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)}</div>;

  const metrics: any[] = data?.metrics ?? [];
  const chartData = metrics.map(m => ({
    name: m.name.replace(" Rate", "").replace("Appropriate ", "").substring(0, 16),
    value: Math.round(m.rate * 100),
    benchmark: Math.round(m.benchmark * 100),
    fill: m.status === "exceeds" ? "#10b981" : m.status === "meets" ? "#3b82f6" : m.status === "below" ? "#ef4444" : "#6b7280",
  }));

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <FileText size={12} className="text-blue-400" />
          <span className="text-xs font-semibold">HEDIS-Style Quality Reporting</span>
          <Badge variant="outline" className={cn("ml-auto text-[10px]",
            (data?.overallGrade === "A+" || data?.overallGrade === "A") ? "text-green-400 border-green-500/40" :
            data?.overallGrade === "B" ? "text-blue-400 border-blue-500/40" : "text-yellow-400 border-yellow-500/40"
          )}>
            Grade {data?.overallGrade ?? "—"}
          </Badge>
          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => refetch()} data-testid="button-refresh-hedis">
            <RefreshCw size={9} />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="HEDIS Score" value={(Math.round((data?.overallScore ?? 0) * 1000) / 10) + "%"}
              color={(data?.overallScore ?? 0) >= 0.88 ? "text-green-400" : "text-yellow-400"} />
            <StatBox label="Exceeding" value={metrics.filter(m => m.status === "exceeds").length} color="text-green-400" />
            <StatBox label="Meeting" value={metrics.filter(m => m.status === "meets").length} color="text-blue-400" />
            <StatBox label="Below" value={metrics.filter(m => m.status === "below").length} color={metrics.filter(m => m.status === "below").length > 0 ? "text-red-400" : "text-muted-foreground"} />
          </div>

          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={30} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
                formatter={(v: number, name: string) => [`${v}%`, name === "value" ? "Actual" : "Benchmark"]} />
              <Bar dataKey="value" name="value" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
              <Bar dataKey="benchmark" name="benchmark" fill="#6b7280" opacity={0.3} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="space-y-1">
            {metrics.map((m: any, i: number) => (
              <div key={i} className={cn("flex items-center gap-2 text-xs p-2 rounded border",
                m.status === "exceeds" ? "border-green-500/20 bg-green-500/5" :
                m.status === "below" ? "border-red-500/20 bg-red-500/5" :
                "border-border/30"
              )} data-testid={`hedis-metric-${i}`}>
                <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                  m.status === "exceeds" ? "bg-green-500" : m.status === "meets" ? "bg-blue-500" : m.status === "below" ? "bg-red-500" : "bg-gray-500"
                )} />
                <span className="flex-1 text-[10px] truncate">{m.name}</span>
                <span className="text-muted-foreground text-[9px]">target {Math.round(m.benchmark * 100)}%</span>
                <span className={cn("font-bold font-mono text-[11px]",
                  m.status === "exceeds" ? "text-green-400" : m.status === "below" ? "text-red-400" : "text-blue-400"
                )}>{Math.round(m.rate * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {report && (
        <Card className="border border-border/50 p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Contract Leverage Points</div>
          {!reportLoading && (report?.contractLeverage ?? []).map((l: string, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border border-border/30 bg-card/30 mb-1.5">
              <Star size={9} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              {l}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Insurer Contract Engine ─────────────────────────────────────────────────
function InsurerContractTab() {
  const [selectedPayer, setSelectedPayer] = useState("BCBS");
  const { data: leaderboard, isLoading: lbLoading } = useQuery<any>({
    queryKey: ["/api/insurer/leaderboard"],
  });
  const { data: payerScore, isLoading: scoreLoading } = useQuery<any>({
    queryKey: ["/api/insurer/score", selectedPayer],
    queryFn: () => fetch(`/api/insurer/score/${selectedPayer}`).then(r => r.json()),
  });

  const strategyColors: Record<string, string> = {
    anchor_high: "text-green-400",
    value_based: "text-blue-400",
    bundled_rate: "text-purple-400",
    risk_share: "text-orange-400",
    standard: "text-muted-foreground",
  };

  const PAYER_IDS = ["BCBS", "AETNA", "UHC", "CIGNA", "HUMANA", "MEDICARE", "MEDICAID"];

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <TrendingUp size={12} className="text-green-400" />
          <span className="text-xs font-semibold">Insurer Contract Negotiation Engine</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Outcome-backed rates</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {PAYER_IDS.map(p => (
              <button key={p} onClick={() => setSelectedPayer(p)}
                className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors",
                  selectedPayer === p ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary/50"
                )} data-testid={`payer-select-${p.toLowerCase()}`}>
                {p}
              </button>
            ))}
          </div>

          {scoreLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : payerScore ? (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2">
                <StatBox label="Score" value={(Math.round((payerScore.score ?? 0) * 100)) + "%"}
                  color={(payerScore.score ?? 0) >= 0.7 ? "text-green-400" : "text-yellow-400"} />
                <StatBox label="Grade" value={payerScore.grade ?? "—"} color="text-blue-400" />
                <StatBox label="Avg Rate" value={"$" + (payerScore.avgReimbursement ?? 0)} />
                <StatBox label="Denial" value={((payerScore.denialRate ?? 0) * 100).toFixed(1) + "%"} color={(payerScore.denialRate ?? 0.12) < 0.10 ? "text-green-400" : "text-red-400"} />
                <StatBox label="Collection" value={((payerScore.collectionRate ?? 0) * 100).toFixed(1) + "%"} color="text-blue-400" />
              </div>

              <div className={cn("text-xs p-3 rounded border", (payerScore.score ?? 0) >= 0.7 ? "bg-green-500/5 border-green-500/20" : "bg-yellow-500/5 border-yellow-500/20")} data-testid="contract-strategy">
                <span className={cn("font-bold capitalize", strategyColors[payerScore.recommendedStrategy])}>{payerScore.recommendedStrategy?.replace(/_/g, " ")} Strategy</span>: {payerScore.rationale}
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">Leverage Points</div>
                {(payerScore.leveragePoints ?? []).map((l: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border border-border/30 bg-card/30">
                    <Zap size={9} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="border border-border/50 p-3">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Payer Leaderboard</div>
        {lbLoading ? <Skeleton className="h-16 w-full" /> : (
          <div className="space-y-1">
            {(leaderboard?.leaderboard ?? []).slice(0, 7).map((p: any, i: number) => (
              <div key={p.payerId} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-card/40" data-testid={`leaderboard-row-${p.payerId.toLowerCase()}`}>
                <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                <span className="font-mono font-bold w-20 text-[11px]">{p.payerId}</span>
                <span className={cn("text-[10px]", strategyColors[p.strategy] ?? "text-muted-foreground")}>{p.strategy?.replace(/_/g, " ")}</span>
                <span className="ml-auto font-bold text-[11px]">{Math.round(p.score * 100)}%</span>
                <Badge variant="outline" className={cn("text-[9px] h-4", p.grade === "A" || p.grade === "A+" ? "text-green-400 border-green-500/40" : "text-muted-foreground")}>{p.grade}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Physician Intelligence ──────────────────────────────────────────────────
function PhysicianIntelligenceTab() {
  const [selectedId, setSelectedId] = useState("DR-001");
  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/clinician-engine/system-summary"],
    refetchInterval: 30_000,
  });
  const { data: coaching, isLoading: coachingLoading } = useQuery<any>({
    queryKey: ["/api/clinician-engine", selectedId, "coaching"],
    queryFn: () => fetch(`/api/clinician-engine/${selectedId}/coaching`).then(r => r.json()),
  });

  const priorityColor = coaching?.priority === "critical" ? "text-red-400"
    : coaching?.priority === "high" ? "text-orange-400"
    : coaching?.priority === "medium" ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Users size={12} className="text-purple-400" />
          <span className="text-xs font-semibold">System Performance Summary</span>
        </div>
        <div className="p-4">
          {summaryLoading ? <Skeleton className="h-20 w-full" /> : (
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Total MDs" value={summary?.totalPhysicians ?? 0} />
              <StatBox label="Available" value={summary?.availablePhysicians ?? 0} color="text-green-400" />
              <StatBox label="Avg Accuracy" value={((summary?.avgSystemAccuracy ?? 0) * 100).toFixed(1) + "%"}
                color={(summary?.avgSystemAccuracy ?? 0) >= 0.88 ? "text-green-400" : "text-yellow-400"} />
              <StatBox label="Utilization" value={((summary?.systemUtilization ?? 0) * 100).toFixed(0) + "%"}
                color={(summary?.systemUtilization ?? 0) > 0.85 ? "text-red-400" : "text-muted-foreground"} />
            </div>
          )}
          {!summaryLoading && (summary?.criticalAlerts ?? []).length > 0 && (
            <div className="mt-3 space-y-1">
              {(summary.criticalAlerts ?? []).slice(0, 3).map((a: string, i: number) => (
                <div key={i} className="text-[10px] text-orange-400 flex items-start gap-1.5">
                  <AlertTriangle size={9} className="mt-0.5 flex-shrink-0" /> {a}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Brain size={12} className="text-purple-400" />
          <span className="text-xs font-semibold">Physician Coaching Agent</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {["DR-001", "DR-002", "DR-003", "DR-004"].map(id => (
              <button key={id} onClick={() => setSelectedId(id)}
                className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors",
                  selectedId === id ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary/50"
                )} data-testid={`coaching-select-${id.toLowerCase()}`}>
                {id}
              </button>
            ))}
          </div>

          {coachingLoading ? <Skeleton className="h-32 w-full" /> : coaching ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="Grade" value={coaching.metrics?.performanceGrade ?? "—"} color="text-blue-400" />
                <StatBox label="Tier" value={coaching.metrics?.tier ?? "—"}
                  color={coaching.metrics?.tier === "elite" ? "text-yellow-400" : coaching.metrics?.tier === "proficient" ? "text-green-400" : "text-orange-400"} />
                <StatBox label="Accuracy" value={((coaching.metrics?.accuracyScore ?? 0) * 100).toFixed(1) + "%"}
                  color={(coaching.metrics?.accuracyScore ?? 0) >= 0.88 ? "text-green-400" : "text-red-400"} />
                <StatBox label="Priority" value={coaching.priority ?? "—"} color={priorityColor} />
              </div>

              {coaching.focusArea && (
                <div className="text-xs flex items-center gap-2 p-2 rounded border border-purple-500/20 bg-purple-500/5">
                  <Target size={10} className="text-purple-400 flex-shrink-0" />
                  <span className="text-muted-foreground">Focus: </span>
                  <span className="text-purple-300">{coaching.focusArea}</span>
                </div>
              )}

              {(coaching.recommendations ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">Recommendations</div>
                  {coaching.recommendations.slice(0, 3).map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border border-border/30 bg-card/30" data-testid={`coaching-rec-${i}`}>
                      <ChevronRight size={10} className="text-purple-400 mt-0.5 flex-shrink-0" /> {r}
                    </div>
                  ))}
                </div>
              )}

              {coaching.estimatedImpact && (
                <div className="text-[10px] text-muted-foreground border-l-2 border-green-500/40 pl-2 py-0.5">{coaching.estimatedImpact}</div>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function SystemWarRoomPage() {
  return (
    <ScrollArea className="h-screen">
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Activity size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-bold" data-testid="page-title-system-war-room">System War Room</h1>
            <p className="text-[10px] text-muted-foreground">Live system health · Agent governor · HEDIS quality · Insurer contracts · Physician intelligence</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] text-violet-400 border-violet-500/40">Autonomous Control</Badge>
        </div>

        <Tabs defaultValue="snapshot" className="w-full">
          <TabsList className="h-8 text-[11px] w-full grid grid-cols-5">
            <TabsTrigger value="snapshot" className="text-[10px]" data-testid="tab-snapshot">Live Snapshot</TabsTrigger>
            <TabsTrigger value="governor" className="text-[10px]" data-testid="tab-governor">Agent Governor</TabsTrigger>
            <TabsTrigger value="hedis" className="text-[10px]" data-testid="tab-hedis">HEDIS Quality</TabsTrigger>
            <TabsTrigger value="insurer" className="text-[10px]" data-testid="tab-insurer">Insurer Engine</TabsTrigger>
            <TabsTrigger value="physicians" className="text-[10px]" data-testid="tab-physicians">Physician Intel</TabsTrigger>
          </TabsList>

          <TabsContent value="snapshot" className="mt-4"><SystemSnapshotTab /></TabsContent>
          <TabsContent value="governor" className="mt-4"><AgentGovernorTab /></TabsContent>
          <TabsContent value="hedis" className="mt-4"><HEDISQualityTab /></TabsContent>
          <TabsContent value="insurer" className="mt-4"><InsurerContractTab /></TabsContent>
          <TabsContent value="physicians" className="mt-4"><PhysicianIntelligenceTab /></TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
