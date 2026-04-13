import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, AlertTriangle, Heart, Wind, Thermometer, TrendingUp, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PatientRisk {
  id: string;
  rank: number;
  vitals: { hr: number; rr: number; spo2: number; temp: number; sbp: number };
  symptoms: string[];
  risk: {
    riskLabel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    deteriorationScore: number;
    sepsisRisk: number;
    shockRisk: number;
    respiratoryFailureRisk: number;
    triggeringFactors: string[];
  };
}

interface PatientSummary {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  ranked: PatientRisk[];
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-orange-500 text-white",
  MODERATE: "bg-yellow-500 text-black",
  LOW:      "bg-green-500 text-white",
};

const RISK_BORDER: Record<string, string> = {
  CRITICAL: "border-red-500",
  HIGH:     "border-orange-400",
  MODERATE: "border-yellow-400",
  LOW:      "border-green-400",
};

function VitalChip({ icon: Icon, value, label, danger }: { icon: any; value: string | number; label: string; danger?: boolean }) {
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${danger ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
      <Icon size={11} />
      <span className="font-mono font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function PatientCard({ p }: { p: PatientRisk }) {
  const [simResult, setSimResult] = useState<any>(null);
  const simulateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/icu/simulate", { patient: p, hours: 6 }),
    onSuccess: (data: any) => setSimResult(data),
  });

  return (
    <Card
      className={`border-2 ${RISK_BORDER[p.risk.riskLabel]} transition-all`}
      data-testid={`patient-card-${p.id}`}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span data-testid={`rank-${p.id}`} className="text-lg font-bold text-muted-foreground">#{p.rank}</span>
            <span data-testid={`patient-id-${p.id}`} className="font-semibold">Patient {p.id.toUpperCase()}</span>
          </div>
          <Badge className={RISK_COLORS[p.risk.riskLabel]} data-testid={`risk-label-${p.id}`}>
            {p.risk.riskLabel}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {p.symptoms.join(" · ") || "No symptoms"}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <VitalChip icon={Heart}       value={p.vitals.hr}   label="HR"   danger={p.vitals.hr > 110 || p.vitals.hr < 50} />
          <VitalChip icon={Wind}        value={p.vitals.rr}   label="RR"   danger={p.vitals.rr > 22} />
          <VitalChip icon={Activity}    value={`${p.vitals.spo2}%`} label="SpO₂" danger={p.vitals.spo2 < 92} />
          <VitalChip icon={Thermometer} value={`${p.vitals.temp}°`} label="T"   danger={p.vitals.temp > 38.5} />
          <VitalChip icon={TrendingUp}  value={p.vitals.sbp}  label="SBP"  danger={p.vitals.sbp < 90} />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Deterioration</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${p.risk.deteriorationScore >= 0.75 ? "bg-red-500" : p.risk.deteriorationScore >= 0.5 ? "bg-orange-400" : p.risk.deteriorationScore >= 0.25 ? "bg-yellow-400" : "bg-green-400"}`}
              style={{ width: `${Math.round(p.risk.deteriorationScore * 100)}%` }}
              data-testid={`deterioration-bar-${p.id}`}
            />
          </div>
          <span className="font-mono font-semibold" data-testid={`deterioration-score-${p.id}`}>
            {Math.round(p.risk.deteriorationScore * 100)}%
          </span>
        </div>

        {p.risk.triggeringFactors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.risk.triggeringFactors.slice(0, 4).map(f => (
              <span key={f} className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded" data-testid={`factor-${p.id}-${f}`}>
                {f.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm" variant="outline" className="text-xs h-7"
            onClick={() => simulateMutation.mutate()}
            disabled={simulateMutation.isPending}
            data-testid={`simulate-btn-${p.id}`}
          >
            {simulateMutation.isPending ? "Simulating…" : "6-Hour Simulation"}
          </Button>
        </div>

        {simResult && (
          <div className={`mt-2 text-xs rounded px-2 py-1 ${simResult.predictedOutcome === "CRITICAL_TRANSFER" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : simResult.predictedOutcome === "WORSENING" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"}`} data-testid={`sim-result-${p.id}`}>
            Predicted: <strong>{simResult.predictedOutcome}</strong> · Peak deterioration {Math.round(simResult.peakDeterioration * 100)}%
            {simResult.transferHour !== undefined && <span> · Transfer at hour {simResult.transferHour}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ICUControlTower() {
  const { data, isLoading, refetch, isFetching } = useQuery<PatientSummary>({
    queryKey: ["/api/icu/patients"],
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">ICU Control Tower</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time multi-patient risk ranking and deterioration prediction</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="refresh-btn"
        >
          <RefreshCw size={14} className={`mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary row */}
      {data && (
        <div className="grid grid-cols-5 gap-3" data-testid="summary-row">
          {[
            { label: "Total",    value: data.total,    color: "text-foreground" },
            { label: "Critical", value: data.critical, color: "text-red-600" },
            { label: "High",     value: data.high,     color: "text-orange-500" },
            { label: "Moderate", value: data.moderate, color: "text-yellow-600" },
            { label: "Low",      value: data.low,      color: "text-green-600" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="py-3 px-4 text-center">
                <div className={`text-2xl font-bold ${color}`} data-testid={`count-${label.toLowerCase()}`}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="loading-state">Loading patient risk data…</div>
      ) : !data?.ranked?.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">No patients in queue</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.ranked.map(p => <PatientCard key={p.id} p={p} />)}
        </div>
      )}

      {data?.ranked?.some(p => p.risk.riskLabel === "CRITICAL") && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg" data-testid="critical-alert">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>CRITICAL ALERT:</strong> {data.ranked.filter(p => p.risk.riskLabel === "CRITICAL").length} patient(s) require immediate physician intervention.
          </p>
        </div>
      )}
    </div>
  );
}
