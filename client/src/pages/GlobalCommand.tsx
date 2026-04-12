/**
 * Global Command — system-wide hospital brain: ops + EMS + RL + system state
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation }             from "@tanstack/react-query";
import { apiRequest }              from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }                   from "@/components/ui/badge";
import { Button }                  from "@/components/ui/button";
import { useToast }                from "@/hooks/use-toast";
import { ScrollArea }              from "@/components/ui/scroll-area";
import { Cpu, Activity, AlertTriangle, Ambulance, RefreshCw, Wifi, WifiOff } from "lucide-react";

function useGlobalFeed() {
  const [data, setData]         = useState<any>(null);
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
        if (msg.type === "GLOBAL_BRAIN_UPDATE") setData(msg.payload);
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); if (timer.current) clearTimeout(timer.current); }; }, [connect]);
  return { data, connected };
}

const DEMO = {
  patients:  [
    { id: "A01", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"] },
    { id: "A02", vitals: { hr: 78,  spo2: 98, temp: 98.6,  systolicBP: 122, rr: 16 }, symptoms: [] },
  ],
  beds:      [{ id: "B1", hospitalId: "H1", available: true }, { id: "B2", hospitalId: "H1", available: false }],
  hospitals: [
    { id: "H1", name: "NYU Langone", icuBeds: 20, availableBeds: 8,  location: { lat: 40.74, lng: -73.97 } },
    { id: "H2", name: "Bellevue",    icuBeds: 30, availableBeds: 15, location: { lat: 40.74, lng: -73.97 } },
  ],
  emsCalls:  [
    { id: "EMS-1", vitals: { hr: 130, spo2: 88, temp: 102.5, systolicBP: 85, rr: 26 }, symptoms: ["chest pain"], etaMinutes: 8, location: { lat: 40.75, lng: -73.98 } },
  ],
};

function strategyBadge(strategy: string) {
  if (strategy === "CRITICAL_OVERLOAD") return <Badge className="bg-red-600 text-white">{strategy.replace("_", " ")}</Badge>;
  if (strategy === "DIVERT")            return <Badge className="bg-orange-500 text-white">{strategy}</Badge>;
  if (strategy === "SURGE")             return <Badge className="bg-yellow-500 text-black">{strategy}</Badge>;
  return <Badge className="bg-emerald-600 text-white">{strategy}</Badge>;
}

export default function GlobalCommand() {
  const { toast } = useToast();
  const { data: wsData, connected } = useGlobalFeed();

  const brainMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hospital/brain", DEMO),
    onError: () => toast({ title: "Global brain cycle failed", variant: "destructive" }),
  });

  const data = (brainMut.data as any) ?? wsData;
  const ops  = data?.ops;
  const ems  = data?.emsRouting ?? [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" />Global Command Brain</h1>
          <p className="text-xs text-muted-foreground">Hospital Ops · EMS Pipeline · RL Recommendations · System Health</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${connected ? "border-emerald-400 text-emerald-600" : "border-red-400 text-red-500"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Offline"}
          </div>
          <Button size="sm" onClick={() => brainMut.mutate()} disabled={brainMut.isPending} data-testid="button-global-brain">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${brainMut.isPending ? "animate-spin" : ""}`} />Run Brain
          </Button>
        </div>
      </div>

      {!data ? (
        <div className="text-center text-muted-foreground py-16">Press "Run Brain" to run the first global hospital brain cycle</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Hospital Ops */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Hospital Ops</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {ops ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Strategy</span>{strategyBadge(ops.strategy)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Load</span><span className="font-mono font-bold">{ops.load} patients</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Available beds</span><span className="font-mono">{ops.availableBeds}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Utilization</span><span className={`font-mono ${ops.utilizationPct > 80 ? "text-red-600 font-bold" : ""}`}>{ops.utilizationPct}%</span></div>
                  <div className="mt-2 pt-2 border-t">
                    <div className="font-semibold mb-1 text-muted-foreground">Actions</div>
                    {ops.actions?.map((a: string) => <div key={a} className="text-muted-foreground">• {a.replace(/_/g, " ")}</div>)}
                  </div>
                  <div className="text-xs text-muted-foreground italic">{ops.recommendation}</div>
                </>
              ) : <div className="text-muted-foreground">No ops data</div>}
            </CardContent>
          </Card>

          {/* EMS Routing */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />EMS Routing</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-52 px-3 py-2">
                {ems.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4">No EMS calls</div>
                ) : ems.map((r: any, i: number) => (
                  <div key={i} data-testid={`ems-route-${r.patientId}`} className="py-1.5 border-b last:border-0 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold">{r.patientId}</span>
                      <Badge className={`text-xs px-1.5 py-0 ${r.alertLevel === "CRITICAL" ? "bg-red-600 text-white" : r.alertLevel === "URGENT" ? "bg-orange-500 text-white" : "bg-slate-500 text-white"}`}>{r.alertLevel}</Badge>
                    </div>
                    <div className="text-muted-foreground">→ {r.hospitalName ?? r.assignedHospital ?? "No hospital"}</div>
                    <div className="text-muted-foreground">ICU prob: <span className="font-mono">{(r.predictedICUProb * 100).toFixed(0)}%</span> | ETA: {r.etaMinutes}min</div>
                    {r.sepsisFlag && <div className="text-red-500 font-bold">🔴 Sepsis flag</div>}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* System stats */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" />System Status</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {data.system && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Patients tracked</span><span className="font-bold font-mono">{data.system.twins?.length ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">At risk</span><span className={`font-bold font-mono ${(data.system.patientsAtRisk ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>{data.system.patientsAtRisk ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ICU beds assigned</span><span className="font-mono">{data.system.icuAssignments?.length ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Capacity</span><span className="font-mono">{data.system.capacity?.available ?? "—"}/{data.system.capacity?.total ?? "—"}</span></div>
                </>
              )}
              <div className="pt-2 border-t text-muted-foreground">
                <div>WS Events</div>
                <div className={`font-bold ${connected ? "text-emerald-600" : "text-red-500"}`}>{connected ? "Receiving live updates" : "Disconnected"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
