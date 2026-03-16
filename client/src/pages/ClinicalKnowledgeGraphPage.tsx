import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Network, Search, GitBranch, AlertTriangle, HelpCircle,
  ArrowRight, CheckCircle2, XCircle, Lightbulb, Layers, Cpu, Zap,
  Upload, FileSpreadsheet, Loader2, Brain, Target,
  AlertCircle, Database, History, ShieldAlert, ArrowDownToLine
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

function PanelDataImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const { data: uploads, isLoading: uploadsLoading } = useQuery<any>({
    queryKey: ["/api/sheets/uploads"],
  });

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch("/api/sheets/import", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({ title: "Sheet uploaded", description: `${result.filename} (${result.sizeKb} KB)` });
      qc.invalidateQueries({ queryKey: ["/api/sheets/uploads"] });
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Clinical Data Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload .csv, .xlsx, or .json files containing complaints, diagnoses, questions, protocols, or medications to populate the knowledge graph.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.xls,.json"
              className="max-w-sm"
              data-testid="input-sheet-file"
            />
            <Button onClick={handleUpload} disabled={uploading} data-testid="button-upload-sheet">
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload Sheet
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Complaints</Badge>
            <Badge variant="outline">Diagnoses</Badge>
            <Badge variant="outline">Questions</Badge>
            <Badge variant="outline">Protocols</Badge>
            <Badge variant="outline">Medications</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Previous Uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uploadsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !uploads?.files?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-uploads">
              No sheets uploaded yet. Upload a file to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {uploads.files.map((f: any) => (
                <div key={f.filename} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm" data-testid={`upload-${f.filename}`}>
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{f.filename}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{f.sizeKb} KB</span>
                    <span>{new Date(f.uploadedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PanelGraphIngestion />
      <PanelAuditLog />
    </div>
  );
}

function PanelGraphIngestion() {
  const { toast } = useToast();
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleIngest() {
    setIngesting(true);
    try {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch("/api/sheets/ingest-graph", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const data = await res.json();
      setResult(data);
      if (data.status === "success") {
        toast({ title: "Ingestion Complete", description: `Imported ${Object.values(data.counts || {}).reduce((a: number, b: any) => a + (b || 0), 0)} records into the knowledge graph` });
      } else if (data.status === "blocked") {
        toast({ title: "Ingestion Blocked", description: data.reason, variant: "destructive" });
      } else {
        toast({ title: "Ingestion Failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Ingestion Error", description: err?.message, variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowDownToLine className="h-4 w-4" />
          Ingest Sheets Into Knowledge Graph
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Run the full ingestion pipeline: validates the latest uploaded workbook, then imports complaints, questions, disposition rules, red flags, scoring rules, and templates into the knowledge graph.
        </p>
        <Button onClick={handleIngest} disabled={ingesting} data-testid="button-ingest-graph">
          {ingesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          Import Into Knowledge Graph
        </Button>

        {result && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              {result.status === "success" ? (
                <Badge className="bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>
              ) : result.status === "blocked" ? (
                <Badge className="bg-red-100 text-red-800 border-red-300"><ShieldAlert className="h-3 w-3 mr-1" />Blocked</Badge>
              ) : (
                <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>
              )}
              {result.file && <span className="text-xs font-mono text-muted-foreground">{result.file}</span>}
            </div>

            {result.status === "blocked" && (
              <p className="text-sm text-red-600 dark:text-red-400">{result.reason}</p>
            )}

            {result.counts && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(result.counts).map(([key, val]) => (
                  <div key={key} className="text-center p-2 rounded-lg bg-muted/30 border">
                    <div className="text-lg font-bold">{val as number}</div>
                    <div className="text-xs text-muted-foreground">{key}</div>
                  </div>
                ))}
              </div>
            )}

            {result.impacts?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Impact Analysis</div>
                {result.impacts.map((imp: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">{imp.severity}</Badge>
                    <span>{imp.impact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelAuditLog() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/clinical-audit-log"],
  });

  const IMPACT_COLORS: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-yellow-600",
    low: "text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Clinical Change Audit Log
          {data?.count > 0 && <Badge variant="outline" className="text-xs">{data.count} records</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !data?.records?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-audit">
            No clinical changes recorded yet. Import data to begin tracking changes.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.records.slice(0, 50).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs" data-testid={`audit-${i}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs flex-shrink-0">{r.sheet}</Badge>
                  <span className="truncate">{r.changeType}: {r.key || "—"}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={IMPACT_COLORS[r.impact?.severity] || ""}>{r.impact?.severity}</span>
                  <span className="text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300",
};

function PanelAIPlanner() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/clinical-planner/run"],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          AI-driven strategic planning layer — automatically identifies what needs attention across the entire platform.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-rerun-planner">
          <Brain className="h-3.5 w-3.5 mr-1.5" />
          Re-Run
        </Button>
      </div>

      {isLoading && <div className="text-muted-foreground py-8 text-center">Analyzing platform state…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Knowledge Gaps</div>
                <div className={`text-3xl font-bold mt-1 ${data.gapCount > 0 ? "text-orange-600" : "text-green-600"}`}>{data.gapCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Model Drift</div>
                <div className={`text-3xl font-bold mt-1 ${data.driftDetected ? "text-red-600" : "text-green-600"}`}>
                  {data.driftDetected ? "Yes" : "No"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Accuracy</div>
                <div className="text-3xl font-bold mt-1">
                  {data.outcomeAccuracy != null ? `${data.outcomeAccuracy}%` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Priorities</div>
                <div className="text-3xl font-bold mt-1">{data.priorities.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" />
                Next Focus: <Badge variant="outline" className="font-mono text-xs">{data.nextFocus.replace(/_/g, " ")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.priorities.map((p: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20" data-testid={`priority-${i}`}>
                  <Badge className={`${PRIORITY_COLORS[p.priority]} border text-xs flex-shrink-0`}>{p.priority}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{p.task.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                    {p.count != null && (
                      <div className="text-xs mt-1"><Badge variant="outline" className="text-xs">{p.count} items</Badge></div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {data.simulationSchedule && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Simulation Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {["daily", "weekly", "monthly"].map((freq) => (
                    <div key={freq}>
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-2">{freq}</div>
                      <div className="space-y-1">
                        {(data.simulationSchedule[freq] || []).map((task: string) => (
                          <div key={task} className="text-xs bg-muted/30 rounded px-2 py-1">{task.replace(/_/g, " ")}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
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
          <TabsTrigger value="import" className="gap-1.5" data-testid="tab-kg-import"><Upload className="h-3.5 w-3.5" />Data Import</TabsTrigger>
          <TabsTrigger value="planner" className="gap-1.5" data-testid="tab-kg-planner"><Brain className="h-3.5 w-3.5" />AI Planner</TabsTrigger>
        </TabsList>

        <TabsContent value="explorer"><PanelExplorer /></TabsContent>
        <TabsContent value="pathway"><PanelPathway /></TabsContent>
        <TabsContent value="gaps"><PanelGaps /></TabsContent>
        <TabsContent value="coverage"><PanelQuestionCoverage /></TabsContent>
        <TabsContent value="deps"><PanelEngineDeps /></TabsContent>
        <TabsContent value="adaptive"><PanelAdaptiveQuestions /></TabsContent>
        <TabsContent value="import"><PanelDataImport /></TabsContent>
        <TabsContent value="planner"><PanelAIPlanner /></TabsContent>
      </Tabs>
    </div>
  );
}
