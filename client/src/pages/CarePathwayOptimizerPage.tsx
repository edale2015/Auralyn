import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AdminLayout from "@/components/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowRight, BarChart2, CheckCircle2,
  ChevronDown, ChevronRight, ChevronUp, Clock, Code2, DollarSign,
  FlaskConical, Loader2, PlayCircle, Plus, RefreshCcw, Shuffle, TrendingUp,
} from "lucide-react";

type Pathway = {
  id: number; pathway_id: string; complaint_id: string; name: string;
  version: number; steps: any[]; is_active: boolean; experiment_count: number;
};
type ExperimentResult = {
  ok: boolean; experimentId: number; results: { A: MetricSet; B: MetricSet }; suggestions: any[];
};
type MetricSet = {
  accuracy: number; red_flag_sensitivity: number; false_reassurance_rate: number;
  avg_cost: number; avg_steps: number; avg_time_ms: number; admission_rate: number; case_count: number;
};
type Suggestion = {
  id: number; complaint_id: string; current_pathway_id: string; suggestion_type: string;
  suggestion: any; rationale: string; confidence: number; status: string;
};

const STEP_COLORS: Record<string, string> = {
  questions:   "bg-blue-500/20 border-blue-500/40 text-blue-400",
  modifiers:   "bg-cyan-500/20 border-cyan-500/40 text-cyan-400",
  findings:    "bg-purple-500/20 border-purple-500/40 text-purple-400",
  red_flags:   "bg-red-500/20 border-red-500/40 text-red-400",
  workup:      "bg-orange-500/20 border-orange-500/40 text-orange-400",
  diagnosis:   "bg-yellow-500/20 border-yellow-500/40 text-yellow-400",
  treatment:   "bg-green-500/20 border-green-500/40 text-green-400",
  disposition: "bg-muted/40 border-muted-foreground/30 text-muted-foreground",
};

function MetricComparison({ label, valueA, valueB, format = "pct", lowerIsBetter = false }: {
  label: string; valueA: number; valueB: number;
  format?: "pct" | "dollar" | "num"; lowerIsBetter?: boolean;
}) {
  const fmt = (v: number) =>
    format === "pct" ? `${(v * 100).toFixed(1)}%` :
    format === "dollar" ? `$${v.toFixed(0)}` :
    v.toFixed(1);

  const diff = valueB - valueA;
  const betterB = lowerIsBetter ? diff < 0 : diff > 0;
  const betterA = lowerIsBetter ? diff > 0 : diff < 0;
  const neutral = Math.abs(diff) < 0.001;

  return (
    <div className="flex items-center gap-2 py-1 text-xs border-b border-border/30 last:border-0">
      <span className="text-muted-foreground w-36 flex-shrink-0">{label}</span>
      <span className={cn("font-bold w-16 text-right flex-shrink-0", betterA ? "text-green-400" : neutral ? "text-foreground" : "text-muted-foreground")}>{fmt(valueA)}</span>
      <ArrowRight size={10} className="text-muted-foreground flex-shrink-0" />
      <span className={cn("font-bold w-16 text-right flex-shrink-0", betterB ? "text-green-400" : neutral ? "text-foreground" : "text-muted-foreground")}>{fmt(valueB)}</span>
      {!neutral && (
        <span className={cn("text-[10px] ml-auto flex-shrink-0", betterB ? "text-green-400" : "text-red-400")}>
          {betterB ? "▲" : "▼"} B {lowerIsBetter ? "better" : "better"}
        </span>
      )}
    </div>
  );
}

export default function CarePathwayOptimizerPage() {
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [caseCount, setCaseCount] = useState("500");
  const [expandedPathway, setExpandedPathway] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExperimentResult | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const pathwaysQ  = useQuery<{ ok: boolean; pathways: Pathway[] }>({ queryKey: ["/api/optimizer/"], refetchInterval: 15_000 });
  const suggestQ   = useQuery<{ ok: boolean; suggestions: Suggestion[] }>({ queryKey: ["/api/optimizer/suggestions"], refetchInterval: 10_000 });
  const experimentsQ = useQuery<{ ok: boolean; experiments: any[] }>({ queryKey: ["/api/optimizer/experiments"], refetchInterval: 10_000 });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/optimizer/seed", {}).then(r => r.json()),
    onSuccess: d => { qc.invalidateQueries({ queryKey: ["/api/optimizer/"] }); toast({ title: "Pathways Seeded", description: `${d.seeded} demo pathways loaded` }); },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const experimentMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/optimizer/experiment", { pathwayAId: selectedA, pathwayBId: selectedB, caseCount: parseInt(caseCount), experimentName: `${selectedA} vs ${selectedB}` }).then(r => r.json()),
    onSuccess: d => {
      setLastResult(d);
      qc.invalidateQueries({ queryKey: ["/api/optimizer/experiments"] });
      qc.invalidateQueries({ queryKey: ["/api/optimizer/suggestions"] });
      toast({ title: "Experiment Complete", description: `${d.results?.A?.case_count} cases simulated` });
    },
    onError: (e: any) => toast({ title: "Experiment failed", description: e.message, variant: "destructive" }),
  });

  const applySugMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/optimizer/suggestions/${id}`, { status: "applied" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/optimizer/suggestions"] }); toast({ title: "Suggestion Applied" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const pathways = pathwaysQ.data?.pathways ?? [];
  const suggestions = suggestQ.data?.suggestions ?? [];
  const experiments = experimentsQ.data?.experiments ?? [];

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-card flex items-center gap-3 flex-shrink-0">
          <Shuffle size={18} className="text-indigo-400" />
          <div>
            <h1 className="text-base font-bold leading-tight" data-testid="heading-pathway-optimizer">Care Pathway Optimizer</h1>
            <p className="text-xs text-muted-foreground">A/B pathway experiments · Simulation engine · Auto-suggestions · Clinical wind tunnel</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-400 bg-indigo-500/10">
              {experiments.length} experiments run
            </Badge>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={seedMut.isPending} onClick={() => seedMut.mutate()} data-testid="button-seed-pathways">
              {seedMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Seed Demo Pathways
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: pathway library */}
          <div className="w-[260px] flex-shrink-0 border-r flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
              <Code2 size={12} className="text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pathway Library</span>
              <Badge variant="outline" className="ml-auto text-[10px] h-4">{pathways.length}</Badge>
            </div>
            <ScrollArea className="flex-1">
              {pathwaysQ.isLoading ? (
                <div className="p-2 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
              ) : pathways.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Code2 size={24} className="opacity-20" />
                  <div className="text-xs text-center">No pathways yet</div>
                  <div className="text-[11px] opacity-60 text-center max-w-[160px]">Click "Seed Demo Pathways" to load 4 demo pathways</div>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {pathways.map(p => {
                    const isExpanded = expandedPathway === p.pathway_id;
                    return (
                      <Card key={p.pathway_id} className={cn("border overflow-hidden", isExpanded ? "border-indigo-500/40" : "border-border/50")}>
                        <button
                          className="w-full flex items-center gap-2 p-2.5 text-left"
                          onClick={() => setExpandedPathway(isExpanded ? null : p.pathway_id)}
                          data-testid={`pathway-${p.pathway_id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold leading-snug truncate">{p.name}</div>
                            <div className="flex gap-1.5 mt-1">
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{p.complaint_id}</Badge>
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">v{p.version}</Badge>
                              <span className="text-[10px] text-muted-foreground">{p.steps?.length ?? 0} steps</span>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp size={12} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="px-2 pb-2 border-t bg-muted/10">
                            <div className="flex flex-col gap-1 mt-1.5">
                              {(p.steps ?? []).map((s: any, i: number) => (
                                <div key={i} className={cn("flex items-center gap-1.5 px-2 py-1 rounded border text-[10px]", STEP_COLORS[s.type] ?? STEP_COLORS.disposition)}>
                                  <span className="font-bold w-4 text-center opacity-60">{i + 1}</span>
                                  <span className="flex-1 truncate">{s.label}</span>
                                  {s.config?.strict_mode && <Badge variant="outline" className="text-[8px] h-3 px-1 border-red-500/30 text-red-400">strict</Badge>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Middle: experiment runner + results */}
          <div className="flex-1 flex flex-col overflow-hidden border-r min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
              <PlayCircle size={12} className="text-green-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">A/B Experiment Runner</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                {/* Config */}
                <Card className="p-3 border border-border/50">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Pathway A (baseline)</Label>
                      <Select value={selectedA} onValueChange={setSelectedA}>
                        <SelectTrigger className="h-7 text-xs" data-testid="select-pathway-a">
                          <SelectValue placeholder="Select pathway A…" />
                        </SelectTrigger>
                        <SelectContent>
                          {pathways.map(p => <SelectItem key={p.pathway_id} value={p.pathway_id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Pathway B (variant)</Label>
                      <Select value={selectedB} onValueChange={setSelectedB}>
                        <SelectTrigger className="h-7 text-xs" data-testid="select-pathway-b">
                          <SelectValue placeholder="Select pathway B…" />
                        </SelectTrigger>
                        <SelectContent>
                          {pathways.map(p => <SelectItem key={p.pathway_id} value={p.pathway_id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="space-y-1 flex-1">
                      <Label className="text-[11px] text-muted-foreground">Simulated Cases</Label>
                      <Input value={caseCount} onChange={e => setCaseCount(e.target.value)} className="h-7 text-xs" type="number" min="100" max="2000" data-testid="input-case-count" />
                    </div>
                    <Button
                      className="h-7 text-xs gap-2 bg-green-600 hover:bg-green-700 flex-shrink-0"
                      disabled={experimentMut.isPending || !selectedA || !selectedB || selectedA === selectedB}
                      onClick={() => experimentMut.mutate()}
                      data-testid="button-run-experiment"
                    >
                      {experimentMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />}
                      {experimentMut.isPending ? `Running ${caseCount} cases…` : `Run A/B Experiment`}
                    </Button>
                  </div>
                  {selectedA === selectedB && selectedA && (
                    <div className="text-[11px] text-yellow-400 mt-1.5 flex items-center gap-1"><AlertTriangle size={11} /> Select two different pathways to compare</div>
                  )}
                </Card>

                {/* Results */}
                {lastResult && (
                  <Card className="border border-indigo-500/30 bg-indigo-500/5">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-500/20">
                      <BarChart2 size={12} className="text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-400">Experiment Results — {lastResult.results.A.case_count} cases each</span>
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="flex text-[10px] text-muted-foreground mb-2">
                        <span className="w-36 flex-shrink-0">Metric</span>
                        <span className="w-16 text-right flex-shrink-0">Pathway A</span>
                        <span className="w-4 flex-shrink-0"></span>
                        <span className="w-16 text-right flex-shrink-0">Pathway B</span>
                      </div>
                      <MetricComparison label="Accuracy" valueA={lastResult.results.A.accuracy} valueB={lastResult.results.B.accuracy} />
                      <MetricComparison label="RF Sensitivity" valueA={lastResult.results.A.red_flag_sensitivity} valueB={lastResult.results.B.red_flag_sensitivity} />
                      <MetricComparison label="False Reassurance" valueA={lastResult.results.A.false_reassurance_rate} valueB={lastResult.results.B.false_reassurance_rate} lowerIsBetter />
                      <MetricComparison label="Avg Cost" valueA={lastResult.results.A.avg_cost} valueB={lastResult.results.B.avg_cost} format="dollar" lowerIsBetter />
                      <MetricComparison label="Avg Steps" valueA={lastResult.results.A.avg_steps} valueB={lastResult.results.B.avg_steps} format="num" lowerIsBetter />
                      <MetricComparison label="Avg Time (ms)" valueA={lastResult.results.A.avg_time_ms} valueB={lastResult.results.B.avg_time_ms} format="num" lowerIsBetter />
                      <MetricComparison label="Admission Rate" valueA={lastResult.results.A.admission_rate} valueB={lastResult.results.B.admission_rate} />
                    </div>
                    {lastResult.suggestions.length > 0 && (
                      <div className="px-3 pb-3">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">{lastResult.suggestions.length} Auto-Suggestions Generated →</div>
                        <div className="space-y-1">
                          {lastResult.suggestions.slice(0, 3).map((s, i) => (
                            <div key={i} className="text-[11px] flex items-start gap-1.5 p-1.5 rounded bg-muted/20">
                              <AlertTriangle size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">{s.rationale}</div>
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-yellow-500/30 text-yellow-400 flex-shrink-0">{Math.round(s.confidence * 100)}%</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {/* Recent experiments */}
                {experiments.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                      <Clock size={11} /> Recent Experiments
                    </div>
                    <div className="space-y-1.5">
                      {experiments.slice(0, 5).map(e => {
                        const r = e.results ?? {};
                        return (
                          <Card key={e.id} className="p-2.5 border border-border/50">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{e.experiment_name}</div>
                                <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                  <span>{e.case_count} cases</span>
                                  {r.A && <span>A: {(r.A.accuracy * 100).toFixed(1)}%</span>}
                                  {r.B && <span>B: {(r.B.accuracy * 100).toFixed(1)}%</span>}
                                  <span className="ml-auto">{new Date(e.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Suggestions queue */}
          <div className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
              <TrendingUp size={12} className="text-yellow-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pathway Suggestions</span>
              {suggestions.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] h-4 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">{suggestions.length}</Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              {suggestQ.isLoading ? (
                <div className="p-2 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded" />)}</div>
              ) : suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <CheckCircle2 size={28} className="text-green-400" />
                  <div className="text-xs font-medium text-green-400">No pending suggestions</div>
                  <div className="text-[11px] text-center max-w-[180px]">Run an A/B experiment to auto-generate pathway improvement suggestions</div>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {suggestions.map(s => {
                    const confPct = Math.round(s.confidence * 100);
                    const typeColors: Record<string, string> = {
                      add_step:     "border-green-500/30 text-green-400 bg-green-500/10",
                      reorder_step: "border-blue-500/30 text-blue-400 bg-blue-500/10",
                      remove_step:  "border-red-500/30 text-red-400 bg-red-500/10",
                      split_branch: "border-purple-500/30 text-purple-400 bg-purple-500/10",
                    };
                    return (
                      <Card key={s.id} className="p-2.5 border border-border/50" data-testid={`suggestion-${s.id}`}>
                        <div className="flex gap-1.5 mb-1.5">
                          <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", typeColors[s.suggestion_type] ?? "border-muted-foreground/30")}>{s.suggestion_type?.replace(/_/g, " ")}</Badge>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{s.current_pathway_id}</Badge>
                          <Badge variant="outline" className={cn("ml-auto text-[9px] h-3.5 px-1", confPct >= 85 ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400")}>{confPct}%</Badge>
                        </div>
                        <div className="text-[11px] leading-snug mb-1.5">{s.rationale}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-6 text-[10px] gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                          disabled={applySugMut.isPending}
                          onClick={() => applySugMut.mutate(s.id)}
                          data-testid={`button-apply-suggestion-${s.id}`}
                        >
                          <CheckCircle2 size={9} /> Apply Suggestion
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
