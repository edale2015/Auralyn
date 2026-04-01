import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import AdminLayout from "@/components/AdminLayout";
import {
  Activity, AlertTriangle, BarChart2, CheckCircle2, ChevronRight,
  Database, FileText, GitBranch, Loader2, Plus, Shuffle,
  TrendingUp, Trophy, Zap, FlaskConical,
} from "lucide-react";

const STEP_TYPE_COLORS: Record<string, string> = {
  question:       "bg-blue-500/20 border-blue-500/40 text-blue-400",
  red_flag_check: "bg-red-500/20 border-red-500/40 text-red-400",
  diagnosis:      "bg-violet-500/20 border-violet-500/40 text-violet-400",
  treatment:      "bg-green-500/20 border-green-500/40 text-green-400",
};

const STEP_TYPE_ICONS: Record<string, any> = {
  question:       ChevronRight,
  red_flag_check: AlertTriangle,
  diagnosis:      FileText,
  treatment:      CheckCircle2,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

export default function CarePathwayOptimizerPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPathway, setSelectedPathway] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newComplaint, setNewComplaint] = useState("");
  const [expA, setExpA] = useState("");
  const [expB, setExpB] = useState("");
  const [expCases, setExpCases] = useState("200");
  const [lastExp, setLastExp] = useState<any>(null);

  const pathwaysQ    = useQuery<any>({ queryKey: ["/api/optimizer"] });
  const metricsQ     = useQuery<any>({ queryKey: ["/api/optimizer/metrics"] });
  const experimentsQ = useQuery<any>({ queryKey: ["/api/optimizer/experiments"] });
  const suggestionsQ = useQuery<any>({ queryKey: ["/api/optimizer/suggestions"] });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/optimizer/seed", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      ["", "/metrics", "/experiments", "/suggestions"].forEach(suffix =>
        qc.invalidateQueries({ queryKey: [`/api/optimizer${suffix}`] })
      );
      toast({ title: "Pathways Seeded", description: `${d.seeded} demo care pathways loaded` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/optimizer", { name: newName, complaint_id: newComplaint || undefined }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/optimizer"] });
      setNewName(""); setNewComplaint("");
      toast({ title: "Pathway Created" });
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const experimentMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/optimizer/experiment", { pathway_a: expA, pathway_b: expB, n_cases: parseInt(expCases) || 200 }).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/optimizer/experiments"] });
      setLastExp(d);
      toast({ title: "A/B Complete", description: `Winner: ${d.winner_name} (Δ${(d.delta * 100).toFixed(1)}%)` });
    },
    onError: (e: any) => toast({ title: "Experiment failed", description: e.message, variant: "destructive" }),
  });

  const suggestMut = useMutation({
    mutationFn: (pathwayId: string) => apiRequest("POST", "/api/optimizer/suggest", { pathway_id: pathwayId }).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/optimizer/suggestions"] });
      toast({ title: "Suggestions Generated", description: `${d.count} recommendation(s) for this pathway` });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const pathways: any[]    = pathwaysQ.data?.pathways ?? [];
  const metrics: any[]     = metricsQ.data?.metrics ?? [];
  const experiments: any[] = experimentsQ.data?.experiments ?? [];
  const suggestions: any[] = suggestionsQ.data?.suggestions ?? [];
  const selected = pathways.find(p => p.pathway_id === selectedPathway);
  const selectedSteps: any[] = selected?.steps ?? [];
  const seeded = pathways.length > 0;

  return (
    <AdminLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b flex-shrink-0 flex-wrap" data-testid="pathway-optimizer-header">
          <Shuffle size={18} className="text-indigo-400 flex-shrink-0" />
          <div>
            <div className="font-bold text-base">Care Pathway Optimizer</div>
            <div className="text-xs text-muted-foreground">A/B clinical pathway engine · step-by-step viewer · metric comparison · AI suggestions</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {seeded && <Badge variant="outline" className="text-[10px] h-5 gap-1"><Database size={9} />{pathways.length} pathways</Badge>}
            <Button size="sm" variant="outline" disabled={seedMut.isPending} onClick={() => seedMut.mutate()}
              className="h-7 text-xs gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
              data-testid="button-seed-pathways">
              {seedMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />}
              {seeded ? "Re-seed Demos" : "Seed Demo Pathways"}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 divide-x overflow-hidden">

          {/* ── Left: Pathway Library ────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden" style={{ width: "28%" }}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 flex-shrink-0">
              <GitBranch size={13} className="text-indigo-400" />
              <span className="text-xs font-semibold">Pathway Library</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto">{pathways.length}</Badge>
            </div>

            {/* Create new */}
            <div className="p-2.5 border-b space-y-1.5 flex-shrink-0">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Pathway name…" className="h-7 text-xs" data-testid="input-pathway-name" />
              <Input value={newComplaint} onChange={e => setNewComplaint(e.target.value)} placeholder="Complaint ID (optional)" className="h-7 text-xs" data-testid="input-pathway-complaint" />
              <Button size="sm" className="w-full h-7 text-xs gap-1.5" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()} data-testid="button-create-pathway">
                {createMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create Pathway
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {pathwaysQ.isLoading ? (
                  <div className="space-y-1.5">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-16 rounded" />)}</div>
                ) : pathways.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <GitBranch size={28} className="mx-auto mb-2 opacity-10" />
                    <p className="text-xs">No pathways yet</p>
                    <p className="text-[10px] opacity-60 mt-0.5">Seed demo pathways to start</p>
                  </div>
                ) : pathways.map(p => {
                  const isSelected = selectedPathway === p.pathway_id;
                  return (
                    <button key={p.pathway_id} onClick={() => setSelectedPathway(p.pathway_id)}
                      className={cn("w-full text-left p-2.5 rounded border text-xs transition-colors", isSelected ? "border-indigo-500/50 bg-indigo-500/10" : "border-border/40 hover:border-border/70")}
                      data-testid={`pathway-card-${p.pathway_id}`}>
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="text-muted-foreground text-[10px] mt-0.5">{p.complaint_id ?? "general"} · {(p.steps as any[])?.length ?? 0} steps</div>
                      {p.accuracy != null && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(p.accuracy ?? 0) * 100}%` }} />
                          </div>
                          <span className="text-indigo-400 tabular-nums text-[10px]">{((p.accuracy ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {p.open_suggestions > 0 && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-yellow-500/30 text-yellow-400">{p.open_suggestions} suggestions</Badge>}
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-green-500/20 text-green-400">{p.status}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ── Middle: Steps Viewer + A/B Engine ───────────────────────── */}
          <div className="flex flex-col overflow-hidden" style={{ width: "42%" }}>
            <Tabs defaultValue="steps" className="flex flex-col flex-1 min-h-0">
              <div className="px-3 pt-1.5 border-b flex-shrink-0">
                <TabsList className="h-7">
                  <TabsTrigger value="steps"   className="text-xs h-6 gap-1" data-testid="cpo-tab-steps"><FileText size={10} />Steps</TabsTrigger>
                  <TabsTrigger value="ab"      className="text-xs h-6 gap-1" data-testid="cpo-tab-ab"><FlaskConical size={10} />A/B Engine</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs h-6 gap-1" data-testid="cpo-tab-history"><Activity size={10} />History</TabsTrigger>
                </TabsList>
              </div>

              {/* Steps Viewer */}
              <TabsContent value="steps" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0 bg-muted/5">
                  <span className="text-xs font-medium truncate flex-1">{selected?.name ?? "Select a pathway →"}</span>
                  {selected && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 gap-1 text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => suggestMut.mutate(selected.pathway_id)}
                      disabled={suggestMut.isPending}
                      data-testid="button-suggest-pathway">
                      {suggestMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />} Generate Suggestions
                    </Button>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {!selected ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-xs gap-2">
                        <GitBranch size={28} className="opacity-10" />
                        Select a pathway from the library to view its steps
                      </div>
                    ) : selectedSteps.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">No steps defined for this pathway</div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-[18px] top-4 bottom-4 w-0.5 bg-border/20" />
                        <div className="space-y-4">
                          {selectedSteps.map((step: any, i: number) => {
                            const Icon = STEP_TYPE_ICONS[step.type] ?? ChevronRight;
                            return (
                              <div key={i} className="flex items-start gap-3 relative" data-testid={`pathway-step-${i}`}>
                                <div className={cn("w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10", STEP_TYPE_COLORS[step.type] ?? "bg-muted border-muted-foreground/30 text-muted-foreground")}>
                                  <Icon size={14} />
                                </div>
                                <div className="flex-1 min-w-0 pt-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold">{step.label}</span>
                                    <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", STEP_TYPE_COLORS[step.type] ?? "")}>{step.type}</Badge>
                                  </div>
                                  {step.skill_id && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">skill: {step.skill_id}</div>}
                                </div>
                                <div className="text-[10px] text-muted-foreground/50 flex-shrink-0 pt-2">#{step.order}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Metrics */}
                    {selected && selected.accuracy != null && (
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        {[
                          { label: "Accuracy",     val: `${((selected.accuracy ?? 0) * 100).toFixed(1)}%`,           c: "text-indigo-400" },
                          { label: "RF Catch",     val: `${((selected.red_flag_catch_rate ?? 0) * 100).toFixed(1)}%`, c: "text-red-400" },
                          { label: "Duration",     val: `${selected.avg_duration_s ?? 0}s`,                           c: "text-blue-400" },
                          { label: "Satisfaction", val: (selected.patient_satisfaction ?? 0).toFixed(1),              c: "text-green-400" },
                        ].map(m => (
                          <Card key={m.label} className="p-2 text-center border-border/40">
                            <div className={`text-base font-black tabular-nums ${m.c}`} data-testid={`cpo-metric-${m.label.toLowerCase()}`}>{m.val}</div>
                            <div className="text-[9px] text-muted-foreground">{m.label}</div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* A/B Experiment Engine */}
              <TabsContent value="ab" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2 mb-0.5"><FlaskConical size={14} className="text-violet-400" /> A/B Experiment Engine</div>
                      <p className="text-xs text-muted-foreground">Compare two pathways on a simulated patient cohort. Uses each pathway's accuracy baseline ± noise to determine the winner.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Pathway A</label>
                      <select className="w-full h-8 px-2 text-xs rounded border border-input bg-background" value={expA} onChange={e => setExpA(e.target.value)} data-testid="select-pathway-a">
                        <option value="">— select pathway A —</option>
                        {pathways.map(p => <option key={p.pathway_id} value={p.pathway_id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Pathway B</label>
                      <select className="w-full h-8 px-2 text-xs rounded border border-input bg-background" value={expB} onChange={e => setExpB(e.target.value)} data-testid="select-pathway-b">
                        <option value="">— select pathway B —</option>
                        {pathways.map(p => <option key={p.pathway_id} value={p.pathway_id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Simulated Cases</label>
                      <Input type="number" min="50" max="2000" value={expCases} onChange={e => setExpCases(e.target.value)} className="h-7 text-xs" data-testid="input-exp-cases" />
                    </div>

                    <Button className="w-full gap-2" disabled={!expA || !expB || expA === expB || experimentMut.isPending} onClick={() => experimentMut.mutate()} data-testid="button-run-experiment">
                      {experimentMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                      {experimentMut.isPending ? "Running Experiment…" : "Run A/B Comparison"}
                    </Button>

                    {lastExp && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                          <Trophy size={18} className="text-yellow-400 flex-shrink-0" />
                          <div>
                            <div className="text-sm font-semibold text-yellow-400">Winner: {lastExp.winner_name}</div>
                            <div className="text-[10px] text-muted-foreground">Δ {(lastExp.delta * 100).toFixed(1)}% accuracy · {lastExp.n_cases} simulated cases</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[lastExp.pathway_a, lastExp.pathway_b].map((p: any) => (
                            <div key={p.id} className={cn("p-3 rounded border text-xs", lastExp.winner === p.id ? "border-green-500/30 bg-green-500/5" : "border-border/40")}>
                              <div className="font-medium truncate text-[10px] text-muted-foreground">{p.name}</div>
                              <div className={cn("text-2xl font-black tabular-nums mt-1", lastExp.winner === p.id ? "text-green-400" : "text-muted-foreground")}>
                                {(p.accuracy * 100).toFixed(1)}%
                              </div>
                              {lastExp.winner === p.id && <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><CheckCircle2 size={10} /> Winner</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Experiment History */}
              <TabsContent value="history" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-1.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{experiments.length} Past Experiments</div>
                    {experimentsQ.isLoading ? (
                      <div className="space-y-1.5">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
                    ) : experiments.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">No experiments yet — run an A/B comparison first</div>
                    ) : experiments.map((e, i) => (
                      <div key={i} className="p-2.5 rounded border border-border/40 text-xs" data-testid={`experiment-row-${i}`}>
                        <div className="flex items-center gap-2">
                          <Trophy size={11} className="text-yellow-400 flex-shrink-0" />
                          <span className="font-medium text-[10px] truncate flex-1">{e.pathway_a} vs {e.pathway_b}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-green-500/30 text-green-400">{e.status}</Badge>
                        </div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          A: {((e.result_a ?? 0) * 100).toFixed(1)}% · B: {((e.result_b ?? 0) * 100).toFixed(1)}% · Δ{(Math.abs((e.result_a ?? 0) - (e.result_b ?? 0)) * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Right: Metrics + Suggestions ─────────────────────────────── */}
          <div className="flex flex-col overflow-hidden" style={{ width: "30%" }}>
            <Tabs defaultValue="metrics" className="flex flex-col flex-1 min-h-0">
              <div className="px-3 pt-1.5 border-b flex-shrink-0">
                <TabsList className="h-7">
                  <TabsTrigger value="metrics"     className="text-xs h-6 gap-1" data-testid="cpo-tab-metrics"><BarChart2 size={10} />Metrics</TabsTrigger>
                  <TabsTrigger value="suggestions" className="text-xs h-6 gap-1" data-testid="cpo-tab-suggestions"><Zap size={10} />Suggestions</TabsTrigger>
                </TabsList>
              </div>

              {/* Metrics Comparison */}
              <TabsContent value="metrics" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{metrics.length} Pathways Ranked by Accuracy</div>
                    {metricsQ.isLoading ? (
                      <div className="space-y-1.5">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-16 rounded" />)}</div>
                    ) : metrics.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">Seed pathways to see metrics</div>
                    ) : metrics.map((m, i) => (
                      <div key={i}
                        className={cn("p-2.5 rounded border text-xs transition-colors cursor-pointer", m.pathway_id === selectedPathway ? "border-indigo-500/40 bg-indigo-500/5" : "border-border/40 hover:border-border/70")}
                        onClick={() => setSelectedPathway(m.pathway_id)}
                        data-testid={`metric-row-${i}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm flex-shrink-0">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</span>
                          <span className="font-medium truncate text-[10px]">{m.pathway_name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[10px] mb-1.5">
                          <span>Acc <span className="text-indigo-400 tabular-nums font-bold">{((m.accuracy ?? 0) * 100).toFixed(1)}%</span></span>
                          <span>RF <span className="text-red-400 tabular-nums">{((m.red_flag_catch_rate ?? 0) * 100).toFixed(1)}%</span></span>
                          <span>Time <span className="text-blue-400 tabular-nums">{m.avg_duration_s ?? 0}s</span></span>
                          <span>Sat <span className="text-green-400 tabular-nums">{(m.patient_satisfaction ?? 0).toFixed(1)}</span></span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(m.accuracy ?? 0) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Suggestions */}
              <TabsContent value="suggestions" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-1.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{suggestions.length} AI Suggestions</div>
                    {suggestionsQ.isLoading ? (
                      <div className="space-y-1.5">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
                    ) : suggestions.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        <Zap size={24} className="mx-auto mb-2 opacity-10" />
                        <p>Select a pathway and click "Generate Suggestions"</p>
                      </div>
                    ) : suggestions.map((s, i) => (
                      <div key={i} className={cn("p-2.5 rounded border text-xs", PRIORITY_COLORS[s.priority] ?? "border-border/40")} data-testid={`suggestion-row-${i}`}>
                        <div className="flex items-start gap-1.5">
                          <Zap size={10} className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium leading-snug">{s.suggestion}</div>
                            <div className="text-[9px] opacity-60 mt-0.5 leading-snug">{s.reason}</div>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className={cn("text-[8px] h-3 px-1", PRIORITY_COLORS[s.priority])}>{s.priority}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
