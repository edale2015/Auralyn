import "reactflow/dist/style.css";
import { useState } from "react";
import ReactFlow, { MiniMap, Controls, Background, Node, Edge } from "reactflow";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Database, GitBranch,
  Loader2, RefreshCcw, ShieldAlert, Zap,
} from "lucide-react";

// ── Node type colors ─────────────────────────────────────────────────────────
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  complaint: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" },
  modifier:  { bg: "#2d1f47", border: "#a855f7", text: "#c4b5fd" },
  skill:     { bg: "#1a3a2a", border: "#22c55e", text: "#86efac" },
  rule:      { bg: "#3b1a1a", border: "#ef4444", text: "#fca5a5" },
};

const COL_X: Record<string, number> = {
  complaint: 0,
  modifier:  320,
  skill:     640,
  rule:      960,
};

const REL_COLORS: Record<string, string> = {
  uses:       "#22c55e",
  triggers:   "#ef4444",
  depends_on: "#a855f7",
  handles:    "#3b82f6",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

// ── Build React Flow nodes+edges from API data ────────────────────────────────
function buildFlowData(
  apiNodes: any[],
  apiEdges: any[],
  typeFilter: string,
  systemFilter: string,
): { nodes: Node[]; edges: Edge[] } {
  const filtered = apiNodes.filter(n => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (systemFilter !== "all" && n.system && n.system !== systemFilter) return false;
    return true;
  });
  const nodeIdSet = new Set(filtered.map(n => n.node_id));
  const colCount: Record<string, number> = {};

  const nodes: Node[] = filtered.map(n => {
    const col = COL_X[n.type] ?? 1280;
    colCount[n.type] = (colCount[n.type] ?? 0) + 1;
    const y = (colCount[n.type] - 1) * 82;
    const colors = NODE_COLORS[n.type] ?? { bg: "#1f2937", border: "#6b7280", text: "#d1d5db" };
    const totalDegree = (n.degree_in ?? 0) + (n.degree_out ?? 0);
    const isOrphan = totalDegree === 0;
    return {
      id: n.node_id,
      position: { x: col, y },
      data: { label: n.name?.slice(0, 40) ?? n.node_id },
      style: {
        background: isOrphan ? "#3b0000" : colors.bg,
        border: `2px solid ${isOrphan ? "#dc2626" : colors.border}`,
        color: isOrphan ? "#f87171" : colors.text,
        borderRadius: "6px",
        fontSize: "11px",
        padding: "6px 10px",
        minWidth: "150px",
        maxWidth: "220px",
        whiteSpace: "normal" as any,
        wordBreak: "break-word" as any,
        boxShadow: isOrphan ? "0 0 8px #dc2626" : undefined,
      },
    };
  });

  const flowEdges: Edge[] = apiEdges
    .filter(e => nodeIdSet.has(e.from_node) && nodeIdSet.has(e.to_node))
    .slice(0, 500)
    .map((e, i) => ({
      id: `e-${i}`,
      source: e.from_node,
      target: e.to_node,
      label: e.relationship,
      animated: e.relationship === "triggers",
      style: { stroke: REL_COLORS[e.relationship] ?? "#6b7280", strokeWidth: 1.2 },
      labelStyle: { fontSize: "9px", fill: REL_COLORS[e.relationship] ?? "#6b7280" },
      labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 },
    }));

  return { nodes, edges: flowEdges };
}

// ─── Main exported panel ─────────────────────────────────────────────────────
export default function SkillGraphPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [systemFilter, setSystemFilter] = useState("all");

  const statsQ = useQuery<any>({ queryKey: ["/api/skill-graph/stats"], refetchInterval: 20_000 });
  const nodesQ = useQuery<any>({ queryKey: ["/api/skill-graph/nodes"], enabled: !!statsQ.data?.built });
  const edgesQ = useQuery<any>({ queryKey: ["/api/skill-graph/edges"], enabled: !!statsQ.data?.built });
  const coverQ = useQuery<any>({ queryKey: ["/api/skill-graph/coverage"], enabled: !!statsQ.data?.built });

  const buildMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/skill-graph/build", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      ["stats", "nodes", "edges", "coverage"].forEach(k =>
        qc.invalidateQueries({ queryKey: [`/api/skill-graph/${k}`] }),
      );
      toast({ title: "Skill Graph Built", description: `${d.nodeCount} nodes · ${d.edgeCount} edges materialized` });
    },
    onError: (e: any) => toast({ title: "Build failed", description: e.message, variant: "destructive" }),
  });

  const stats: any    = statsQ.data ?? {};
  const allNodes: any[] = nodesQ.data?.nodes ?? [];
  const allEdges: any[] = edgesQ.data?.edges ?? [];
  const coverage: any = coverQ.data ?? {};

  const systems = ["all", ...Array.from(new Set(allNodes.map((n: any) => n.system).filter(Boolean))).sort() as string[]];
  const { nodes: flowNodes, edges: flowEdges } = buildFlowData(allNodes, allEdges, typeFilter, systemFilter);

  const isBuilding = buildMut.isPending;
  const isBuilt    = !!stats?.built;

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3 p-3 border-b flex-shrink-0 flex-wrap" data-testid="skill-graph-header">
      <GitBranch size={16} className="text-violet-400 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-bold">Skill Graph</div>
        <div className="text-[11px] text-muted-foreground">KB → persistent graph · coverage evaluator · React Flow canvas</div>
      </div>
      <div className="ml-auto flex gap-2 flex-wrap">
        {isBuilt && (
          <>
            <Badge variant="outline" className="text-[10px] h-5 gap-1"><Database size={9} />{stats.nodeCount} nodes</Badge>
            <Badge variant="outline" className="text-[10px] h-5 gap-1"><GitBranch size={9} />{stats.edgeCount} edges</Badge>
            {coverage?.summary?.orphans > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-red-500/30 text-red-400 bg-red-500/10">
                <AlertTriangle size={9} />{coverage.summary.orphans} orphans
              </Badge>
            )}
            {coverage?.summary && (
              <Badge variant="outline" className={cn("text-[10px] h-5 gap-1",
                coverage.summary.coverage_score >= 90 ? "border-green-500/30 text-green-400 bg-green-500/10"
                : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10")}>
                <CheckCircle2 size={9} />{coverage.summary.coverage_score}% covered
              </Badge>
            )}
          </>
        )}
        <Button size="sm" variant="outline"
          className="h-7 text-xs gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
          disabled={isBuilding} onClick={() => buildMut.mutate()}
          data-testid="button-build-skill-graph">
          {isBuilding ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
          {isBuilt ? "Rebuild Graph" : "Build Graph from KB"}
        </Button>
      </div>
    </div>
  );

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!isBuilt && !isBuilding) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground p-8">
          <GitBranch size={52} className="opacity-10" />
          <div className="text-center max-w-xs">
            <p className="text-sm font-medium mb-1">No graph materialized yet</p>
            <p className="text-xs opacity-60">Click below to scan all live KB tables (complaints, modifiers, questions, red flags, diagnosis rules) and persist nodes + edges into the database.</p>
          </div>
          <Button className="gap-2 mt-2" onClick={() => buildMut.mutate()} data-testid="button-build-skill-graph-empty">
            <Zap size={14} /> Build Skill Graph from KB
          </Button>
          <div className="flex flex-col gap-1 text-[11px] text-muted-foreground/60 mt-2">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: "#3b82f6" }} /> <span>complaint nodes — from kb_complaints</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: "#a855f7" }} /> <span>modifier nodes — from kb_modifiers</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: "#22c55e" }} /> <span>skill nodes — from kb_questions</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: "#ef4444" }} /> <span>rule nodes — from kb_red_flag_rules + kb_diagnosis_rules</span></div>
          </div>
        </div>
      </div>
    );
  }

  // ── Building ──────────────────────────────────────────────────────────────────
  if (isBuilding) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Loader2 size={32} className="animate-spin text-violet-400" />
          <p className="text-sm text-muted-foreground">Scanning KB tables and materializing graph…</p>
        </div>
      </div>
    );
  }

  // ── Filters bar ────────────────────────────────────────────────────────────
  const filterBar = (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b flex-shrink-0 flex-wrap bg-muted/10" data-testid="skill-graph-filters">
      <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide mr-1">Filter:</span>
      {["all", "complaint", "modifier", "skill", "rule"].map(t => (
        <button key={t} onClick={() => setTypeFilter(t)}
          className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors",
            typeFilter === t ? "bg-violet-500/20 border-violet-500/40 text-violet-400" : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40")}>
          {t}
        </button>
      ))}
      <span className="text-muted-foreground/30">·</span>
      {systems.slice(0, 10).map(s => (
        <button key={s} onClick={() => setSystemFilter(s)}
          className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors",
            systemFilter === s ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40")}>
          {s}
        </button>
      ))}
    </div>
  );

  // ── Main content ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {header}
      <Tabs defaultValue="canvas" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0">
          <TabsList className="h-7">
            <TabsTrigger value="canvas"   className="h-6 text-[11px]" data-testid="tab-sg-canvas">Canvas</TabsTrigger>
            <TabsTrigger value="coverage" className="h-6 text-[11px]" data-testid="tab-sg-coverage">Coverage Evaluator</TabsTrigger>
            <TabsTrigger value="matrix"   className="h-6 text-[11px]" data-testid="tab-sg-matrix">Modifier Matrix</TabsTrigger>
            <TabsTrigger value="nodes"    className="h-6 text-[11px]" data-testid="tab-sg-nodes">Node List</TabsTrigger>
          </TabsList>
        </div>

        {filterBar}

        {/* ── Canvas ── */}
        <TabsContent value="canvas" className="flex-1 mt-0 min-h-0 relative data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex-1 min-h-0" style={{ height: "100%", minHeight: 480 }} data-testid="skill-graph-canvas">
            {nodesQ.isLoading || edgesQ.isLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-violet-400" /></div>
            ) : flowNodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No nodes match filter</div>
            ) : (
              <ReactFlow nodes={flowNodes} edges={flowEdges} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.05} maxZoom={3}>
                <MiniMap style={{ background: "#0f172a" }} nodeColor={n => { const t = (n.id as string).split(":")[0]; return NODE_COLORS[t]?.border ?? "#6b7280"; }} />
                <Controls />
                <Background color="#1e293b" gap={24} size={1} />
              </ReactFlow>
            )}
          </div>

          {/* Legend */}
          <div className="absolute bottom-10 left-2 flex flex-col gap-1 bg-card/90 backdrop-blur border rounded-lg p-2 z-10 text-[10px] pointer-events-none">
            {Object.entries(NODE_COLORS).map(([type, c]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c.bg, border: `1.5px solid ${c.border}` }} />
                <span style={{ color: c.text }}>{type}</span>
              </div>
            ))}
            <div className="border-t my-1" />
            {Object.entries(REL_COLORS).map(([rel, col]) => (
              <div key={rel} className="flex items-center gap-1.5">
                <div className="w-4 h-0.5" style={{ background: col }} />
                <span className="text-muted-foreground">{rel}</span>
              </div>
            ))}
            <div className="border-t mt-1 pt-1 text-muted-foreground/60">{flowNodes.length} nodes · {flowEdges.length} edges</div>
          </div>
        </TabsContent>

        {/* ── Coverage Evaluator ── */}
        <TabsContent value="coverage" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {coverQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Nodes",   value: coverage?.summary?.total_nodes ?? 0, color: "text-blue-400",   icon: Database },
                      { label: "Total Edges",   value: coverage?.summary?.total_edges ?? 0, color: "text-violet-400", icon: GitBranch },
                      { label: "Orphan Nodes",  value: coverage?.summary?.orphans ?? 0,     color: "text-red-400",    icon: AlertTriangle },
                      { label: "Coverage",      value: `${coverage?.summary?.coverage_score ?? 0}%`, color: "text-green-400", icon: CheckCircle2 },
                    ].map(s => (
                      <Card key={s.label} className="p-3 text-center border-border/50">
                        <div className={`text-xl font-black tabular-nums ${s.color}`} data-testid={`sg-stat-${s.label.toLowerCase().replace(/\s/g,"-")}`}>{s.value}</div>
                        <div className="text-[10px] text-muted-foreground">{s.label}</div>
                      </Card>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <ShieldAlert size={12} /> {coverage?.issues?.length ?? 0} Issues Detected
                  </div>

                  {(coverage?.issues?.length ?? 0) === 0 ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-green-400">
                      <CheckCircle2 size={20} />
                      <span className="text-sm font-medium">No coverage issues — all nodes connected</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {coverage.issues.map((issue: any, i: number) => (
                        <Card key={i} className={cn("p-2.5 border text-[11px]", SEVERITY_COLORS[issue.severity] ?? "border-muted-foreground/20")} data-testid={`sg-issue-${i}`}>
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{issue.name}</div>
                              <div className="opacity-70 leading-snug">{issue.reason}</div>
                            </div>
                            <div className="flex flex-col gap-0.5 flex-shrink-0 text-right">
                              <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", SEVERITY_COLORS[issue.severity])}>{issue.severity}</Badge>
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{issue.type}</Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Modifier Matrix ── */}
        <TabsContent value="matrix" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">Modifier coverage per complaint — see which global modifiers (pregnancy, CHF, CKD…) connect to which complaints.</p>
              {coverQ.isLoading ? (
                <div className="space-y-2">{Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
              ) : (
                <div className="space-y-1.5">
                  {(coverage?.modifier_matrix ?? []).map((row: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2 px-2.5 rounded border border-border/40 text-xs" data-testid={`sg-matrix-row-${i}`}>
                      <div className="w-44 flex-shrink-0">
                        <div className="font-medium truncate">{row.complaint_name}</div>
                        <div className="text-[10px] text-muted-foreground">{row.system}</div>
                      </div>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", row.pct >= 80 ? "bg-green-500" : row.pct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                          style={{ width: `${row.pct}%` }} />
                      </div>
                      <span className="w-10 text-right font-bold tabular-nums flex-shrink-0"
                        style={{ color: row.pct >= 80 ? "#22c55e" : row.pct >= 50 ? "#eab308" : "#ef4444" }}>
                        {row.pct}%
                      </span>
                      <span className="text-[10px] text-muted-foreground w-24 text-right flex-shrink-0">
                        {row.modifiers_covered}/{row.total_modifiers} modifiers
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Node List ── */}
        <TabsContent value="nodes" className="flex-1 mt-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {stats?.byType?.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {stats.byType.map((t: any) => {
                    const c = NODE_COLORS[t.type] ?? { text: "#d1d5db" };
                    return (
                      <Card key={t.type} className="p-2.5 text-center border-border/40">
                        <div className="text-xl font-black tabular-nums" style={{ color: c.text }}>{t.cnt}</div>
                        <div className="text-[10px] text-muted-foreground">{t.type}s</div>
                      </Card>
                    );
                  })}
                </div>
              )}
              {nodesQ.isLoading ? (
                <div className="space-y-1">{Array.from({length:10}).map((_,i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
              ) : allNodes
                  .filter((n: any) => typeFilter === "all" || n.type === typeFilter)
                  .filter((n: any) => systemFilter === "all" || n.system === systemFilter)
                  .slice(0, 200)
                  .map((n: any, i: number) => {
                    const c = NODE_COLORS[n.type] ?? { border: "#6b7280" };
                    const total = (n.degree_in ?? 0) + (n.degree_out ?? 0);
                    return (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/30 text-xs hover:border-border/60 transition-colors" data-testid={`node-row-${i}`}>
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.border }} />
                        <span className="flex-1 truncate">{n.name}</span>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground flex-shrink-0">{n.type}</Badge>
                        {n.system && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground flex-shrink-0">{n.system}</Badge>}
                        <span className={cn("text-[10px] tabular-nums flex-shrink-0", total === 0 ? "text-red-400 font-bold" : "text-muted-foreground")}
                          title={`in: ${n.degree_in}  out: ${n.degree_out}`}>
                          {total === 0 ? "⚠ orphan" : `↕${total}`}
                        </span>
                      </div>
                    );
                  })
              }
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
