import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Gauge } from "lucide-react";

type PerfData = {
  ruleCache: { size: number };
  expressionCache: { size: number };
  caseCache: { size: number };
  hotPath: { totalExecutions: number; avgDurationMs: number; p95DurationMs: number };
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  uptime: number;
};

export default function PerformanceStats() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/performanceStats");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-performance-stats">
      <div className="flex items-center gap-3"><Gauge className="h-5 w-5" /><h2 className="text-xl font-semibold">Performance Stats</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : !data ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No data.</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-heap">{data.memory.heapUsedMB}MB</div><div className="text-xs text-muted-foreground">Heap Used</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-rss">{data.memory.rssMB}MB</div><div className="text-xs text-muted-foreground">RSS</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-uptime">{Math.round(data.uptime / 60)}m</div><div className="text-xs text-muted-foreground">Uptime</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-executions">{data.hotPath.totalExecutions}</div><div className="text-xs text-muted-foreground">Executions</div></CardContent></Card>
          </div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Cache Stats</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className="text-lg font-semibold" data-testid="stat-rule-cache">{data.ruleCache.size}</div><div className="text-xs text-muted-foreground">Rule Cache</div></div>
              <div><div className="text-lg font-semibold" data-testid="stat-expr-cache">{data.expressionCache.size}</div><div className="text-xs text-muted-foreground">Expression Cache</div></div>
              <div><div className="text-lg font-semibold" data-testid="stat-case-cache">{data.caseCache.size}</div><div className="text-xs text-muted-foreground">Case Cache</div></div>
            </div>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
