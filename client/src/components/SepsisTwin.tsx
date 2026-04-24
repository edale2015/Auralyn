import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Activity, Shield, RefreshCw, Play } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TwinState {
  t:           number;
  hr?:         number;
  rr?:         number;
  temp?:       number;
  map?:        number;
  spo2?:       number;
  lactate?:    number;
  sofa?:       number;
  sepsisProb?: number;
  shock?:      number;
  resp?:       number;
}

interface AnalysisResult {
  sepsis: {
    type:    string;
    current: { sofa?: number; sepsisProb?: number; shock?: number };
    trajectory: TwinState[];
    scenarios:  { baseline: TwinState[]; intervention: TwinState[] };
    flags:   { highRisk: boolean; septicShock: boolean };
  };
  gate: {
    allowed:           boolean;
    requiresPhysician: boolean;
    message:           string;
    suggested?:        string[];
  };
}

// ── Demo patient ──────────────────────────────────────────────────────────────
const DEMO_PATIENT = {
  hr: 120, rr: 24, temp: 101.5,
  map: 60, spo2: 88, lactate: 3.2,
  onVent: false, vasopressors: false,
  labs: { platelets: 90, bilirubin: 2.5, creatinine: 2.2, gcs: 13 },
};

// ── Colour helpers ────────────────────────────────────────────────────────────
function sofaColour(s?: number) {
  if (s == null) return "text-slate-400";
  if (s >= 11)  return "text-red-400 font-bold";
  if (s >= 7)   return "text-orange-400 font-bold";
  if (s >= 3)   return "text-yellow-400";
  return "text-emerald-400";
}

function probColour(p?: number) {
  if (p == null) return "text-slate-400";
  if (p >= 0.8)  return "text-red-400 font-bold";
  if (p >= 0.6)  return "text-orange-400 font-bold";
  if (p >= 0.3)  return "text-yellow-400";
  return "text-emerald-400";
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function TwinTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">Hour {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Chart panel ───────────────────────────────────────────────────────────────
function TwinChart({
  data,
  title,
  subtitle,
}: {
  data:     TwinState[];
  title:    string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="t" stroke="#475569" tick={{ fontSize: 10 }} label={{ value: "hour", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#64748b" }} />
          <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
          <Tooltip content={<TwinTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <ReferenceLine y={0.6} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
          <Line dataKey="sofa"       name="SOFA"        stroke="#6b5cff" dot={false} strokeWidth={2} />
          <Line dataKey="sepsisProb" name="Sepsis Prob" stroke="#ff4d4f" dot={false} strokeWidth={2} />
          <Line dataKey="map"        name="MAP"         stroke="#2ecc71" dot={false} strokeWidth={1.5} />
          <Line dataKey="lactate"    name="Lactate"     stroke="#f39c12" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SepsisTwin({ patientData }: { patientData?: Partial<typeof DEMO_PATIENT> }) {
  const qc = useQueryClient();
  const [showComparison, setShowComparison] = useState(false);

  const patient = { ...DEMO_PATIENT, ...patientData };

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sepsis-twin/analyze", patient).then(r => r.json()),
  });

  const compareMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sepsis-twin/compare", { patient }).then(r => r.json()),
  });

  const result: AnalysisResult | null = analyzeMutation.data ?? null;
  const comparison = compareMutation.data ?? null;

  const trajectory  = result?.sepsis?.trajectory ?? [];
  const flags       = result?.sepsis?.flags;
  const gate        = result?.gate;
  const current     = result?.sepsis?.current;

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-violet-400" />
          <h2 className="text-base font-bold text-white">Sepsis Digital Twin</h2>
          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300">V2</Badge>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            data-testid="btn-run-sepsis-analysis"
            size="sm"
            onClick={() => { analyzeMutation.mutate(); setShowComparison(false); }}
            disabled={analyzeMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7"
          >
            <Play size={12} className={cn("mr-1", analyzeMutation.isPending && "animate-spin")} />
            Analyze
          </Button>
          <Button
            data-testid="btn-compare-scenarios"
            size="sm"
            variant="outline"
            onClick={() => { compareMutation.mutate(); setShowComparison(true); }}
            disabled={compareMutation.isPending}
            className="border-slate-600 text-slate-300 hover:bg-slate-800 text-xs h-7"
          >
            <RefreshCw size={12} className={cn("mr-1", compareMutation.isPending && "animate-spin")} />
            Compare Scenarios
          </Button>
        </div>
      </div>

      {/* Safety gate banner */}
      {gate && (
        <div className={cn(
          "rounded-xl border p-3 flex items-start gap-3",
          gate.allowed
            ? "bg-emerald-900/30 border-emerald-500/40"
            : "bg-red-900/30 border-red-500/60"
        )}>
          <Shield size={16} className={gate.allowed ? "text-emerald-400 mt-0.5" : "text-red-400 mt-0.5 animate-pulse"} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-sm font-bold", gate.allowed ? "text-emerald-300" : "text-red-300")}>
                {gate.allowed ? "Safety Gate: CLEARED" : "Safety Gate: PHYSICIAN REQUIRED"}
              </span>
              {flags?.septicShock && (
                <Badge className="bg-red-700 text-red-100 text-[10px] animate-pulse">SEPTIC SHOCK</Badge>
              )}
              {flags?.highRisk && !flags?.septicShock && (
                <Badge className="bg-orange-700 text-orange-100 text-[10px]">HIGH RISK</Badge>
              )}
            </div>
            <p className="text-xs text-slate-300">{gate.message}</p>
            {gate.suggested && gate.suggested.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Suggested (advisory only):</p>
                <ul className="space-y-0.5">
                  {gate.suggested.map((s, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-center gap-1.5">
                      <span className="text-slate-500">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current scores */}
      {current && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SOFA Score</p>
              <p data-testid="sofa-score" className={cn("text-2xl font-mono font-bold", sofaColour(current.sofa))}>
                {current.sofa ?? "—"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {current.sofa == null ? "" :
                 current.sofa >= 11 ? "Very high mortality" :
                 current.sofa >= 7  ? "High mortality" :
                 current.sofa >= 3  ? "Organ dysfunction" : "Mild / none"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Sepsis Probability</p>
              <p data-testid="sepsis-prob" className={cn("text-2xl font-mono font-bold", probColour(current.sepsisProb))}>
                {current.sepsisProb != null ? `${Math.round(current.sepsisProb * 100)}%` : "—"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {current.sepsisProb == null ? "" :
                 current.sepsisProb >= 0.8  ? "Very high risk" :
                 current.sepsisProb >= 0.6  ? "High — likely sepsis" :
                 current.sepsisProb >= 0.3  ? "Moderate — monitor" : "Low risk"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Shock Score</p>
              <p data-testid="shock-score" className={cn("text-2xl font-mono font-bold",
                (current.shock ?? 0) >= 0.7 ? "text-red-400 font-bold" :
                (current.shock ?? 0) >= 0.4 ? "text-orange-400" : "text-emerald-400"
              )}>
                {current.shock != null ? Math.round(current.shock * 100) + "%" : "—"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {current.shock == null ? "" :
                 current.shock >= 0.7 ? "Shock likely" :
                 current.shock >= 0.4 ? "Borderline" : "Haemodynamically stable"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trajectory chart */}
      {trajectory.length > 0 && !showComparison && (
        <Card className="bg-slate-900/60 border-slate-700/60">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-slate-300">Predicted Trajectory (8-hour simulation)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <TwinChart data={trajectory} title="" />
          </CardContent>
        </Card>
      )}

      {/* Baseline vs intervention comparison */}
      {showComparison && comparison?.ok && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-900/60 border-slate-700/60">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm text-yellow-300 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Baseline (No Intervention)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <TwinChart data={comparison.baseline} title="" />
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-emerald-700/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm text-emerald-300 flex items-center gap-1.5">
                <Shield size={13} /> After Fluids + O₂ + Pressors
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <TwinChart data={comparison.intervention} title="" />
            </CardContent>
          </Card>

          {comparison.delta && (
            <div className="col-span-2 bg-slate-800/60 rounded-xl border border-slate-700/60 p-3">
              <p className="text-xs font-semibold text-slate-300 mb-2">Intervention Benefit (final step)</p>
              <div className="grid grid-cols-4 gap-3 text-xs text-center">
                {[
                  { label: "SOFA reduction",     value: comparison.delta.sofaDiff?.toFixed(1),       good: comparison.delta.sofaDiff > 0 },
                  { label: "Sepsis risk ↓",       value: `${Math.round(comparison.delta.sepsisRiskDiff * 100)}%`, good: comparison.delta.sepsisRiskDiff > 0 },
                  { label: "Shock score ↓",       value: `${Math.round(comparison.delta.shockDiff * 100)}%`,      good: comparison.delta.shockDiff > 0 },
                  { label: "MAP ↑",               value: `${comparison.delta.mapDiff?.toFixed(0)} mmHg`,         good: comparison.delta.mapDiff > 0 },
                ].map(({ label, value, good }) => (
                  <div key={label} className={cn("rounded-lg border p-2", good ? "bg-emerald-900/30 border-emerald-700/50" : "bg-red-900/20 border-red-700/40")}>
                    <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                    <p className={cn("font-mono font-bold text-sm", good ? "text-emerald-300" : "text-red-300")}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 italic mt-2 text-center">{comparison.recommendation}</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !comparison && (
        <div className="text-center py-12 text-slate-500">
          <Activity size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click <strong className="text-slate-400">Analyze</strong> to run the sepsis digital twin</p>
          <p className="text-xs mt-1">or <strong className="text-slate-400">Compare Scenarios</strong> for baseline vs intervention</p>
        </div>
      )}
    </div>
  );
}
