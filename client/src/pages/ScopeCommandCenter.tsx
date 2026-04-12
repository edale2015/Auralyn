/**
 * Scope Command Center — live agent scope dashboard
 * Real-time scope decisions · violation monitor · delegation tracker · FDA metrics
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient }     from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle }  from "@/components/ui/card";
import { Badge }          from "@/components/ui/badge";
import { Button }         from "@/components/ui/button";
import { ScrollArea }     from "@/components/ui/scroll-area";
import { apiRequest }     from "@/lib/queryClient";
import { useToast }       from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldX, AlertTriangle, Users, Activity,
  Wifi, WifiOff, RefreshCw, FlaskConical, ClipboardCheck, Eye
} from "lucide-react";

// ── Real-time WS scope event feed ─────────────────────────────────────────────
function useScopeEventStream() {
  const [events, setEvents] = useState<any[]>([]);
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
        if (msg.type === "SCOPE_EVENT" && msg.payload) {
          setEvents((prev) => [msg.payload, ...prev].slice(0, 200));
        }
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); if (timer.current) clearTimeout(timer.current); }; }, [connect]);
  return { events, connected };
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ allowed, requiresOverride }: { allowed: boolean; requiresOverride?: boolean }) {
  if (requiresOverride) return <Badge className="bg-yellow-500 text-black text-xs">⚠ Override</Badge>;
  return allowed
    ? <Badge className="bg-emerald-600 text-white text-xs">✅ Allowed</Badge>
    : <Badge className="bg-red-600 text-white text-xs">🚫 Blocked</Badge>;
}

// ── Stats card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "" }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function ScopeCommandCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { events, connected } = useScopeEventStream();

  const { data: stats }     = useQuery<any>({ queryKey: ["/api/scope/stats"],     refetchInterval: 10000 });
  const { data: fda }       = useQuery<any>({ queryKey: ["/api/scope/fda"],       refetchInterval: 15000 });
  const { data: drift }     = useQuery<any>({ queryKey: ["/api/scope/drift"],     refetchInterval: 15000 });
  const { data: roles }     = useQuery<any>({ queryKey: ["/api/scope/roles"] });
  const { data: overrides } = useQuery<any>({ queryKey: ["/api/scope/overrides"], refetchInterval: 5000 });
  const { data: heatmap }   = useQuery<any>({ queryKey: ["/api/scope/heatmap"],   refetchInterval: 20000 });

  const approveMut = useMutation({
    mutationFn: ({ id, physicianId }: { id: string; physicianId: string }) =>
      apiRequest("POST", `/api/scope/overrides/${id}/approve`, { physicianId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/scope/overrides"] }); toast({ title: "Override approved" }); },
  });

  const denyMut = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("POST", `/api/scope/overrides/${id}/deny`, { physicianId: "attending", reason: "Denied via dashboard" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/scope/overrides"] }); toast({ title: "Override denied" }); },
  });

  const driftRisk = drift?.riskLevel ?? "LOW";
  const driftColor = driftRisk === "CRITICAL" ? "text-red-600" : driftRisk === "HIGH" ? "text-orange-600" : driftRisk === "MEDIUM" ? "text-yellow-600" : "text-emerald-600";
  const pendingCount = (overrides?.pending ?? []).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Agent Scope Command Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live scope enforcement · violation monitor · delegation tracker · FDA audit</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${connected ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-red-400 text-red-600 bg-red-50"}`} data-testid="scope-ws-status">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Live" : "Offline"}
          </div>
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/scope"] })} data-testid="button-scope-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Alert banners */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-500 text-black rounded-lg px-4 py-2 text-sm font-medium animate-pulse" data-testid="override-banner">
          <AlertTriangle className="h-4 w-4" /> {pendingCount} PHYSICIAN OVERRIDE{pendingCount > 1 ? "S" : ""} PENDING APPROVAL
        </div>
      )}
      {driftRisk === "HIGH" || driftRisk === "CRITICAL" ? (
        <div className="flex items-center gap-2 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium" data-testid="drift-banner">
          <ShieldX className="h-4 w-4" /> Scope drift detected — {drift?.recommendation}
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatCard label="Total Actions"  value={stats?.total ?? 0} />
        <StatCard label="Allowed"        value={stats?.allowed ?? 0}   color="text-emerald-600" />
        <StatCard label="Blocked"        value={stats?.denied ?? 0}    color="text-red-600" />
        <StatCard label="Overrides"      value={stats?.overrides ?? 0} color="text-yellow-600" />
        <StatCard label="FDA Safe"       value={fda?.fdaSafe ? "✅" : "⚠️"} sub={`score: ${fda?.safetyScore ?? "—"}`} />
        <StatCard label="Scope Drift"    value={driftRisk} color={driftColor} />
        <StatCard label="Agent Roles"    value={stats?.roles?.length ?? 0} />
      </div>

      {/* Main 3-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* LEFT — live scope event feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Live Scope Events <span className="ml-auto text-xs text-muted-foreground font-normal">{events.length} events</span></CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-72 px-3">
                <div className="space-y-1.5 py-2">
                  {events.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">Waiting for scope events…</div>}
                  {events.map((e, i) => (
                    <div key={i} data-testid={`scope-event-${i}`} className={`flex items-start justify-between rounded px-2.5 py-1.5 text-xs border ${e.allowed ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : e.requiresOverride ? "border-yellow-300 bg-yellow-50/50 dark:bg-yellow-950/20" : "border-red-200 bg-red-50/50 dark:bg-red-950/20"}`}>
                      <div>
                        <span className="font-semibold">{e.agent}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="font-mono">{e.action}</span>
                        {e.reason && <div className="text-muted-foreground mt-0.5">{e.reason}</div>}
                      </div>
                      <StatusBadge allowed={e.allowed} requiresOverride={e.requiresOverride} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — overrides + FDA */}
        <div className="space-y-3">
          {/* Pending overrides */}
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Physician Overrides</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-36 px-3 py-2">
                {(overrides?.pending ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">No pending overrides</div>}
                {(overrides?.pending ?? []).map((ov: any) => (
                  <div key={ov.actionId} data-testid={`override-${ov.actionId}`} className="border rounded p-2 mb-1.5 text-xs">
                    <div className="font-semibold">{ov.agentRole}</div>
                    <div className="text-muted-foreground font-mono">{ov.action}</div>
                    <div className="flex gap-1.5 mt-1">
                      <Button size="sm" className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2" onClick={() => approveMut.mutate({ id: ov.actionId, physicianId: "attending-md" })} data-testid={`approve-${ov.actionId}`}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-red-300 text-red-700" onClick={() => denyMut.mutate({ id: ov.actionId })} data-testid={`deny-${ov.actionId}`}>Deny</Button>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* FDA metrics */}
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> FDA Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {fda ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Allowed rate</span><span className="font-mono font-bold text-emerald-600">{(fda.allowedRate * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Blocked rate</span><span className={`font-mono font-bold ${fda.blockedRate > 0.1 ? "text-red-600" : "text-muted-foreground"}`}>{(fda.blockedRate * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Override rate</span><span className="font-mono">{(fda.overrideRate * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Safety score</span><span className={`font-bold ${fda.safetyScore >= 80 ? "text-emerald-600" : fda.safetyScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>{fda.safetyScore}/100</span></div>
                  <div className={`text-xs mt-1 font-medium ${fda.fdaSafe ? "text-emerald-700" : "text-yellow-700"}`}>{fda.fdaSafe ? "✅ FDA SAFE" : "⚠️ Review Required"}</div>
                </>
              ) : <div className="text-muted-foreground py-2">Loading…</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Agent roles grid */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Agent Scope Contracts ({roles?.count ?? 0} roles)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(roles?.roles ?? []).map((r: any) => (
              <div key={r.role} data-testid={`role-card-${r.role}`} className="border rounded-lg p-3 text-xs space-y-1.5">
                <div className="font-semibold font-mono">{r.role}</div>
                {r.description && <div className="text-muted-foreground">{r.description}</div>}
                <div>
                  <span className="text-emerald-600 font-medium">Express:</span>
                  <div className="flex flex-wrap gap-1 mt-1">{r.express?.map((p: string) => <span key={p} className="bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 px-1.5 py-0.5 rounded font-mono">{p}</span>)}</div>
                </div>
                {r.denied?.length > 0 && (
                  <div>
                    <span className="text-red-600 font-medium">Denied:</span>
                    <div className="flex flex-wrap gap-1 mt-1">{r.denied.map((p: string) => <span key={p} className="bg-red-100 dark:bg-red-950/30 text-red-700 px-1.5 py-0.5 rounded font-mono">{p}</span>)}</div>
                  </div>
                )}
                {r.constraints?.audit_level && (
                  <div className="flex items-center gap-1"><Eye className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Audit: <b>{r.constraints.audit_level}</b></span></div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
