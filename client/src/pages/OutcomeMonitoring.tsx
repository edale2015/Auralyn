import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity } from "lucide-react";

type Summary = { totalCases: number; casesWithOutcome: number; outcomeCaptureRate: number; bouncebackRate: number; dispositionAccuracy: number };

export default function OutcomeMonitoring() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/outcomeMonitoring/summary");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="p-6 space-y-4" data-testid="page-outcome-monitoring">
      <div className="flex items-center gap-3"><Activity className="h-5 w-5" /><h2 className="text-xl font-semibold">Outcome Monitoring</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : !data ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No data.</p> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-total">{data.totalCases}</div><div className="text-xs text-muted-foreground">Total Cases</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-with-outcome">{data.casesWithOutcome}</div><div className="text-xs text-muted-foreground">With Outcome</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-capture-rate">{pct(data.outcomeCaptureRate)}</div><div className="text-xs text-muted-foreground">Capture Rate</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-bounceback">{pct(data.bouncebackRate)}</div><div className="text-xs text-muted-foreground">Bounceback Rate</div></CardContent></Card>
        </div>
      )}
    </div>
  );
}
