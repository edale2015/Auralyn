import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitBranch, BarChart3, ShieldAlert, Layers, Search, ExternalLink, ArrowRight } from "lucide-react";

function DifferentialExplorerTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/differential-explorer/graph"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading differential graph...</div>;

  const graph = data;
  if (!graph) return null;

  const systemColors: Record<string, string> = {
    respiratory: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    ent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    neuro: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    complaint: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    diagnosis: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const relColors: Record<string, string> = {
    overlap: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    rule_out: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    rule_in: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    co_occurrence: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  };

  const systems = [...new Set(graph.nodes.map((n: any) => n.system))];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-diff-nodes">{graph.nodes.length}</div>
            <div className="text-sm text-muted-foreground">Diagnoses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-diff-edges">{graph.edges.length}</div>
            <div className="text-sm text-muted-foreground">Relationships</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{systems.length}</div>
            <div className="text-sm text-muted-foreground">Body Systems</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Diagnosis Nodes</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2" data-testid="diff-node-list">
            {graph.nodes.map((n: any) => (
              <Badge key={n.id} className={`${systemColors[n.system] || "bg-gray-100"} text-sm`} data-testid={`diff-node-${n.id}`}>
                {n.name}
                <span className="ml-1 opacity-60">({n.system})</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Differential Relationships</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="diff-edge-list">
            {graph.edges.map((e: any, i: number) => {
              const src = graph.nodes.find((n: any) => n.id === e.source);
              const tgt = graph.nodes.find((n: any) => n.id === e.target);
              return (
                <div key={i} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30" data-testid={`diff-edge-${i}`}>
                  <span className="font-medium text-sm">{src?.name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-sm">{tgt?.name}</span>
                  <Badge className={`ml-auto text-xs ${relColors[e.relationship] || ""}`}>{e.relationship}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionImpactTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/question-impact"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading question impact...</div>;

  const results = data?.results || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Question Entropy Impact Rankings</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-question-impact">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Rank</th>
                  <th className="p-2">Question</th>
                  <th className="p-2 text-right">Entropy Before</th>
                  <th className="p-2 text-right">Entropy After</th>
                  <th className="p-2 text-right">Impact</th>
                  <th className="p-2 text-right">Reduction %</th>
                </tr>
              </thead>
              <tbody>
                {results.map((q: any) => (
                  <tr key={q.questionId} className="border-b hover:bg-muted/50" data-testid={`question-row-${q.questionId}`}>
                    <td className="p-2">
                      <Badge variant={q.rank <= 3 ? "default" : "secondary"}>#{q.rank}</Badge>
                    </td>
                    <td className="p-2 font-medium">{q.questionText || q.questionId}</td>
                    <td className="p-2 text-right font-mono">{q.entropyBefore}</td>
                    <td className="p-2 text-right font-mono">{q.entropyAfter}</td>
                    <td className="p-2 text-right font-mono font-bold text-green-600 dark:text-green-400">
                      {q.impact}
                    </td>
                    <td className="p-2 text-right">
                      <Badge variant="outline" className="font-mono">{q.impactPercent}%</Badge>
                    </td>
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

function ProtocolConflictsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/protocol-conflicts"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading conflicts...</div>;

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.totalRules}</div>
            <div className="text-xs text-muted-foreground">Total Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600" data-testid="text-total-conflicts">{data?.totalConflicts}</div>
            <div className="text-xs text-muted-foreground">Conflicts</div>
          </CardContent>
        </Card>
        {["critical", "high", "medium"].map((s) => (
          <Card key={s}>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold">{data?.bySeverity?.[s] || 0}</div>
              <div className="text-xs text-muted-foreground capitalize">{s}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Detected Conflicts</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="conflict-list">
            {data?.conflicts?.map((c: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 space-y-2" data-testid={`conflict-${i}`}>
                <div className="flex items-center justify-between">
                  <Badge className={severityColors[c.severity]}>{c.severity.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.ruleA.protocolId} vs {c.ruleB.protocolId}
                  </span>
                </div>
                <p className="text-sm">{c.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="font-semibold">{c.ruleA.ruleId}:</span> {c.ruleA.action}
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="font-semibold">{c.ruleB.ruleId}:</span> {c.ruleB.action}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CaseClustersTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/case-clusters"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading clusters...</div>;

  const clusterColors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-yellow-500", "bg-red-500"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.totalCases}</div>
            <div className="text-xs text-muted-foreground">Total Cases</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-total-clusters">{data?.totalClusters}</div>
            <div className="text-xs text-muted-foreground">Clusters</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.largestCluster}</div>
            <div className="text-xs text-muted-foreground">Largest Cluster</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.singletonClusters}</div>
            <div className="text-xs text-muted-foreground">Singletons</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="cluster-list">
        {data?.clusters?.map((c: any, i: number) => (
          <Card key={c.clusterId} data-testid={`cluster-${c.clusterId}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${clusterColors[i % clusterColors.length]}`} />
                  <span className="font-semibold text-sm">{c.suggestedLabel}</span>
                </div>
                <Badge variant="outline">{c.size} case{c.size !== 1 ? "s" : ""}</Badge>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.representativeSymptoms.map((s: string) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s.replace(/_/g, " ")}</Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Cases: {c.cases.join(", ")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PubMedResearchTab() {
  const [searchTerm, setSearchTerm] = useState("ENT flu triage AI clinical");
  const [activeTerm, setActiveTerm] = useState("ENT flu triage AI clinical");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/pubmed-search", activeTerm],
    queryFn: async () => {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch(`/api/pubmed-search?term=${encodeURIComponent(activeTerm)}&max=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search PubMed..."
              data-testid="input-pubmed-search"
              onKeyDown={(e) => e.key === "Enter" && setActiveTerm(searchTerm)}
            />
            <Button onClick={() => setActiveTerm(searchTerm)} disabled={isLoading} data-testid="button-pubmed-search">
              <Search className="h-4 w-4 mr-1" /> Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Searching PubMed...</div>}

      {data && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground" data-testid="text-pubmed-count">
            Found {data.totalResults?.toLocaleString()} results for "{data.term}" — showing {data.articles?.length}
          </p>
          {data.articles?.map((a: any, i: number) => (
            <Card key={a.pmid || i} data-testid={`pubmed-article-${i}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium text-sm">{a.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">PMID: {a.pmid} · {a.source}</p>
                  </div>
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button variant="ghost" size="sm" data-testid={`link-pubmed-${i}`}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClinicalAnalyticsEngines() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-analytics-title">Clinical Analytics Engines</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Differential diagnosis, question impact, protocol conflicts, case clustering, and research tools
          </p>
        </div>
      </div>

      <Tabs defaultValue="differential" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="differential" data-testid="tab-differential">
            <GitBranch className="h-4 w-4 mr-1" /> Differential
          </TabsTrigger>
          <TabsTrigger value="question-impact" data-testid="tab-question-impact">
            <BarChart3 className="h-4 w-4 mr-1" /> Q Impact
          </TabsTrigger>
          <TabsTrigger value="protocol-conflicts" data-testid="tab-protocol-conflicts">
            <ShieldAlert className="h-4 w-4 mr-1" /> Conflicts
          </TabsTrigger>
          <TabsTrigger value="case-clusters" data-testid="tab-case-clusters">
            <Layers className="h-4 w-4 mr-1" /> Clusters
          </TabsTrigger>
          <TabsTrigger value="pubmed" data-testid="tab-pubmed">
            <Search className="h-4 w-4 mr-1" /> PubMed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="differential"><DifferentialExplorerTab /></TabsContent>
        <TabsContent value="question-impact"><QuestionImpactTab /></TabsContent>
        <TabsContent value="protocol-conflicts"><ProtocolConflictsTab /></TabsContent>
        <TabsContent value="case-clusters"><CaseClustersTab /></TabsContent>
        <TabsContent value="pubmed"><PubMedResearchTab /></TabsContent>
      </Tabs>
    </div>
  );
}
