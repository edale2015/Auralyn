/**
 * Command Center v3 — Predictive Analytics · ICU Management · Multi-Hospital
 * Deterioration scoring, ICU bed tracker, transfer queue, surge alerts.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, Bed, ArrowRight, AlertTriangle, AlertCircle,
  CheckCircle, RefreshCw, Building2, Ambulance, Activity,
  BarChart3, ChevronRight, FlaskConical,
} from "lucide-react";

function SeverityBadge({ level }: { level: string }) {
  const cls = level === "CRITICAL"
    ? "bg-red-900 text-red-200 border-red-700"
    : level === "WARNING"
    ? "bg-amber-900 text-amber-200 border-amber-700"
    : "bg-emerald-900 text-emerald-200 border-emerald-700";
  return <Badge variant="outline" className={`text-xs font-mono ${cls}`}>{level}</Badge>;
}

function RiskBar({ score }: { score: number }) {
  const pct  = Math.round(score * 100);
  const color = pct > 70 ? "bg-red-500" : pct > 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function CommandCenterV3Page() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"predictions" | "icu" | "transfers" | "surge">("predictions");

  const { data: predictions, isLoading: predLoading, refetch: refetchPreds } = useQuery<any>({
    queryKey: ["/api/cc-v3/predictions"],
    refetchInterval: 30_000,
  });

  const { data: icuData, isLoading: icuLoading, refetch: refetchICU } = useQuery<any>({
    queryKey: ["/api/cc-v3/icu-beds"],
    refetchInterval: 15_000,
  });

  const { data: transferQueue, isLoading: xferLoading } = useQuery<any>({
    queryKey: ["/api/cc-v3/transfer-queue"],
    refetchInterval: 20_000,
  });

  const { data: surge, isLoading: surgeLoading } = useQuery<any>({
    queryKey: ["/api/cc-v3/surge"],
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/cc-v3/transfer/approve", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cc-v3/transfer-queue"] });
      toast({ title: "Transfer Approved", description: `Transfer ID: ${data.transferId}` });
    },
  });

  const tabs = [
    { id: "predictions", label: "Predictions",  icon: TrendingUp  },
    { id: "icu",         label: "ICU Beds",      icon: Bed         },
    { id: "transfers",   label: "Transfers",     icon: Ambulance   },
    { id: "surge",       label: "Surge Alerts",  icon: AlertCircle },
  ] as const;

  const network  = icuData?.network ?? {};
  const preds    = predictions?.predictions ?? [];
  const hospitals = icuData?.hospitals ?? [];
  const queue    = transferQueue?.queue ?? [];
  const alerts   = surge?.alerts ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-600">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Command Center v3</h1>
            <p className="text-xs text-slate-400">Predictive Analytics · ICU Management · Multi-Hospital</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {surge?.surgeLevel && <SeverityBadge level={surge.surgeLevel} />}
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => { refetchPreds(); refetchICU(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Network summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total ICU Beds",    value: network.totalICUBeds,      color: "text-slate-300" },
          { label: "Available ICU",     value: network.availableICUBeds,  color: "text-emerald-400" },
          { label: "System Occupancy",  value: network.systemOccupancyPct != null ? `${network.systemOccupancyPct}%` : "—", color: network.systemOccupancyPct > 85 ? "text-red-400" : "text-amber-400" },
          { label: "Surge Alerts",      value: alerts.length,             color: alerts.length > 0 ? "text-red-400" : "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-3">
              <p className={`text-2xl font-bold ${color}`} data-testid={`stat-v3-${label.toLowerCase().replace(/ /g, "-")}`}>{value ?? "—"}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            data-testid={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === id ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "predictions" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              Deterioration Risk Predictions
              {predictions && <Badge variant="secondary" className="text-xs">{preds.length} patients</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-96">
              <div className="px-4 pb-4 space-y-2">
                {predLoading && <p className="text-xs text-slate-500 py-6 text-center">Running predictions...</p>}
                {preds.map((p: any) => (
                  <div key={p.patientId} data-testid={`prediction-card-${p.patientId}`}
                    className="flex items-start gap-3 py-2.5 border-b border-slate-800 last:border-0">
                    <div className="shrink-0">
                      <p className="text-sm font-medium text-slate-200">{p.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{p.patientId} · Age {p.age}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <RiskBar score={p.prediction.score} />
                      <p className="text-xs text-slate-400 mt-1 truncate">{p.prediction.recommendation}</p>
                      {p.prediction.drivers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.prediction.drivers.map((d: string) => (
                            <span key={d} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{d}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge className={`shrink-0 text-xs ${
                      p.prediction.score > 0.7 ? "bg-red-900 text-red-200" :
                      p.prediction.score > 0.4 ? "bg-amber-900 text-amber-200" :
                      "bg-emerald-900 text-emerald-200"
                    }`}>
                      {p.prediction.score > 0.7 ? "HIGH" : p.prediction.score > 0.4 ? "MED" : "LOW"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {activeTab === "icu" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bed className="w-4 h-4 text-blue-400" /> ICU Bed Availability — NYC Network
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {icuLoading && <p className="text-xs text-slate-500">Loading bed data...</p>}
            {hospitals.map((h: any) => (
              <div key={h.id} data-testid={`hospital-row-${h.id}`}
                className="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0">
                <Building2 className={`w-4 h-4 shrink-0 ${h.criticallyFull ? "text-red-400" : "text-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate">{h.name}</p>
                  <p className="text-xs text-slate-500">{h.city} · {h.tier}</p>
                  <div className="flex gap-1 mt-1">
                    <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${h.occupancyPct > 90 ? "bg-red-500" : h.occupancyPct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${h.occupancyPct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-100">{h.icuAvail}<span className="text-xs text-slate-500">/{h.icuTotal}</span></p>
                  <p className="text-xs text-slate-500">beds avail</p>
                </div>
                {h.criticallyFull
                  ? <Badge className="bg-red-900 text-red-200 text-xs shrink-0">CRITICAL</Badge>
                  : h.acceptingTransfers
                  ? <Badge className="bg-emerald-900 text-emerald-200 text-xs shrink-0">ACCEPTING</Badge>
                  : <Badge variant="secondary" className="text-xs shrink-0">STABLE</Badge>
                }
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "transfers" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Ambulance className="w-4 h-4 text-amber-400" /> Transfer Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {xferLoading && <p className="text-xs text-slate-500">Loading queue...</p>}
            {queue.length === 0 && !xferLoading && (
              <div className="py-8 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No transfers queued</p>
              </div>
            )}
            {queue.map((t: any) => (
              <div key={t.patientId} data-testid={`transfer-card-${t.patientId}`}
                className="bg-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">{t.name} <span className="text-slate-500 font-mono text-xs">({t.patientId})</span></p>
                  <SeverityBadge level={t.priority} />
                </div>
                <p className="text-xs text-slate-400">{t.reason}</p>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span>Destination:</span>
                  <span className="text-blue-400 font-mono">{t.destinationId}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>ETA ~{t.estimatedTransferMins} min</span>
                </div>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  data-testid={`button-approve-transfer-${t.patientId}`}
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate({ patientId: t.patientId, destinationId: t.destinationId })}>
                  <CheckCircle className="w-3 h-3 mr-1" /> Approve Transfer
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "surge" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" /> Surge Capacity Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {surgeLoading && <p className="text-xs text-slate-500">Loading alerts...</p>}
            {alerts.length === 0 && !surgeLoading && (
              <div className="py-8 text-center">
                <Activity className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No surge alerts — all systems normal</p>
              </div>
            )}
            {alerts.map((a: any, i: number) => (
              <div key={i} data-testid={`surge-alert-${a.hospitalId}`}
                className={`rounded-lg p-3 border ${
                  a.severity === "CRITICAL" ? "border-red-700 bg-red-950/40" : "border-amber-700 bg-amber-950/40"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-slate-200">{a.hospitalName}</p>
                  <SeverityBadge level={a.severity} />
                </div>
                <p className="text-xs text-slate-400">{a.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
