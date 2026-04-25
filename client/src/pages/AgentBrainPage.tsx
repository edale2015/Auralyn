import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Brain,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Heart,
  Thermometer,
  Wind,
  Droplets,
  ArrowRight,
  Play,
  Square,
  RefreshCw,
  Lock,
  Unlock,
  Network,
  Clock,
  ChevronRight,
  Waves,
  TrendingUp,
  Eye,
  Hash,
  GitBranch,
  Send,
  FileArchive,
  Cpu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Colour helpers ─────────────────────────────────────────────────────────────

const riskColour = (level: string) => {
  switch (level) {
    case "CRITICAL": return "bg-red-600/20 border-red-500/60 text-red-300";
    case "HIGH":     return "bg-orange-600/20 border-orange-500/60 text-orange-300";
    case "MODERATE": return "bg-yellow-600/20 border-yellow-500/60 text-yellow-300";
    default:         return "bg-emerald-600/20 border-emerald-500/60 text-emerald-300";
  }
};

const riskDot = (level: string) => {
  switch (level) {
    case "CRITICAL": return "bg-red-500 animate-pulse";
    case "HIGH":     return "bg-orange-500 animate-pulse";
    case "MODERATE": return "bg-yellow-500";
    default:         return "bg-emerald-500";
  }
};

const priorityColour = (p: string) => {
  switch (p) {
    case "CRITICAL": return "text-red-400";
    case "HIGH":     return "text-orange-400";
    case "MODERATE": return "text-yellow-400";
    default:         return "text-slate-400";
  }
};

const destColour = (dest: string) => {
  switch (dest) {
    case "ICU":     return "bg-red-800/50 text-red-200";
    case "ER":      return "bg-orange-800/50 text-orange-200";
    case "CLINIC":  return "bg-yellow-800/50 text-yellow-200";
    case "TELEMED": return "bg-blue-800/50 text-blue-200";
    default:        return "bg-emerald-800/50 text-emerald-200";
  }
};

const twinColour = (intervention: string) => {
  if (intervention === "treatment") return "border-emerald-500/40 bg-emerald-950/30";
  if (intervention === "none")      return "border-yellow-500/40 bg-yellow-950/30";
  return "border-red-500/40 bg-red-950/30";
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface PatientCard {
  patientId: string;
  name?: string;
  riskScore: number;
  riskLevel: string;
  flags: string[];
  destination: string;
  urgency: string;
  icu: boolean;
  ts: number;
  vitals: { hr: number; spo2: number; temp: number; sbp: number; rr: number };
}

interface Insight {
  message: string;
  action: string;
  priority: string;
  patientId: string;
}

interface AuditEntry {
  hash: string;
  prevHash: string;
  patientId: string;
  risk?: { level: string; score: number };
  ts: number;
}

interface TwinScenario {
  scenario: string;
  intervention: string;
  riskScore: number;
  outcome: string;
  timeToEvent: string;
  recommendation: string;
}

// ── Vital chip ─────────────────────────────────────────────────────────────────

function VitalChip({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 text-xs", warn ? "text-red-400" : "text-slate-400")}>
      <span className="text-slate-500">{icon}</span>
      <span>{label}</span>
      <span className={cn("font-mono font-semibold", warn ? "text-red-300" : "text-slate-200")}>{value}</span>
    </div>
  );
}

// ── Patient heatmap card ───────────────────────────────────────────────────────

function PatientHeatCard({ p, selected, onClick }: { p: PatientCard; selected: boolean; onClick: () => void }) {
  const pct = Math.round(p.riskScore * 100);
  return (
    <button
      data-testid={`patient-card-${p.patientId}`}
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-all duration-200 cursor-pointer",
        riskColour(p.riskLevel),
        selected ? "ring-2 ring-white/30 scale-[1.02]" : "hover:scale-[1.01] hover:brightness-110",
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-0.5", riskDot(p.riskLevel))} />
          <span className="text-xs font-bold uppercase tracking-wider">{p.riskLevel}</span>
        </div>
        <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", destColour(p.destination))}>{p.destination}</span>
      </div>
      <p className="text-sm font-semibold text-white mb-0.5">{p.name ?? p.patientId}</p>
      <p className="text-xs text-slate-400 mb-2">{p.patientId}</p>

      <div className="w-full bg-black/30 rounded-full h-1.5 mb-2">
        <div
          className={cn("h-1.5 rounded-full transition-all duration-700",
            p.riskLevel === "CRITICAL" ? "bg-red-500" :
            p.riskLevel === "HIGH"     ? "bg-orange-500" :
            p.riskLevel === "MODERATE" ? "bg-yellow-500" : "bg-emerald-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mb-2">Risk: {pct}%</p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <VitalChip icon={<Heart size={10} />} label="HR" value={`${Math.round(p.vitals.hr)}`} warn={p.vitals.hr > 110 || p.vitals.hr < 50} />
        <VitalChip icon={<Droplets size={10} />} label="SpO2" value={`${Math.round(p.vitals.spo2)}%`} warn={p.vitals.spo2 < 92} />
        <VitalChip icon={<Thermometer size={10} />} label="Temp" value={`${p.vitals.temp.toFixed(1)}°F`} warn={p.vitals.temp > 101 || p.vitals.temp < 96} />
        <VitalChip icon={<Wind size={10} />} label="RR" value={`${Math.round(p.vitals.rr)}`} warn={p.vitals.rr > 25 || p.vitals.rr < 8} />
      </div>

      {p.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.flags.slice(0, 2).map(f => (
            <span key={f} className="text-[10px] bg-black/30 text-slate-300 px-1.5 py-0.5 rounded">{f}</span>
          ))}
          {p.flags.length > 2 && <span className="text-[10px] text-slate-500">+{p.flags.length - 2}</span>}
        </div>
      )}
    </button>
  );
}

// ── Digital Twin panel ─────────────────────────────────────────────────────────

function TwinPanel({ scenarios }: { scenarios: TwinScenario[] }) {
  return (
    <div className="space-y-2">
      {scenarios.map(s => (
        <div key={s.scenario} className={cn("rounded-lg border p-3 transition-all", twinColour(s.intervention))}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-white">{s.scenario}</span>
            <span className="text-xs font-mono text-slate-300">{Math.round(s.riskScore * 100)}% risk</span>
          </div>
          <p className="text-xs text-slate-300 mb-1">{s.outcome}</p>
          <p className="text-[10px] text-slate-400">⏱ {s.timeToEvent}</p>
          <p className="text-[10px] text-slate-500 italic mt-1">{s.recommendation}</p>
        </div>
      ))}
    </div>
  );
}

// ── Pipeline stage ─────────────────────────────────────────────────────────────

function PipelineStage({ icon, label, status, note }: { icon: React.ReactNode; label: string; status: "done" | "warn" | "block" | "pending"; note?: string }) {
  const colours = {
    done:    "bg-emerald-900/40 border-emerald-500/30 text-emerald-300",
    warn:    "bg-yellow-900/40  border-yellow-500/30  text-yellow-300",
    block:   "bg-red-900/40    border-red-500/30    text-red-300",
    pending: "bg-slate-800/40  border-slate-600/30  text-slate-400",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2 flex items-center gap-2 text-xs", colours[status])}>
      <span className="flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{label}</p>
        {note && <p className="text-[10px] opacity-70 truncate">{note}</p>}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentBrainPage() {
  const qc = useQueryClient();
  const [selectedPatient, setSelectedPatient] = useState<PatientCard | null>(null);
  const [wsEvents, setWsEvents] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ── Hardening Review state ───────────────────────────────────────────────────
  const [hrLogs,    setHrLogs]    = useState<string[]>([]);
  const [hrResult,  setHrResult]  = useState<any>(null);
  const [hrRunning, setHrRunning] = useState(false);
  const [hrOpen,    setHrOpen]    = useState(false);

  const { data: statusData } = useQuery<any>({
    queryKey: ["/api/agent-brain/status"],
    refetchInterval: 2000,
  });

  const { data: heatmapData } = useQuery<{ patients: PatientCard[] }>({
    queryKey: ["/api/agent-brain/heatmap"],
    refetchInterval: 3000,
  });

  const { data: insightsData } = useQuery<{ insights: Insight[]; critical: number; high: number }>({
    queryKey: ["/api/agent-brain/insights"],
    refetchInterval: 3000,
  });

  const { data: auditData } = useQuery<{ entries: AuditEntry[]; totalEvents: number }>({
    queryKey: ["/api/agent-brain/audit"],
    refetchInterval: 5000,
  });

  const { data: bundleStatus } = useQuery<any>({
    queryKey: ["/api/hardening-review/webhook/status"],
    refetchInterval: hrRunning ? false : 30_000,
  });

  const activeZip: string = bundleStatus?.newestZip
    ? (bundleStatus.newestZip as string).split("/").pop() ?? ""
    : "";

  const startHardeningReview = useCallback(async () => {
    setHrRunning(true);
    setHrLogs(["Connecting to review pipeline…"]);
    setHrResult(null);
    setHrOpen(true);
    try {
      const res = await fetch("/api/hardening-review/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      if (!res.body) throw new Error("No SSE body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "progress") {
              setHrLogs(l => [...l, ev.message].slice(-40));
            } else if (ev.type === "complete") {
              setHrResult(ev.result);
              setHrLogs(l => [...l, `✓ Done — ${ev.summary}`]);
            } else if (ev.type === "error") {
              setHrLogs(l => [...l, `✗ Error: ${ev.error}`]);
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err: any) {
      setHrLogs(l => [...l, `✗ Connection error: ${err?.message}`]);
    } finally {
      setHrRunning(false);
    }
  }, []);

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/agent-brain/loop/start"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-brain/status"] }); },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/agent-brain/loop/stop"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-brain/status"] }); },
  });

  const cycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/agent-brain/cycle"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agent-brain/heatmap"] });
      qc.invalidateQueries({ queryKey: ["/api/agent-brain/insights"] });
      qc.invalidateQueries({ queryKey: ["/api/agent-brain/audit"] });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: (vitals?: any) => apiRequest("POST", "/api/agent-brain/simulate", vitals ? { vitals } : {}),
  });

  // ── WebSocket connection ─────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/patient-stream`);
    ws.onopen = () => setWsEvents(e => [`✓ Connected at ${new Date().toLocaleTimeString()}`, ...e].slice(0, 50));
    ws.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "agent_cycle") {
          setWsEvents(e => [`[${new Date().toLocaleTimeString()}] ${d.patientId} → ${d.risk?.level ?? "?"}`, ...e].slice(0, 50));
        }
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => setTimeout(connectWS, 3000);
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWS();
    return () => { wsRef.current?.close(); };
  }, [connectWS]);

  // Auto-select first critical/high patient
  useEffect(() => {
    if (!selectedPatient && heatmapData?.patients?.length) {
      const priority = heatmapData.patients.find(p => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH");
      setSelectedPatient(priority ?? heatmapData.patients[0]);
    }
  }, [heatmapData, selectedPatient]);

  const isRunning = statusData?.running ?? false;
  const patients  = heatmapData?.patients ?? [];
  const insights  = insightsData?.insights ?? [];
  const audit     = auditData?.entries ?? [];

  const cycleResult = (cycleMutation.data as any)?.risk
    ? (cycleMutation.data as any)
    : (simulateMutation.data as any);

  const sortedPatients = [...patients].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
    return (order[a.riskLevel as keyof typeof order] ?? 4) - (order[b.riskLevel as keyof typeof order] ?? 4);
  });

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-800/60 bg-slate-900/60 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-violet-400" />
          <h1 className="text-base font-bold tracking-tight">Agentic Brain</h1>
          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300 ml-1">LIVE</Badge>
        </div>

        <div className="flex items-center gap-3 ml-2 text-xs text-slate-400">
          <span data-testid="stat-cycles" className="flex items-center gap-1">
            <Activity size={12} className="text-slate-500" />
            Cycles: <strong className="text-white">{statusData?.cycleCount ?? 0}</strong>
          </span>
          <span data-testid="stat-patients" className="flex items-center gap-1">
            <Eye size={12} className="text-slate-500" />
            Patients: <strong className="text-white">{patients.length}</strong>
          </span>
          <span data-testid="stat-critical" className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-red-500" />
            Critical: <strong className="text-red-300">{patients.filter(p => p.riskLevel === "CRITICAL").length}</strong>
          </span>
          <span data-testid="stat-audit" className="flex items-center gap-1">
            <Hash size={12} className="text-slate-500" />
            Audit: <strong className="text-white">{auditData?.totalEvents ?? 0}</strong>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            data-testid="btn-run-cycle"
            size="sm"
            variant="outline"
            onClick={() => cycleMutation.mutate()}
            disabled={cycleMutation.isPending}
            className="border-slate-600 text-slate-300 hover:bg-slate-800 text-xs h-7"
          >
            <RefreshCw size={12} className={cn("mr-1", cycleMutation.isPending && "animate-spin")} />
            Run Cycle
          </Button>
          {isRunning ? (
            <Button
              data-testid="btn-stop-loop"
              size="sm"
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="text-xs h-7"
            >
              <Square size={12} className="mr-1" />
              Stop Loop
            </Button>
          ) : (
            <Button
              data-testid="btn-start-loop"
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7"
            >
              <Play size={12} className="mr-1" />
              Start Loop
            </Button>
          )}
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border",
            isRunning
              ? "bg-emerald-900/40 border-emerald-500/40 text-emerald-300"
              : "bg-slate-800/40 border-slate-600/40 text-slate-400"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500")} />
            {isRunning ? "LOOP ACTIVE" : "LOOP IDLE"}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[260px_1fr_280px] gap-0 overflow-hidden">

        {/* LEFT — Patient Risk Heatmap */}
        <div className="border-r border-slate-800/60 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
            <Network size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-slate-300">Patient Heatmap</span>
            <span className="ml-auto text-[10px] text-slate-500">{sortedPatients.length} active</span>
          </div>
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-2">
              {sortedPatients.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8">
                  <Brain size={24} className="mx-auto mb-2 opacity-30" />
                  No patients yet — start the loop or run a cycle
                </div>
              ) : (
                sortedPatients.map(p => (
                  <PatientHeatCard
                    key={p.patientId}
                    p={p}
                    selected={selectedPatient?.patientId === p.patientId}
                    onClick={() => setSelectedPatient(p)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER — Selected Patient Detail + Pipeline */}
        <div className="flex flex-col overflow-hidden">
          {selectedPatient ? (
            <>
              {/* Patient banner */}
              <div className={cn("px-5 py-3 border-b border-slate-800/60 flex items-center gap-4 flex-shrink-0", "bg-slate-900/40")}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full", riskDot(selectedPatient.riskLevel))} />
                    <h2 className="text-base font-bold text-white">{selectedPatient.name ?? selectedPatient.patientId}</h2>
                    <Badge className={cn("text-[10px]", riskColour(selectedPatient.riskLevel))}>{selectedPatient.riskLevel}</Badge>
                    <Badge className={cn("text-[10px]", destColour(selectedPatient.destination))}>{selectedPatient.destination}</Badge>
                    {selectedPatient.icu && <Badge className="text-[10px] bg-red-900/50 text-red-200 border-red-700">ICU Required</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedPatient.patientId} · Updated {new Date(selectedPatient.ts).toLocaleTimeString()}</p>
                </div>
                <div className="ml-auto flex items-center gap-6 text-sm">
                  <VitalChip icon={<Heart size={12} />} label="HR" value={`${Math.round(selectedPatient.vitals.hr)} bpm`} warn={selectedPatient.vitals.hr > 110 || selectedPatient.vitals.hr < 50} />
                  <VitalChip icon={<Droplets size={12} />} label="SpO2" value={`${Math.round(selectedPatient.vitals.spo2)}%`} warn={selectedPatient.vitals.spo2 < 92} />
                  <VitalChip icon={<Thermometer size={12} />} label="Temp" value={`${selectedPatient.vitals.temp.toFixed(1)}°F`} warn={selectedPatient.vitals.temp > 101} />
                  <VitalChip icon={<Activity size={12} />} label="SBP" value={`${Math.round(selectedPatient.vitals.sbp)} mmHg`} warn={selectedPatient.vitals.sbp < 90 || selectedPatient.vitals.sbp > 180} />
                  <VitalChip icon={<Wind size={12} />} label="RR" value={`${Math.round(selectedPatient.vitals.rr)}/min`} warn={selectedPatient.vitals.rr > 25 || selectedPatient.vitals.rr < 8} />
                </div>
              </div>

              <div className="flex-1 overflow-hidden grid grid-rows-[auto_1fr]">
                {/* Agent pipeline */}
                <div className="px-5 py-3 border-b border-slate-800/60 flex-shrink-0">
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <Zap size={11} />  Agent Pipeline
                  </h3>
                  <div className="grid grid-cols-5 gap-2">
                    <PipelineStage
                      icon={<Activity size={12} />}
                      label="Risk Score"
                      status="done"
                      note={`${Math.round(selectedPatient.riskScore * 100)}% — ${selectedPatient.riskLevel}`}
                    />
                    <PipelineStage
                      icon={<Heart size={12} />}
                      label="ICU Decision"
                      status={selectedPatient.icu ? "block" : "done"}
                      note={selectedPatient.icu ? "ICU required" : "No ICU needed"}
                    />
                    <PipelineStage
                      icon={<Shield size={12} />}
                      label="Safety Gate"
                      status={selectedPatient.icu ? "block" : "done"}
                      note={selectedPatient.icu ? "Approval needed" : "Passed"}
                    />
                    <PipelineStage
                      icon={<TrendingUp size={12} />}
                      label="Digital Twin"
                      status="done"
                      note="3 scenarios computed"
                    />
                    <PipelineStage
                      icon={<Network size={12} />}
                      label="Routing"
                      status="done"
                      note={`→ ${selectedPatient.destination} (${selectedPatient.urgency})`}
                    />
                  </div>
                </div>

                {/* Digital Twin + Flags */}
                <div className="flex-1 overflow-auto px-5 py-4">
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Digital Twin */}
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                        <Waves size={11} />  Digital Twin — What-If Scenarios
                      </h3>
                      <TwinPanel scenarios={[
                        {
                          scenario: "No Action",
                          intervention: "none",
                          riskScore: Math.min(1, selectedPatient.riskScore + 0.25),
                          outcome: selectedPatient.riskScore + 0.25 > 0.75 ? "High likelihood of deterioration" : "Moderate risk — close monitoring",
                          timeToEvent: selectedPatient.riskScore > 0.5 ? "< 2 hours" : "12-48 hours",
                          recommendation: "Do not delay — deterioration likely without intervention",
                        },
                        {
                          scenario: "Immediate Treatment",
                          intervention: "treatment",
                          riskScore: Math.max(0, selectedPatient.riskScore - 0.28),
                          outcome: selectedPatient.riskScore - 0.28 < 0.3 ? "Low risk — stable" : "Moderate risk — monitoring needed",
                          timeToEvent: "stable",
                          recommendation: "Initiate treatment now for best outcome trajectory",
                        },
                        {
                          scenario: "Delayed Care (4-6h)",
                          intervention: "delay",
                          riskScore: Math.min(1, selectedPatient.riskScore + 0.38),
                          outcome: "High likelihood of deterioration",
                          timeToEvent: "< 2 hours",
                          recommendation: "Avoid delay — 4-6 hour lag substantially worsens prognosis",
                        },
                      ]} />
                    </div>

                    {/* Risk flags + routing detail */}
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={11} />  Risk Flags
                        </h3>
                        {selectedPatient.flags.length > 0 ? (
                          <div className="space-y-1.5">
                            {selectedPatient.flags.map(f => (
                              <div key={f} className="flex items-center gap-2 bg-red-950/20 border border-red-800/30 rounded-lg px-3 py-1.5 text-xs text-red-300">
                                <AlertTriangle size={10} className="text-red-500 flex-shrink-0" />
                                {f}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-emerald-950/20 border border-emerald-800/30 rounded-lg px-3 py-1.5 text-xs text-emerald-300">
                            <CheckCircle2 size={10} />
                            All vitals within acceptable range
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                          <ArrowRight size={11} />  Routing Decision
                        </h3>
                        <div className={cn("rounded-lg border px-3 py-2 text-xs", destColour(selectedPatient.destination))}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm">{selectedPatient.destination}</span>
                            <Badge variant="outline" className="text-[10px] capitalize border-current opacity-70">{selectedPatient.urgency}</Badge>
                          </div>
                          <p className="opacity-70">Patient routed based on deterioration risk, system capacity, and safety disposition</p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                          <Shield size={11} />  Safety Gate
                        </h3>
                        <div className={cn("rounded-lg border px-3 py-2 text-xs flex items-center gap-2",
                          selectedPatient.icu
                            ? "bg-red-950/20 border-red-700/40 text-red-300"
                            : "bg-emerald-950/20 border-emerald-700/40 text-emerald-300"
                        )}>
                          {selectedPatient.icu
                            ? <><Lock size={10} /><span>Blocked — physician co-signature required before ICU transfer</span></>
                            : <><Unlock size={10} /><span>Passed — no safety escalation required</span></>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Brain size={48} className="text-violet-400/30 mb-4" />
              <h2 className="text-lg font-semibold text-slate-500 mb-2">No patient selected</h2>
              <p className="text-sm text-slate-600">Start the autonomous loop or run a cycle, then click a patient card to view their full agent analysis.</p>
              <Button
                data-testid="btn-start-loop-empty"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || isRunning}
                className="mt-6 bg-violet-600 hover:bg-violet-700"
              >
                <Play size={14} className="mr-2" />
                Start Autonomous Loop
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT — Insights + Audit + WebSocket */}
        <div className="border-l border-slate-800/60 flex flex-col overflow-hidden">
          {/* Insights */}
          <div className="flex flex-col" style={{ flex: "0 0 auto", maxHeight: "45%" }}>
            <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
              <Zap size={13} className="text-yellow-400" />
              <span className="text-xs font-semibold text-slate-300">Agent Insights</span>
              {(insightsData?.critical ?? 0) > 0 && (
                <Badge className="ml-auto text-[10px] bg-red-900/50 text-red-200">{insightsData?.critical} CRIT</Badge>
              )}
              {(insightsData?.high ?? 0) > 0 && (
                <Badge className="text-[10px] bg-orange-900/50 text-orange-200">{insightsData?.high} HIGH</Badge>
              )}
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1.5">
                {insights.length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-4">No insights yet</p>
                ) : (
                  insights.slice(0, 20).map((ins, i) => (
                    <div
                      key={i}
                      data-testid={`insight-item-${i}`}
                      className={cn("rounded-lg px-2.5 py-2 border text-[11px]",
                        ins.priority === "CRITICAL" ? "bg-red-950/20 border-red-800/30" :
                        ins.priority === "HIGH"     ? "bg-orange-950/20 border-orange-800/30" :
                        ins.priority === "MODERATE" ? "bg-yellow-950/20 border-yellow-800/30" :
                        "bg-slate-900/40 border-slate-700/30"
                      )}
                    >
                      <p className={cn("font-medium leading-snug mb-0.5", priorityColour(ins.priority))}>{ins.message}</p>
                      <p className="text-slate-500 flex items-center gap-1">
                        <ChevronRight size={9} /> {ins.action}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator className="bg-slate-800/60" />

          {/* ── Claude Hardening Review ──────────────────────────────────── */}
          <div className="flex flex-col flex-shrink-0">
            <button
              className="px-3 py-2 flex items-center gap-2 w-full text-left hover:bg-slate-800/30 transition-colors"
              onClick={() => setHrOpen(o => !o)}
              data-testid="btn-toggle-hardening-panel"
            >
              <GitBranch size={13} className="text-violet-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-300 flex-1">Claude Hardening Review</span>
              {hrRunning && <RefreshCw size={11} className="text-violet-300 animate-spin" />}
              {hrResult && !hrRunning && <CheckCircle2 size={11} className="text-emerald-400" />}
              {hrOpen ? <ChevronUp size={11} className="text-slate-500" /> : <ChevronDown size={11} className="text-slate-500" />}
            </button>

            {hrOpen && (
              <div className="px-2 pb-2 space-y-2">
                <div className="flex items-center gap-1.5 bg-slate-800/40 rounded px-2 py-1.5">
                  <FileArchive size={11} className="text-yellow-400 flex-shrink-0" />
                  <span className="text-[10px] text-slate-400 truncate flex-1" data-testid="text-active-zip">
                    {activeZip || (bundleStatus ? "No bundle found" : "Loading…")}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="w-full h-7 text-xs bg-violet-700 hover:bg-violet-600 text-white"
                  onClick={startHardeningReview}
                  disabled={hrRunning}
                  data-testid="btn-send-to-claude"
                >
                  {hrRunning
                    ? <><Cpu size={12} className="mr-1.5 animate-pulse" />Sending to Claude…</>
                    : <><Send size={12} className="mr-1.5" />Send to Claude</>}
                </Button>
                {hrLogs.length > 0 && (
                  <ScrollArea className="h-28 rounded border border-slate-700/40 bg-slate-900/50 p-1.5">
                    <div className="space-y-0.5">
                      {hrLogs.map((l, i) => (
                        <p key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed">{l}</p>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                {hrResult && (
                  <div className="rounded border border-emerald-700/40 bg-emerald-950/20 px-2 py-1.5 space-y-1">
                    <p className="text-[10px] font-semibold text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 size={10} /> {hrResult.phases?.length ?? 0} phases · {hrResult.filesChanged?.length ?? 0} files
                    </p>
                    {hrResult.phases?.slice(0, 3).map((ph: any) => (
                      <p key={ph.phase} className="text-[10px] text-slate-400">
                        <span className="text-violet-400 font-mono">P{ph.phase}</span> {ph.title}
                      </p>
                    ))}
                    {(hrResult.phases?.length ?? 0) > 3 && (
                      <p className="text-[10px] text-slate-500">+{hrResult.phases.length - 3} more phases…</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator className="bg-slate-800/60" />

          {/* Audit chain */}
          <div className="flex flex-col" style={{ flex: "0 0 auto", maxHeight: "30%" }}>
            <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
              <Hash size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">Audit Chain</span>
              <span className="ml-auto text-[10px] text-slate-500">{auditData?.totalEvents ?? 0} events</span>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1">
                {audit.length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-3">No events yet</p>
                ) : (
                  audit.slice(0, 10).map((e, i) => (
                    <div key={i} data-testid={`audit-entry-${i}`} className="rounded border border-slate-800/40 bg-slate-900/30 px-2 py-1.5 text-[10px]">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn("font-medium", e.risk?.level === "CRITICAL" ? "text-red-400" : e.risk?.level === "HIGH" ? "text-orange-400" : "text-slate-300")}>
                          {e.patientId}
                        </span>
                        {e.risk?.level && (
                          <span className={cn("px-1 rounded text-[9px]",
                            e.risk.level === "CRITICAL" ? "bg-red-900/40 text-red-300" :
                            e.risk.level === "HIGH"     ? "bg-orange-900/40 text-orange-300" :
                            "bg-slate-800 text-slate-400"
                          )}>{e.risk.level}</span>
                        )}
                        <span className="ml-auto text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span>
                      </div>
                      <p className="font-mono text-slate-600 truncate">#{e.hash}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator className="bg-slate-800/60" />

          {/* WebSocket live feed */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
              <Waves size={13} className="text-blue-400" />
              <span className="text-xs font-semibold text-slate-300">Live Stream</span>
              <span className={cn("w-1.5 h-1.5 rounded-full ml-auto",
                wsRef.current?.readyState === WebSocket.OPEN ? "bg-emerald-400 animate-pulse" : "bg-red-500"
              )} />
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-0.5">
                {wsEvents.length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-3">Awaiting stream…</p>
                ) : (
                  wsEvents.slice(0, 30).map((e, i) => (
                    <p key={i} className="text-[10px] font-mono text-slate-500 truncate">{e}</p>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
