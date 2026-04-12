/**
 * Regional Command — Digital Twin + ICU allocation + multi-hospital routing
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation }  from "@tanstack/react-query";
import { apiRequest }              from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }                   from "@/components/ui/badge";
import { Button }                  from "@/components/ui/button";
import { useToast }                from "@/hooks/use-toast";
import { ScrollArea }              from "@/components/ui/scroll-area";
import { Activity, Building2, Bed, RefreshCw, Wifi, WifiOff } from "lucide-react";

function useSystemSnapshot() {
  const [data, setData] = useState<any>(null);
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
        if (msg.type === "SYSTEM_SNAPSHOT") setData(msg.payload);
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); if (timer.current) clearTimeout(timer.current); }; }, [connect]);
  return { data, connected };
}

const DEMO_PATIENTS = [
  { id: "A01", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"] },
  { id: "A02", vitals: { hr: 112, spo2: 93, temp: 101.5, systolicBP: 98, rr: 22 }, symptoms: ["fever"] },
  { id: "A03", vitals: { hr: 78,  spo2: 98, temp: 98.6,  systolicBP: 122, rr: 16 }, symptoms: [] },
];

const DEMO_BEDS      = [
  { id: "B1", hospitalId: "H1", available: true },
  { id: "B2", hospitalId: "H1", available: true },
  { id: "B3", hospitalId: "H2", available: false },
];

const DEMO_HOSPITALS = [
  { id: "H1", name: "NYU Langone",  icuBeds: 20, availableBeds: 8,  location: { lat: 40.74, lng: -73.97 } },
  { id: "H2", name: "Bellevue",     icuBeds: 30, availableBeds: 2,  location: { lat: 40.74, lng: -73.97 } },
  { id: "H3", name: "Lenox Hill",   icuBeds: 15, availableBeds: 12, location: { lat: 40.77, lng: -73.96 } },
];

function riskColor(summary: string) {
  if (summary === "ICU_IMMINENT")   return "bg-red-600 text-white";
  if (summary === "DETERIORATING")  return "bg-orange-500 text-white";
  if (summary === "WATCH")          return "bg-yellow-500 text-black";
  return "bg-emerald-600 text-white";
}

export default function RegionalCommand() {
  const { toast } = useToast();
  const { data: wsData, connected } = useSystemSnapshot();

  const cycleMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hospital/system/cycle", { patients: DEMO_PATIENTS, beds: DEMO_BEDS, hospitals: DEMO_HOSPITALS }),
    onError: () => toast({ title: "System cycle failed", variant: "destructive" }),
  });

  const data = (cycleMut.data as any) ?? wsData;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Regional Command</h1>
          <p className="text-xs text-muted-foreground">Digital Twin · ICU Allocation · Multi-Hospital Routing</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${connected ? "border-emerald-400 text-emerald-600" : "border-red-400 text-red-500"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Offline"}
          </div>
          <Button size="sm" onClick={() => cycleMut.mutate()} disabled={cycleMut.isPending} data-testid="button-regional-refresh">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${cycleMut.isPending ? "animate-spin" : ""}`} />Run Cycle
          </Button>
        </div>
      </div>

      {!data ? (
        <div className="text-center text-muted-foreground py-16">Press "Run Cycle" to run the first system cycle</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Digital Twins */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Digital Twins ({data.twins?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64 px-3 py-2">
                {(data.twins ?? []).map((t: any) => (
                  <div key={t.patientId} data-testid={`twin-${t.patientId}`} className="flex items-center justify-between py-1.5 border-b last:border-0 text-xs">
                    <div>
                      <span className="font-semibold">Pt {t.patientId}</span>
                      <div className="text-muted-foreground">ICU risk: <span className="font-mono font-bold">{(t.icuProb * 100).toFixed(0)}%</span></div>
                      <div className="text-muted-foreground">TTE: {t.tteMinutes === -1 ? "N/A" : `${t.tteMinutes}min`}</div>
                    </div>
                    <Badge className={`text-xs ${riskColor(t.riskSummary)}`}>{t.riskSummary?.replace("_", " ")}</Badge>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ICU Allocations */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Bed className="h-4 w-4" />ICU Allocations</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64 px-3 py-2">
                {(data.icuAssignments ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4">No ICU assignments needed</div>
                ) : (data.icuAssignments ?? []).map((a: any) => (
                  <div key={a.patientId} data-testid={`icu-${a.patientId}`} className="py-1.5 border-b last:border-0 text-xs">
                    <div className="font-semibold">Pt {a.patientId} → Bed {a.bedId}</div>
                    <div className="text-muted-foreground">{a.hospitalId} · priority {(a.priorityScore * 100).toFixed(0)}%</div>
                  </div>
                ))}
                {/* Capacity summary */}
                {data.capacity && (
                  <div className="mt-2 pt-2 border-t text-xs space-y-0.5">
                    <div className="font-semibold text-muted-foreground">System Capacity</div>
                    <div>Available: {data.capacity.available}/{data.capacity.total} beds</div>
                    <div>Utilized: <span className={data.capacity.critical ? "text-red-600 font-bold" : ""}>{data.capacity.utilizationPct}%</span></div>
                    {data.capacity.critical && <div className="text-red-600 font-bold">⚠ CAPACITY CRITICAL</div>}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Hospital Routing */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />Hospital Routing</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-64 px-3 py-2">
                {(data.routing ?? []).map((r: any) => (
                  <div key={r.patientId} data-testid={`route-${r.patientId}`} className="py-1.5 border-b last:border-0 text-xs">
                    <div className="font-semibold">Pt {r.patientId}</div>
                    <div className="text-muted-foreground">{r.hospitalName ?? r.assignedHospital ?? "No hospital"}</div>
                    {r.availableBeds !== undefined && <div className="text-muted-foreground">{r.availableBeds} beds available</div>}
                    {!r.assignedHospital && <div className="text-red-600 font-bold">No bed available</div>}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
