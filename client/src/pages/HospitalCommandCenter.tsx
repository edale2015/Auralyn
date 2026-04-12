/**
 * Hospital Command Center — multi-panel clinical command surface
 * Priority feed · live vitals · intervention queue · agent actions · stats bar
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePatientStream } from "@/hooks/usePatientStream";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, CheckCircle, Brain, Heart,
  Wifi, WifiOff, Bot, RefreshCw, PhoneCall, FlaskConical, Pill, Monitor
} from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-600",
  high:     "text-orange-500",
  medium:   "text-yellow-600",
  low:      "text-emerald-600",
};

const RISK_BG: Record<string, string> = {
  critical: "bg-red-600",
  high:     "bg-orange-500",
  medium:   "bg-yellow-400",
  low:      "bg-emerald-500",
};

const INTV_ICON: Record<string, any> = {
  lab: FlaskConical, med: Pill, escalation: PhoneCall, monitor: Monitor,
};

export default function HospitalCommandCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { patients, connected, criticalCount } = usePatientStream();
  const { data: status }   = useQuery<any>({ queryKey: ["/api/hospital/status"] });
  const { data: agentLog } = useQuery<any[]>({ queryKey: ["/api/hospital/agent/log"] });

  const agentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hospital/agent/run"),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["/api/hospital/agent/log"] });
      toast({ title: "Hospital agent scanned", description: "Actions generated and logged." });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/hospital/agent/resolve/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["/api/hospital/agent/log"] }),
  });

  // Priority-sorted patients from stream (already sorted server-side)
  const critical = patients.filter((p) => p.status === "critical");
  const warning  = patients.filter((p) => p.status === "warning");
  const stable   = patients.filter((p) => p.status === "stable");

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* ── Top status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-base font-bold">Hospital Command Center</h1>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {[
            { label: "Patients", value: patients.length, color: "" },
            { label: "Critical",  value: criticalCount, color: criticalCount > 0 ? "text-red-600 font-bold" : "text-emerald-600" },
            { label: "Beds",      value: status?.capacity ? `${status.capacity.occupied}/${status.capacity.total}` : "—", color: "" },
            { label: "Staff",     value: status?.staffing?.activeStaff ?? "—", color: "" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex gap-1.5 items-center">
              <span className="text-muted-foreground">{label}:</span>
              <span className={`font-semibold ${color}`}>{value}</span>
            </div>
          ))}

          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${connected ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-red-400 text-red-600 bg-red-50"}`} data-testid="cmd-ws-status">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Live" : "Offline"}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/hospital"] })} data-testid="button-cmd-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => agentMutation.mutate()} disabled={agentMutation.isPending} data-testid="button-cmd-agent">
            <Bot className="h-3.5 w-3.5 mr-1.5" />{agentMutation.isPending ? "Scanning…" : "Run Agent"}
          </Button>
        </div>
      </div>

      {/* ── Critical alert banner ───────────────────────────────────────────── */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium shrink-0 animate-pulse" data-testid="cmd-critical-banner">
          <AlertTriangle className="h-4 w-4" />
          {criticalCount} CRITICAL PATIENT{criticalCount > 1 ? "S" : ""} — IMMEDIATE INTERVENTION REQUIRED
        </div>
      )}

      {/* ── Main 3-panel layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden gap-0">

        {/* LEFT — Live patient priority feed (2/3 width) */}
        <div className="flex-[2] border-r flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" />Live Priority Feed</h2>
            <span className="text-xs text-muted-foreground">{patients.length} patients</span>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {[...critical, ...warning, ...stable].map((p, idx) => (
                <div
                  key={p.id}
                  data-testid={`cmd-patient-${p.id}`}
                  className={`rounded-lg border p-3 transition-all ${
                    p.status === "critical" ? "border-red-400 bg-red-50 dark:bg-red-950/20" :
                    p.status === "warning"  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" :
                    "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                      <span className="text-sm font-semibold">{p.name}</span>
                      <span className="text-xs text-muted-foreground">· {p.age}y · {p.condition}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${RISK_COLORS[p.deterioration.riskLevel]}`}>NEWS2: {p.deterioration.newsScore}</span>
                      <div className={`w-2 h-2 rounded-full ${RISK_BG[p.deterioration.riskLevel]}`} />
                    </div>
                  </div>

                  {/* Vitals inline */}
                  <div className="flex gap-4 text-xs font-mono mb-2">
                    <span className={p.vitals.hr > 120 || p.vitals.hr < 50 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                      ❤ {p.vitals.hr}bpm
                    </span>
                    <span className={p.vitals.spo2 < 92 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                      🫁 {p.vitals.spo2}%
                    </span>
                    <span className={p.vitals.temp > 101 ? "text-orange-600 font-bold" : "text-muted-foreground"}>
                      🌡 {p.vitals.temp?.toFixed(1)}°F
                    </span>
                    <span className={p.vitals.systolicBP < 90 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                      🩺 {p.vitals.bp ?? `${p.vitals.systolicBP}/${Math.round(p.vitals.systolicBP * 0.65)}`}
                    </span>
                  </div>

                  {/* Sepsis + prediction */}
                  {p.deterioration.sepsisCriteria && (
                    <div className="text-xs text-red-700 font-medium mb-1">⚠ Sepsis criteria met</div>
                  )}
                  {(p.status === "critical" || p.status === "warning") && (
                    <div className={`text-xs mb-2 ${p.status === "critical" ? "text-red-700" : "text-orange-700"}`}>
                      {p.deterioration.prediction}
                    </div>
                  )}

                  {/* Top intervention */}
                  {p.interventions[0] && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {(() => { const Icon = INTV_ICON[p.interventions[0].type] ?? Monitor; return <Icon className={`h-3 w-3 ${RISK_COLORS[p.interventions[0].priority]}`} />; })()}
                      <span>{p.interventions[0].action}</span>
                    </div>
                  )}
                </div>
              ))}
              {patients.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {connected ? "Waiting for patient data…" : "Connecting to stream…"}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT — Agent actions + hospital stats (1/3 width) */}
        <div className="flex-[1] flex flex-col overflow-hidden">
          {/* Hospital quick stats */}
          <div className="p-3 border-b shrink-0">
            <h2 className="text-sm font-semibold mb-2">Hospital Status</h2>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                ["Occupancy", status?.capacity ? `${Math.round(status.capacity.occupancyRate * 100)}%` : "—"],
                ["Appts",     status?.scheduling?.total ?? "—"],
                ["High-Risk", status?.population?.highRisk ?? "—"],
                ["Deficit",   status?.staffing?.deficit ?? 0],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-muted rounded px-2 py-1 flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-bold">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent action log */}
          <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-1"><Bot className="h-4 w-4" />Agent Actions</h2>
            <span className="text-xs text-muted-foreground">{(agentLog ?? []).filter((a: any) => !a.resolved).length} open</span>
          </div>

          <ScrollArea className="flex-1 p-2">
            <div className="space-y-1.5">
              {(agentLog ?? []).slice(0, 20).map((action: any) => (
                <div
                  key={action.id}
                  data-testid={`cmd-action-${action.id}`}
                  className={`p-2 rounded border text-xs transition-opacity ${action.resolved ? "opacity-40" : ""} ${
                    action.priority === "critical" ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
                    action.priority === "high"     ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" :
                    "border-border"
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <Badge variant="outline" className="text-xs py-0 h-4">{action.type}</Badge>
                    {action.unit && <span className="text-muted-foreground">{action.unit}</span>}
                  </div>
                  <p className="leading-snug mb-1">{action.message}</p>
                  {!action.resolved && (
                    <button
                      className="text-xs text-primary underline hover:no-underline"
                      data-testid={`cmd-resolve-${action.id}`}
                      onClick={() => resolveMutation.mutate(action.id)}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              ))}
              {(!agentLog || agentLog.length === 0) && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Run agent to generate actions
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
