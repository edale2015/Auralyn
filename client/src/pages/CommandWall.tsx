/**
 * Command Wall — full-hospital visibility for large display/wall screen
 * Shows ALL patients ranked by risk · live sepsis alerts · deterioration signals
 * Designed for dark-mode command room display
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation }        from "@tanstack/react-query";
import { apiRequest }                   from "@/lib/queryClient";
import { useToast }                     from "@/hooks/use-toast";
import { Badge }                        from "@/components/ui/badge";
import { Button }                       from "@/components/ui/button";
import { Activity, Wifi, WifiOff, AlertTriangle, RefreshCw } from "lucide-react";

// ── WS live feed ──────────────────────────────────────────────────────────────
function useWallFeed() {
  const [patients, setPatients] = useState<any[]>([]);
  const [alerts,   setAlerts]   = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timer = useRef<any>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws    = new WebSocket(`${proto}//${window.location.host}/ws/patients`);
    wsRef.current = ws;
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => { setConnected(false); timer.current = setTimeout(connect, 2000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "WALL_DISPLAY_UPDATE" && Array.isArray(msg.payload)) {
          setPatients(msg.payload);
        }
        if (msg.type === "SEPSIS_ALERT" && msg.payload) {
          setAlerts((prev) => [msg.payload, ...prev].slice(0, 20));
        }
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); if (timer.current) clearTimeout(timer.current); }; }, [connect]);
  return { patients, alerts, connected };
}

// ── Risk color for card ───────────────────────────────────────────────────────
function levelBg(level: string) {
  if (level === "CRITICAL") return "bg-red-900/90 border-red-500";
  if (level === "HIGH")     return "bg-orange-900/90 border-orange-400";
  if (level === "MODERATE") return "bg-yellow-900/80 border-yellow-500";
  return "bg-slate-800/80 border-slate-600";
}

function sepsisBar(prob: number) {
  const pct = Math.round(prob * 100);
  const col = pct > 60 ? "bg-red-500" : pct > 30 ? "bg-orange-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${col} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${pct > 60 ? "text-red-400" : pct > 30 ? "text-orange-300" : "text-slate-400"}`}>{pct}%</span>
    </div>
  );
}

export default function CommandWall() {
  const { toast } = useToast();
  const { patients, alerts, connected } = useWallFeed();

  // Demo sample data for manual refresh
  const samplePatients = [
    { id: "A01", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28, alteredMentalStatus: true }, symptoms: ["fever", "chills"], labs: { lactate: 3.2 } },
    { id: "A02", vitals: { hr: 112, spo2: 93, temp: 101.5, systolicBP: 98, rr: 22 }, symptoms: ["fever"] },
    { id: "A03", vitals: { hr: 78, spo2: 98, temp: 98.6, systolicBP: 122, rr: 16 }, symptoms: [] },
  ];

  const wallMut = useMutation({
    mutationFn: (patients: any[]) => apiRequest("POST", "/api/hospital/wall/update", { patients }),
    onError: () => toast({ title: "Wall update failed", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-bold tracking-wide">AURALYN COMMAND WALL</h1>
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${connected ? "bg-emerald-900 text-emerald-400" : "bg-red-900 text-red-400"}`} data-testid="wall-ws-status">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "LIVE" : "OFFLINE"}
          </div>
        </div>
        <Button size="sm" variant="outline" className="text-white border-slate-600 hover:bg-slate-800" onClick={() => wallMut.mutate(samplePatients)} data-testid="button-wall-refresh">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Demo Update
        </Button>
      </div>

      {/* Sepsis alerts strip */}
      {alerts.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {alerts.slice(0, 5).map((a, i) => (
            <div key={i} className="flex-shrink-0 flex items-center gap-1.5 bg-red-700 text-white rounded px-2.5 py-1 text-xs animate-pulse" data-testid={`sepsis-alert-${i}`}>
              <AlertTriangle className="h-3 w-3" />
              <span className="font-bold">SEPSIS</span> Pt {a.patientId} — {Math.round((a.probability ?? 0) * 100)}%
            </div>
          ))}
        </div>
      )}

      {/* Patient grid */}
      {patients.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <Activity className="h-8 w-8 mb-3 opacity-30" />
          <div className="text-sm">Waiting for patient data — press Demo Update to populate</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {patients.map((p, i) => (
            <div key={p.patientId ?? i} data-testid={`wall-patient-${p.patientId}`} className={`rounded-lg border p-3 text-xs space-y-1.5 ${levelBg(p.level)}`}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Pt {p.patientId}</span>
                <Badge className={`text-xs px-1.5 py-0 ${p.level === "CRITICAL" ? "bg-red-600" : p.level === "HIGH" ? "bg-orange-500" : p.level === "MODERATE" ? "bg-yellow-500 text-black" : "bg-slate-600"}`}>
                  {p.level ?? "?"}
                </Badge>
              </div>
              {/* Risk score */}
              <div className="text-slate-300">Risk: <span className="font-mono font-bold text-white">{p.riskScore?.toFixed(1) ?? "—"}</span></div>
              {/* Scope level */}
              <div className="text-slate-400">Scope Lv <span className="text-white font-mono">{p.allowedScopeLevel ?? 1}</span></div>
              {/* Sepsis */}
              <div className="space-y-0.5">
                <div className="text-slate-400">Sepsis</div>
                {sepsisBar(p.sepsisRisk?.probability ?? 0)}
              </div>
              {/* Deterioration */}
              {p.deterioration?.deteriorating && (
                <div className="flex items-center gap-1 text-yellow-300 animate-pulse" data-testid={`wall-deteriorating-${p.patientId}`}>
                  <AlertTriangle className="h-3 w-3" /> Deteriorating
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
