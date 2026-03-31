import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Heart,
  RefreshCw,
  Thermometer,
  User,
  Zap,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export interface PatientRow {
  patient_id: string;
  name: string;
  age: number;
  phone: string;
  chief_complaint: string;
  top_dx: string;
  disposition: string;
  risk_score: number;
  admission_risk: number;
  vitals: Record<string, number>;
  flags: string[];
  last_update: string;
}

interface Props {
  selected: string | null;
  onSelect: (p: PatientRow) => void;
}

const RISK_CONFIG = {
  critical: { color: "bg-red-600 text-white",    badge: "bg-red-600",    border: "border-red-500",    label: "CRITICAL" },
  high:     { color: "bg-orange-500 text-white",  badge: "bg-orange-500", border: "border-orange-400", label: "HIGH" },
  moderate: { color: "bg-yellow-500 text-white",  badge: "bg-yellow-500", border: "border-yellow-400", label: "MODERATE" },
  low:      { color: "bg-green-600 text-white",   badge: "bg-green-600",  border: "border-green-500",  label: "LOW" },
};

function riskLevel(score: number) {
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "moderate";
  return "low";
}

function dispositionLabel(d: string) {
  const map: Record<string, string> = {
    ER_NOW: "ER – Immediate",
    urgent_care: "Urgent Care",
    office_followup: "Office Follow-up",
    self_care: "Self-Care",
    pending: "Pending",
  };
  return map[d] ?? d;
}

export default function MultiPatientGrid({ selected, onSelect }: Props) {
  const { data, isLoading, refetch } = useQuery<{ patients: PatientRow[]; count: number }>({
    queryKey: ["/api/command/grid"],
    refetchInterval: 30_000,
  });

  const patients = data?.patients ?? [];

  const stats = {
    total:    patients.length,
    critical: patients.filter(p => riskLevel(p.risk_score) === "critical").length,
    high:     patients.filter(p => riskLevel(p.risk_score) === "high").length,
    er:       patients.filter(p => p.disposition === "ER_NOW").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-3 p-3 bg-muted/40 border-b flex-shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <User size={14} /> <span data-testid="stat-total">{stats.total}</span> patients
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1 text-sm text-red-500 font-semibold">
          <Zap size={13} /> <span data-testid="stat-critical">{stats.critical}</span> critical
        </div>
        <div className="flex items-center gap-1 text-sm text-orange-500 font-semibold">
          <AlertTriangle size={13} /> <span data-testid="stat-high">{stats.high}</span> high
        </div>
        <div className="flex items-center gap-1 text-sm text-red-400">
          <Activity size={13} /> <span data-testid="stat-er">{stats.er}</span> ER-now
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/command/grid"] });
              refetch();
            }}
            data-testid="button-refresh-grid"
          >
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Patient rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3">
                <Skeleton className="h-16 w-full rounded" />
              </div>
            ))
          : patients.map(p => {
              const level = riskLevel(p.risk_score);
              const cfg   = RISK_CONFIG[level];
              const isSelected = selected === p.patient_id;

              return (
                <div
                  key={p.patient_id}
                  data-testid={`patient-row-${p.patient_id}`}
                  className={cn(
                    "flex items-start gap-3 p-3 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-primary/10 border-l-4 border-primary"
                      : `hover:bg-muted/50 border-l-4 ${cfg.border}`
                  )}
                  onClick={() => onSelect(p)}
                >
                  {/* Risk badge */}
                  <div className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold min-w-[62px] text-center mt-0.5", cfg.color)}>
                    {cfg.label}
                  </div>

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">Age {p.age}</span>
                      {p.flags?.includes("high_risk") && (
                        <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{p.chief_complaint}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] font-mono text-blue-400">{p.top_dx?.replace("DX_BAY_", "").replace(/_/g, " ")}</span>
                      <Badge variant="outline" className="text-[10px] px-1 h-4">
                        {dispositionLabel(p.disposition)}
                      </Badge>
                    </div>
                  </div>

                  {/* Vitals mini strip */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 text-[11px]">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Heart size={11} className={p.vitals?.hr > 110 ? "text-red-400" : "text-pink-400"} />
                      {p.vitals?.hr ?? "—"}
                    </div>
                    {p.vitals?.spo2 && (
                      <div className={cn("flex items-center gap-1", p.vitals.spo2 < 93 ? "text-red-400" : "text-green-400")}>
                        <Activity size={11} />
                        {p.vitals.spo2}%
                      </div>
                    )}
                    {p.vitals?.temp && (
                      <div className={cn("flex items-center gap-1", p.vitals.temp >= 39 ? "text-orange-400" : "text-muted-foreground")}>
                        <Thermometer size={11} />
                        {p.vitals.temp}°C
                      </div>
                    )}
                    <div className={cn("mt-0.5 font-bold text-[10px]", level === "critical" ? "text-red-500" : level === "high" ? "text-orange-500" : "text-muted-foreground")}>
                      Risk {Math.round(p.risk_score * 100)}%
                    </div>
                  </div>
                </div>
              );
            })}

        {!isLoading && patients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CheckCircle size={32} className="mb-2" />
            <span className="text-sm">No active patients</span>
          </div>
        )}
      </div>

      {/* Last refresh */}
      <div className="text-[10px] text-muted-foreground text-right px-3 py-1 border-t flex-shrink-0 flex items-center justify-end gap-1">
        <Clock size={10} /> Auto-refresh 30s
      </div>
    </div>
  );
}
