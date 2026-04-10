import { useEffect, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Activity, CheckCircle, Zap, Globe } from "lucide-react";

interface OversightData {
  severity: string;
  alerts: string[];
  actions: string[];
  score?: number;
  status?: string;
}

interface StressResult {
  total: number;
  erRate: number;
  errors: number;
  durationMs: number;
  throughputPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-orange-500 text-white",
  MEDIUM:   "bg-yellow-500 text-black",
  LOW:      "bg-green-600 text-white",
};

export default function LiveCommandCenter() {
  const [data, setData] = useState<OversightData | null>(null);
  const [stress, setStress] = useState<StressResult | null>(null);
  const [stressLoading, setStressLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/oversight/run", { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString());
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "polling failed");
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const runStress = async (n: number) => {
    setStressLoading(true);
    setStress(null);
    try {
      const res = await fetch(`/simulate/stress?n=${n}`);
      const json = await res.json();
      setStress(json);
    } catch (e: any) {
      setError(e?.message ?? "stress test failed");
    } finally {
      setStressLoading(false);
    }
  };

  const severityBadge = data?.severity
    ? SEVERITY_COLOR[data.severity.toUpperCase()] ?? "bg-gray-500 text-white"
    : "bg-gray-500 text-white";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-blue-400 animate-pulse" />
          <h1 className="text-2xl font-bold tracking-tight">Live Command Center</h1>
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-500" data-testid="text-last-updated">
            Last updated: {lastUpdated}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-900/40 border border-red-700 px-4 py-2 text-sm text-red-300"
          data-testid="status-error">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {!data ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm" data-testid="status-loading">
          <Activity className="h-4 w-4 animate-pulse" /> Connecting to oversight engine…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" /> System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">Severity</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${severityBadge}`}
                  data-testid="text-severity">
                  {data.severity ?? "—"}
                </span>
              </div>
              {typeof data.score === "number" && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm">Score</span>
                  <span className="text-white font-mono" data-testid="text-score">
                    {data.score.toFixed(2)}
                  </span>
                </div>
              )}
              {data.status && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-gray-300" data-testid="text-status">{data.status}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400" /> Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.alerts?.length === 0 ? (
                <p className="text-sm text-gray-500">No active alerts</p>
              ) : (
                <ul className="space-y-1" data-testid="list-alerts">
                  {data.alerts?.map((a, i) => (
                    <li key={i} className="text-sm text-orange-300 flex items-start gap-1"
                      data-testid={`alert-item-${i}`}>
                      ⚠️ {a}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" /> Recommended Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.actions?.length === 0 ? (
                <p className="text-sm text-gray-500">No actions required</p>
              ) : (
                <ul className="space-y-1" data-testid="list-actions">
                  {data.actions?.map((a, i) => (
                    <li key={i} className="text-sm text-blue-300 flex items-start gap-1"
                      data-testid={`action-item-${i}`}>
                      ➡️ {a}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" /> System Stress Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[100, 1000, 10000].map(n => (
              <Button key={n} variant="outline" size="sm"
                data-testid={`button-stress-${n}`}
                disabled={stressLoading}
                onClick={() => runStress(n)}
                className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Run {n.toLocaleString()} patients
              </Button>
            ))}
            {stressLoading && (
              <span className="text-sm text-gray-400 self-center animate-pulse"
                data-testid="status-stress-loading">
                Running…
              </span>
            )}
          </div>
          {stress && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stress-results">
              {[
                { label: "Total", value: stress.total.toLocaleString() },
                { label: "ER Rate", value: `${(stress.erRate * 100).toFixed(1)}%` },
                { label: "Errors", value: stress.errors },
                { label: "Duration", value: `${(stress.durationMs / 1000).toFixed(1)}s` },
                { label: "Throughput", value: `${stress.throughputPerSec.toFixed(0)}/s` },
                { label: "p50", value: `${stress.p50Ms}ms` },
                { label: "p95", value: `${stress.p95Ms}ms` },
                { label: "p99", value: `${stress.p99Ms}ms` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-mono text-white" data-testid={`stress-${label.toLowerCase()}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
