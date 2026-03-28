import "reactflow/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  type Node, type Edge, type NodeMouseHandler,
  useNodesState, useEdgesState,
} from "reactflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  GitBranch, AlertTriangle, CheckCircle2, XCircle, Lightbulb,
  RefreshCw, Search, Layers, Zap,
} from "lucide-react";

// ─── Type helpers ─────────────────────────────────────────────────────────
type NodeType = "stage" | "question" | "redflag" | "score_rule" | "disposition" | "dx";

interface TreeNode { id: string; label: string; type: NodeType; data?: any; x?: number; y?: number; }
interface TreeEdge { id: string; from: string; to: string; }

const TYPE_COLORS: Record<NodeType, { bg: string; border: string; text: string; badge: string }> = {
  stage:       { bg: "#312e81", border: "#6366f1", text: "#e0e7ff", badge: "bg-indigo-600" },
  question:    { bg: "#1e3a5f", border: "#3b82f6", text: "#bfdbfe", badge: "bg-blue-600" },
  redflag:     { bg: "#450a0a", border: "#ef4444", text: "#fecaca", badge: "bg-red-600" },
  score_rule:  { bg: "#431407", border: "#f97316", text: "#fed7aa", badge: "bg-orange-600" },
  disposition: { bg: "#052e16", border: "#22c55e", text: "#bbf7d0", badge: "bg-green-600" },
  dx:          { bg: "#0f172a", border: "#06b6d4", text: "#cffafe", badge: "bg-cyan-600" },
};

const TYPE_LABELS: Record<NodeType, string> = {
  stage: "Pipeline Stage", question: "Core Question", redflag: "Red Flag Rule",
  score_rule: "Scoring Rule", disposition: "Disposition", dx: "DX Candidate",
};

function makeRFNode(n: TreeNode, highlighted?: Set<string>): Node {
  const c = TYPE_COLORS[n.type] ?? TYPE_COLORS.stage;
  const isHighlighted = highlighted?.has(n.id);
  return {
    id: n.id,
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    data: { label: n.label, nodeType: n.type, raw: n.data },
    style: {
      background:   isHighlighted ? "#7f1d1d" : c.bg,
      border:       `2px solid ${isHighlighted ? "#ef4444" : c.border}`,
      borderRadius: n.type === "stage" ? 8 : 6,
      color:        c.text,
      padding:      n.type === "stage" ? "8px 16px" : "6px 10px",
      fontSize:     n.type === "stage" ? 13 : 11,
      fontWeight:   n.type === "stage" ? 700 : 400,
      maxWidth:     n.type === "stage" ? 160 : 200,
      boxShadow:    isHighlighted ? "0 0 16px rgba(239,68,68,0.6)" : undefined,
    },
  };
}

function makeRFEdge(e: TreeEdge, highlighted?: Set<string>): Edge {
  const isH = highlighted?.has(e.from) && highlighted?.has(e.to);
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    animated: isH,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: isH ? "#ef4444" : "#374151", strokeWidth: isH ? 3 : 1 },
  };
}

const COMPLAINT_PRESETS = [
  "sore_throat", "ent_sore_throat", "ent_ear_pain", "ent_sinus_pressure",
  "earache", "persistent_cough", "chest_pain", "dizziness",
];

// ─── Main Component ───────────────────────────────────────────────────────
export default function DecisionTreePage() {
  const { toast } = useToast();

  const [complaint, setComplaint]           = useState("ent_sore_throat");
  const [loading, setLoading]               = useState(false);
  const [meta, setMeta]                     = useState<any>(null);
  const [rawNodes, setRawNodes]             = useState<TreeNode[]>([]);
  const [rawEdges, setRawEdges]             = useState<TreeEdge[]>([]);
  const [highlighted, setHighlighted]       = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedNode, setSelectedNode]     = useState<TreeNode | null>(null);
  const [traceResult, setTraceResult]       = useState<any>(null);
  const [traceLoading, setTraceLoading]     = useState(false);

  const [failures, setFailures]             = useState<any[]>([]);
  const [fixResult, setFixResult]           = useState<any>(null);
  const [fixLoading, setFixLoading]         = useState(false);

  const [availableComplaints, setAvailableComplaints] = useState<{ id: string; label: string }[]>([]);

  // ── Fetch available complaints ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/decision-tree")
      .then(r => r.json())
      .then(j => { if (j.ok) setAvailableComplaints(j.complaints); })
      .catch(() => {});
  }, []);

  // ── Load tree ──────────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    if (!complaint) return;
    setLoading(true);
    setHighlighted(new Set());
    setSelectedNode(null);
    setTraceResult(null);
    setFixResult(null);
    try {
      const r = await fetch(`/api/decision-tree/${encodeURIComponent(complaint)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Load failed");

      setRawNodes(j.nodes);
      setRawEdges(j.edges);
      setMeta(j.meta);

      const rfn = j.nodes.map((n: TreeNode) => makeRFNode(n, new Set()));
      const rfe = j.edges.map((e: TreeEdge) => makeRFEdge(e, new Set()));
      setNodes(rfn);
      setEdges(rfe);

      toast({ title: `Tree loaded for ${j.complaint}`, description: `${rfn.length} nodes · ${rfe.length} edges` });
    } catch (err: any) {
      toast({ title: "Load failed", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [complaint, setNodes, setEdges, toast]);

  // Load on mount
  useEffect(() => { loadTree(); }, []); // eslint-disable-line

  // ── Fetch golden failures ──────────────────────────────────────────────
  const fetchFailures = useCallback(async () => {
    try {
      const r = await fetch("/api/test/golden/failures");
      const j = await r.json();
      if (j.ok) setFailures(j.failures ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchFailures(); const t = setInterval(fetchFailures, 15_000); return () => clearInterval(t); }, [fetchFailures]);

  // ── Node click ────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler = useCallback((_evt, rfNode) => {
    const raw = rawNodes.find(n => n.id === rfNode.id) ?? null;
    setSelectedNode(raw);
    setTraceResult(null);
    setFixResult(null);
  }, [rawNodes]);

  // ── Test a node via skill layer ──────────────────────────────────────
  const testNode = async () => {
    if (!selectedNode) return;
    setTraceLoading(true);
    setTraceResult(null);
    try {
      const r = await fetch("/api/skill-layer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaint: complaint.toLowerCase(),
          focusNode: selectedNode.id,
          text: selectedNode.label,
        }),
      });
      const j = await r.json();
      setTraceResult(j);
      toast({ title: `Node tested: ${selectedNode.label.slice(0, 30)}…`, description: `Status: ${j.status ?? j.outcome ?? "ok"}` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally { setTraceLoading(false); }
  };

  // ── Highlight a trace path ───────────────────────────────────────────
  const highlightPath = useCallback((traceNodes: string[]) => {
    const pathSet = new Set<string>(traceNodes);
    setHighlighted(pathSet);
    setNodes(rawNodes.map(n => makeRFNode(n, pathSet)));
    setEdges(rawEdges.map(e => makeRFEdge(e, pathSet)));
  }, [rawNodes, rawEdges, setNodes, setEdges]);

  const clearHighlight = useCallback(() => {
    setHighlighted(new Set());
    setNodes(rawNodes.map(n => makeRFNode(n, new Set())));
    setEdges(rawEdges.map(e => makeRFEdge(e, new Set())));
  }, [rawNodes, rawEdges, setNodes, setEdges]);

  // ── AI Fix suggestion ─────────────────────────────────────────────────
  const suggestFix = async (f?: any) => {
    setFixLoading(true);
    setFixResult(null);
    const target = f ?? (traceResult ? { expected: {}, actual: traceResult } : null);
    try {
      const r = await fetch("/api/learning/suggest-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId:   target?.id ?? selectedNode?.id,
          expected: target?.expected,
          actual:   target?.actual ?? traceResult,
          trace:    target?.result?.trace ?? traceResult?.trace ?? [],
        }),
      });
      const j = await r.json();
      setFixResult(j);
    } catch (e: any) {
      toast({ title: "Fix suggestion failed", description: e.message, variant: "destructive" });
    } finally { setFixLoading(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/30 bg-background px-4 py-3 flex flex-wrap items-center gap-3">
        <GitBranch className="h-5 w-5 text-indigo-400 shrink-0" />
        <h1 className="text-sm font-semibold">Decision Tree Explorer</h1>

        <div className="flex items-center gap-2 ml-2">
          <select
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs focus:outline-none"
            data-testid="select-complaint"
          >
            {(availableComplaints.length > 0 ? availableComplaints.map(c => ({ id: c.id, label: c.label })) : COMPLAINT_PRESETS.map(p => ({ id: p, label: p.replace(/_/g, " ") })))
              .map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input
            className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs w-40 focus:outline-none"
            placeholder="or type complaint ID…"
            onKeyDown={e => { if (e.key === "Enter") { setComplaint((e.target as HTMLInputElement).value.toUpperCase().replace(/ /g, "_")); setTimeout(loadTree, 0); } }}
            data-testid="input-complaint"
          />
        </div>

        <Button size="sm" onClick={loadTree} disabled={loading} data-testid="btn-load-tree" className="h-8 px-3 text-xs">
          <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? "animate-spin" : ""}`} /> {loading ? "Loading…" : "Load Tree"}
        </Button>

        {meta?.available && (
          <div className="flex gap-2 ml-auto">
            {[
              { label: "Questions", value: meta.questionCount, color: "bg-blue-600" },
              { label: "Red Flags", value: meta.redFlagCount,  color: "bg-red-600" },
              { label: "Rules",     value: meta.scoringRules,  color: "bg-orange-600" },
              { label: "Dispositions", value: meta.dispositions, color: "bg-green-600" },
              { label: "DX",        value: meta.dxCandidates,  color: "bg-cyan-600" },
            ].map(s => (
              <div key={s.label} className={`rounded px-2 py-0.5 text-[10px] text-white font-medium ${s.color}`} data-testid={`stat-${s.label.toLowerCase()}`}>
                {s.value} {s.label}
              </div>
            ))}
          </div>
        )}
        {!meta?.available && meta !== null && (
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px]">No config found — showing pipeline skeleton</Badge>
        )}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/20 bg-muted/10 px-4 py-1.5 flex flex-wrap gap-3">
        {(Object.entries(TYPE_COLORS) as [NodeType, any][]).map(([t, c]) => (
          <div key={t} className="flex items-center gap-1.5 text-[10px]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.bg, border: `1.5px solid ${c.border}` }} />
            <span className="text-muted-foreground">{TYPE_LABELS[t]}</span>
          </div>
        ))}
        {highlighted.size > 0 && (
          <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px] text-red-400 ml-auto"
            onClick={clearHighlight} data-testid="btn-clear-highlight">
            Clear Highlight
          </Button>
        )}
      </div>

      {/* ── Main: Canvas + Sidebar ─────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ReactFlow canvas */}
        <div className="flex-1 min-w-0" data-testid="reactflow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={2.5}
          >
            <Background gap={24} color="#1f2937" />
            <Controls />
            <MiniMap
              nodeStrokeColor={n => {
                const t = (n.data as any)?.nodeType as NodeType ?? "stage";
                return TYPE_COLORS[t]?.border ?? "#6366f1";
              }}
              nodeColor={n => {
                const t = (n.data as any)?.nodeType as NodeType ?? "stage";
                return TYPE_COLORS[t]?.bg ?? "#312e81";
              }}
              maskColor="rgba(0,0,0,0.5)"
            />
          </ReactFlow>
        </div>

        {/* Sidebar */}
        <div className="w-72 xl:w-80 shrink-0 border-l border-border/30 bg-background flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">

            {/* Selected node details */}
            {selectedNode ? (
              <Card className="border-border/30 bg-muted/10">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" /> Node Detail
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{TYPE_LABELS[selectedNode.type]}</p>
                    <p className="text-xs font-medium mt-0.5">{selectedNode.label}</p>
                  </div>
                  {selectedNode.data && (
                    <pre className="text-[10px] text-muted-foreground bg-black/30 rounded p-2 overflow-auto max-h-32">
                      {JSON.stringify(selectedNode.data, null, 2)}
                    </pre>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 px-2 text-[10px] flex-1"
                      onClick={testNode} disabled={traceLoading}
                      data-testid="btn-test-node"
                    >
                      <Zap className="h-3 w-3 mr-1" /> {traceLoading ? "Testing…" : "Test Node"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] flex-1"
                      onClick={() => suggestFix()} disabled={fixLoading}
                      data-testid="btn-suggest-fix"
                    >
                      <Lightbulb className="h-3 w-3 mr-1" /> {fixLoading ? "…" : "Suggest Fix"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-border/20 bg-muted/5 p-3 text-center">
                <Search className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Click any node to inspect it</p>
              </div>
            )}

            {/* Trace / test result */}
            {traceResult && (
              <Card className="border-border/30 bg-muted/10">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" /> Test Result
                    {traceResult.trace?.length > 0 && (
                      <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px]"
                        onClick={() => {
                          const path = traceResult.trace.map((t: any) => t.name ?? t.step ?? t.id).filter(Boolean);
                          highlightPath(path);
                        }}
                        data-testid="btn-highlight-trace"
                      >
                        Highlight Path
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <Badge variant="outline" className="text-[10px] mb-2">
                    {traceResult.status ?? traceResult.outcome ?? "complete"}
                  </Badge>
                  {traceResult.trace?.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {traceResult.trace.map((t: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[10px] text-muted-foreground mt-0.5">{i + 1}.</span>
                          <div>
                            <p className="text-[10px] font-medium">{t.name ?? t.step ?? `Step ${i + 1}`}</p>
                            {t.reason && <p className="text-[10px] text-muted-foreground">{t.reason}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!traceResult.trace?.length && (
                    <pre className="text-[10px] text-muted-foreground bg-black/30 rounded p-2 overflow-auto max-h-32 mt-1">
                      {JSON.stringify(traceResult, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Fix suggestion */}
            {fixResult && (
              <Card className="border-yellow-800/30 bg-yellow-950/20">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs flex items-center gap-2 text-yellow-400">
                    <Lightbulb className="h-3.5 w-3.5" /> Fix Suggestion
                    <Badge variant="outline" className="ml-auto text-[10px]">{fixResult.confidence ?? "?"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Problem</p>
                    <p className="text-xs">{fixResult.problem}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Suggestion</p>
                    <p className="text-xs">{fixResult.suggestion}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Source: {fixResult.source}</p>
                </CardContent>
              </Card>
            )}

            {/* Golden Case Failures */}
            <Card className="border-border/30 bg-muted/10">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Golden Failures
                  <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px]"
                    onClick={fetchFailures} data-testid="btn-refresh-failures">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {failures.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All cases passing
                  </div>
                ) : (
                  <div className="space-y-2">
                    {failures.map((f: any) => (
                      <div key={f.id} className="rounded-lg border border-red-800/30 bg-red-950/20 p-2 space-y-1"
                        data-testid={`failure-${f.id}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-red-300">{f.id}</p>
                          {f.result?.trace?.length > 0 && (
                            <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-red-400"
                              onClick={() => {
                                const path = (f.result.trace ?? []).map((t: any) => t.name ?? t.step ?? t.id).filter(Boolean);
                                highlightPath(path);
                              }}
                              data-testid={`btn-highlight-failure-${f.id}`}
                            >
                              <XCircle className="h-3 w-3 mr-0.5" /> Path
                            </Button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Expected: {JSON.stringify((f.expected as any)?.disposition ?? f.expected)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Actual: {(f.result as any)?.status ?? "unknown"}
                        </p>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] w-full mt-1"
                          onClick={() => suggestFix(f)} disabled={fixLoading}
                          data-testid={`btn-fix-failure-${f.id}`}
                        >
                          <Lightbulb className="h-3 w-3 mr-1" /> Suggest Fix
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
