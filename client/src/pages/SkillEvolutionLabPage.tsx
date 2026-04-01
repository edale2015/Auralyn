import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Activity, CheckCircle2, Database, GitBranch,
  Globe, Loader2, RefreshCcw, ShieldAlert, Sigma, Thermometer,
  TrendingUp, Zap, Brain, Cpu, ChevronUp, ChevronDown, Minus,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  improved: "text-green-400 border-green-500/30 bg-green-500/10",
  rejected: "text-red-400 border-red-500/30 bg-red-500/5",
  pending:  "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
};

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  low:      "text-green-400 border-green-500/30 bg-green-500/5",
};

export default function SkillEvolutionLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [skillIdInput, setSkillIdInput] = useState("");
  const [iterationsInput, setIterationsInput] = useState("5");

  // Queries
  const evolutionStatsQ = useQuery<any>({ queryKey: ["/api/skill-evolution/stats"], refetchInterval: 20_000 });
  const cyclesQ         = useQuery<any>({ queryKey: ["/api/skill-evolution/cycles"] });
  const metaQ           = useQuery<any>({ queryKey: ["/api/skill-evolution/meta-patterns"] });
  const crossClinicQ    = useQuery<any>({ queryKey: ["/api/skill-evolution/cross-clinic"] });
  const heatmapQ        = useQuery<any>({ queryKey: ["/api/skill-evolution/coverage-heatmap"] });
  const riskQ           = useQuery<any>({ queryKey: ["/api/skill-evolution/risk-scores"] });

  // Mutations
  const runEvolutionMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/skill-evolution/run", {
      skill_id: skillIdInput.trim() || undefined,
      iterations: parseInt(iterationsInput) || 5,
    }).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/skill-evolution/cycles"] });
      qc.invalidateQueries({ queryKey: ["/api/skill-evolution/stats"] });
      const improved = d.cycles?.filter((c: any) => c.status === "improved").length ?? 0;
      toast({ title: "Evolution Complete", description: `${d.cycles?.length} cycles · ${improved} improved · final accuracy ${(d.final_accuracy * 100).toFixed(1)}%` });
    },
    onError: (e: any) => toast({ title: "Evolution failed", description: e.message, variant: "destructive" }),
  });

  const discoverPatternsMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/skill-evolution/meta-patterns/discover", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/skill-evolution/meta-patterns"] });
      toast({ title: "Patterns Discovered", description: `${d.count} meta-patterns found` });
    },
    onError: (e: any) => toast({ title: "Discovery failed", description: e.message, variant: "destructive" }),
  });

  const seedCrossClinicMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/skill-evolution/cross-clinic/seed", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/skill-evolution/cross-clinic"] });
      toast({ title: "Cross-Clinic Seeded", description: `${d.seeded} records from 4 clinic sites` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const stats: any       = evolutionStatsQ.data ?? {};
  const cycles: any[]    = cyclesQ.data?.cycles ?? [];
  const patterns: any[]  = metaQ.data?.patterns ?? [];
  const crossClinic: any[]= crossClinicQ.data?.aggregated ?? [];
  const heatmap: any[]   = heatmapQ.data?.heatmap ?? [];
  const riskScores: any[]= riskQ.data?.scores ?? [];
  const hasPatterns      = metaQ.data?.discovered && patterns.length > 0;
  const hasCrossClinic   = crossClinicQ.data?.seeded && crossClinic.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0 flex-wrap" data-testid="skill-evolution-header">
        <Activity size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <div className="font-bold text-base">Skill Evolution Lab</div>
          <div className="text-xs text-muted-foreground">Autonomous evolution cycles · meta-learning · cross-clinic · coverage heatmap · risk scoring</div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {stats.total > 0 && (
            <>
              <Badge variant="outline" className="text-[10px] h-5 gap-1"><Cpu size={9} />{stats.total} cycles</Badge>
              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-green-500/30 text-green-400 bg-green-500/10"><TrendingUp size={9} />{stats.improved} improved</Badge>
              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-blue-500/30 text-blue-400">{stats.improvement_rate}% rate</Badge>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="evolution" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-2 border-b flex-shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="evolution"   className="gap-1.5 text-xs h-7" data-testid="sel-tab-evolution"><Zap size={11} />Evolution</TabsTrigger>
            <TabsTrigger value="meta"        className="gap-1.5 text-xs h-7" data-testid="sel-tab-meta"><Brain size={11} />Meta-Learning</TabsTrigger>
            <TabsTrigger value="cross-clinic" className="gap-1.5 text-xs h-7" data-testid="sel-tab-cross-clinic"><Globe size={11} />Cross-Clinic</TabsTrigger>
            <TabsTrigger value="heatmap"     className="gap-1.5 text-xs h-7" data-testid="sel-tab-heatmap"><Thermometer size={11} />Coverage Heatmap</TabsTrigger>
            <TabsTrigger value="risk"        className="gap-1.5 text-xs h-7" data-testid="sel-tab-risk"><ShieldAlert size={11} />Risk Scoring</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab 1: Skill Evolution ────────────────────────────────────── */}
        <TabsContent value="evolution" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex flex-1 min-h-0 divide-x">
            {/* Controls */}
            <div className="flex flex-col p-4 gap-3" style={{ width: "36%" }}>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-emerald-400" />
                <span className="text-sm font-semibold">Evolution Control</span>
              </div>
              <p className="text-xs text-muted-foreground">Run autonomous mutation cycles on KB skills. Each cycle mutates a threshold parameter, tests against simulated cases, and records improved vs rejected outcomes.</p>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Skill ID (leave blank for random)</label>
                <Input value={skillIdInput} onChange={e => setSkillIdInput(e.target.value)} placeholder="e.g. Q_FEVER" className="h-7 text-xs font-mono" data-testid="input-skill-id" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Iterations (1–10)</label>
                <Input type="number" min="1" max="10" value={iterationsInput} onChange={e => setIterationsInput(e.target.value)} className="h-7 text-xs" data-testid="input-iterations" />
              </div>

              <Button className="gap-2 mt-1" disabled={runEvolutionMut.isPending} onClick={() => runEvolutionMut.mutate()} data-testid="button-run-evolution">
                {runEvolutionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {runEvolutionMut.isPending ? "Evolving…" : "Run Evolution Cycle"}
              </Button>

              {/* Summary stats */}
              {stats.total > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { label: "Total Cycles",   value: stats.total,             c: "text-blue-400" },
                    { label: "Improved",       value: stats.improved,          c: "text-green-400" },
                    { label: "Rejected",       value: stats.rejected,          c: "text-red-400" },
                    { label: "Improvement %",  value: `${stats.improvement_rate}%`, c: "text-violet-400" },
                  ].map(s => (
                    <Card key={s.label} className="p-2 text-center border-border/40">
                      <div className={`text-lg font-black tabular-nums ${s.c}`} data-testid={`evo-stat-${s.label.toLowerCase().replace(/\s/g,"-")}`}>{s.value}</div>
                      <div className="text-[9px] text-muted-foreground">{s.label}</div>
                    </Card>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-muted-foreground/50 mt-auto">
                Simulation: threshold mutation ±0.1 · 200–1000 test cases · accepts if accuracy improves
              </div>
            </div>

            {/* Cycle history */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cycles.length} Evolution Cycles</div>
                {cyclesQ.isLoading ? (
                  <div className="space-y-1.5">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-14 rounded" />)}</div>
                ) : cycles.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Zap size={36} className="mx-auto mb-3 opacity-10" />
                    <p className="text-sm">No evolution cycles yet</p>
                    <p className="text-xs opacity-60 mt-1">Run an evolution cycle to start tracking</p>
                  </div>
                ) : cycles.map((c, i) => {
                  const m = c.metrics as any ?? {};
                  const delta = m.delta ?? 0;
                  return (
                    <Card key={i} className={cn("p-2.5 border text-xs", STATUS_COLORS[c.status] ?? "border-border/40")} data-testid={`evo-cycle-${i}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 mt-0.5">
                          {c.status === "improved" ? <ChevronUp size={13} className="text-green-400" /> :
                           c.status === "rejected" ? <ChevronDown size={13} className="text-red-400" /> :
                           <Minus size={13} className="text-yellow-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] opacity-70">{c.skill_id}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="truncate">{c.skill_name?.slice(0, 40)}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{c.complaint_label} · iter {c.iteration}</div>
                          <div className="flex gap-3 mt-1 text-[10px]">
                            <span>base <span className="tabular-nums text-blue-400">{((m.baseline_accuracy ?? 0) * 100).toFixed(1)}%</span></span>
                            <span>result <span className="tabular-nums text-violet-400">{((m.result_accuracy ?? 0) * 100).toFixed(1)}%</span></span>
                            <span className={delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}>
                              {delta > 0 ? "+" : ""}{(delta * 100).toFixed(2)}%
                            </span>
                            <span className="ml-auto text-muted-foreground/60">{m.cases_tested} cases</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] h-4 px-1 flex-shrink-0", STATUS_COLORS[c.status])}>{c.status}</Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ── Tab 2: Meta-Learning ─────────────────────────────────────── */}
        <TabsContent value="meta" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2"><Brain size={14} className="text-blue-400" /> Meta-Pattern Discovery</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Analyzes the KB for structural patterns — missing BP checks, sparse safety nets, unclassified questions, complaints with no required fields.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-blue-500/30 text-blue-400" disabled={discoverPatternsMut.isPending} onClick={() => discoverPatternsMut.mutate()} data-testid="button-discover-patterns">
                  {discoverPatternsMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
                  Discover Patterns
                </Button>
              </div>

              {!hasPatterns && !metaQ.isLoading ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Brain size={32} className="mx-auto mb-3 opacity-10" />
                  <p className="text-sm">{metaQ.data?.discovered === false ? "No patterns found" : "Not yet discovered"}</p>
                  <p className="text-xs opacity-60 mt-1">Click "Discover Patterns" to scan the KB</p>
                </div>
              ) : metaQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-20 rounded" />)}</div>
              ) : (
                <div className="space-y-3">
                  {patterns.map((p, i) => (
                    <Card key={i} className="p-3 border border-blue-500/20 bg-blue-500/5" data-testid={`meta-pattern-${i}`}>
                      <div className="flex items-start gap-3">
                        <Brain size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-blue-400">{p.pattern}</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/30 text-blue-400">{Math.round((p.confidence ?? 0) * 100)}% confidence</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.recommendation}</p>
                          {p.applies_to?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {p.applies_to.slice(0, 8).map((c: string) => (
                                <Badge key={c} variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{c}</Badge>
                              ))}
                              {p.applies_to.length > 8 && <span className="text-[9px] text-muted-foreground/60">+{p.applies_to.length - 8} more</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 3: Cross-Clinic ──────────────────────────────────────── */}
        <TabsContent value="cross-clinic" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-teal-400" /> Cross-Clinic Knowledge Aggregation</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Aggregates skill performance metrics from 4 clinic sites (NYC, Bronx, Brooklyn, Queens). Shows best-performing clinic per complaint and average accuracy.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-teal-500/30 text-teal-400" disabled={seedCrossClinicMut.isPending} onClick={() => seedCrossClinicMut.mutate()} data-testid="button-seed-cross-clinic">
                  {seedCrossClinicMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />}
                  Seed / Refresh Clinics
                </Button>
              </div>

              {!hasCrossClinic && !crossClinicQ.isLoading ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Globe size={32} className="mx-auto mb-3 opacity-10" />
                  <p className="text-sm">No cross-clinic data</p>
                  <p className="text-xs opacity-60 mt-1">Click "Seed / Refresh Clinics" to populate from 4 clinic sites</p>
                </div>
              ) : crossClinicQ.isLoading ? (
                <div className="space-y-1.5">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : (
                <div className="space-y-1.5">
                  {crossClinic.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded border border-border/40 text-xs hover:border-border/60 transition-colors" data-testid={`cross-clinic-row-${i}`}>
                      <div className="w-36 flex-shrink-0 font-medium truncate">{row.skill_id}</div>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(row.avg_accuracy ?? 0) * 100}%` }} />
                      </div>
                      <div className="w-10 text-right tabular-nums font-bold text-teal-400 flex-shrink-0">{((row.avg_accuracy ?? 0) * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground w-24 text-right flex-shrink-0">
                        best: <span className="text-blue-400">{row.best_clinic?.replace("clinic-","")}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground w-16 text-right flex-shrink-0">
                        {row.avg_cases} cases
                      </div>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-muted-foreground/20 text-muted-foreground flex-shrink-0">
                        {row.site_count} sites
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 4: Coverage Heatmap ───────────────────────────────────── */}
        <TabsContent value="heatmap" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2"><Thermometer size={14} className="text-orange-400" /> Skill Coverage Heatmap</div>
              <p className="text-xs text-muted-foreground">Per-complaint coverage across 4 dimensions: skill density (40%), safety net (30%), diagnosis coverage (20%), modifier applicability (10%). Sorted worst→best.</p>
              <div className="flex gap-3 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><div className="w-3 h-1 bg-red-500 rounded" /> ≤40% Poor</span>
                <span className="flex items-center gap-1"><div className="w-3 h-1 bg-yellow-500 rounded" /> 41–70% Fair</span>
                <span className="flex items-center gap-1"><div className="w-3 h-1 bg-green-500 rounded" /> {">"} 70% Good</span>
              </div>

              {heatmapQ.isLoading ? (
                <div className="space-y-1.5">{Array.from({length:10}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : heatmap.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No data</div>
              ) : (
                <div className="space-y-1">
                  {heatmap.map((row, i) => (
                    <div key={i} className="px-3 py-2 rounded border border-border/30 text-xs" data-testid={`heatmap-row-${i}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-40 flex-shrink-0">
                          <div className="font-medium truncate">{row.complaint}</div>
                          <div className="text-[10px] text-muted-foreground">{row.system}</div>
                        </div>
                        {/* 4 score bars */}
                        <div className="flex-1 grid grid-cols-4 gap-1">
                          {[
                            { label: "Skill",   val: row.skill_score,   col: "bg-blue-500" },
                            { label: "Safety",  val: row.safety_score,  col: "bg-red-500" },
                            { label: "Dx",      val: row.dx_score,      col: "bg-violet-500" },
                            { label: "Overall", val: row.overall_score, col: row.overall_score > 70 ? "bg-green-500" : row.overall_score > 40 ? "bg-yellow-500" : "bg-red-500" },
                          ].map(s => (
                            <div key={s.label}>
                              <div className="text-[9px] text-muted-foreground/60 mb-0.5">{s.label}</div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${s.col}`} style={{ width: `${s.val}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="w-10 text-right tabular-nums font-bold flex-shrink-0"
                          style={{ color: row.overall_score > 70 ? "#22c55e" : row.overall_score > 40 ? "#eab308" : "#ef4444" }}>
                          {row.overall_score.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 5: Risk Scoring ──────────────────────────────────────── */}
        <TabsContent value="risk" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-red-400" /> Skill Risk Scoring</div>
                <p className="text-xs text-muted-foreground mt-0.5">Risk = 50% emergency severity weight + 50% false-reassurance/miss weight. Critical scores identify highest-consequence skills that must not fail.</p>
              </div>

              {riskQ.isLoading ? (
                <div className="space-y-1.5">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : riskScores.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No red flag rules found</div>
              ) : (
                <>
                  {/* Summary badges */}
                  <div className="flex gap-2 flex-wrap">
                    {["critical","high","medium","low"].map(level => {
                      const count = riskScores.filter((r: any) => r.risk_level === level).length;
                      return count > 0 ? (
                        <Badge key={level} variant="outline" className={cn("text-[10px] h-5 gap-1", RISK_COLORS[level])}>{count} {level}</Badge>
                      ) : null;
                    })}
                  </div>

                  <div className="space-y-1.5">
                    {riskScores.map((s, i) => (
                      <div key={i} className={cn("flex items-start gap-2 px-3 py-2 rounded border text-xs", RISK_COLORS[s.risk_level] ?? "border-border/40")} data-testid={`risk-row-${i}`}>
                        <ShieldAlert size={11} className="flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">{s.name}</span>
                            <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1 flex-shrink-0", RISK_COLORS[s.risk_level])}>{s.risk_level}</Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{s.complaint} · {s.system} · {s.severity} · action: {s.action}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold tabular-nums text-sm">{(s.risk_score * 100).toFixed(0)}</div>
                          <div className="text-[9px] text-muted-foreground">/ 100</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
