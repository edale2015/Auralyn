import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, Clock, RefreshCw, Activity } from "lucide-react";

export interface ServiceHealth {
  name: string;
  status: "ok" | "degraded" | "error" | "pending";
  latencyMs: number | null;
  errorRate: number;
  lastChecked: string;
  detail: string;
}

const STATUS_ICON: Record<string, any> = {
  ok:      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />,
  degraded:<AlertCircle  className="h-3.5 w-3.5 text-yellow-500 shrink-0" />,
  error:   <XCircle      className="h-3.5 w-3.5 text-red-500 shrink-0" />,
  pending: <Clock        className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
};

const STATUS_BADGE: Record<string, string> = {
  ok:      "bg-green-100 text-green-800 border-green-300",
  degraded:"bg-yellow-100 text-yellow-800 border-yellow-300",
  error:   "bg-red-100 text-red-800 border-red-300",
  pending: "bg-gray-100 text-gray-600 border-gray-300",
};

function LatencyBar({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-xs text-muted-foreground">–</span>;
  const color = ms < 100 ? "bg-green-400" : ms < 500 ? "bg-yellow-400" : "bg-red-400";
  const width = Math.min(100, (ms / 2000) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{ms}ms</span>
    </div>
  );
}

export default function IntegrationHealthPanel() {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<{
    ok: boolean; services: ServiceHealth[]; measuredAt: string;
  }>({
    queryKey: ["/api/control/integration-health"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const services = data?.services ?? [];
  const okCount   = services.filter(s => s.status === "ok").length;
  const downCount = services.filter(s => s.status === "error").length;

  return (
    <div className="space-y-3" data-testid="integration-health-panel">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Integration Health</p>
        <div className="flex items-center gap-1">
          {downCount > 0 && <Badge className="text-xs py-0 bg-red-100 text-red-800 border-red-300">{downCount} down</Badge>}
          <Badge className="text-xs py-0 bg-green-100 text-green-800 border-green-300">{okCount}/{services.length} ok</Badge>
          <Button
            size="sm" variant="ghost" className="h-5 w-5 p-0"
            onClick={() => refetch()} disabled={isFetching}
            data-testid="button-refresh-health"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {services.map(s => (
            <div key={s.name} className="flex flex-col gap-1 p-2 rounded-lg border bg-card" data-testid={`health-row-${s.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {STATUS_ICON[s.status] ?? STATUS_ICON.pending}
                  <span className="text-xs font-medium">{s.name}</span>
                </div>
                <Badge className={`text-xs py-0 border ${STATUS_BADGE[s.status]}`}>{s.status}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground truncate flex-1 pr-2">{s.detail}</p>
                <LatencyBar ms={s.latencyMs} />
              </div>
              {s.errorRate > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-500">Error rate: {(s.errorRate * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data?.measuredAt && (
        <p className="text-xs text-muted-foreground text-right">
          Probed {new Date(data.measuredAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
