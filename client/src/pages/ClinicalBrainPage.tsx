import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Network, Brain, GitBranch, Play,
  FlaskConical, ChevronRight, CheckCircle2, Zap, Clock,
} from "lucide-react";
import ReactFlow, { Background, Controls } from "reactflow";
import type { Node as RFNode, Edge as RFEdge } from "reactflow";
import "reactflow/dist/style.css";

// ─── Agent Contracts ──────────────────────────────────────────────────────────
function AgentContractsPanel() {
  const { data: agents, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/brain/agents"],
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{agents?.length ?? 0} registered agents</p>
        <Button data-testid="button-refresh-agents" size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(agents ?? []).map((agent: any) => (
          <div key={agent.name} className="border rounded-lg p-3 bg-muted/20" data-testid={`agent-card-${agent.name}`}>
            <p className="font-mono text-sm font-medium">{agent.name}</p>
            <div className="mt-2 space-y-1.5">
              <div>
                <span className="text-xs text-blue-500 font-medium">Consumes</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {agent.consumes.map((c: string) => (
                    <Badge key={c} variant="secondary" className="text-xs font-mono">{c}</Badge>
                  ))}
                  {agent.consumes.length === 0 && <span className="text-xs text-muted-foreground italic">none</span>}
                </div>
              </div>
              <div>
                <span className="text-xs text-green-500 font-medium">Provides</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {agent.provides.map((p: string) => (
                    <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DAG Visualizer ───────────────────────────────────────────────────────────
function DAGVisualizerPanel() {
  const { data: dag, isLoading } = useQuery<any>({ queryKey: ["/api/brain/dag"] });

  const COLS = 2;
  const rfNodes: RFNode[] = (dag?.nodes ?? []).map((n: any, i: number) => ({
    id:       n.id,
    data:     { label: n.id },
    position: { x: (i % COLS) * 220 + 40, y: Math.floor(i / COLS) * 80 + 40 },
    style: {
      background: n.type === "agent" ? "#7c3aed" : "#1e40af",
      color: "#fff",
      borderRadius: 6,
      padding: "5px 10px",
      fontSize: 11,
      fontFamily: "monospace",
      border: "none",
    },
  }));

  const rfEdges: RFEdge[] = (dag?.edges ?? []).map((e: any, i: number) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    label:  e.label,
    style:  { stroke: "#6b7280", strokeWidth: 1 },
    labelStyle: { fontSize: 9, fill: "#9ca3af" },
  }));

  if (isLoading) return (
    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading DAG…</div>
  );

  return (
    <div data-testid="dag-visualizer" style={{ height: 420, border: "1px solid hsl(var(--border))", borderRadius: 8 }}>
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────────
function KnowledgeGraphPanel() {
  const { toast } = useToast();
  const [query, setQuery] = useState("chest pain,fever");
  const [results, setResults] = useState<any[]>([]);

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/brain/knowledge-graph"],
    select: (d: any) => d.stats,
  });

  const { mutate: queryGraph, isPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/brain/knowledge-graph/query?symptoms=${encodeURIComponent(query)}`).then((r) => r.json()),
    onSuccess: setResults,
    onError:   (err: any) => toast({ title: "Query failed", description: String(err.message), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="flex gap-6 text-sm font-medium border rounded-lg p-3 bg-muted/20">
          <span data-testid="text-node-count">{stats.nodeCount} nodes</span>
          <span data-testid="text-edge-count" className="text-muted-foreground">{stats.edgeCount} relationships</span>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          data-testid="input-graph-query"
          placeholder="e.g. chest pain,fever,confusion"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button data-testid="button-query-graph" onClick={() => queryGraph()} disabled={isPending}>
          {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Query
        </Button>
      </div>

      <div className="space-y-2">
        {results.map((r: any, i: number) => (
          <div key={r.disease} className="border rounded-lg p-3" data-testid={`graph-result-${i}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{r.disease}</span>
              <Badge variant="outline">score {r.score}</Badge>
            </div>
            {r.tests?.length > 0 && (
              <p className="text-xs text-blue-500 mt-1">Tests: {r.tests.join(", ")}</p>
            )}
            {r.treatments?.length > 0 && (
              <p className="text-xs text-green-500">Rx: {r.treatments.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Debate Panel ─────────────────────────────────────────────────────────────
function DebatePanel() {
  const { toast } = useToast();
  const [form, setForm] = useState({ complaint: "chest pain", tempF: "100", hr: "115", spo2: "94" });
  const [result, setResult] = useState<any>(null);

  const { mutate: runDebate, isPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/brain/debate", {
        complaint: form.complaint,
        vitals: { tempF: Number(form.tempF), hr: Number(form.hr), spo2: Number(form.spo2) },
        symptoms: { chestPain: form.complaint === "chest pain", sob: Number(form.spo2) < 95, fever: Number(form.tempF) > 99 },
      }),
    onSuccess: setResult,
    onError:   (err: any) => toast({ title: "Debate failed", description: String(err.message), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {(["complaint", "tempF", "hr", "spo2"] as const).map((k) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground capitalize">{k}</label>
            <Input data-testid={`input-debate-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <Button data-testid="button-run-debate" onClick={() => runDebate()} disabled={isPending} className="w-full">
        {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
        Run Multi-Specialist Debate (Cardiology + Pulmonary)
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="border rounded-lg p-4 bg-primary/5">
            <p className="text-sm font-semibold" data-testid="text-consensus">
              Consensus: <span className="text-primary">{result.consensus?.diagnosis}</span>
              <Badge className="ml-2" variant="secondary">score {result.consensus?.totalScore}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-debate-summary">{result.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {result.opinions?.map((op: any) => (
              <div key={op.specialist} className="border rounded-lg p-3" data-testid={`opinion-${op.specialist}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{op.specialist}</span>
                  <Badge variant={op.confidence > 0.6 ? "default" : "secondary"}>
                    {(op.confidence * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs font-mono mt-1">{op.diagnosis}</p>
                {op.icd10 && <p className="text-xs text-muted-foreground">ICD-10: {op.icd10}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{op.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Execution Trace Replay ────────────────────────────────────────────────────
function TraceReplayPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: traces = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/brain/traces"],
    refetchInterval: 15_000,
  });

  const { data: trace } = useQuery<any>({
    queryKey: ["/api/brain/traces", selectedId],
    enabled: !!selectedId,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{traces.length} trace(s) stored</p>
        <Button data-testid="button-refresh-traces" size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {traces.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-no-traces">
          No traces yet. Run the YAML pipeline to record an execution trace.
        </div>
      )}

      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1 max-h-72 overflow-y-auto border rounded p-2">
          {traces.map((t: any) => (
            <button
              key={t.id}
              data-testid={`trace-item-${t.id.slice(0, 8)}`}
              className={`w-full text-left border rounded p-2 text-xs hover:bg-muted transition-colors ${selectedId === t.id ? "border-primary bg-primary/5" : ""}`}
              onClick={() => setSelectedId(t.id)}
            >
              <p className="font-mono">{t.id.slice(0, 12)}…</p>
              <p className="text-muted-foreground">{t.steps?.length ?? 0} steps · {t.totalMs}ms</p>
            </button>
          ))}
        </div>

        <div className="col-span-3 space-y-2 max-h-72 overflow-y-auto">
          {!selectedId && <p className="text-xs text-muted-foreground text-center pt-8">Select a trace to replay</p>}
          {trace?.steps?.map((step: any, i: number) => (
            <div key={i} className="border rounded p-2 text-xs" data-testid={`trace-step-${i}`}>
              <div className="flex items-center gap-2 font-medium">
                <ChevronRight className="h-3 w-3 text-primary" />
                {step.agent}
                <span className="text-muted-foreground ml-auto">{step.durationMs}ms</span>
              </div>
              <pre className="text-muted-foreground mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] max-h-24">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── YAML Pipeline ────────────────────────────────────────────────────────────
function YamlPipelinePanel() {
  const { toast } = useToast();
  const [pipeline, setPipeline] = useState("chestPain");
  const [inputStr, setInputStr] = useState('{"vitals":{"hr":115,"spo2":93},"symptoms":{"chestPain":true}}');
  const [result, setResult] = useState<any>(null);

  const { mutate: run, isPending } = useMutation({
    mutationFn: () => {
      let parsed: any = {};
      try { parsed = JSON.parse(inputStr); } catch { /* skip */ }
      return apiRequest("POST", "/api/brain/pipeline/run", { pipeline, input: parsed });
    },
    onSuccess: setResult,
    onError:   (err: any) => toast({ title: "Pipeline failed", description: String(err.message), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Pipeline name</label>
          <Input data-testid="input-pipeline-name" value={pipeline} onChange={(e) => setPipeline(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Input JSON</label>
          <Input data-testid="input-pipeline-json" value={inputStr} onChange={(e) => setInputStr(e.target.value)} className="font-mono text-xs" />
        </div>
      </div>

      <Button data-testid="button-run-pipeline" onClick={() => run()} disabled={isPending} className="w-full">
        {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Execute Pipeline
      </Button>

      {result && (
        <div className="border rounded-lg p-4 bg-muted/20 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-medium" data-testid="text-pipeline-name">{result.pipelineName}</span>
            <Badge variant="outline" data-testid="text-pipeline-steps">{result.steps} agents ran</Badge>
            <span className="text-muted-foreground text-xs ml-auto" data-testid="text-pipeline-duration">{result.durationMs}ms</span>
          </div>
          <pre className="text-xs text-muted-foreground overflow-x-auto max-h-48 whitespace-pre-wrap" data-testid="text-pipeline-context">
            {JSON.stringify(result.context, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClinicalBrainPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-clinical-brain">
          Clinical Brain — Control Tower
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agent contracts · DAG visualizer · Medical knowledge graph · Specialist debate · Execution replay · YAML pipelines
        </p>
      </div>

      <Tabs defaultValue="agents">
        <TabsList data-testid="tabs-clinical-brain">
          <TabsTrigger value="agents"  data-testid="tab-agents">Agents</TabsTrigger>
          <TabsTrigger value="dag"     data-testid="tab-dag">DAG</TabsTrigger>
          <TabsTrigger value="graph"   data-testid="tab-graph">Knowledge Graph</TabsTrigger>
          <TabsTrigger value="debate"  data-testid="tab-debate">Debate</TabsTrigger>
          <TabsTrigger value="traces"  data-testid="tab-traces">Replay</TabsTrigger>
          <TabsTrigger value="yaml"    data-testid="tab-yaml">YAML Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" />Agent Contracts</CardTitle></CardHeader>
            <CardContent><AgentContractsPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dag">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" />DAG Visualizer</CardTitle></CardHeader>
            <CardContent><DAGVisualizerPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graph">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" />Medical Knowledge Graph</CardTitle></CardHeader>
            <CardContent><KnowledgeGraphPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debate">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" />Multi-Specialist Debate</CardTitle></CardHeader>
            <CardContent><DebatePanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traces">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Execution Replay</CardTitle></CardHeader>
            <CardContent><TraceReplayPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" />YAML Pipeline Runner</CardTitle></CardHeader>
            <CardContent><YamlPipelinePanel /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
