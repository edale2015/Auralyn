/**
 * Live Patient Monitor — ICU-style real-time patient cards
 * WebSocket-driven · deterioration prediction · intervention overlay · AI insights
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePatientStream, type LivePatient } from "@/hooks/usePatientStream";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, Activity, Thermometer, Gauge, AlertTriangle,
  CheckCircle, Brain, FlaskConical, Pill, PhoneCall, Monitor,
  Wifi, WifiOff, Clock
} from "lucide-react";

// ── Status / risk colours ─────────────────────────────────────────────────────
const STATUS_BORDER: Record<string, string> = {
  critical: "border-red-500  bg-red-50  dark:bg-red-950/30",
  warning:  "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
  stable:   "border-emerald-400 bg-white dark:bg-card",
};

const RISK_BADGE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high:     "bg-orange-500 text-white",
  medium:   "bg-yellow-400 text-black",
  low:      "bg-emerald-500 text-white",
};

const INTERVENTION_ICON: Record<string, any> = {
  lab:        FlaskConical,
  med:        Pill,
  escalation: PhoneCall,
  monitor:    Monitor,
};

const INTERVENTION_COLOR: Record<string, string> = {
  critical: "text-red-600",
  high:     "text-orange-600",
  medium:   "text-yellow-600",
  low:      "text-emerald-600",
};

// ── Vital sign display ───────────────────────────────────────────────────────
function VitalRow({ icon: Icon, label, value, unit, alert }: { icon: any; label: string; value: any; unit?: string; alert?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-xs py-0.5 ${alert ? "text-red-600 font-semibold" : ""}`}>
      <span className="flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" />{label}</span>
      <span className="font-mono font-bold">{value}{unit}</span>
    </div>
  );
}

// ── AI Insight panel (lazy-loaded on demand) ─────────────────────────────────
function AIInsightPanel({ patient }: { patient: LivePatient }) {
  const [shown, setShown] = useState(false);
  const [insight, setInsight] = useState<any>(null);
  const { toast } = useToast();

  const insightMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/patients/insights", { patientId: String(patient.id), name: patient.name, vitals: patient.vitals }),
    onSuccess: (data: any) => setInsight(data),
    onError: () => toast({ title: "AI insight failed", variant: "destructive" }),
  });

  if (!shown) {
    return (
      <Button size="sm" variant="outline" className="w-full mt-2 text-xs h-7" data-testid={`button-ai-insight-${patient.id}`} onClick={() => { setShown(true); insightMutation.mutate(); }}>
        <Brain className="h-3 w-3 mr-1" /> AI Insight
      </Button>
    );
  }

  return (
    <div className="mt-2 p-2 rounded border bg-background text-xs space-y-1" data-testid={`ai-insight-panel-${patient.id}`}>
      {insightMutation.isPending && <div className="text-muted-foreground">Generating…</div>}
      {insight && (
        <>
          <div className="flex items-center gap-1"><Brain className="h-3 w-3 text-primary" /><span className="font-medium">AI Insight</span>{insight.fromCache && <span className="text-muted-foreground ml-1">(cached)</span>}</div>
          <div><span className="text-muted-foreground">Risk: </span>{insight.risk}</div>
          <div><span className="text-muted-foreground">Action: </span><span className="font-medium">{insight.action}</span></div>
          <div><span className="text-muted-foreground">Priority: </span>
            <span className={`font-bold ${insight.priority === "critical" ? "text-red-600" : insight.priority === "high" ? "text-orange-600" : "text-emerald-600"}`}>
              {insight.priority?.toUpperCase()}
            </span>
          </div>
          {insight.rationale && <div className="text-muted-foreground italic">{insight.rationale}</div>}
        </>
      )}
    </div>
  );
}

// ── Single patient card ───────────────────────────────────────────────────────
function PatientCard({ patient, rank }: { patient: LivePatient; rank: number }) {
  const isCritical = patient.status === "critical";
  const isWarning  = patient.status === "warning";
  const v          = patient.vitals;

  return (
    <Card
      data-testid={`patient-card-${patient.id}`}
      className={`border-2 transition-all duration-500 ${STATUS_BORDER[patient.status]} ${isCritical ? "animate-pulse-alert" : ""}`}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">#{rank}</span>
            <CardTitle className="text-sm">{patient.name}</CardTitle>
            <span className="text-xs text-muted-foreground">·&nbsp;{patient.age}y</span>
          </div>
          <Badge className={`text-xs ${RISK_BADGE[patient.deterioration.riskLevel]}`} data-testid={`badge-risk-${patient.id}`}>
            {patient.deterioration.riskLevel.toUpperCase()}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">{patient.condition}</div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-3">
        {/* Vitals */}
        <div className="space-y-0.5">
          <VitalRow icon={Heart}       label="HR"     value={v.hr}         unit=" bpm"  alert={v.hr > 120 || v.hr < 50} />
          <VitalRow icon={Activity}    label="SpO₂"   value={v.spo2}       unit="%"     alert={v.spo2 < 92} />
          <VitalRow icon={Thermometer} label="Temp"   value={v.temp?.toFixed(1)} unit="°F"  alert={v.temp > 101 || v.temp < 96} />
          <VitalRow icon={Gauge}       label="BP"     value={v.bp ?? `${v.systolicBP}/${Math.round(v.systolicBP * 0.65)}`} alert={v.systolicBP < 90 || v.systolicBP > 180} />
        </div>

        {/* NEWS2 score */}
        <div className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
          <span className="text-muted-foreground">NEWS2 score</span>
          <span className={`font-bold ${patient.deterioration.newsScore >= 5 ? "text-red-600" : patient.deterioration.newsScore >= 3 ? "text-orange-600" : "text-emerald-600"}`}>
            {patient.deterioration.newsScore}
          </span>
        </div>

        {/* Sepsis alert */}
        {patient.deterioration.sepsisCriteria && (
          <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-100 border border-red-300 rounded px-2 py-1 animate-pulse" data-testid={`sepsis-alert-${patient.id}`}>
            <AlertTriangle className="h-3 w-3" /> Sepsis criteria met
          </div>
        )}

        {/* Deterioration prediction */}
        {(isCritical || isWarning) && (
          <div className={`text-xs rounded px-2 py-1 ${isCritical ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`} data-testid={`prediction-${patient.id}`}>
            🚨 {patient.deterioration.prediction}
          </div>
        )}

        {/* Top interventions */}
        <div className="space-y-1">
          {patient.interventions.slice(0, 2).map((intv, i) => {
            const Icon = INTERVENTION_ICON[intv.type] ?? Monitor;
            return (
              <div key={i} className="flex items-start gap-1.5 text-xs" data-testid={`intervention-${patient.id}-${i}`}>
                <Icon className={`h-3 w-3 flex-shrink-0 mt-0.5 ${INTERVENTION_COLOR[intv.priority]}`} />
                <span className="text-muted-foreground leading-tight">{intv.action}</span>
              </div>
            );
          })}
        </div>

        {/* AI insight (on demand) */}
        <AIInsightPanel patient={patient} />
      </CardContent>
    </Card>
  );
}

// ── Main monitor page ─────────────────────────────────────────────────────────
export default function LivePatientMonitor() {
  const { patients, connected, tick, criticalCount, lastReceived } = usePatientStream();
  const [lastTick, setLastTick] = useState(0);
  const [flashConnected, setFlashConnected] = useState(false);

  useEffect(() => {
    if (tick !== lastTick) {
      setLastTick(tick);
      setFlashConnected(true);
      setTimeout(() => setFlashConnected(false), 300);
    }
  }, [tick, lastTick]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Live Patient Monitor
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">ICU-grade real-time monitoring · NEWS2 early warning · autonomous intervention engine</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats bar */}
          <div className="hidden md:flex gap-4 text-xs">
            <div className="flex items-center gap-1"><span className="text-muted-foreground">Patients:</span><span className="font-bold">{patients.length}</span></div>
            <div className="flex items-center gap-1"><span className="text-muted-foreground">Critical:</span><span className={`font-bold ${criticalCount > 0 ? "text-red-600" : "text-emerald-600"}`}>{criticalCount}</span></div>
            <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" /><span className="font-mono text-muted-foreground">{lastReceived ? new Date(lastReceived).toLocaleTimeString() : "—"}</span></div>
          </div>

          {/* Connection indicator */}
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all ${connected ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-red-400 text-red-700 bg-red-50"} ${flashConnected ? "scale-110" : ""}`} data-testid="ws-connection-status">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Live" : "Reconnecting…"}
          </div>
        </div>
      </div>

      {/* Critical alert banner */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-2 bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium animate-pulse" data-testid="critical-banner">
          <AlertTriangle className="h-4 w-4" />
          {criticalCount} CRITICAL PATIENT{criticalCount > 1 ? "S" : ""} — IMMEDIATE ATTENTION REQUIRED
        </div>
      )}

      {/* No data yet */}
      {!connected && patients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <WifiOff className="h-8 w-8" />
          <p className="text-sm">Connecting to patient stream…</p>
        </div>
      )}

      {/* Patient grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {patients.map((p, i) => (
          <PatientCard key={p.id} patient={p} rank={i + 1} />
        ))}
      </div>

      {/* Tick counter */}
      {connected && (
        <div className="text-center text-xs text-muted-foreground">
          Tick #{tick} · updates every 2s · <span className="font-mono">/ws/patients</span>
        </div>
      )}
    </div>
  );
}
