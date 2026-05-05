import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Database, Edit3,
  FileText, GitBranch, History, Layers,
  Play, RefreshCw, Shield, Stethoscope, Zap,
  ArrowDown, BookOpen, ClipboardList, Activity, FlaskConical,
  Target, SlidersHorizontal, Pill,
} from "lucide-react";

type Complaint = {
  complaintId: string;
  label: string;
  category?: string;
  urgencyLevel?: string;
};

type LayerKey =
  | "complaintIdentification"
  | "differentialDiagnosis"
  | "modifiers"
  | "questions"
  | "workup"
  | "medication"
  | "redFlags"
  | "clusterScoring"
  | "diagnosisRanking"
  | "dispositionPlan"
  | "audit";

type LayerRow = { count: number; rows: any[]; sourceTables: string[]; unit: string };

type SourceMapEntry = {
  key: LayerKey;
  stage: string;
  step: string;
  label: string;
  unit: string;
  sourceTables: string[];
  purpose: string;
};

type Bundle = {
  complaint: Complaint;
  world?: string;
  sourceMap?: SourceMapEntry[];
  layers: Record<LayerKey, LayerRow>;
  changeHistory: any[];
  summary: {
    totalRules: number;
    hasRedFlags: boolean;
    hasDisposition: boolean;
    hasDiagnosis: boolean;
    lastChanged: string | null;
  };
};

type PipelineTrace = {
  ok: boolean;
  complaintId: string;
  symptoms: string[];
  pipeline: Array<{
    step?: string;
    stage: string;
    label: string;
    triggered: boolean;
    results: any[];
    allRuleCount: number;
  }>;
  finalDisposition: string;
  isEscalated: boolean;
  topDiagnosis: any;
  engineSource: string;
  activeRuleCount: number;
  tracedAt: string;
};

const PIPELINE_STAGES: { key: LayerKey; step: string; label: string; icon: any; color: string; bg: string }[] = [
  { key: "complaintIdentification", step: "1", label: "Complaint Identification", icon: Layers, color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-950/30" },
  { key: "differentialDiagnosis", step: "2", label: "Differential Diagnosis", icon: Target, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
  { key: "modifiers", step: "3A", label: "Modifier Collection", icon: SlidersHorizontal, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  { key: "questions", step: "3B", label: "Question Engine", icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "workup", step: "4", label: "Workup Selection", icon: FlaskConical, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { key: "medication", step: "5", label: "Medication Safety", icon: Pill, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/30" },
  { key: "redFlags", step: "6", label: "Safety Screen (Red Flags)", icon: Shield, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  { key: "clusterScoring", step: "7", label: "Cluster Scoring", icon: Zap, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  { key: "diagnosisRanking", step: "8", label: "Diagnosis Ranking", icon: Activity, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  { key: "dispositionPlan", step: "9", label: "Disposition + Plan", icon: GitBranch, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { key: "audit", step: "13", label: "Audit Trail", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
];

function rowId(row: any): string {
  return row?.ruleId ?? row?.id ?? row?.questionId ?? row?.rfId ?? row?.clusterId ?? row?.dispRuleId ?? row?.templateId ?? "—";
}

function rowLabel(row: any): string {
  return row?.label ?? row?.question ?? row?.description ?? row?.diagnosisLabel ?? row?.disposition ?? row?.treatmentPlan ?? rowId(row);
}

function stringifyShort(val: any, max = 100): string {
  const s = typeof val === "string" ? val : JSON.stringify(val);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function RuleRow({ rule, tableName, layer }: { rule: any; tableName: string; layer: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = rowId(rule);
  const label = rowLabel(rule);
  return (
    <div
      className="border-b last:border-b-0 py-2.5 px-1 hover:bg-muted/30 cursor-pointer"
      onClick={() => setExpanded(e => !e)}
      data-testid={`rule-row-${id}`}
    >
      <div className="flex items-center gap-3">
        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono flex-shrink-0">{id}</code>
        <span className="text-sm flex-1 min-w-0 truncate">{label}</span>
        {rule.severity && (
          <Badge variant={rule.severity === "critical" ? "destructive" : "outline"} className="text-[10px] flex-shrink-0">
            {rule.severity}
          </Badge>
        )}
        {rule.confidence && (
          <Badge variant="outline" className="text-[10px] flex-shrink-0">{rule.confidence}</Badge>
        )}
        {rule.priority && (
          <Badge variant="outline" className="text-[10px] flex-shrink-0">P{rule.priority}</Badge>
        )}
      </div>
      {expanded && (
        <div className="mt-2 pl-4 text-xs text-muted-foreground space-y-1 border-l-2 border-muted">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3" /> <code className="font-mono">{tableName}</code>
          </div>
          {Object.entries(rule).filter(([k]) =>
            !["id", "ruleId", "questionId", "label", "question", "description", "diagnosisLabel", "disposition", "__sourceTable"].includes(k)
          ).slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground font-medium w-32 flex-shrink-0">{k}:</span>
              <span className="truncate">{JSON.stringify(v)}</span>
            </div>
          ))}
          <div className="pt-1">
            <Link href={`/knowledge-base?layer=${layer}&id=${id}`}>
              <button className="text-primary hover:underline flex items-center gap-1 text-[11px]">
                <Edit3 className="w-3 h-3" /> Edit in Knowledge Base
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceStageCard({ stage }: { stage: PipelineTrace["pipeline"][0] }) {
  const conf = PIPELINE_STAGES.find(s => s.step === stage.step)
    ?? PIPELINE_STAGES.find(s => s.key === stage.stage)
    ?? PIPELINE_STAGES.find(s => stage.stage.includes(s.key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")))
    ?? PIPELINE_STAGES[0];
  const Icon = conf.icon;

  return (
    <div
      className={`rounded-lg border p-3 ${stage.triggered ? "border-primary/30" : "border-dashed opacity-60"}`}
      data-testid={`trace-stage-${stage.stage}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${conf.color}`} />
        <span className="font-medium text-sm">{stage.label}</span>
        {stage.triggered ? (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px] ml-auto">TRIGGERED</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] ml-auto">skipped</Badge>
        )}
        <span className="text-[10px] text-muted-foreground">{stage.allRuleCount} total</span>
      </div>
      {stage.results.length > 0 && (
        <div className="space-y-1.5">
          {stage.results.slice(0, 6).map((result, i) => (
            <div key={i} className="bg-muted/40 rounded p-2 text-xs">
              <div className="flex items-center gap-2">
                {result.rank && <span className="font-medium text-muted-foreground">#{result.rank}</span>}
                <span className="font-medium flex-1 truncate">
                  {result.diagnosis ?? result.disposition ?? result.label ?? result.clusterId ?? rowLabel(result.raw ?? result)}
                </span>
                {result.score !== undefined && <Badge variant="outline" className="text-[10px]">score {result.score}</Badge>}
                {result.sourceTable && <code className="text-muted-foreground font-mono text-[9px]">{result.sourceTable}</code>}
              </div>
              {(result.plan || result.forcedByRedFlagGate) && (
                <div className="text-muted-foreground mt-1">
                  {result.forcedByRedFlagGate ? "Forced by red-flag gate. " : null}
                  {result.plan ? stringifyShort(result.plan, 140) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClinicalDecisionPipelinePage() {
  const [selectedComplaint, setSelectedComplaint] = useState<string>("");
  const [symptomInput, setSymptomInput] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [traceResult, setTraceResult] = useState<PipelineTrace | null>(null);

  const { data: complaints = [], isLoading: complaintsLoading } = useQuery<Complaint[]>({
    queryKey: ["/api/clinical-pipeline"],
    refetchInterval: false,
  });

  const { data: bundle, isLoading: bundleLoading } = useQuery<Bundle>({
    queryKey: ["/api/clinical-pipeline", selectedComplaint, "bundle"],
    enabled: !!selectedComplaint,
  });

  const traceMutation = useMutation({
    mutationFn: async ({ complaintId, syms }: { complaintId: string; syms: string[] }) => {
      const res = await apiRequest("POST", `/api/clinical-pipeline/${complaintId}/trace`, { symptoms: syms });
      return res.json();
    },
    onSuccess: (data) => setTraceResult(data),
  });

  function addSymptom() {
    const s = symptomInput.trim().toLowerCase();
    if (s && !symptoms.includes(s)) setSymptoms(p => [...p, s]);
    setSymptomInput("");
  }

  function runTrace() {
    if (!selectedComplaint || symptoms.length === 0) return;
    traceMutation.mutate({ complaintId: selectedComplaint, syms: symptoms });
  }

  return (
    <div className="flex flex-col h-full" data-testid="clinical-decision-pipeline">
      <div className="flex items-start justify-between p-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Clinical Decision Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            World B Google Sheets flow: complaint → differential → modifiers/questions → workup/meds → red flags → scoring → disposition-plan → audit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/knowledge-base">
            <Button variant="outline" size="sm" data-testid="link-knowledge-base">
              <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Edit KB
            </Button>
          </Link>
          <Link href="/trace-viewer">
            <Button variant="outline" size="sm" data-testid="link-trace-viewer">
              <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Case Traces
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r flex flex-col bg-muted/20">
          <div className="p-4 border-b">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Select Complaint
            </label>
            {complaintsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={selectedComplaint} onValueChange={(v) => { setSelectedComplaint(v); setTraceResult(null); }}>
                <SelectTrigger data-testid="select-complaint">
                  <SelectValue placeholder="Choose complaint..." />
                </SelectTrigger>
                <SelectContent>
                  {complaints.map(c => (
                    <SelectItem key={c.complaintId} value={c.complaintId}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {bundle && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Pipeline Layers
                </div>
                {PIPELINE_STAGES.map((stage, i) => {
                  const layer = bundle.layers[stage.key];
                  const Icon = stage.icon;
                  return (
                    <div key={stage.key}>
                      <div className="flex items-center gap-2 py-1.5">
                        <div className={`w-7 h-7 rounded-md ${stage.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${stage.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">Step {stage.step} — {stage.label}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {layer?.count ?? 0} {layer?.unit ?? "row"}{(layer?.count ?? 0) !== 1 ? "s" : ""}
                          </div>
                        </div>
                        {(layer?.count ?? 0) > 0 ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div className="flex justify-center">
                          <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                  );
                })}

                <Separator className="my-2" />

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">World</span>
                    <span className="font-medium text-right">{bundle.world ?? "World B"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total source rows</span>
                    <span className="font-medium">{bundle.summary.totalRules}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium">{bundle.complaint.category ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Engine</span>
                    <Badge variant="outline" className="text-[10px]">{bundle.complaint.urgencyLevel ?? "—"}</Badge>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          {!selectedComplaint && (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <Layers className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Select a complaint to explore its World B decision pipeline</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedComplaint ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Activity className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">Select a Complaint</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a chief complaint to view the source-mapped clinical reasoning pipeline.
                </p>
              </div>
            </div>
          ) : bundleLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : bundle ? (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-4 pb-0 border-b">
                <div className="mb-2">
                  <h2 className="text-lg font-semibold">{bundle.complaint.label}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{bundle.complaint.complaintId}</p>
                </div>
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="map" data-testid="tab-map">World B Map</TabsTrigger>
                  <TabsTrigger value="rules" data-testid="tab-rules">Source Rows</TabsTrigger>
                  <TabsTrigger value="trace" data-testid="tab-trace">Live Trace</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">Change History</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="flex-1 overflow-auto p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {PIPELINE_STAGES.map(stage => {
                    const layer = bundle.layers[stage.key];
                    const Icon = stage.icon;
                    return (
                      <Card key={stage.key} className={(layer?.count ?? 0) === 0 ? "border-dashed opacity-70" : ""}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-7 h-7 rounded-md ${stage.bg} flex items-center justify-center`}>
                              <Icon className={`w-3.5 h-3.5 ${stage.color}`} />
                            </div>
                            <span className="text-xs font-medium">Step {stage.step}</span>
                          </div>
                          <div className="text-sm font-medium leading-tight">{stage.label}</div>
                          <div className={`text-2xl font-bold ${stage.color}`}>{layer?.count ?? 0}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(layer?.count ?? 0) === 0 ? `⚠ No ${layer?.unit ?? "rows"} configured` : `${layer?.unit ?? "source row"}${(layer?.count ?? 0) !== 1 ? "s" : ""}`}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {!bundle.summary.hasDiagnosis && (
                  <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                    <CardContent className="p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-amber-800 dark:text-amber-400">No Early Differential</div>
                        <div className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                          Questions and workup need diagnosis/rule-out targets immediately after chief complaint.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {!bundle.summary.hasRedFlags && (
                  <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                    <CardContent className="p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-amber-800 dark:text-amber-400">No Red Flag Rules</div>
                        <div className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                          This complaint has no red flag detection rows in RED_FLAG_RULES or RED_FLAGS_MASTER.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {!bundle.summary.hasDisposition && (
                  <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
                    <CardContent className="p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-red-800 dark:text-red-400">No Disposition + Plan</div>
                        <div className="text-xs text-red-700 dark:text-red-500 mt-0.5">
                          DISPOSITION_RULES and OUTPUT_TEMPLATES must be connected so the route and plan travel together.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Link href={`/knowledge-base?complaint=${selectedComplaint}&layer=differential`}>
                      <Button variant="outline" size="sm" className="gap-1.5"><Target className="w-3.5 h-3.5" /> Edit Differential</Button>
                    </Link>
                    <Link href={`/knowledge-base?complaint=${selectedComplaint}&layer=modifiers`}>
                      <Button variant="outline" size="sm" className="gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" /> Edit Modifiers</Button>
                    </Link>
                    <Link href={`/knowledge-base?complaint=${selectedComplaint}&layer=red-flags`}>
                      <Button variant="outline" size="sm" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Edit Red Flags</Button>
                    </Link>
                    <Link href={`/knowledge-base?complaint=${selectedComplaint}&layer=disposition-plan`}>
                      <Button variant="outline" size="sm" className="gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Edit Disposition + Plan</Button>
                    </Link>
                    <Link href={`/audit-reports?complaint=${selectedComplaint}`}>
                      <Button variant="outline" size="sm" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Audit Reports</Button>
                    </Link>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="map" className="flex-1 overflow-auto p-6 space-y-4">
                {(bundle.sourceMap ?? []).map(entry => (
                  <Card key={entry.key} data-testid={`source-map-${entry.key}`}>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm">{entry.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 space-y-2">
                      <p className="text-xs text-muted-foreground">{entry.purpose}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.sourceTables.map(table => (
                          <Badge key={table} variant="outline" className="text-[10px] font-mono">{table}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="rules" className="flex-1 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-4">
                    {PIPELINE_STAGES.map(stage => {
                      const layer = bundle.layers[stage.key];
                      const tableName = layer?.sourceTables?.join(" + ") ?? stage.key;
                      const Icon = stage.icon;
                      return (
                        <Card key={stage.key} data-testid={`layer-card-${stage.key}`}>
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-md ${stage.bg} flex items-center justify-center`}>
                                <Icon className={`w-3.5 h-3.5 ${stage.color}`} />
                              </div>
                              <CardTitle className="text-sm">Step {stage.step} — {stage.label}</CardTitle>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {layer?.count ?? 0} {layer?.unit ?? "row"}{(layer?.count ?? 0) !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <code className="text-[9px] text-muted-foreground font-mono block mt-1">{tableName}</code>
                          </CardHeader>
                          {(layer?.rows.length ?? 0) > 0 ? (
                            <CardContent className="px-4 pb-3 pt-0">
                              {layer.rows.slice(0, 80).map((row, i) => (
                                <RuleRow key={i} rule={row} tableName={row.__sourceTable ?? tableName} layer={stage.key} />
                              ))}
                            </CardContent>
                          ) : (
                            <CardContent className="px-4 pb-4 pt-0">
                              <p className="text-xs text-muted-foreground italic">No source rows configured for this layer.</p>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="trace" className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Play className="w-4 h-4 text-primary" /> Live Decision Trace
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Enter symptom features such as <code>chest_pain</code>, <code>shortness_of_breath</code>, or <code>fever</code> to trace World B provenance.
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add symptom feature..."
                        value={symptomInput}
                        onChange={e => setSymptomInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addSymptom()}
                        className="flex-1"
                        data-testid="input-symptom"
                      />
                      <Button variant="outline" size="sm" onClick={addSymptom}>Add</Button>
                    </div>
                    {symptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {symptoms.map(s => (
                          <Badge key={s} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSymptoms(p => p.filter(x => x !== s))}>
                            {s} ×
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Button
                      onClick={runTrace}
                      disabled={symptoms.length === 0 || traceMutation.isPending}
                      className="w-full"
                      data-testid="button-run-trace"
                    >
                      {traceMutation.isPending ? (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running trace...</>
                      ) : (
                        <><Play className="w-3.5 h-3.5 mr-1.5" /> Run Pipeline Trace</>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {traceResult && (
                  <ScrollArea className="flex-1">
                    <div className="space-y-3">
                      <Card className={`border-2 ${traceResult.isEscalated ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-green-400 bg-green-50 dark:bg-green-950/20"}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          {traceResult.isEscalated ? (
                            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-sm">Final Disposition</div>
                            <div className="text-xs">{traceResult.finalDisposition}</div>
                          </div>
                          {traceResult.topDiagnosis && (
                            <div className="text-right">
                              <div className="text-[10px] text-muted-foreground">Top Diagnosis</div>
                              <div className="text-xs font-medium">{traceResult.topDiagnosis.diagnosis ?? traceResult.topDiagnosis.label}</div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <div className="space-y-2">
                        {traceResult.pipeline.map((stage, i) => (
                          <div key={stage.stage} className="flex gap-2">
                            <div className="flex flex-col items-center">
                              <div className={`min-w-7 h-7 px-1 rounded-full flex items-center justify-center text-[10px] font-bold ${stage.triggered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                {stage.step ?? i + 1}
                              </div>
                              {i < traceResult.pipeline.length - 1 && (
                                <div className="w-0.5 flex-1 bg-muted mt-0.5" />
                              )}
                            </div>
                            <div className="flex-1 pb-2">
                              <TraceStageCard stage={stage} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Traced at {new Date(traceResult.tracedAt).toLocaleTimeString()} · {traceResult.activeRuleCount} active source rows
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-2">
                    {bundle.changeHistory.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No changes recorded yet</p>
                      </div>
                    ) : bundle.changeHistory.map((ch, i) => (
                      <div key={i} className="border rounded-md p-3 text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          <ChevronRight className="w-3.5 h-3.5" />
                          {ch.changeType ?? ch.change_type ?? "Change"}
                          {ch.layer && <Badge variant="outline" className="text-[9px]">{ch.layer}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{new Date(ch.createdAt ?? ch.created_at).toLocaleString()}</span>
                          {ch.changedBy ?? ch.changed_by ? <span>by <strong>{ch.changedBy ?? ch.changed_by}</strong></span> : null}
                          {ch.reviewedBy ?? ch.reviewed_by ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[9px]">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> reviewed
                            </Badge>
                          ) : null}
                        </div>
                        {ch.description && <p className="text-xs mt-1 text-muted-foreground">{ch.description}</p>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </div>
    </div>
  );
}
