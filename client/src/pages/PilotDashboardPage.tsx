import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Clock, TrendingUp, Users, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AggregatedStats {
  patients: number;
  er: number;
  erRate: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-white",
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  testId?: string;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
        <p className={`text-2xl font-bold font-mono ${accent}`} data-testid={testId}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LatencyBar({ label, ms, max }: { label: string; ms: number; max: number }) {
  const pct = max > 0 ? Math.min((ms / max) * 100, 100) : 0;
  const color = ms > 500 ? "bg-red-500" : ms > 200 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">{ms} ms</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PilotDashboardPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery<AggregatedStats>({
    queryKey: ["/api/pilot/stats"],
    refetchInterval: 2000,
  });

  const erPct = data ? (data.erRate * 100).toFixed(1) : "—";
  const erColor =
    !data ? "text-gray-500"
    : data.erRate > 0.3  ? "text-red-400"
    : data.erRate > 0.15 ? "text-yellow-400"
    : "text-green-400";

  const lastTick = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-green-400 animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live Pilot Dashboard</h1>
            <p className="text-xs text-gray-500">Real-time pilot aggregation — 2s refresh</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-700 text-green-400 text-xs" data-testid="badge-live">
            LIVE
          </Badge>
          <span className="text-xs text-gray-600" data-testid="text-last-tick">
            {lastTick}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300"
          data-testid="status-error">
          <AlertTriangle className="h-4 w-4" /> Could not fetch pilot stats
        </div>
      )}

      {isLoading && !data && (
        <div className="text-gray-500 text-sm animate-pulse" data-testid="status-loading">
          Waiting for pilot data…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users}       label="Total Patients"  value={data.patients.toLocaleString()}   testId="stat-patients" />
            <StatCard icon={AlertTriangle} label="ER Dispositions" value={data.er.toLocaleString()}       testId="stat-er" />
            <StatCard icon={TrendingUp}  label="ER Rate"         value={`${erPct}%`}  accent={erColor}   testId="stat-er-rate" />
            <StatCard icon={Clock}       label="Avg Latency"     value={`${data.avgLatencyMs} ms`}       sub="mean response time" testId="stat-avg-latency" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-400" /> Latency Percentiles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3" data-testid="section-latency">
                <LatencyBar label="p50 (median)"   ms={data.p50Ms} max={data.p99Ms || 1} />
                <LatencyBar label="p95"            ms={data.p95Ms} max={data.p99Ms || 1} />
                <LatencyBar label="p99 (tail)"     ms={data.p99Ms} max={data.p99Ms || 1} />
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" /> Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4" data-testid="section-range">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Min latency</span>
                  <span className="font-mono text-green-400" data-testid="stat-min">{data.minLatencyMs} ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Max latency</span>
                  <span className="font-mono text-red-400" data-testid="stat-max">{data.maxLatencyMs} ms</span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-800 pt-3">
                  <span className="text-sm text-gray-400">ER / Total</span>
                  <span className="font-mono text-white" data-testid="stat-er-ratio">
                    {data.er} / {data.patients}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
