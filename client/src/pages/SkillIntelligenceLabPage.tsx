import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Database, FlaskConical, GitBranch,
  Loader2, Merge, Scissors, Sparkles, TrendingUp, Zap, BarChart2,
  ChevronRight, Code2, Layers,
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

export default function SkillIntelligenceLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [guidelineText, setGuidelineText] = useState("");

  // Queries
  const generatedQ    = useQuery<any>({ queryKey: ["/api/qa/generated-skills"] });
  const pruneQ        = useQuery<any>({ queryKey: ["/api/qa/prune-skills"] });
  const importanceQ   = useQuery<any>({ queryKey: ["/api/qa/skill-importance"] });
  const mergeQ        = useQuery<any>({ queryKey: ["/api/qa/merge-candidates"] });
  const mergedQ       = useQuery<any>({ queryKey: ["/api/qa/merged-skills"] });
  const depOptQ       = useQuery<any>({ queryKey: ["/api/qa/dependency-optimizer"] });
  const mvssQ         = useQuery<any>({ queryKey: ["/api/qa/mvss"] });

  // Mutations
  const generateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/qa/generate-skills", { text: guidelineText }).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/qa/generated-skills"] });
      toast({ title: "Skills Generated", description: `${d.count} skill modules extracted from guideline text` });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const computeImportanceMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/qa/skill-importance/compute", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/qa/skill-importance"] });
      toast({ title: "Importance Computed", description: `${d.count} skills scored` });
    },
    onError: (e: any) => toast({ title: "Compute failed", description: e.message, variant: "destructive" }),
  });

  const mergeScanMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/qa/merge-candidates/compute", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/qa/merge-candidates"] });
      toast({ title: "Scan Complete", description: `${d.count} merge candidates found` });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });

  const applyMergeMut = useMutation({
    mutationFn: (pair: { skill_a: string; skill_b: string }) => apiRequest("POST", "/api/qa/merge-apply", { skillA: pair.skill_a, skillB: pair.skill_b }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/qa/merged-skills"] });
      toast({ title: "Merge Applied", description: "Skill pair merged and saved" });
    },
    onError: (e: any) => toast({ title: "Merge failed", description: e.message, variant: "destructive" }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/qa/generated-skills/${id}`, { status }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/qa/generated-skills"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const generated: any[]  = generatedQ.data?.skills ?? [];
  const prunable: any[]   = pruneQ.data?.prunable ?? [];
  const scores: any[]     = importanceQ.data?.scores ?? [];
  const mergePairs: any[] = mergeQ.data?.pairs ?? [];
  const mergedList: any[] = mergedQ.data?.merged ?? [];
  const depSuggs: any[]   = depOptQ.data?.suggestions ?? [];
  const mvss: any[]       = mvssQ.data?.mvss ?? [];

  const hasImportance = importanceQ.data?.computed && scores.length > 0;
  const hasMerge      = mergeQ.data?.computed && mergePairs.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0" data-testid="skill-intelligence-header">
        <FlaskConical size={18} className="text-violet-400" />
        <div>
          <div className="font-bold text-base">Skill Intelligence Lab</div>
          <div className="text-xs text-muted-foreground">AI skill generation · pruning engine · importance scoring · merge candidates · dependency optimizer · MVSS</div>
        </div>
      </div>

      <Tabs defaultValue="generation" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-2 border-b flex-shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="generation" className="gap-1.5 text-xs h-7" data-testid="sil-tab-generation"><Sparkles size={11} />AI Generation</TabsTrigger>
            <TabsTrigger value="pruning"    className="gap-1.5 text-xs h-7" data-testid="sil-tab-pruning"><Scissors size={11} />Pruning</TabsTrigger>
            <TabsTrigger value="importance" className="gap-1.5 text-xs h-7" data-testid="sil-tab-importance"><TrendingUp size={11} />Importance</TabsTrigger>
            <TabsTrigger value="merge"      className="gap-1.5 text-xs h-7" data-testid="sil-tab-merge"><Merge size={11} />Merge</TabsTrigger>
            <TabsTrigger value="dependency" className="gap-1.5 text-xs h-7" data-testid="sil-tab-dependency"><Layers size={11} />Dependency</TabsTrigger>
            <TabsTrigger value="mvss"       className="gap-1.5 text-xs h-7" data-testid="sil-tab-mvss"><Zap size={11} />Min Viable Set</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab 1: AI Skill Generation ─────────────────────────────────── */}
        <TabsContent value="generation" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex flex-1 min-h-0 divide-x">
            {/* Input panel */}
            <div className="flex flex-col p-4 gap-3" style={{ width: "42%" }}>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-400" />
                <span className="text-sm font-semibold">Guideline → Skill Generator</span>
              </div>
              <p className="text-xs text-muted-foreground">Paste clinical guideline text below. GPT-4o will extract structured skill modules with triggers, actions, and categories.</p>
              <Textarea
                value={guidelineText}
                onChange={e => setGuidelineText(e.target.value)}
                placeholder="Paste clinical guideline text here…&#10;e.g. 'IDSA recommends throat culture for patients with ≥2 Centor criteria. Empiric penicillin if rapid antigen positive...' "
                className="flex-1 min-h-0 text-xs font-mono resize-none"
                style={{ minHeight: 200 }}
                data-testid="input-guideline-text"
              />
              <Button className="gap-2" disabled={!guidelineText.trim() || generateMut.isPending} onClick={() => generateMut.mutate()} data-testid="button-generate-skills">
                {generateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generateMut.isPending ? "Generating skills…" : "Generate Skill Modules"}
              </Button>
              <div className="text-[10px] text-muted-foreground/60 mt-1">Skills are saved with status "pending" for review. Approve or reject each in the list →</div>
            </div>

            {/* Generated skills list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{generated.length} Generated Skills</div>
                  <div className="flex gap-1.5">
                    {["all","pending","approved","rejected"].map(s => (
                      <Badge key={s} variant="outline" className="text-[9px] h-4 px-1">{generated.filter(g => s === "all" || g.status === s).length} {s}</Badge>
                    ))}
                  </div>
                </div>
                {generatedQ.isLoading ? (
                  <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-16 rounded" />)}</div>
                ) : generated.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles size={32} className="mx-auto mb-3 opacity-10" />
                    <p className="text-sm">No generated skills yet</p>
                    <p className="text-xs opacity-60 mt-1">Paste guideline text and click Generate</p>
                  </div>
                ) : generated.map((g, i) => (
                  <Card key={i} className={cn("p-3 border text-xs", g.status === "approved" ? "border-green-500/30 bg-green-500/5" : g.status === "rejected" ? "border-red-500/20 opacity-50" : "border-border/50")} data-testid={`generated-skill-${i}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{g.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{g.complaint} · source: {g.source} · confidence: {Math.round((g.confidence ?? 0.9) * 100)}%</div>
                        {g.logic?.category && <Badge variant="outline" className="text-[9px] h-3.5 px-1 mt-1">{g.logic.category}</Badge>}
                      </div>
                      {g.status === "pending" && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => updateStatusMut.mutate({ id: g.id, status: "approved" })} className="text-green-400 hover:text-green-300 p-1" title="Approve"><CheckCircle2 size={13} /></button>
                          <button onClick={() => updateStatusMut.mutate({ id: g.id, status: "rejected" })} className="text-red-400 hover:text-red-300 p-1" title="Reject"><AlertTriangle size={13} /></button>
                        </div>
                      )}
                      {g.status === "approved" && <CheckCircle2 size={13} className="text-green-400 flex-shrink-0 mt-0.5" />}
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ── Tab 2: Pruning Engine ──────────────────────────────────────── */}
        <TabsContent value="pruning" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                <Scissors size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-yellow-400">Pruning Engine</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Identifies KB questions with low usage count AND no linked diagnoses — candidates for removal or consolidation.</p>
                </div>
                <div className="ml-auto flex-shrink-0">
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">{pruneQ.data?.count ?? 0} prunable</Badge>
                </div>
              </div>

              {pruneQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : prunable.length === 0 ? (
                <div className="flex items-center gap-2 justify-center py-10 text-green-400">
                  <CheckCircle2 size={20} /><span className="text-sm font-medium">No prunable skills found — KB is well connected</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {prunable.map((p, i) => (
                    <Card key={i} className="p-3 border border-yellow-500/20 bg-yellow-500/5 text-xs" data-testid={`prune-skill-${i}`}>
                      <div className="flex items-start gap-2">
                        <Scissors size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[10px] text-yellow-400/80">{p.skill_id}</div>
                          <div className="font-medium truncate mt-0.5">{p.name}</div>
                          <div className="text-muted-foreground text-[10px]">{p.complaint} · {p.system} · usage: {p.usage_count} · impact: {p.outcome_impact?.toFixed(3) ?? 0}</div>
                          <div className="text-yellow-400/70 text-[10px] mt-0.5">⚠ {p.reason}</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 3: Skill Importance ────────────────────────────────────── */}
        <TabsContent value="importance" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-green-400" /> Skill Importance Scores</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Combined score = 40% impact + 30% safety + 20% frequency + 10% linked diagnoses. Click Compute to refresh.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-green-500/30 text-green-400" disabled={computeImportanceMut.isPending} onClick={() => computeImportanceMut.mutate()} data-testid="button-compute-importance">
                  {computeImportanceMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <BarChart2 size={11} />}
                  Compute
                </Button>
              </div>

              {!hasImportance && !importanceQ.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp size={32} className="mx-auto mb-3 opacity-10" />
                  <p className="text-sm">No importance scores yet</p>
                  <p className="text-xs opacity-60 mt-1">Click Compute to score all KB questions</p>
                </div>
              ) : importanceQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : (
                <div className="space-y-1.5">
                  {scores.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded border border-border/30 text-xs hover:border-border/60 transition-colors" data-testid={`importance-row-${i}`}>
                      <div className="w-5 text-right text-[10px] text-muted-foreground/60 flex-shrink-0">#{i+1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.name?.slice(0, 55) ?? s.skill_id}</div>
                        <div className="text-[10px] text-muted-foreground">{s.complaint_label}</div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 items-center">
                        <div className="text-[10px] text-muted-foreground">impact <span className="text-blue-400">{(s.impact_score ?? 0).toFixed(2)}</span></div>
                        <div className="text-[10px] text-muted-foreground">safety <span className="text-orange-400">{(s.safety_score ?? 0).toFixed(2)}</span></div>
                        <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((s.combined_score ?? 0) * 100, 100)}%` }} />
                        </div>
                        <div className="w-8 text-right font-bold tabular-nums text-green-400">{((s.combined_score ?? 0) * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 4: Skill Merging ──────────────────────────────────────── */}
        <TabsContent value="merge" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2"><Merge size={14} className="text-blue-400" /> Automatic Skill Merging</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Finds KB questions with overlapping category + prompt tokens (Jaccard similarity {">"} 20%). Apply to merge into a canonical skill.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-blue-500/30 text-blue-400" disabled={mergeScanMut.isPending} onClick={() => mergeScanMut.mutate()} data-testid="button-scan-merges">
                  {mergeScanMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Merge size={11} />}
                  Scan for Candidates
                </Button>
              </div>

              {mergedList.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Applied Merges ({mergedList.length})</div>
                  <div className="space-y-1">
                    {mergedList.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-green-500/20 bg-green-500/5 text-xs">
                        <CheckCircle2 size={11} className="text-green-400 flex-shrink-0" />
                        <span className="font-mono text-[10px] text-green-400">{m.new_skill_id}</span>
                        <span className="text-muted-foreground text-[10px]">← {m.original_skills?.join(" + ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hasMerge && !mergeQ.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Merge size={32} className="mx-auto mb-3 opacity-10" />
                  <p className="text-sm">{mergeQ.data?.computed === false ? "No merge candidates" : "Scan not run yet"}</p>
                  <p className="text-xs opacity-60 mt-1">Click "Scan for Candidates" to find overlapping questions</p>
                </div>
              ) : mergeQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : (
                <div className="space-y-1.5">
                  {mergePairs.map((p, i) => (
                    <Card key={i} className="p-2.5 border border-blue-500/20 text-xs" data-testid={`merge-candidate-${i}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-blue-400">{p.skill_a}</span>
                            <Merge size={9} className="text-muted-foreground" />
                            <span className="font-mono text-[10px] text-blue-400">{p.skill_b}</span>
                          </div>
                          <div className="text-muted-foreground text-[10px] mt-0.5">{p.complaint} · category: {p.category}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/30 text-blue-400">{(p.similarity * 100).toFixed(0)}% similar</Badge>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-green-400 hover:bg-green-500/10"
                            onClick={() => applyMergeMut.mutate({ skill_a: p.skill_a, skill_b: p.skill_b })}
                            disabled={applyMergeMut.isPending}
                            data-testid={`button-merge-apply-${i}`}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 5: Dependency Optimizer ───────────────────────────────── */}
        <TabsContent value="dependency" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
                <Layers size={16} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-violet-400">Dependency Optimizer</div>
                  <p className="text-xs text-muted-foreground mt-0.5">Finds KB questions that are optional, have no conditional logic, and no linked diagnoses — these may need dependencies added to be effective.</p>
                </div>
                <Badge variant="outline" className="ml-auto flex-shrink-0 border-violet-500/30 text-violet-400">{depOptQ.data?.count ?? 0} suggestions</Badge>
              </div>

              {depOptQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : depSuggs.length === 0 ? (
                <div className="flex items-center gap-2 justify-center py-10 text-green-400">
                  <CheckCircle2 size={20} /><span className="text-sm">No dependency issues detected</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {depSuggs.map((s, i) => (
                    <Card key={i} className="p-2.5 border border-violet-500/20 text-xs" data-testid={`dep-suggestion-${i}`}>
                      <div className="flex items-start gap-2">
                        <ChevronRight size={11} className="text-violet-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-violet-400">{s.skill}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="truncate text-muted-foreground">{s.name}</span>
                          </div>
                          <div className="text-muted-foreground text-[10px] mt-0.5">{s.complaint}</div>
                          <div className="text-violet-400/80 text-[10px] mt-0.5 font-medium">{s.suggestion}</div>
                          <div className="text-muted-foreground text-[9px]">{s.reason}</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Tab 6: Minimum Viable Skill Set ───────────────────────────── */}
        <TabsContent value="mvss" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <Zap size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-green-400">Minimum Viable Skill Set (MVSS)</div>
                  <p className="text-xs text-muted-foreground mt-0.5">For each complaint: the single highest-priority question + the first red flag rule = the irreducible triage core. Use this to validate all complaints have at least a minimum viable skill set.</p>
                </div>
              </div>

              {mvssQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-14 rounded" />)}</div>
              ) : mvss.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No data</div>
              ) : (
                <div className="space-y-1.5">
                  {mvss.map((m, i) => {
                    const hasQ = !!m.mvs_question;
                    const hasRF = !!m.mvs_red_flag;
                    const complete = hasQ && hasRF;
                    return (
                      <div key={i} className={cn("flex items-start gap-3 px-3 py-2.5 rounded border text-xs", complete ? "border-border/40" : "border-red-500/30 bg-red-500/5")} data-testid={`mvss-row-${i}`}>
                        <div className={cn("flex-shrink-0 mt-0.5", complete ? "text-green-400" : "text-red-400")}>
                          {complete ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{m.complaint}</span>
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{m.system}</Badge>
                            <span className="text-muted-foreground text-[10px] ml-auto">{m.skill_density} questions</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 mt-1 text-[10px]">
                            <div className={hasQ ? "text-blue-400" : "text-red-400"}>
                              {hasQ ? `✓ Q: ${m.mvs_question}` : "✗ No questions found"}
                            </div>
                            <div className={hasRF ? "text-orange-400" : "text-red-400"}>
                              {hasRF ? `✓ RF: ${m.mvs_red_flag}` : "✗ No red flags found"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
