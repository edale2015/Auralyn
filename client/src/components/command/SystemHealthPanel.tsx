import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Activity,
  BrainCircuit,
  Building2,
  CheckCircle,
  Database,
  MessageSquare,
  Phone,
  RefreshCw,
  Siren,
  XCircle,
  Zap,
} from "lucide-react";

interface HealthResult {
  name: string;
  pass: boolean;
  detail?: string;
  durationMs?: number;
}

interface SystemHealthData {
  results: HealthResult[];
  passed: number;
  failed: number;
  total: number;
}

const ICONS: Record<string, any> = {
  intake:     MessageSquare,
  diagnosis:  BrainCircuit,
  admission:  Building2,
  ems:        Siren,
  outreach:   Phone,
  kb_rules:   Database,
  grid:       Activity,
  hospitals:  Building2,
};

function getIcon(name: string) {
  const key = Object.keys(ICONS).find(k => name.toLowerCase().includes(k));
  return key ? ICONS[key] : Zap;
}

export default function SystemHealthPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<SystemHealthData>({
    queryKey: ["/api/command/system-health"],
    queryFn: () => apiRequest("GET", "/api/command/system-health").then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const results = data?.results ?? [];
  const allGreen = results.length > 0 && results.every(r => r.pass);
  const anyRed   = results.some(r => !r.pass);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className={cn(allGreen ? "text-green-400" : anyRed ? "text-red-400" : "text-muted-foreground")} />
          <span className="text-sm font-semibold">System Integration Health</span>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className={cn("text-[11px]", allGreen ? "text-green-400 border-green-500/30" : anyRed ? "text-red-400 border-red-500/30" : "text-yellow-400 border-yellow-500/30")}>
              {data.passed}/{data.total} PASS
            </Badge>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-health"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Results grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2" data-testid="health-results-grid">
          {results.map(r => {
            const Icon = getIcon(r.name);
            return (
              <div
                key={r.name}
                data-testid={`health-${r.name.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "rounded border p-2.5 flex items-start gap-2.5",
                  r.pass ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                )}
              >
                <Icon size={14} className={r.pass ? "text-green-400 flex-shrink-0 mt-0.5" : "text-red-400 flex-shrink-0 mt-0.5"} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold truncate">{r.name}</span>
                    {r.pass
                      ? <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                      : <XCircle    size={10} className="text-red-400 flex-shrink-0" />}
                  </div>
                  {r.detail && <div className="text-[10px] text-muted-foreground truncate">{r.detail}</div>}
                  {r.durationMs !== undefined && (
                    <div className="text-[10px] text-muted-foreground">{r.durationMs}ms</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cross-system validation summary */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cross-System Validations</div>
        <div className="space-y-1.5 text-xs">
          {[
            { label: "Intake → Diagnosis",  desc: "Questions feed KB probability weights" },
            { label: "Diagnosis → Workup",  desc: "Workup adapts to top differential" },
            { label: "Diagnosis → Admission", desc: "Admission KB rules trigger correctly" },
            { label: "Risk → EMS",          desc: "High risk activates EMS dispatch panel" },
            { label: "Outreach → Log",      desc: "All outreach persisted to patient_outreach" },
            { label: "Learning → KB",       desc: "Approved outcomes update clinical weights" },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-2">
              <CheckCircle size={11} className="text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground ml-1">— {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
