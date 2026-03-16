import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Activity, Cpu, AlertTriangle, GitBranch, Network,
  Play, Clock, Zap, BarChart3, Heart, ChevronRight, CircleDot,
} from "lucide-react";

function safetyGradeColor(grade: string) {
  if (grade === "A") return "text-green-600 bg-green-50 dark:bg-green-950";
  if (grade === "B") return "text-blue-600 bg-blue-50 dark:bg-blue-950";
  if (grade === "C") return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950";
  return "text-red-600 bg-red-50 dark:bg-red-950";
}

function healthColor(health: string) {
  if (health === "healthy") return "default" as const;
  if (health === "warning") return "secondary" as const;
  return "destructive" as const;
}

function alertBadge(level: string) {
  if (level === "critical") return "destructive" as const;
  if (level === "warning") return "secondary" as const;
  return "outline" as const;
}

function PanelOverview() {
  const { data: snapshot, isLoading } = useQuery<any>({
    queryKey: ["/api/control-center/snapshot"],
  });

  if (isLoading) return <p className="text-muted-foreground">Loading control center...</p>;
  if (!snapshot) return <p className="text-muted-foreground">Unable to load snapshot</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-safety-score">
          <CardContent className="pt-6 text-center">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-bold ${safetyGradeColor(snapshot.safetyScore.grade)}`}>
              {snapshot.safetyScore.grade}
            </div>
            <p className="text-2xl font-bold mt-2" data-testid="text-safety-score">{snapshot.safetyScore.score}</p>
            <p className="text-sm text-muted-foreground">Safety Score</p>
          </CardContent>
        </Card>

        <Card data-testid="card-system-health">
          <CardContent className="pt-6 text-center">
            <Heart className={`w-10 h-10 mx-auto ${snapshot.systemHealth === "healthy" ? "text-green-500" : snapshot.systemHealth === "warning" ? "text-yellow-500" : "text-red-500"}`} />
            <Badge variant={healthColor(snapshot.systemHealth)} className="mt-3 text-sm" data-testid="badge-system-health">
              {snapshot.systemHealth.toUpperCase()}
            </Badge>
            <p className="text-sm text-muted-foreground mt-1">System Health</p>
          </CardContent>
        </Card>

        <Card data-testid="card-engine-summary">
          <CardContent className="pt-6 text-center">
            <Cpu className="w-10 h-10 mx-auto text-primary" />
            <p className="text-2xl font-bold mt-2">{snapshot.engineSummary.totalEngines}</p>
            <p className="text-sm text-muted-foreground">Active Engines</p>
            <p className="text-xs text-muted-foreground">{snapshot.engineSummary.totalCalls.toLocaleString()} total calls</p>
          </CardContent>
        </Card>

        <Card data-testid="card-graph-health">
          <CardContent className="pt-6 text-center">
            <Network className="w-10 h-10 mx-auto text-primary" />
            <p className="text-2xl font-bold mt-2">{snapshot.graphHealth.nodeCount}</p>
            <p className="text-sm text-muted-foreground">Graph Nodes</p>
            <Badge variant={snapshot.graphHealth.consistencyOk ? "default" : "destructive"} className="mt-1 text-xs">
              {snapshot.graphHealth.consistencyOk ? "Consistent" : `${snapshot.graphHealth.problemCount} issues`}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {snapshot.alerts.length > 0 && (
        <Card data-testid="card-alerts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5" />Active Alerts ({snapshot.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.alerts.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg border" data-testid={`alert-${a.id}`}>
                <Badge variant={alertBadge(a.level)} className="text-xs w-20 justify-center">{a.level}</Badge>
                <span className="text-sm">{a.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />Safety Subscores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.safetyScore.subscores?.map((s: any) => (
              <div key={s.metric} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{s.metric}</span>
                  <span className="font-medium">{s.value} <span className="text-xs text-muted-foreground">({(s.weight * 100)}%)</span></span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${s.value >= 90 ? "bg-green-500" : s.value >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${s.value}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4" />Version & Governance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Total Versions</span>
              <Badge variant="outline">{snapshot.versionStatus.totalVersions}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Deployed Version</span>
              <Badge variant="outline">{snapshot.versionStatus.currentDeployed || "none"}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Governance Queue</span>
              <Badge variant="outline">{snapshot.governanceStatus.pending} pending</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Approved</span>
              <Badge variant="outline">{snapshot.governanceStatus.approved}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PanelEngineProfiler() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/control-center/engine-stats"],
  });

  if (isLoading) return <p className="text-muted-foreground">Loading engine stats...</p>;

  return (
    <div className="space-y-4">
      {data?.summary && (
        <div className="grid grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{data.summary.totalEngines}</p>
            <p className="text-xs text-muted-foreground">Engines</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{data.summary.totalCalls.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{data.summary.avgLatency}ms</p>
            <p className="text-xs text-muted-foreground">Avg Latency</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">${data.summary.totalCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Cost</p>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5" />Engine Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-engine-stats">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Engine</th>
                  <th className="py-2 pr-4 text-right">Calls</th>
                  <th className="py-2 pr-4 text-right">Avg Latency</th>
                  <th className="py-2 pr-4 text-right">Errors</th>
                  <th className="py-2 pr-4 text-right">Error Rate</th>
                  <th className="py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.engines?.map((e: any) => (
                  <tr key={e.engineName} className="border-b" data-testid={`engine-row-${e.engineName}`}>
                    <td className="py-2 pr-4 font-medium">{e.engineName}</td>
                    <td className="py-2 pr-4 text-right">{e.calls.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{e.avgLatency}ms</td>
                    <td className="py-2 pr-4 text-right">{e.errors}</td>
                    <td className="py-2 pr-4 text-right">
                      <Badge variant={e.errorRate > 0.05 ? "destructive" : e.errorRate > 0.01 ? "secondary" : "outline"} className="text-xs">
                        {(e.errorRate * 100).toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="py-2 text-right">${e.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const NODE_TYPE_COLORS: Record<string, string> = {
  interface: "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700",
  agent: "bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700",
  engine: "bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700",
  knowledge: "bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700",
  simulation: "bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700",
  governance: "bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700",
  integration: "bg-cyan-100 dark:bg-cyan-900 border-cyan-300 dark:border-cyan-700",
  safety: "bg-pink-100 dark:bg-pink-900 border-pink-300 dark:border-pink-700",
  learning: "bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  interface: "Interface",
  agent: "Agent",
  engine: "Engine",
  knowledge: "Knowledge",
  simulation: "Simulation",
  governance: "Governance",
  integration: "Integration",
  safety: "Safety",
  learning: "Learning",
};

function PanelIntelligenceMap() {
  const { data: graph, isLoading } = useQuery<any>({
    queryKey: ["/api/intelligence-map"],
  });
  const [selectedNode, setSelectedNode] = useState<any>(null);

  if (isLoading) return <p className="text-muted-foreground">Loading intelligence map...</p>;
  if (!graph) return null;

  const typeGroups = graph.nodes.reduce((acc: Record<string, any[]>, n: any) => {
    (acc[n.type] = acc[n.type] || []).push(n);
    return acc;
  }, {});

  const connections = selectedNode
    ? graph.edges.filter((e: any) => e.from === selectedNode.id || e.to === selectedNode.id)
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(NODE_TYPE_LABELS).map(([type, label]) => (
            <Badge key={type} variant="outline" className={`text-xs ${NODE_TYPE_COLORS[type]}`}>
              {label} ({typeGroups[type]?.length || 0})
            </Badge>
          ))}
        </div>

        {Object.entries(typeGroups).map(([type, nodes]: [string, any]) => (
          <div key={type}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{NODE_TYPE_LABELS[type] || type}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {nodes.map((n: any) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${NODE_TYPE_COLORS[n.type]} ${selectedNode?.id === n.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedNode(n)}
                  data-testid={`map-node-${n.id}`}
                >
                  <div className="flex items-center gap-2">
                    <CircleDot className={`w-3 h-3 ${n.status === "active" ? "text-green-500" : n.status === "monitoring" ? "text-yellow-500" : "text-gray-400"}`} />
                    <span className="text-sm font-medium truncate">{n.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        {selectedNode ? (
          <Card data-testid="node-detail-panel">
            <CardHeader>
              <CardTitle className="text-base">{selectedNode.label}</CardTitle>
              <CardDescription>{selectedNode.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="outline" className={NODE_TYPE_COLORS[selectedNode.type]}>{selectedNode.type}</Badge>
                <Badge variant={selectedNode.status === "active" ? "default" : "secondary"}>{selectedNode.status}</Badge>
              </div>
              <p className="text-xs font-mono text-muted-foreground">ID: {selectedNode.id}</p>

              {connections.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Connections ({connections.length})</p>
                  <div className="space-y-1">
                    {connections.map((c: any, i: number) => {
                      const isSource = c.from === selectedNode.id;
                      const otherId = isSource ? c.to : c.from;
                      const otherNode = graph.nodes.find((n: any) => n.id === otherId);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded border cursor-pointer hover:bg-accent"
                          onClick={() => otherNode && setSelectedNode(otherNode)}
                        >
                          <ChevronRight className={`w-3 h-3 ${isSource ? "text-blue-500" : "text-green-500 rotate-180"}`} />
                          <span>{otherNode?.label || otherId}</span>
                          {c.label && <Badge variant="outline" className="text-xs ml-auto">{c.label}</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedNode.apiEndpoint && (
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <a href={selectedNode.apiEndpoint}>Open Dashboard</a>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center" data-testid="text-select-node">
                Click any node to view details and connections
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PanelReasoningDebugger() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("cough");
  const [symptoms, setSymptoms] = useState("sore throat, fever");
  const [trace, setTrace] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const runTrace = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reasoning-debug", {
        complaint,
        symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setTrace(data);
      setCurrentStep(0);
      toast({ title: `Trace complete: ${data.steps.length} steps in ${data.totalDuration}ms` });
    },
    onError: () => toast({ title: "Trace failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />Visual Reasoning Debugger
          </CardTitle>
          <CardDescription>Step through the clinical reasoning pipeline for any complaint</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Complaint</label>
              <Input value={complaint} onChange={(e) => setComplaint(e.target.value)} data-testid="input-debug-complaint" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Symptoms (comma-separated)</label>
              <Input value={symptoms} onChange={(e) => setSymptoms(e.target.value)} data-testid="input-debug-symptoms" />
            </div>
          </div>
          <Button onClick={() => runTrace.mutate()} disabled={runTrace.isPending} data-testid="button-run-trace">
            {runTrace.isPending ? "Running..." : "Run Reasoning Trace"}
          </Button>
        </CardContent>
      </Card>

      {trace && (
        <div className="space-y-4" data-testid="trace-results">
          <div className="flex items-center gap-4">
            <Badge variant="default">{trace.finalDisposition}</Badge>
            <span className="text-sm text-muted-foreground">
              Confidence: {(trace.finalConfidence * 100).toFixed(0)}% | {trace.totalDuration}ms | {trace.steps.length} steps
            </span>
            <div className="flex gap-1 ml-auto">
              <Button size="sm" variant="outline" disabled={currentStep === 0} onClick={() => setCurrentStep((p) => p - 1)}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={currentStep >= trace.steps.length - 1} onClick={() => setCurrentStep((p) => p + 1)} data-testid="button-next-step">
                Next
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCurrentStep(trace.steps.length - 1)}>
                Last
              </Button>
            </div>
          </div>

          <div className="relative" data-testid="trace-step-list">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
            {trace.steps.map((step: any, i: number) => (
              <div
                key={i}
                className={`relative pl-14 pb-4 cursor-pointer transition-opacity ${i > currentStep ? "opacity-30" : ""}`}
                onClick={() => setCurrentStep(i)}
                data-testid={`trace-step-${i}`}
              >
                <div className={`absolute left-4 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border-2 ${i === currentStep ? "bg-primary text-primary-foreground border-primary" : i < currentStep ? "bg-green-500 text-white border-green-500" : "bg-background border-muted-foreground"}`}>
                  {step.step}
                </div>
                <Card className={i === currentStep ? "border-primary" : ""}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm">{step.engine}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{step.duration}ms</span>
                        {step.confidence != null && (
                          <Badge variant="outline" className="text-xs">{(step.confidence * 100).toFixed(0)}%</Badge>
                        )}
                      </div>
                    </div>
                    {i === currentStep && (
                      <div className="mt-2 space-y-1 text-xs">
                        <p><span className="font-medium text-muted-foreground">Input:</span> {step.input}</p>
                        <p><span className="font-medium text-muted-foreground">Output:</span> {step.output}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClinicalIntelligenceControlCenter() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-cicc-title">Clinical Intelligence Control Center</h1>
          <p className="text-muted-foreground text-sm">Mission control for your clinical AI platform</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-cicc-overview">
            <Activity className="w-4 h-4 mr-1" />Overview
          </TabsTrigger>
          <TabsTrigger value="profiler" data-testid="tab-cicc-profiler">
            <BarChart3 className="w-4 h-4 mr-1" />Engine Profiler
          </TabsTrigger>
          <TabsTrigger value="map" data-testid="tab-cicc-map">
            <Network className="w-4 h-4 mr-1" />Intelligence Map
          </TabsTrigger>
          <TabsTrigger value="debugger" data-testid="tab-cicc-debugger">
            <Play className="w-4 h-4 mr-1" />Reasoning Debugger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6"><PanelOverview /></TabsContent>
        <TabsContent value="profiler" className="mt-6"><PanelEngineProfiler /></TabsContent>
        <TabsContent value="map" className="mt-6"><PanelIntelligenceMap /></TabsContent>
        <TabsContent value="debugger" className="mt-6"><PanelReasoningDebugger /></TabsContent>
      </Tabs>
    </div>
  );
}
