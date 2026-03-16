import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Network, Search, GitBranch, AlertTriangle, HelpCircle,
  ArrowRight, CheckCircle2, XCircle, Lightbulb, Layers, Cpu, Zap
} from "lucide-react";

const nodeTypeColor: Record<string, string> = {
  complaint: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  symptom: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  question: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  skill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  engine: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  diagnosis: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  protocol: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  disposition: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
};

const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const coverageColor: Record<string, string> = {
  good: "text-green-600",
  adequate: "text-yellow-600",
  weak: "text-orange-600",
  none: "text-red-600",
};

function PanelExplorer() {
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { data: stats } = useQuery<any>({ queryKey: ["/api/knowledge-graph/stats"] });

  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/knowledge-graph/search", query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(`/api/knowledge-graph/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.trim().length > 0,
  });

  const { data: neighborhood } = useQuery<any>({
    queryKey: ["/api/knowledge-graph/node", selectedNode],
    queryFn: async () => {
      if (!selectedNode) return null;
      const parts = selectedNode.split(":");
      const res = await fetch(`/api/knowledge-graph/node/${parts[0]}/${parts.slice(1).join(":")}`);
      return res.json();
    },
    enabled: !!selectedNode,
  });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Total Nodes</div>
              <div className="text-3xl font-bold mt-1">{stats.totalNodes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Total Edges</div>
              <div className="text-3xl font-bold mt-1">{stats.totalEdges}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Node Types</div>
              <div className="text-3xl font-bold mt-1">{Object.keys(stats.nodesByType).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Relation Types</div>
              <div className="text-3xl font-bold mt-1">{Object.keys(stats.edgesByRelation).length}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Node Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.nodesByType).map(([type, cnt]: any) => (
                <Badge key={type} className={`${nodeTypeColor[type] ?? "bg-muted"} cursor-pointer`} onClick={() => setQuery(type)}>
                  {type}: {cnt}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Search Graph</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search complaints, skills, engines, diagnoses..."
              data-testid="input-kg-search"
            />
            <Button variant="outline" size="icon" data-testid="button-kg-search"><Search className="h-4 w-4" /></Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {searchResults.slice(0, 20).map((node: any) => (
                <div
                  key={node.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 border ${selectedNode === node.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}`}
                  onClick={() => setSelectedNode(node.id)}
                  data-testid={`node-${node.id}`}
                >
                  <Badge className={nodeTypeColor[node.type]}>{node.type}</Badge>
                  <span className="text-sm font-medium">{node.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto font-mono">{node.id}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {neighborhood && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge className={nodeTypeColor[neighborhood.center.type]}>{neighborhood.center.type}</Badge>
              {neighborhood.center.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mb-3">{neighborhood.neighbors.length} neighbors · {neighborhood.edges.length} edges</div>
            <div className="space-y-1.5">
              {neighborhood.edges.map((edge: any) => {
                const isOutgoing = edge.from === neighborhood.center.id;
                const otherId = isOutgoing ? edge.to : edge.from;
                const other = neighborhood.neighbors.find((n: any) => n.id === otherId);
                return (
                  <div key={edge.id} className="flex items-center gap-2 text-sm p-1.5 rounded bg-muted/30">
                    {isOutgoing ? (
                      <>
                        <span className="text-muted-foreground">{edge.relation}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge className={nodeTypeColor[other?.type ?? ""] ?? ""}>{other?.type}</Badge>
                        <span className="font-medium cursor-pointer hover:underline" onClick={() => setSelectedNode(otherId)}>{other?.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium cursor-pointer hover:underline" onClick={() => setSelectedNode(otherId)}>{other?.label}</span>
                        <Badge className={nodeTypeColor[other?.type ?? ""] ?? ""}>{other?.type}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{edge.relation}</span>
                      </>
                    )}
                    {edge.weight && <span className="text-xs text-muted-foreground ml-auto">w:{edge.weight}</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PanelPathway() {
  const [complaint, setComplaint] = useState("complaint:cough");
  const complaints = ["cough", "chest_pain", "headache", "dizziness", "sore_throat", "fever", "ear_pain", "breathlessness"];

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/knowledge-graph/pathway", complaint],
    queryFn: async () => {
      const parts = complaint.split(":");
      const res = await fetch(`/api/knowledge-graph/pathway/${parts[0]}/${parts.slice(1).join(":")}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <Select value={complaint.replace("complaint:", "")} onValueChange={v => { setComplaint(`complaint:${v}`); }}>
          <SelectTrigger className="w-48" data-testid="select-kg-complaint"><SelectValue /></SelectTrigger>
          <SelectContent>
            {complaints.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-load-pathway">Load Pathway</Button>
      </div>

      {isLoading && <div className="text-muted-foreground py-8 text-center">Loading…</div>}

      {data && !data.error && (
        <div className="space-y-4">
          <div className="text-lg font-bold flex items-center gap-2">
            <Badge className={nodeTypeColor.complaint}>complaint</Badge>
            {data.complaint.label} Pathway
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Required Skills", items: data.skills, type: "skill" },
              { title: "Screening Questions", items: data.questions, type: "question" },
              { title: "Clinical Protocols", items: data.protocols, type: "protocol" },
              { title: "Active Engines", items: data.engines, type: "engine" },
              { title: "Differential Diagnoses", items: data.diagnoses, type: "diagnosis" },
              { title: "Possible Dispositions", items: data.dispositions, type: "disposition" },
            ].map(({ title, items, type }) => (
              <Card key={title}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground">None mapped</div>
                  ) : (
                    <div className="space-y-1">
                      {items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <Badge className={`${nodeTypeColor[type]} text-xs`}>{type}</Badge>
                          <span className="text-sm">{item.label}</span>
                          {item.weight != null && <span className="text-xs text-muted-foreground ml-auto">{item.weight}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelGaps() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/knowledge-graph/gaps"] });

  if (isLoading) return <div className="text-muted-foreground py-8 text-center">Loading…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Gaps</div>
            <div className={`text-3xl font-bold mt-1 ${data.total === 0 ? "text-green-600" : "text-orange-600"}`}>{data.total}</div>
          </CardContent>
        </Card>
        {Object.entries(data.bySeverity).map(([sev, cnt]: any) => (
          <Card key={sev}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground capitalize">{sev}</div>
              <div className="text-3xl font-bold mt-1">{cnt}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.total === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="text-muted-foreground">No structural gaps detected in the knowledge graph</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(data.gaps as any[]).map((gap: any, i: number) => (
            <Card key={i} className={gap.severity === "critical" ? "border-red-400 dark:border-red-700" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${gap.severity === "critical" ? "text-red-600" : gap.severity === "high" ? "text-orange-500" : "text-yellow-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{gap.nodeLabel}</span>
                      <Badge className={severityColor[gap.severity]} variant="secondary">{gap.severity}</Badge>
                      <Badge variant="outline" className="text-xs">{gap.problem.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{gap.suggestion}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelQuestionCoverage() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/knowledge-graph/question-coverage"] });

  if (isLoading) return <div className="text-muted-foreground py-8 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(data as any[]).map((item: any) => (
          <Card key={item.skillId}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{item.skillLabel}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${coverageColor[item.coverage]}`}>{item.questionCount}</span>
                  <Badge variant="outline" className={`text-xs ${coverageColor[item.coverage]}`}>{item.coverage}</Badge>
                </div>
              </div>
              {item.questions.length > 0 && (
                <div className="space-y-1">
                  {item.questions.map((q: string, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <HelpCircle className="h-3 w-3 flex-shrink-0" />
                      {q}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PanelEngineDeps() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/knowledge-graph/engine-dependencies"] });

  if (isLoading) return <div className="text-muted-foreground py-8 text-center">Loading…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(data.list as any[]).map((dep: any) => (
          <Card key={dep.engine}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-emerald-500" />
                <span className="font-semibold text-sm font-mono">{dep.engine}</span>
                <Badge variant="outline" className="text-xs ml-auto">{dep.dependsOn.length} deps</Badge>
              </div>
              {dep.dependsOn.length > 0 ? (
                <div className="space-y-1">
                  {dep.dependsOn.map((d: string) => (
                    <div key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-mono">{d}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No upstream dependencies</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PanelAdaptiveQuestions() {
  const [complaint, setComplaint] = useState("cough");
  const complaints = ["cough", "chest_pain", "headache", "dizziness", "sore_throat", "fever", "ear_pain", "breathlessness"];

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge-graph/question-sequence", complaint],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge-graph/question-sequence/${complaint}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <Select value={complaint} onValueChange={setComplaint}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {complaints.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
        </SelectContent>
      </Select>

      {isLoading && <div className="text-muted-foreground py-8 text-center">Loading…</div>}

      {(data as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Graph-Optimized Question Sequence for {complaint.replace(/_/g, " ")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data as any[]).map((q: any, i: number) => (
                <div key={q.questionId} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300 flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{q.questionLabel}</div>
                    <div className="text-xs text-muted-foreground">{q.reason}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">w: {q.weight}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ClinicalKnowledgeGraphPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Network className="h-7 w-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold">Clinical Knowledge Graph</h1>
          <p className="text-sm text-muted-foreground">
            Unified clinical ontology connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions
          </p>
        </div>
      </div>

      <Tabs defaultValue="explorer">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="explorer" className="gap-1.5" data-testid="tab-kg-explorer"><Search className="h-3.5 w-3.5" />Explorer</TabsTrigger>
          <TabsTrigger value="pathway" className="gap-1.5" data-testid="tab-kg-pathway"><GitBranch className="h-3.5 w-3.5" />Pathways</TabsTrigger>
          <TabsTrigger value="gaps" className="gap-1.5" data-testid="tab-kg-gaps"><AlertTriangle className="h-3.5 w-3.5" />Gap Analysis</TabsTrigger>
          <TabsTrigger value="coverage" className="gap-1.5" data-testid="tab-kg-coverage"><HelpCircle className="h-3.5 w-3.5" />Question Coverage</TabsTrigger>
          <TabsTrigger value="deps" className="gap-1.5" data-testid="tab-kg-deps"><Layers className="h-3.5 w-3.5" />Engine Dependencies</TabsTrigger>
          <TabsTrigger value="adaptive" className="gap-1.5" data-testid="tab-kg-adaptive"><Zap className="h-3.5 w-3.5" />Adaptive Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="explorer"><PanelExplorer /></TabsContent>
        <TabsContent value="pathway"><PanelPathway /></TabsContent>
        <TabsContent value="gaps"><PanelGaps /></TabsContent>
        <TabsContent value="coverage"><PanelQuestionCoverage /></TabsContent>
        <TabsContent value="deps"><PanelEngineDeps /></TabsContent>
        <TabsContent value="adaptive"><PanelAdaptiveQuestions /></TabsContent>
      </Tabs>
    </div>
  );
}
