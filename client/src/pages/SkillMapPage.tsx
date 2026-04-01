import "reactflow/dist/style.css";
import { useState } from "react";
import ReactFlow, { MiniMap, Controls, Background, Node, Edge } from "reactflow";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Database, GitBranch, Loader2,
  RefreshCcw, Share2, Lightbulb, ShieldAlert, Zap, Network,
  TrendingUp, Activity,
} from "lucide-react";

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  complaint: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" },
  modifier:  { bg: "#2d1f47", border: "#a855f7", text: "#c4b5fd" },
  skill:     { bg: "#1a3a2a", border: "#22c55e", text: "#86efac" },
  rule:      { bg: "#3b1a1a", border: "#ef4444", text: "#fca5a5" },
};

const COL_X: Record<string, number> = { complaint: 0, modifier: 280, skill: 560, rule: 840 };
const REL_COLORS: Record<string, string> = { uses: "#22c55e", triggers: "#ef4444", depends_on: "#a855f7" };

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

const TYPE_COLORS: Record<string, string> = {
  add_red_flag: "text-red-400",
  add_skill:    "text-blue-400",
  expand_dx:    "text-violet-400",
};

export default function SkillMapPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");

  const statsQ       = useQuery<any>({ queryKey: ["/api/skill-graph/stats"], refetchInterval: 15_000 });
  const nodesQ       = useQuery<any>({ queryKey: ["/api/skill-graph/nodes"], enabled: !!statsQ.data?.built });
  const edgesQ       = useQuery<any>({ queryKey: ["/api/skill-graph/edges"], enabled: !!statsQ.data?.built });
  const coverageQ    = useQuery<any>({ queryKey: ["/api/skill-graph/coverage"], enabled: !!statsQ.data?.built });
  const suggestionsQ = useQuery<any>({ queryKey: ["/api/qa/skill-suggestions"] });

  const buildMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/skill-graph/build", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      ["stats", "nodes", "edges", "coverage"].forEach(k => qc.invalidateQueries({ queryKey: [`/api/skill-graph/${k}`] }));
      toast({ title: "Skill Graph Built", description: `${d.nodeCount} nodes · ${d.edgeCount} edges materialized` });
    },
    onError: (e: any) => toast({ title: "Build failed", description: e.message, variant: "destructive" }),
  });

  const stats: any      = statsQ.data ?? {};
  const allNodes: any[] = nodesQ.data?.nodes ?? [];
  const allEdges: any[] = edgesQ.data?.edges ?? [];
  const coverage: any   = coverageQ.data ?? {};
  const suggestions: any[] = suggestionsQ.data?.suggestions ?? [];

  // Build React Flow data
  const colCount: Record<string, number> = {};
  const filteredNodes = allNodes.filter(n => typeFilter === "all" || n.type === typeFilter);
  const nodeIdSet = new Set(filteredNodes.map(n => n.node_id));

  const flowNodes: Node[] = filteredNodes.map(n => {
    colCount[n.type] = (colCount[n.type] ?? 0) + 1;
    const y = (colCount[n.type] - 1) * 72;
    const c = NODE_COLORS[n.type] ?? { bg: "#1f2937", border: "#6b7280", text: "#d1d5db" };
    const isOrphan = ((n.degree_in ?? 0) + (n.degree_out ?? 0)) === 0;
    return {
      id: n.node_id,
      position: { x: COL_X[n.type] ?? 1120, y },
      data: { label: n.name?.slice(0, 36) ?? n.node_id },
      style: { background: isOrphan ? "#3b0000" : c.bg, border: `2px solid ${isOrphan ? "#dc2626" : c.border}`, color: isOrphan ? "#f87171" : c.text, borderRadius: "5px", fontSize: "10px", padding: "5px 8px", minWidth: "120px" },
    };
  });

  const flowEdges: Edge[] = allEdges
    .filter(e => nodeIdSet.has(e.from_node) && nodeIdSet.has(e.to_node))
    .slice(0, 400)
    .map((e, i) => ({
      id: `e-${i}`, source: e.from_node, target: e.to_node,
      animated: e.relationship === "triggers",
      style: { stroke: REL_COLORS[e.relationship] ?? "#6b7280", strokeWidth: 1 },
    }));

  const isBuilt = !!stats.built;
  const isBuilding = buildMut.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0 flex-wrap" data-testid="skill-map-header">
        <Share2 size={18} className="text-blue-400 flex-shrink-0" />
        <div>
          <div className="font-bold text-base">Skill Map</div>
          <div className="text-xs text-muted-foreground">Live KB dependency graph · coverage evaluator · optimal skill analyzer</div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isBuilt && (
            <>
              <Badge variant="outline" className="text-[10px] h-5 gap-1"><Database size={9} />{stats.nodeCount} nodes</Badge>
              <Badge variant="outline" className="text-[10px] h-5 gap-1"><GitBranch size={9} />{stats.edgeCount} edges</Badge>
              {coverage?.summary?.orphans > 0 && (
                <Badge variant="outline" className="text-[10px] h-5 gap-1 border-red-500/30 text-red-400 bg-red-500/10"><AlertTriangle size={9} />{coverage.summary.orphans} orphans</Badge>
              )}
              {coverage?.summary && (
                <Badge variant="outline" className={cn("text-[10px] h-5 gap-1", coverage.summary.coverage_score >= 90 ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-yellow-500/30 text-yellow-400")}>
                  <CheckCircle2 size={9} />{coverage.summary.coverage_score}% coverage
                </Badge>
              )}
            </>
          )}
          <Button size="sm" variant="outline" disabled={isBuilding} onClick={() => buildMut.mutate()}
            className="h-7 text-xs gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            data-testid="button-build-skill-map">
            {isBuilding ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
            {isBuilt ? "Rebuild" : "Build Graph"}
          </Button>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 min-h-0 divide-x">

        {/* ── Left: Skill Graph Canvas ────────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: "45%" }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 flex-shrink-0">
            <Network size={13} className="text-blue-400" />
            <span className="text-xs font-semibold">Knowledge Dependency Graph</span>
            <div className="ml-auto flex gap-1">
              {["all", "complaint", "modifier", "skill", "rule"].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={cn("text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                    typeFilter === t ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-muted-foreground/20 text-muted-foreground")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 relative" style={{ minHeight: 400 }}>
            {isBuilding ? (
              <div className="flex items-center justify-center h-full gap-3">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <span className="text-sm text-muted-foreground">Building graph…</span>
              </div>
            ) : !isBuilt ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-6">
                <Share2 size={40} className="opacity-10" />
                <div className="text-center">
                  <p className="text-sm font-medium">Graph not yet built</p>
                  <p className="text-xs opacity-60 mt-1">Click "Build Graph" to materialize nodes and edges from the live KB</p>
                </div>
                <Button size="sm" onClick={() => buildMut.mutate()} className="gap-2 mt-1" data-testid="button-build-skill-map-empty">
                  <Zap size={12} /> Build from KB
                </Button>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-left">
                  {Object.entries(NODE_COLORS).map(([type, c]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: c.bg, border: `1.5px solid ${c.border}` }} />
                      <span style={{ color: c.text }}>{type} nodes</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : nodesQ.isLoading || edgesQ.isLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-blue-400" /></div>
            ) : (
              <ReactFlow nodes={flowNodes} edges={flowEdges} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.05} maxZoom={3} data-testid="skill-map-canvas">
                <MiniMap style={{ background: "#0f172a" }} nodeColor={n => { const t = (n.id as string).split(":")[0]; return NODE_COLORS[t]?.border ?? "#6b7280"; }} />
                <Controls />
                <Background color="#1e293b" gap={20} size={1} />
              </ReactFlow>
            )}

            {/* Legend */}
            {isBuilt && (
              <div className="absolute bottom-10 left-2 flex flex-col gap-1 bg-card/90 backdrop-blur border rounded-lg p-1.5 z-10 text-[9px] pointer-events-none">
                {Object.entries(NODE_COLORS).map(([t, c]) => (
                  <div key={t} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
                    <span style={{ color: c.text }}>{t}</span>
                  </div>
                ))}
                <div className="text-muted-foreground/60 border-t mt-0.5 pt-0.5">{flowNodes.length}n · {flowEdges.length}e</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Middle: Coverage Evaluator ──────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: "27%" }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 flex-shrink-0">
            <ShieldAlert size={13} className="text-violet-400" />
            <span className="text-xs font-semibold">Coverage Evaluator</span>
            {coverage?.summary && (
              <Badge variant="outline" className={cn("text-[9px] h-4 px-1 ml-auto", coverage.summary.coverage_score >= 90 ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400")}>
                {coverage.summary.coverage_score}%
              </Badge>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {!isBuilt ? (
                <div className="text-center py-8 text-xs text-muted-foreground/60">Build graph to view coverage</div>
              ) : coverageQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Nodes",   value: coverage?.summary?.total_nodes ?? 0, c: "text-blue-400" },
                      { label: "Edges",   value: coverage?.summary?.total_edges ?? 0, c: "text-violet-400" },
                      { label: "Orphans", value: coverage?.summary?.orphans ?? 0,     c: "text-red-400" },
                      { label: "Score",   value: `${coverage?.summary?.coverage_score ?? 0}%`, c: "text-green-400" },
                    ].map(s => (
                      <Card key={s.label} className="p-2 text-center border-border/40">
                        <div className={`text-lg font-black tabular-nums ${s.c}`} data-testid={`sm-stat-${s.label.toLowerCase()}`}>{s.value}</div>
                        <div className="text-[9px] text-muted-foreground">{s.label}</div>
                      </Card>
                    ))}
                  </div>

                  {/* Issue list */}
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {coverage?.issues?.length ?? 0} Coverage Issues
                  </div>
                  {(coverage?.issues?.length ?? 0) === 0 ? (
                    <div className="flex items-center gap-2 py-4 text-green-400 justify-center text-xs">
                      <CheckCircle2 size={16} /> All nodes connected
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {coverage.issues.map((issue: any, i: number) => (
                        <div key={i} className={cn("p-2 rounded border text-[10px]", PRIORITY_COLORS[issue.severity] ?? "border-muted-foreground/20")} data-testid={`sm-issue-${i}`}>
                          <div className="font-semibold truncate">{issue.name}</div>
                          <div className="opacity-70 leading-snug text-[9px] mt-0.5">{issue.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Modifier matrix */}
                  {coverage?.modifier_matrix?.length > 0 && (
                    <>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-2">Modifier Coverage</div>
                      <div className="space-y-1">
                        {coverage.modifier_matrix.map((row: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-[10px]" data-testid={`sm-modifier-row-${i}`}>
                            <span className="truncate flex-1">{row.complaint_name}</span>
                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden flex-shrink-0">
                              <div className={cn("h-full rounded-full", row.pct >= 80 ? "bg-green-500" : row.pct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                                style={{ width: `${row.pct}%` }} />
                            </div>
                            <span className="w-6 text-right flex-shrink-0" style={{ color: row.pct >= 80 ? "#22c55e" : row.pct >= 50 ? "#eab308" : "#ef4444" }}>{row.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right: Skill Suggestions ─────────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: "28%" }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 flex-shrink-0">
            <Lightbulb size={13} className="text-yellow-400" />
            <span className="text-xs font-semibold">Optimal Skill Analyzer</span>
            {suggestions.length > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto border-yellow-500/30 text-yellow-400">{suggestions.length}</Badge>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {suggestionsQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-14 rounded" />)}</div>
              ) : suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <CheckCircle2 size={24} className="text-green-400" />
                  <p className="text-xs font-medium">No suggestions — KB looks well structured</p>
                </div>
              ) : (
                <>
                  {/* Group by type */}
                  {["critical","high","medium"].map(priority => {
                    const group = suggestions.filter(s => s.priority === priority);
                    if (!group.length) return null;
                    return (
                      <div key={priority}>
                        <div className={cn("text-[10px] font-semibold uppercase tracking-wide mb-1.5", PRIORITY_COLORS[priority])}>{priority} ({group.length})</div>
                        <div className="space-y-1.5">
                          {group.map((s: any, i: number) => (
                            <Card key={i} className={cn("p-2.5 border text-[10px]", PRIORITY_COLORS[s.priority] ?? "border-muted-foreground/20")} data-testid={`sm-suggestion-${i}`}>
                              <div className="flex items-start gap-1.5">
                                <Lightbulb size={10} className={cn("flex-shrink-0 mt-0.5", TYPE_COLORS[s.type] ?? "text-yellow-400")} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold truncate">{s.complaint}</div>
                                  <div className="opacity-80 leading-snug">{s.suggestion}</div>
                                  <div className="opacity-50 text-[9px] mt-0.5">{s.reason}</div>
                                </div>
                                <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 flex-shrink-0", PRIORITY_COLORS[s.priority])}>{s.system}</Badge>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
