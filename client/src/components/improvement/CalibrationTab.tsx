import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Activity, Loader2, Sigma, TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type CalibBin = { id: number; bin_index: number; predicted_prob: number; actual_freq: number | null; count: number };
type CalibData = {
  ok: boolean;
  bins: CalibBin[];
  brier: number | null;
  n: number;
};

type CausalModel = { id: number; treatment: string; ate: number; ate_dr: number; n_samples: number; updated_at: string };
type CausalData = { ok: boolean; treatments: CausalModel[] };

export default function CalibrationTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const calibQ = useQuery<CalibData>({ queryKey: ["/api/analytics/calibration"], refetchInterval: 20_000 });
  const causalQ = useQuery<CausalData>({ queryKey: ["/api/analytics/causal"], refetchInterval: 15_000 });

  const seedCalibMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/calibration/seed", {}).then(r => r.json()),
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/calibration"] });
      toast({ title: "Calibration Data Seeded", description: `${d.seeded} data points generated` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const seedCausalMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/causal/seed", {}).then(r => r.json()),
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/causal"] });
      toast({ title: "Causal Models Seeded", description: `${d.seeded} treatment effects loaded` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const calibCurve = (calibQ.data?.bins ?? []).map(b => ({
    label: `${Math.round(b.predicted_prob * 100)}%`,
    predicted: b.predicted_prob,
    actual: b.actual_freq,
    n: b.count,
  }));

  const brier = calibQ.data?.brier;
  const n = calibQ.data?.n ?? 0;
  const models = causalQ.data?.treatments ?? [];

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {/* Calibration curve */}
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Sigma size={12} className="text-violet-400" />
            <span className="text-xs font-semibold">Confidence Calibration Curve</span>
            {brier != null && (
              <Badge variant="outline" className={cn("ml-auto text-[10px] h-4", brier < 0.10 ? "border-green-500/30 text-green-400" : brier < 0.20 ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400")}>
                Brier {brier.toFixed(3)}
              </Badge>
            )}
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 ml-1" disabled={seedCalibMut.isPending} onClick={() => seedCalibMut.mutate()} data-testid="button-seed-calibration">
              {seedCalibMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <Activity size={9} />} Seed Demo
            </Button>
          </div>
          <div className="p-3">
            {calibQ.isLoading ? (
              <Skeleton className="h-[200px] w-full rounded" />
            ) : n === 0 ? (
              <div className="flex flex-col items-center justify-center h-[120px] gap-2 text-muted-foreground">
                <Sigma size={24} className="opacity-20" />
                <div className="text-xs">No calibration data — click "Seed Demo"</div>
              </div>
            ) : (
              <>
                <div className="text-[10px] text-muted-foreground mb-2">N={n.toLocaleString()} · Purple=Predicted · Green=Actual (perfect calibration = diagonal)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={calibCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={30} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Line type="monotone" dataKey="predicted" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Predicted" />
                    <Line type="monotone" dataKey="actual" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} name="Actual" connectNulls={false} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
                {brier != null && (
                  <div className={cn("mt-2 text-xs font-medium text-center", brier < 0.10 ? "text-green-400" : brier < 0.20 ? "text-yellow-400" : "text-red-400")}>
                    Brier Score: {brier.toFixed(4)} — {brier < 0.10 ? "Excellent calibration" : brier < 0.20 ? "Acceptable calibration" : "Recalibration needed"}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Causal / ATE panel */}
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Activity size={12} className="text-cyan-400" />
            <span className="text-xs font-semibold">Treatment Effect (ATE)</span>
            <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px] gap-1" disabled={seedCausalMut.isPending} onClick={() => seedCausalMut.mutate()} data-testid="button-seed-causal">
              {seedCausalMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <TrendingUp size={9} />} Seed Demo
            </Button>
          </div>
          <div className="p-3">
            {causalQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[80px] gap-2 text-muted-foreground">
                <Activity size={20} className="opacity-20" />
                <div className="text-xs">No causal models — click "Seed Demo"</div>
              </div>
            ) : (
              <div className="space-y-2">
                {models.map(m => {
                  const ate = parseFloat(String(m.ate ?? 0));
                  const ate_dr = parseFloat(String(m.ate_dr ?? 0));
                  const positive = ate > 0;
                  return (
                    <div key={m.treatment} className="flex items-center gap-3 p-2 rounded border border-border/40">
                      {positive
                        ? <TrendingUp size={14} className="text-green-400 flex-shrink-0" />
                        : <TrendingDown size={14} className="text-red-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono truncate">{m.treatment.replace(/_/g, " ")}</div>
                        <div className="flex gap-2 mt-0.5">
                          <span className={cn("text-[11px] font-bold", positive ? "text-green-400" : "text-red-400")}>
                            ATE: {ate > 0 ? "+" : ""}{ate.toFixed(3)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">DR: {ate_dr > 0 ? "+" : ""}{ate_dr.toFixed(3)}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">N={m.n_samples ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
