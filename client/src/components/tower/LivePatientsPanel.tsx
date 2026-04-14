import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Activity, Wifi, WifiOff } from "lucide-react";

interface StreamEvent {
  patient_id: string;
  feature_key: string;
  value: number;
  ts: number;
}

interface PatientStateRow {
  patientId: string;
  currentDx: string | null;
  currentDisposition: string | null;
  riskScore: number | null;
}

export default function LivePatientsPanel() {
  const [connected, setConnected] = useState(false);
  const [stream, setStream] = useState<StreamEvent[]>([]);

  const { data: patients = [] } = useQuery<PatientStateRow[]>({
    queryKey: ["/api/sysctrl/patients"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    // Phase 5 Fix: was using /ws/patient-stream which is an unmounted endpoint.
    // The live patient engine broadcasts to /ws/patients (via patientStream.ts).
    // The usePatientStream hook uses this correctly; this component was out of sync.
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/patients`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.patient_id) {
          setStream(prev => [data, ...prev.slice(0, 29)]);
        }
      } catch {}
    };
    return () => { try { ws.close(); } catch {} };
  }, []);

  return (
    <div data-testid="live-patients-panel" className="space-y-3">
      <div className="flex items-center gap-2">
        {connected
          ? <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-xs text-green-600">Live stream connected</span></>
          : <><WifiOff className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Waiting for stream…</span></>
        }
      </div>

      {/* Patient state table */}
      {patients.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Active Patients</p>
          <div className="space-y-1">
            {patients.map((p, i) => (
              <div key={p.patientId} className="flex items-center justify-between text-xs p-2 rounded-lg border bg-card" data-testid={`patient-state-${i}`}>
                <span className="font-medium">{p.patientId}</span>
                <div className="flex items-center gap-1">
                  {p.currentDx && <Badge variant="outline" className="text-xs py-0">{p.currentDx.slice(0, 12)}</Badge>}
                  {p.riskScore != null && p.riskScore > 0 && (
                    <Badge variant="destructive" className="text-xs py-0">risk {p.riskScore.toFixed(1)}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live stream events */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Live Events</p>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {stream.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No events yet — POST to /api/sysctrl/stream to push data</p>
          )}
          {stream.map((ev, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5 border-b border-border/40">
              <Activity className="h-3 w-3 text-blue-500 shrink-0" />
              <span className="font-medium">{ev.patient_id}</span>
              <span className="text-muted-foreground">→</span>
              <span>{ev.feature_key}</span>
              <Badge variant="secondary" className="text-xs py-0 ml-auto">{ev.value}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
