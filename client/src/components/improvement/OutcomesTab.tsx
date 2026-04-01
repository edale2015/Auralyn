import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { BarChart3, Download, DollarSign, Loader2, RefreshCcw, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type OutcomeData = {
  ok: boolean; total: number; mismatchCount: number; mismatchRate: number;
  clusters: { dx: string; count: number }[];
  recent: any[];
};
type PayerData = { ok: boolean; data: any[] };
type FdaData   = { ok: boolean; report: any };

export default function OutcomesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const outQ   = useQuery<OutcomeData>({ queryKey: ["/api/analytics/outcomes"],  refetchInterval: 20_000 });
  const payQ   = useQuery<PayerData>  ({ queryKey: ["/api/analytics/payer"],     refetchInterval: 20_000 });
  const fdaQ   = useQuery<FdaData>    ({ queryKey: ["/api/analytics/fda-report"],refetchInterval: 30_000 });

  const seedOutMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/outcomes/seed", {}).then(r => r.json()),
    onSuccess:  d => { qc.invalidateQueries({ queryKey: ["/api/analytics/outcomes"] }); toast({ title: "Outcomes Seeded", description: `${d.seeded} cases added` }); },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });
  const seedPayMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/payer/seed", {}).then(r => r.json()),
    onSuccess:  d => { qc.invalidateQueries({ queryKey: ["/api/analytics/payer"] }); toast({ title: "Payer Data Seeded", description: `${d.seeded} cases added` }); },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const outcomes = outQ.data;
  const payerData = payQ.data?.data ?? [];
  const fda = fdaQ.data?.report;

  const mismatchPct = outcomes ? (outcomes.mismatchRate * 100).toFixed(1) : null;

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {/* Outcome mismatch panel */}
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <ShieldAlert size={12} className="text-red-400" />
            <span className="text-xs font-semibold">Real-World Outcome Feedback</span>
            <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px] gap-1" disabled={seedOutMut.isPending} onClick={() => seedOutMut.mutate()} data-testid="button-seed-outcomes">
              {seedOutMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <RefreshCcw size={9} />} Seed Demo
            </Button>
          </div>
          <div className="p-3">
            {outQ.isLoading ? (
              <Skeleton className="h-24 w-full rounded" />
            ) : !outcomes || outcomes.total === 0 ? (
              <div className="flex flex-col items-center justify-center h-[80px] gap-2 text-muted-foreground">
                <ShieldAlert size={20} className="opacity-20" />
                <div className="text-xs">No outcome data — click "Seed Demo"</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Total Cases", value: outcomes.total, color: "text-foreground" },
                    { label: "Mismatches", value: outcomes.mismatchCount, color: "text-red-400" },
                    { label: "Mismatch Rate", value: `${mismatchPct}%`, color: parseFloat(mismatchPct ?? "0") < 10 ? "text-green-400" : "text-red-400" },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded border border-border/40" data-testid={`outcome-stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                      <div className={cn("text-xl font-black", s.color)}>{s.value}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                {outcomes.clusters.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-2">Top Mismatch Clusters</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={outcomes.clusters} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="dx" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={25} />
                        <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                        <Bar dataKey="count" name="Mismatches" radius={[2, 2, 0, 0]}>
                          {outcomes.clusters.map((_, i) => <Cell key={i} fill={i === 0 ? "#f87171" : "#fb923c"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Payer metrics */}
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <DollarSign size={12} className="text-green-400" />
            <span className="text-xs font-semibold">Payer / Financial Metrics</span>
            <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px] gap-1" disabled={seedPayMut.isPending} onClick={() => seedPayMut.mutate()} data-testid="button-seed-payer">
              {seedPayMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <DollarSign size={9} />} Seed Demo
            </Button>
          </div>
          <div className="p-3">
            {payQ.isLoading ? <Skeleton className="h-24 w-full rounded" /> : payerData.length === 0 ? (
              <div className="flex justify-center items-center h-16 text-xs text-muted-foreground">No payer data — click "Seed Demo"</div>
            ) : (
              <div className="space-y-1.5">
                {payerData.map(p => (
                  <div key={p.diagnosis} className="flex items-center gap-2 text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="font-mono text-[10px] text-muted-foreground w-24 truncate flex-shrink-0">{p.diagnosis}</span>
                    <span className="font-bold text-foreground">${parseFloat(p.avg_cost ?? 0).toFixed(0)}</span>
                    <span className="text-muted-foreground text-[10px]">avg cost</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">LOS {parseFloat(p.avg_los ?? 0).toFixed(1)}d</span>
                    {parseFloat(p.readmission_rate ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-red-500/30 text-red-400">
                        {(parseFloat(p.readmission_rate ?? 0) * 100).toFixed(0)}% readmit
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* FDA report */}
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <BarChart3 size={12} className="text-blue-400" />
            <span className="text-xs font-semibold">FDA-Ready Validation Report</span>
            {fda && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-6 text-[10px] gap-1"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(fda, null, 2)], { type: "application/json" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                  a.download = `auralyn-fda-report-${new Date().toISOString().split("T")[0]}.json`; a.click();
                }}
                data-testid="button-export-fda"
              >
                <Download size={9} /> Export JSON
              </Button>
            )}
          </div>
          <div className="p-3">
            {fdaQ.isLoading ? <Skeleton className="h-32 w-full rounded" /> : !fda ? (
              <div className="flex justify-center items-center h-16 text-xs text-muted-foreground">Report unavailable</div>
            ) : (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground w-28 flex-shrink-0">Intended Use:</span>
                  <span className="text-foreground">{fda.intended_use}</span>
                </div>
                <div className="flex gap-4 flex-wrap">
                  {[
                    { label: "KB Rules", value: fda.system?.total_kb_rules, color: "text-blue-400" },
                    { label: "Systems", value: fda.system?.clinical_systems, color: "text-cyan-400" },
                    { label: "Complaints", value: fda.system?.total_complaints, color: "text-purple-400" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className={cn("text-lg font-black", s.color)}>{s.value}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                {fda.validation && (
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border/40">
                    {[
                      { k: "Accuracy",    v: fda.validation.accuracy,    col: "text-green-400" },
                      { k: "Sensitivity", v: fda.validation.sensitivity, col: "text-blue-400" },
                      { k: "Specificity", v: fda.validation.specificity, col: "text-cyan-400" },
                      { k: "F1",          v: fda.validation.f1,          col: "text-purple-400" },
                    ].map(m => (
                      <div key={m.k} className="text-center p-1 rounded bg-muted/20">
                        <div className={cn("text-sm font-bold", m.col)}>{typeof m.v === "number" ? (m.v * 100).toFixed(1) + "%" : "—"}</div>
                        <div className="text-[9px] text-muted-foreground">{m.k}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Audit Trail ✓</Badge>
                  <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Peer Review ✓</Badge>
                  <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Guideline-Backed ✓</Badge>
                  <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">v{fda.version}</Badge>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
