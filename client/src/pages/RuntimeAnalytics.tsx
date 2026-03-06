import { useEffect, useState } from "react";
import { ComplaintMetricsChart } from "../components/ComplaintMetricsChart";
import { DispositionMetricsChart } from "../components/DispositionMetricsChart";
import { TopDisagreementTable } from "../components/TopDisagreementTable";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BarChart3, CheckCircle, AlertTriangle, GitPullRequest } from "lucide-react";

export default function RuntimeAnalytics() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/runtimeAnalytics/dashboard?limit=500");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to load analytics");
      }

      setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="status-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="text-destructive" data-testid="text-error">{error}</div>
      </div>
    );
  }

  const summaryCards = [
    { label: "Total Cases", value: data?.summary?.totalCases ?? 0, icon: BarChart3 },
    { label: "Signed Off", value: data?.summary?.totalSignedOff ?? 0, icon: CheckCircle },
    { label: "Overrides", value: data?.summary?.totalOverrides ?? 0, icon: AlertTriangle },
    { label: "Discrepancies", value: data?.summary?.totalDiscrepancies ?? 0, icon: GitPullRequest }
  ];

  return (
    <div className="p-6 space-y-6" data-testid="page-runtime-analytics">
      <h2 className="text-xl font-semibold">Runtime Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} data-testid={`card-summary-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="pt-4 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <card.icon className="h-3.5 w-3.5" />
                {card.label}
              </div>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ComplaintMetricsChart rows={data.complaintMetrics || []} />
            <DispositionMetricsChart rows={data.dispositionMetrics || []} />
          </div>
          <TopDisagreementTable rows={data.topDisagreements || []} />
        </>
      )}
    </div>
  );
}
