import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Search } from "lucide-react";

interface DeteriorationAlert {
  featureKey: string;
  trend: string;
  delta: number;
  threshold: number;
  action: string;
  riskWeight: number;
  recentValues: number[];
}

interface DeteriorationResult {
  patientId: string;
  risk: number;
  alerts: DeteriorationAlert[];
  level: "safe" | "watch" | "warning" | "critical";
}

const LEVEL_STYLE: Record<string, string> = {
  safe:     "border-green-300 bg-green-50 dark:bg-green-950",
  watch:    "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
  warning:  "border-orange-300 bg-orange-50 dark:bg-orange-950",
  critical: "border-red-400 bg-red-50 dark:bg-red-950",
};

export default function DeteriorationAlertsPanel() {
  const [patientId, setPatientId] = useState("p1");
  const [queried, setQueried] = useState("p1");

  const { data, isFetching } = useQuery<DeteriorationResult>({
    queryKey: ["/api/sysctrl/alerts", queried],
    queryFn: async () => {
      const res = await fetch(`/api/sysctrl/alerts/${queried}`);
      return res.json();
    },
    enabled: !!queried,
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-3" data-testid="deterioration-alerts-panel">
      <div className="flex gap-2">
        <Input
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          placeholder="patient_id"
          className="h-7 text-xs"
          data-testid="input-patient-id"
        />
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setQueried(patientId)} data-testid="button-query-alerts">
          <Search className="h-3 w-3" />
        </Button>
      </div>

      {data && (
        <div className={`rounded-lg border-2 p-3 ${LEVEL_STYLE[data.level]}`} data-testid="alerts-result">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">{data.patientId}</span>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs py-0">{data.level.toUpperCase()}</Badge>
              <Badge variant="secondary" className="text-xs py-0">risk: {data.risk.toFixed(1)}</Badge>
            </div>
          </div>
          {data.alerts.length === 0 && (
            <p className="text-xs text-muted-foreground">No deterioration alerts</p>
          )}
          {data.alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background/60 mb-1" data-testid={`alert-row-${i}`}>
              <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{a.featureKey}</p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {a.trend === "rising" ? <TrendingUp className="h-3 w-3 text-red-400" /> : <TrendingDown className="h-3 w-3 text-blue-400" />}
                  <span className="text-muted-foreground">Δ{a.delta.toFixed(1)} &gt; {a.threshold}</span>
                  <Badge className="text-xs py-0 bg-red-600">{a.action}</Badge>
                </div>
                <p className="text-muted-foreground mt-0.5">Recent: [{a.recentValues.slice(0, 3).join(", ")}]</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {isFetching && !data && <p className="text-xs text-muted-foreground">Checking…</p>}
    </div>
  );
}
