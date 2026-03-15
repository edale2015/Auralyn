import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, GitBranch, Map, Network, Cpu, Activity, Download, RefreshCw, Layers } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";
import { COMPLAINTS } from "@shared/complaints";

const FORMAT_OPTIONS = [
  { value: "mermaid", label: "Mermaid (Interactive)" },
  { value: "ascii", label: "ASCII (Text)" },
  { value: "json", label: "JSON (Structured)" },
  { value: "dot", label: "DOT (Graphviz)" },
];

const SAMPLE_CASE = {
  complaint: "chest_pain",
  symptoms: ["chest_pain", "shortness_of_breath", "diaphoresis", "palpitations"],
  differential: [
    { diagnosis: "acute_coronary_syndrome", score: 0.45 },
    { diagnosis: "pulmonary_embolism", score: 0.22 },
    { diagnosis: "chest_wall_pain", score: 0.18 },
    { diagnosis: "gerd_esophageal", score: 0.1 },
  ],
  tests: ["12-lead ECG", "Troponin", "CXR", "D-dimer"],
  treatments: ["Aspirin 325mg", "Oxygen supplementation", "IV access"],
  disposition: "ed_transfer",
};

export default function ClinicalVisualizationPage() {
  const [archFormat, setArchFormat] = useState("mermaid");
  const [pathComplaint, setPathComplaint] = useState("chest_pain");
  const [activeTab, setActiveTab] = useState("architecture");

  // Architecture diagram
  const archQuery = useQuery<any>({
    queryKey: ["/api/visualization/architecture", archFormat],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/visualization/architecture?format=${archFormat}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  // Complaint pathway
  const pathwayQuery = useQuery<any>({
    queryKey: ["/api/visualization/pathway", pathComplaint],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/visualization/pathway/${pathComplaint}`);
      return res.json();
    },
    enabled: !!pathComplaint,
  });

  // Case reasoning
  const caseReasoningMutation = useMutation<any, Error, typeof SAMPLE_CASE>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/visualization/case-reasoning", body);
      return res.json();
    },
  });

  // Engine map
  const engineMapQuery = useQuery<any>({
    queryKey: ["/api/visualization/engine-map"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/visualization/engine-map");
      return res.json();
    },
    staleTime: 120_000,
  });

  // Telepresence
  const telepresenceQuery = useQuery<any>({
    queryKey: ["/api/visualization/telepresence-workflow"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/visualization/telepresence-workflow");
      return res.json();
    },
    staleTime: 120_000,
  });

  function downloadSVG() {
    const svg = document.querySelector("[data-testid='mermaid-diagram'] svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clinical-diagram-${activeTab}.svg`;
    a.click();
  }

  function downloadText(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-testid="page-clinical-visualization">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Clinical Visualization Engine</h1>
              <p className="text-sm text-muted-foreground">System architecture · Complaint pathways · Case reasoning · Engine maps</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadSVG} data-testid="button-download-svg">
              <Download className="h-4 w-4 mr-1" />
              Download SVG
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-visualization">
            <TabsTrigger value="architecture" data-testid="tab-architecture">
              <Layers className="h-3.5 w-3.5 mr-1.5" />Architecture
            </TabsTrigger>
            <TabsTrigger value="pathway" data-testid="tab-pathway">
              <Map className="h-3.5 w-3.5 mr-1.5" />Complaint Pathway
            </TabsTrigger>
            <TabsTrigger value="case-reasoning" data-testid="tab-case-reasoning">
              <Activity className="h-3.5 w-3.5 mr-1.5" />Case Reasoning
            </TabsTrigger>
            <TabsTrigger value="engine-map" data-testid="tab-engine-map">
              <Cpu className="h-3.5 w-3.5 mr-1.5" />Engine Map
            </TabsTrigger>
            <TabsTrigger value="telepresence" data-testid="tab-telepresence">
              <Network className="h-3.5 w-3.5 mr-1.5" />Telepresence Flow
            </TabsTrigger>
          </TabsList>

          {/* Architecture Tab */}
          <TabsContent value="architecture" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">System Architecture Diagram</CardTitle>
                    <CardDescription>12-layer clinical AI pipeline with {archQuery.data?.engineCount ?? "…"} engines</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={archFormat} onValueChange={setArchFormat} data-testid="select-arch-format">
                      <SelectTrigger className="w-44" data-testid="select-trigger-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAT_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => archQuery.refetch()} data-testid="button-refresh-arch">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {archQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-8 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading architecture…</span>
                  </div>
                ) : archFormat === "mermaid" ? (
                  <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                    <MermaidDiagram chart={archQuery.data?.content ?? ""} />
                  </div>
                ) : (
                  <div className="relative">
                    <pre className="text-xs bg-muted rounded p-4 overflow-auto max-h-[600px] whitespace-pre-wrap" data-testid="text-arch-content">
                      {archQuery.data?.content ?? "Loading…"}
                    </pre>
                    <Button
                      variant="outline" size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => downloadText(archQuery.data?.content ?? "", `architecture.${archFormat}`)}
                      data-testid="button-download-arch"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {archQuery.data && (
                  <div className="flex gap-3 mt-3 flex-wrap">
                    <Badge variant="outline" data-testid="badge-engine-count">
                      {archQuery.data.engineCount} engines
                    </Badge>
                    <Badge variant="outline" data-testid="badge-layer-count">
                      {archQuery.data.layerCount} layers
                    </Badge>
                    <Badge variant="outline" data-testid="badge-generated-at">
                      Generated {new Date(archQuery.data.generatedAt).toLocaleTimeString()}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Complaint Pathway Tab */}
          <TabsContent value="pathway" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">Complaint Triage Pathway</CardTitle>
                    <CardDescription>End-to-end flow from intake to disposition for a specific complaint</CardDescription>
                  </div>
                  <Select value={pathComplaint} onValueChange={setPathComplaint} data-testid="select-complaint">
                    <SelectTrigger className="w-52" data-testid="select-trigger-complaint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLAINTS.slice(0, 40).map((c) => (
                        <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {pathwayQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-8 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                    <MermaidDiagram chart={pathwayQuery.data?.content ?? ""} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Case Reasoning Tab */}
          <TabsContent value="case-reasoning" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">Case Reasoning Visualization</CardTitle>
                    <CardDescription>Visual reasoning graph, mind map, decision tree, and audit ladder for a case</CardDescription>
                  </div>
                  <Button
                    onClick={() => caseReasoningMutation.mutate(SAMPLE_CASE)}
                    disabled={caseReasoningMutation.isPending}
                    data-testid="button-run-case-reasoning"
                  >
                    {caseReasoningMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Analyzing…</>
                    ) : (
                      <>Run Sample Case</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!caseReasoningMutation.data && !caseReasoningMutation.isPending && (
                  <div className="text-center py-10 text-muted-foreground">
                    <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Click "Run Sample Case" to visualize chest pain reasoning</p>
                    <p className="text-xs mt-1 opacity-60">Uses differential diagnosis + decision engine outputs</p>
                  </div>
                )}

                {caseReasoningMutation.data && (
                  <Tabs defaultValue="mermaid" className="w-full">
                    <TabsList className="flex-wrap h-auto gap-1 mb-3">
                      <TabsTrigger value="mermaid" data-testid="subtab-reasoning-graph">Reasoning Graph</TabsTrigger>
                      <TabsTrigger value="mindmap" data-testid="subtab-mindmap">Mind Map</TabsTrigger>
                      <TabsTrigger value="decision-tree" data-testid="subtab-decision-tree">Decision Tree</TabsTrigger>
                      <TabsTrigger value="audit-ladder" data-testid="subtab-audit-ladder">Audit Ladder</TabsTrigger>
                    </TabsList>

                    <TabsContent value="mermaid">
                      <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                        <MermaidDiagram chart={caseReasoningMutation.data.mermaid} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2" data-testid="text-case-summary">
                        {caseReasoningMutation.data.summary}
                      </p>
                    </TabsContent>

                    <TabsContent value="mindmap">
                      <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                        <MermaidDiagram chart={caseReasoningMutation.data.mindMap} />
                      </div>
                    </TabsContent>

                    <TabsContent value="decision-tree">
                      <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                        <MermaidDiagram chart={caseReasoningMutation.data.decisionTree} />
                      </div>
                    </TabsContent>

                    <TabsContent value="audit-ladder">
                      <div className="space-y-2">
                        {caseReasoningMutation.data.auditLadder?.map((step: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                            data-testid={`audit-step-${i}`}
                          >
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                              {step.step}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{step.engine}</span>
                                {step.confidence != null && (
                                  <Badge variant="outline" className="text-xs">
                                    {(step.confidence * 100).toFixed(0)}% confidence
                                  </Badge>
                                )}
                              </div>
                              {step.input && <p className="text-xs text-muted-foreground mt-0.5">In: {step.input}</p>}
                              <p className="text-xs mt-0.5 text-foreground">Out: {step.output}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Engine Map Tab */}
          <TabsContent value="engine-map" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Engine Dependency Map</CardTitle>
                <CardDescription>How all 71 clinical AI engines connect and pass data</CardDescription>
              </CardHeader>
              <CardContent>
                {engineMapQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-8 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                    <MermaidDiagram chart={engineMapQuery.data?.content ?? ""} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Telepresence Workflow Tab */}
          <TabsContent value="telepresence" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Telepresence Workflow Map</CardTitle>
                <CardDescription>Patient journey from WhatsApp/web intake to physician decision and device routing</CardDescription>
              </CardHeader>
              <CardContent>
                {telepresenceQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-8 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-muted/20 overflow-auto">
                    <MermaidDiagram chart={telepresenceQuery.data?.content ?? ""} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
