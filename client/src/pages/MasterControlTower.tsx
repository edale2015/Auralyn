import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertTriangle, Brain, CheckCircle, Download,
  Globe, RefreshCcw, Server, Shield, Zap, FlaskConical,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SystemState {
  simulation: { running: boolean; lastRun: number; patients: number; load: string };
  ml: { modelVersion: string; drift: boolean; activeModel: string };
  automation: { templates: number; failures: number };
  infrastructure: { regions: string[]; healthy: boolean };
  safety: { mismatchRate: number };
  controls: { resetCount: number; lastResetAt: string | null; lastAlertAt: string | null };
}

interface WSEvent { event: string; data?: unknown; ts?: number }

const LOAD_COLOR: Record<string, string> = {
  normal:   "text-green-400",
  high:     "text-yellow-400",
  critical: "text-red-400",
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-400" : "bg-red-500"}`} />
  );
}

function ActionBtn({
  icon: Icon, label, onClick, pending, variant = "outline", testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  pending?: boolean;
  variant?: "outline" | "destructive";
  testId?: string;
}) {
  return (
    <Button variant={variant} size="sm" disabled={pending} onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-1.5 border-gray-700 text-gray-300 hover:bg-gray-800 ${
        variant === "destructive" ? "border-red-800 text-red-400 hover:bg-red-900/20" : ""
      }`}>
      <Icon className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      {label}
    </Button>
  );
}

export default function MasterControlTower() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [wsEvents, setWsEvents] = useState<WSEvent[]>([]);
  const [modelInput, setModelInput] = useState("v2");
  const [alertMsg, setAlertMsg] = useState("");
  const [templateId, setTemplateId] = useState("");

  const { data: state, isLoading } = useQuery<SystemState>({
    queryKey: ["/api/control/state"],
    refetchInterval: 2000,
  });

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/control`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const ev: WSEvent = JSON.parse(e.data);
        setWsEvents(prev => [ev, ...prev].slice(0, 20));
      } catch {}
    };
    return () => ws.close();
  }, []);

  const post = (path: string, body?: unknown) =>
    useMutation({
      mutationFn: () => apiRequest("POST", `/api/control${path}`, body ?? {}),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/control/state"] }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    });

  const simMut    = post("/simulate");
  const stressMut = post("/stress");
  const resetMut  = post("/reset");

  const modelMut  = useMutation({
    mutationFn: () => apiRequest("POST", "/api/control/model", { version: modelInput }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/control/state"] }); toast({ title: `Model switched to ${modelInput}` }); },
  });

  const alertMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/control/alert", { message: alertMsg }),
    onSuccess: () => { setAlertMsg(""); toast({ title: "Alert broadcast", description: alertMsg }); },
  });

  const repairMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/control/template/repair", { templateId }),
    onSuccess: () => { setTemplateId(""); toast({ title: `Template ${templateId} queued for repair` }); },
  });

  const exportMut = useMutation({
    mutationFn: () => apiRequest("GET", "/api/control/export"),
    onSuccess: () => toast({ title: "Enterprise package exported" }),
  });

  const reportMut = useMutation({
    mutationFn: () => apiRequest("GET", "/api/control/report"),
    onSuccess: (d: any) => toast({ title: d?.summary ?? "Report generated" }),
  });

  const loadColor = LOAD_COLOR[state?.simulation?.load ?? "normal"] ?? "text-green-400";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-purple-400 animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Master Control Tower</h1>
            <p className="text-xs text-gray-500">Live, self-aware healthcare intelligence network</p>
          </div>
        </div>
        <Badge variant="outline" className="border-purple-700 text-purple-400 text-xs" data-testid="badge-live">
          UNIFIED CONTROL
        </Badge>
      </div>

      {isLoading && !state && (
        <div className="text-gray-500 text-sm animate-pulse" data-testid="status-loading">
          Connecting to control plane…
        </div>
      )}

      {state && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs text-gray-500">Simulation</span>
                </div>
                <p className={`text-lg font-bold font-mono ${loadColor}`} data-testid="stat-load">
                  {state.simulation.load.toUpperCase()}
                </p>
                <p className="text-xs text-gray-600">{state.simulation.patients.toLocaleString()} patients</p>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-xs text-gray-500">ML Model</span>
                </div>
                <p className="text-lg font-bold font-mono text-white" data-testid="stat-model">
                  {state.ml.activeModel}
                </p>
                <p className="text-xs text-gray-600">drift: {state.ml.drift ? "⚠️ yes" : "✓ no"}</p>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="text-xs text-gray-500">Automation</span>
                </div>
                <p className="text-lg font-bold font-mono text-white" data-testid="stat-templates">
                  {state.automation.templates}
                </p>
                <p className="text-xs text-gray-600">{state.automation.failures} failure(s)</p>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs text-gray-500">Infra</span>
                </div>
                <p className="text-sm font-mono text-gray-300 truncate" data-testid="stat-regions">
                  {state.infrastructure.regions.length} regions
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusDot ok={state.infrastructure.healthy} />
                  <span className="text-xs text-gray-600">
                    {state.infrastructure.healthy ? "healthy" : "degraded"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs text-gray-500">Safety</span>
                </div>
                <p className="text-lg font-bold font-mono text-green-400" data-testid="stat-safety">
                  {(state.safety.mismatchRate * 100).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-600">mismatch rate</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-400" /> Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <ActionBtn icon={FlaskConical} label="Run Simulation" testId="button-simulate"
                    onClick={() => simMut.mutate()} pending={simMut.isPending} />
                  <ActionBtn icon={Zap} label="Stress Test (1k)" testId="button-stress"
                    onClick={() => stressMut.mutate()} pending={stressMut.isPending} />
                  <ActionBtn icon={Download} label="Export Package" testId="button-export"
                    onClick={() => exportMut.mutate()} pending={exportMut.isPending} />
                  <ActionBtn icon={CheckCircle} label="Generate Report" testId="button-report"
                    onClick={() => reportMut.mutate()} pending={reportMut.isPending} />
                  <ActionBtn icon={RefreshCcw} label="System Reset" variant="destructive" testId="button-reset"
                    onClick={() => resetMut.mutate()} pending={resetMut.isPending} />
                </div>
                <div className="flex gap-2">
                  <Input value={modelInput} onChange={e => setModelInput(e.target.value)}
                    placeholder="Model version (e.g. v2)" className="h-8 text-sm bg-gray-800 border-gray-700"
                    data-testid="input-model" />
                  <Button size="sm" variant="outline"
                    className="border-purple-700 text-purple-300 hover:bg-purple-900/20 whitespace-nowrap"
                    onClick={() => modelMut.mutate()} disabled={modelMut.isPending}
                    data-testid="button-switch-model">
                    Switch Model
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input value={templateId} onChange={e => setTemplateId(e.target.value)}
                    placeholder="Template ID to repair" className="h-8 text-sm bg-gray-800 border-gray-700"
                    data-testid="input-template-id" />
                  <Button size="sm" variant="outline"
                    className="border-yellow-700 text-yellow-300 hover:bg-yellow-900/20 whitespace-nowrap"
                    onClick={() => repairMut.mutate()} disabled={repairMut.isPending || !templateId}
                    data-testid="button-repair">
                    Repair
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
                    placeholder="Alert message" className="h-8 text-sm bg-gray-800 border-gray-700"
                    data-testid="input-alert" />
                  <Button size="sm" variant="outline"
                    className="border-red-800 text-red-400 hover:bg-red-900/20 whitespace-nowrap"
                    onClick={() => alertMut.mutate()} disabled={alertMut.isPending || !alertMsg}
                    data-testid="button-alert">
                    🚨 Alert
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-400" /> Live Event Stream
                  <Badge variant="outline" className="border-green-800 text-green-500 text-xs ml-auto">
                    /ws/control
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent data-testid="section-events">
                {wsEvents.length === 0 ? (
                  <p className="text-xs text-gray-600 animate-pulse">Waiting for events…</p>
                ) : (
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {wsEvents.map((ev, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs" data-testid={`event-item-${i}`}>
                        <span className="text-gray-600 font-mono tabular-nums w-16 shrink-0">
                          {ev.ts ? new Date(ev.ts).toLocaleTimeString() : "—"}
                        </span>
                        <span className="text-blue-300">{ev.event}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" /> Infrastructure Regions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2" data-testid="section-regions">
                {state.infrastructure.regions.map(r => (
                  <div key={r} className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-md"
                    data-testid={`region-${r}`}>
                    <StatusDot ok={state.infrastructure.healthy} />
                    <span className="text-xs font-mono text-gray-300">{r}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Resets: {state.controls.resetCount} ·{" "}
                Last reset: {state.controls.lastResetAt
                  ? new Date(state.controls.lastResetAt).toLocaleTimeString()
                  : "never"} ·{" "}
                Last alert: {state.controls.lastAlertAt
                  ? new Date(state.controls.lastAlertAt).toLocaleTimeString()
                  : "never"}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
