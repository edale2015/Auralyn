import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Plus, Trash2, Save, FlaskConical, Zap, Brain,
  BarChart3, GitBranch, ExternalLink, ChevronDown, ChevronUp,
  Clock, Target, TrendingUp, Map, Shield, Activity,
  FileText, Code2, Layers,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoldenCase {
  id: string;
  input?: { complaint?: string; symptoms?: string[]; age?: number; ageYears?: number; vitals?: Record<string, number> };
  expected?: { diagnosis?: string; disposition?: string; canonicalDisposition?: string; broadCategory?: string; notes?: string };
  result?: any;
  status?: "pass" | "fail" | "pending";
  ranAt?: string;
}

interface PipelineTraceStage { stage: string; status: string; durationMs?: number; output?: any }

interface EnrichedRunResult {
  id: string;
  passed: boolean;
  latencyMs: number;
  actualDisposition?: string;
  expectedDisposition?: string;
  failReason?: string | null;
  error?: string;
  pipelineVersion?: string;
  topDiagnosis?: string;
  safetyFlags?: string[];
  trace?: { stages?: PipelineTraceStage[]; pipelineVersion?: string; duration?: number };
  scoringTrace?: { hybridTop?: Array<{ dx: string; hybridScore: number; rlhfWeight: number; bayesScore: number }>; weightVersion?: string; overallRisk?: string };
}

interface BatchRunResponse {
  ok: boolean;
  ran: number;
  passed: number;
  failed: number;
  passRate: number;
  pipelineVersion?: string;
  results: EnrichedRunResult[];
}

interface StressResult {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSecond: number;
  breakdown: Record<string, number>;
}

interface KnowledgeSource {
  file: string;
  description: string;
  editPath?: string;
  medicationGovernance?: Record<string, string>;
}

interface KnowledgeMap {
  ok: boolean;
  sourceOfTruth: Record<string, KnowledgeSource>;
  executionPaths: Record<string, string>;
  connectedLayers: string[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PassBadge({ status }: { status?: string }) {
  if (status === "pass") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Pass</span>;
  if (status === "fail") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><XCircle className="h-3 w-3" /> Fail</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Clock className="h-3 w-3" /> Pending</span>;
}

function DispositionChip({ label }: { label?: string }) {
  if (!label) return null;
  const d = label.toUpperCase();
  const color = d.includes("ER_NOW") || d.includes("911") ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    : d.includes("URGENT") ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
    : d.includes("ROUTINE") ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${color}`}>{label}</span>;
}

function BigStat({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-4xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide font-medium">{label}</div>
    </div>
  );
}

function TracePanel({ result }: { result: EnrichedRunResult }) {
  const [open, setOpen] = useState(false);
  const stages = result.trace?.stages ?? [];
  const hybrid = result.scoringTrace?.hybridTop ?? [];
  const hasData = stages.length > 0 || hybrid.length > 0 || (result.safetyFlags?.length ?? 0) > 0;

  if (!hasData) return null;

  return (
    <div className="mt-1.5">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid={`trace-toggle-${result.id}`}
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <Activity className="h-3 w-3" />
        {open ? "Hide trace" : "Show pipeline trace"}
        {result.pipelineVersion && <span className="ml-1 opacity-60">{result.pipelineVersion}</span>}
      </button>

      {open && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-border/60" data-testid={`trace-panel-${result.id}`}>
          {result.topDiagnosis && (
            <div className="text-xs"><span className="text-muted-foreground">Top diagnosis: </span><span className="font-medium">{result.topDiagnosis}</span></div>
          )}
          {(result.safetyFlags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.safetyFlags!.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 text-xs font-mono">
                  <Shield className="h-2.5 w-2.5" />{f}
                </span>
              ))}
            </div>
          )}
          {stages.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline stages</p>
              {stages.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${s.status === "ok" || s.status === "pass" ? "bg-green-50 dark:bg-green-900/10" : s.status === "error" ? "bg-red-50 dark:bg-red-900/10" : "bg-muted/40"}`}>
                  {(s.status === "ok" || s.status === "pass") ? <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> : s.status === "error" ? <XCircle className="h-3 w-3 text-red-600 shrink-0" /> : <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  <span className="font-mono font-medium">{s.stage}</span>
                  {s.durationMs != null && <span className="text-muted-foreground ml-auto">{s.durationMs}ms</span>}
                </div>
              ))}
            </div>
          )}
          {hybrid.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hybrid scoring top-3</p>
              {hybrid.slice(0, 3).map((h, i) => (
                <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/10 flex justify-between gap-4">
                  <span className="font-medium">{h.dx}</span>
                  <span className="text-muted-foreground">hybrid {h.hybridScore?.toFixed(3)} | rlhf {h.rlhfWeight?.toFixed(3)} | bayes {h.bayesScore?.toFixed(3)}</span>
                </div>
              ))}
              {result.scoringTrace?.weightVersion && <span className="text-xs text-muted-foreground">Weight version: {result.scoringTrace.weightVersion}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditableCase({ c, onSave, onDelete }: { c: GoldenCase; onSave: (c: GoldenCase) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(c.id);
  const [complaint, setComplaint] = useState(c.input?.complaint ?? "");
  const [symptoms, setSymptoms] = useState((c.input?.symptoms ?? []).join(", "));
  const [age, setAge] = useState(String(c.input?.age ?? ""));
  const [expectedDx, setExpectedDx] = useState(c.expected?.diagnosis ?? "");
  const [expectedDisp, setExpectedDisp] = useState(c.expected?.canonicalDisposition ?? c.expected?.disposition ?? "");

  function save() {
    onSave({ ...c, id, input: { complaint, symptoms: symptoms.split(",").map(s => s.trim()).filter(Boolean), age: age ? Number(age) : undefined }, expected: { diagnosis: expectedDx, canonicalDisposition: expectedDisp, disposition: expectedDisp } });
    setOpen(false);
  }

  const actualDisp = c.result?.safetyDisposition ?? c.result?.disposition ?? c.result?.status;

  return (
    <div className={`rounded-lg border ${c.status === "fail" ? "border-red-300 bg-red-50/30 dark:bg-red-900/10" : c.status === "pass" ? "border-green-300 bg-green-50/30 dark:bg-green-900/10" : "border-border bg-card"}`} data-testid={`case-item-${c.id}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <PassBadge status={c.status} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{c.id}</p>
          <p className="text-xs text-muted-foreground truncate">{c.input?.complaint ?? "—"} · age {c.input?.age ?? "?"} · {(c.input?.symptoms ?? []).join(", ")}</p>
        </div>
        {c.ranAt && <span className="text-xs text-muted-foreground hidden sm:block">{new Date(c.ranAt).toLocaleTimeString()}</span>}
        <div className="flex gap-2 items-center">
          {actualDisp && <DispositionChip label={actualDisp} />}
          <button className="text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(c.id); }} data-testid={`delete-case-${c.id}`}><Trash2 className="h-4 w-4" /></button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-3">
          {c.status === "fail" && c.result && (
            <div className="p-3 rounded bg-red-100 dark:bg-red-900/20 text-xs text-red-800 dark:text-red-300">
              <strong>Failure:</strong> expected <DispositionChip label={c.expected?.canonicalDisposition ?? c.expected?.disposition} /> but got <DispositionChip label={actualDisp} />
              {c.expected?.notes && <div className="mt-1 text-muted-foreground">{c.expected.notes}</div>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Case ID</Label><Input data-testid={`input-case-id-${c.id}`} className="h-8 text-sm mt-1" value={id} onChange={e => setId(e.target.value)} /></div>
            <div><Label className="text-xs">Complaint</Label><Input data-testid={`input-complaint-${c.id}`} className="h-8 text-sm mt-1" value={complaint} onChange={e => setComplaint(e.target.value)} /></div>
            <div><Label className="text-xs">Symptoms (comma-separated)</Label><Input data-testid={`input-symptoms-${c.id}`} className="h-8 text-sm mt-1" value={symptoms} onChange={e => setSymptoms(e.target.value)} /></div>
            <div><Label className="text-xs">Age</Label><Input data-testid={`input-age-${c.id}`} type="number" className="h-8 text-sm mt-1" value={age} onChange={e => setAge(e.target.value)} /></div>
            <div><Label className="text-xs">Expected Diagnosis</Label><Input data-testid={`input-expected-dx-${c.id}`} className="h-8 text-sm mt-1" value={expectedDx} onChange={e => setExpectedDx(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Expected Disposition (canonical)</Label>
              <Input data-testid={`input-expected-disp-${c.id}`} className="h-8 text-sm mt-1 font-mono" placeholder="MONITOR / ER_NOW / URGENT_24H / ROUTINE_72H" value={expectedDisp} onChange={e => setExpectedDisp(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={save} data-testid={`save-case-${c.id}`}><Save className="h-3.5 w-3.5 mr-1.5" /> Save Changes</Button>
        </div>
      )}
    </div>
  );
}

// ── Knowledge Map Tab ─────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, typeof FileText> = {
  complaints: Layers, packRows: Layers, scoringRules: BarChart3, redFlags: Shield,
  dispositionRules: Shield, diagnosisRanking: Brain, medications: FileText,
  hardStops: Shield, bayesianPriors: BarChart3,
};

function KnowledgeMapTab() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery<KnowledgeMap>({ queryKey: ["/api/test/golden/knowledge-map"] });

  if (q.isLoading) return <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><RefreshCw className="h-4 w-4 animate-spin" /> Loading knowledge map…</div>;
  if (q.isError || !q.data?.ok) return <div className="text-destructive text-sm py-4">Failed to load knowledge map.</div>;

  const { sourceOfTruth, executionPaths, connectedLayers } = q.data;

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Map className="h-4 w-4 text-blue-500" /> Clinical Knowledge Sources</CardTitle>
          <p className="text-xs text-muted-foreground">Every file that drives a clinical decision — where to find it, what it controls, and how to edit it safely.</p>
        </CardHeader>
        <CardContent className="pb-4 space-y-2">
          {Object.entries(sourceOfTruth).map(([key, src]) => {
            const Icon = SOURCE_ICONS[key] ?? FileText;
            const isOpen = expanded === key;
            return (
              <div key={key} className="rounded-lg border border-border/60 overflow-hidden" data-testid={`knowledge-source-${key}`}>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left" onClick={() => setExpanded(isOpen ? null : key)}>
                  <Icon className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">{src.file}</p>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pt-1 border-t border-border/40 space-y-2 bg-muted/20">
                    <p className="text-sm text-foreground/80">{src.description}</p>
                    {src.editPath && (
                      <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">How to edit</p>
                        <p className="text-xs text-blue-700 dark:text-blue-400">{src.editPath}</p>
                      </div>
                    )}
                    {src.medicationGovernance && (
                      <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 space-y-1">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Governance workflow</p>
                        {Object.entries(src.medicationGovernance).map(([k, v]) => (
                          <p key={k} className="text-xs text-amber-700 dark:text-amber-400"><strong>{k}:</strong> {v}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Code2 className="h-4 w-4 text-purple-500" /> Execution Paths</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-2">
            {Object.entries(executionPaths).map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="font-medium capitalize text-foreground/80">{k.replace(/([A-Z])/g, " $1").trim()}: </span>
                <span className="font-mono text-muted-foreground">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-green-500" /> Connected Layers ({connectedLayers.length})</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-1">
              {connectedLayers.map((l, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground flex gap-2">
                  <span className="text-green-500 shrink-0">→</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClinicalTestBenchPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("run");
  const [lastRunResult, setLastRunResult] = useState<BatchRunResponse | null>(null);
  const [stressTotal, setStressTotal] = useState("20");
  const [stressConcurrency, setStressConcurrency] = useState("5");
  const [lastStressResult, setLastStressResult] = useState<StressResult | null>(null);
  const [stressError, setStressError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newComplaint, setNewComplaint] = useState("");
  const [newSymptoms, setNewSymptoms] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newExpectedDx, setNewExpectedDx] = useState("");
  const [newExpectedDisp, setNewExpectedDisp] = useState("");

  const casesQuery = useQuery<{ ok: boolean; cases: GoldenCase[] }>({ queryKey: ["/api/test/golden"] });

  const weightStatsQuery = useQuery<{ active: boolean; updates: number; avgDelta: number }>({
    queryKey: ["/api/governance/learning/weights/stats"],
  });

  const weightDeltasQuery = useQuery<{ deltas: Record<string, number> }>({
    queryKey: ["/api/governance/learning/weights/deltas"],
  });

  const runAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/test/golden/run-all", {}),
    onSuccess: (data: any) => {
      setLastRunResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/test/golden"] });
      const emoji = data.passRate === 100 ? "🎉" : data.passRate >= 75 ? "⚠️" : "🔴";
      toast({ title: `${emoji} Run complete: ${data.passRate}% pass rate`, description: `${data.passed} passed, ${data.failed} failed out of ${data.ran} cases` });
    },
    onError: (e: any) => toast({ title: "Run failed", description: e?.message, variant: "destructive" }),
  });

  const stressMutation = useMutation({
    mutationFn: () => {
      setStressError(null);
      return apiRequest("POST", "/api/test/golden/stress-run", {
        total: parseInt(stressTotal) || 20,
        concurrency: parseInt(stressConcurrency) || 5,
      });
    },
    onSuccess: (data: any) => {
      setLastStressResult(data.result);
      setStressError(null);
      toast({ title: "Stress test complete", description: `${data.result?.completed}/${data.result?.total} succeeded, avg ${data.result?.avgLatencyMs}ms` });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Stress test failed";
      setStressError(msg);
      toast({ title: "Stress test failed", description: msg, variant: "destructive" });
    },
  });

  const saveCaseMutation = useMutation({
    mutationFn: (c: GoldenCase) => apiRequest("POST", "/api/test/golden/save", c),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/test/golden"] }); toast({ title: "Case saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", "/api/test/golden/delete", { id }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/test/golden"] }); toast({ title: "Case deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const addCaseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/test/golden/save", {
      id: newId,
      input: { complaint: newComplaint, symptoms: newSymptoms.split(",").map(s => s.trim()).filter(Boolean), age: newAge ? Number(newAge) : undefined },
      expected: { diagnosis: newExpectedDx, canonicalDisposition: newExpectedDisp, disposition: newExpectedDisp },
      status: "pending",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test/golden"] });
      toast({ title: "Case added" });
      setNewId(""); setNewComplaint(""); setNewSymptoms(""); setNewAge(""); setNewExpectedDx(""); setNewExpectedDisp("");
    },
    onError: (e: any) => toast({ title: "Add failed", description: e?.message, variant: "destructive" }),
  });

  const cases = casesQuery.data?.cases ?? [];
  const passed = cases.filter(c => c.status === "pass").length;
  const failed = cases.filter(c => c.status === "fail").length;
  const pending = cases.filter(c => c.status === "pending").length;
  const passRate = cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0;
  const stressTotalNum = parseInt(stressTotal) || 20;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-blue-500" /> Clinical Test Bench
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Run golden cases, stress-test the engine, inspect pipeline traces, and map every clinical knowledge source.
          </p>
        </div>
        <Link href="/decision-tree">
          <Button variant="outline" size="sm" data-testid="button-open-decision-tree">
            <GitBranch className="h-4 w-4 mr-1.5" /> Decision Tree <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60"><CardContent className="pt-4 pb-3 text-center"><div className="text-3xl font-black text-slate-700 dark:text-slate-300">{cases.length}</div><div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Total Cases</div></CardContent></Card>
        <Card className={`border-border/60 ${passed > 0 ? "border-green-200 bg-green-50/50 dark:bg-green-900/10" : ""}`}><CardContent className="pt-4 pb-3 text-center"><div className="text-3xl font-black text-green-600">{passed}</div><div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Passing</div></CardContent></Card>
        <Card className={`border-border/60 ${failed > 0 ? "border-red-200 bg-red-50/50 dark:bg-red-900/10" : ""}`}><CardContent className="pt-4 pb-3 text-center"><div className="text-3xl font-black text-red-600">{failed}</div><div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Failing</div></CardContent></Card>
        <Card className="border-border/60"><CardContent className="pt-4 pb-3 text-center"><div className={`text-3xl font-black ${passRate === 100 ? "text-green-600" : passRate >= 80 ? "text-yellow-600" : "text-red-600"}`}>{cases.some(c => c.status !== "pending") ? `${passRate}%` : "—"}</div><div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Pass Rate</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="run" data-testid="tab-run">Run Tests</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">Golden Cases ({cases.length})</TabsTrigger>
          <TabsTrigger value="weights" data-testid="tab-weights">Weights & Logic</TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge"><Map className="h-3.5 w-3.5 mr-1.5" />Knowledge Map</TabsTrigger>
        </TabsList>

        {/* ── Run Tests ─────────────────────────────────────────────────────── */}
        <TabsContent value="run" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-5 w-5 text-blue-500" /> Golden Case Suite</CardTitle>
                <p className="text-xs text-muted-foreground">Runs all {cases.length} golden cases through the full 9-stage clinical pipeline and compares results.</p>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                {lastRunResult?.pipelineVersion && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded bg-muted/50">
                    <Activity className="h-3 w-3" />
                    Pipeline <span className="font-mono font-medium">{lastRunResult.pipelineVersion}</span>
                  </div>
                )}
                <Button size="lg" className="w-full" onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending || cases.length === 0} data-testid="button-run-all-golden">
                  {runAllMutation.isPending
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running {cases.length} cases…</>
                    : <><Play className="h-4 w-4 mr-2" /> Run All {cases.length} Golden Cases</>}
                </Button>

                {lastRunResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <BigStat value={`${lastRunResult.passRate}%`} label="Pass Rate" color={lastRunResult.passRate === 100 ? "text-green-600" : lastRunResult.passRate >= 75 ? "text-yellow-600" : "text-red-600"} />
                      <BigStat value={lastRunResult.passed} label="Passed" color="text-green-600" />
                      <BigStat value={lastRunResult.failed} label="Failed" color="text-red-600" />
                    </div>
                    <Progress value={lastRunResult.passRate} className="h-3" />

                    <div className="space-y-2">
                      {lastRunResult.results.map(r => (
                        <div key={r.id} data-testid={`run-result-${r.id}`}
                          className={`px-3 py-2 rounded text-xs ${r.passed ? "bg-green-50 dark:bg-green-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                              <span className="font-mono font-medium">{r.id}</span>
                              {r.topDiagnosis && <span className="text-muted-foreground hidden sm:inline">· {r.topDiagnosis}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.actualDisposition && <DispositionChip label={r.actualDisposition} />}
                              <span className="text-muted-foreground">{r.latencyMs}ms</span>
                            </div>
                          </div>
                          {!r.passed && (r.failReason || r.error) && (
                            <div className="mt-1 text-red-600 dark:text-red-400 pl-5">{r.failReason ?? r.error}</div>
                          )}
                          <TracePanel result={r} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Stress Test</CardTitle>
                <p className="text-xs text-muted-foreground">Generate synthetic complaints and run them in parallel through the engine. Caps at 5 000 / 50 concurrency.</p>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Complaints</Label>
                    <Input type="number" value={stressTotal} onChange={e => setStressTotal(e.target.value)} className="h-9 mt-1" data-testid="input-stress-total" min={1} max={5000} />
                  </div>
                  <div>
                    <Label className="text-xs">Concurrency</Label>
                    <Input type="number" value={stressConcurrency} onChange={e => setStressConcurrency(e.target.value)} className="h-9 mt-1" data-testid="input-stress-concurrency" min={1} max={50} />
                  </div>
                </div>

                {stressTotalNum > 100 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Large run — request will stay open until complete. Keep this tab active.
                  </div>
                )}

                <Button size="lg" variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400" onClick={() => stressMutation.mutate()} disabled={stressMutation.isPending} data-testid="button-run-stress">
                  {stressMutation.isPending
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running {stressTotal} complaints…</>
                    : <><Zap className="h-4 w-4 mr-2" /> Run {stressTotal} Complaints</>}
                </Button>

                {stressError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-xs text-red-800 dark:text-red-400" data-testid="stress-error">
                    <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span><strong>Error:</strong> {stressError}</span>
                  </div>
                )}

                {lastStressResult && !stressError && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <BigStat value={`${Math.round((lastStressResult.successRate ?? 0) * 100)}%`} label="Success" color={(lastStressResult.successRate ?? 0) >= 0.95 ? "text-green-600" : "text-orange-600"} />
                      <BigStat value={`${lastStressResult.avgLatencyMs}ms`} label="Avg Latency" color="text-blue-600" />
                      <BigStat value={`${lastStressResult.p95LatencyMs}ms`} label="P95" color="text-purple-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium">{lastStressResult.completed}/{lastStressResult.total}</span></div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between"><span className="text-muted-foreground">Throughput</span><span className="font-medium">{lastStressResult.throughputPerSecond?.toFixed(1)}/s</span></div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between"><span className="text-muted-foreground">Max latency</span><span className="font-medium">{lastStressResult.maxLatencyMs}ms</span></div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between"><span className="text-muted-foreground">Failed</span><span className={`font-medium ${lastStressResult.failed > 0 ? "text-red-600" : "text-green-600"}`}>{lastStressResult.failed}</span></div>
                    </div>
                    {Object.keys(lastStressResult.breakdown ?? {}).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Disposition Breakdown</p>
                        <div className="space-y-1">
                          {Object.entries(lastStressResult.breakdown).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-36 truncate font-mono">{k}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round((v / lastStressResult.total) * 100)}%` }} /></div>
                              <span className="font-medium w-8 text-right">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-purple-500" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Decision Tree Explorer</p>
                  <p className="text-xs text-muted-foreground">Visual graph of the clinical decision pipeline — nodes, red flags, scoring rules, and dispositions.</p>
                </div>
                <Link href="/decision-tree">
                  <Button variant="outline" size="sm" data-testid="button-goto-decision-tree">Open Tree <ExternalLink className="h-3.5 w-3.5 ml-1.5" /></Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Golden Cases ──────────────────────────────────────────────────── */}
        <TabsContent value="cases" className="space-y-4 mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-green-500" /> Add New Golden Case</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Case ID *</Label><Input data-testid="input-new-id" className="h-8 text-sm mt-1" placeholder="eg. chest_pain_01" value={newId} onChange={e => setNewId(e.target.value)} /></div>
                <div><Label className="text-xs">Complaint</Label><Input data-testid="input-new-complaint" className="h-8 text-sm mt-1" placeholder="eg. sore_throat" value={newComplaint} onChange={e => setNewComplaint(e.target.value)} /></div>
                <div><Label className="text-xs">Age</Label><Input data-testid="input-new-age" type="number" className="h-8 text-sm mt-1" placeholder="eg. 45" value={newAge} onChange={e => setNewAge(e.target.value)} /></div>
                <div className="sm:col-span-2"><Label className="text-xs">Symptoms (comma-separated)</Label><Input data-testid="input-new-symptoms" className="h-8 text-sm mt-1" placeholder="eg. fever, sore throat, no cough" value={newSymptoms} onChange={e => setNewSymptoms(e.target.value)} /></div>
                <div><Label className="text-xs">Expected Diagnosis</Label><Input data-testid="input-new-dx" className="h-8 text-sm mt-1" placeholder="eg. strep_throat" value={newExpectedDx} onChange={e => setNewExpectedDx(e.target.value)} /></div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Expected Disposition (canonical)</Label>
                  <Input data-testid="input-new-disp" className="h-8 text-sm mt-1 font-mono" placeholder="MONITOR / ER_NOW / URGENT_24H / ROUTINE_72H" value={newExpectedDisp} onChange={e => setNewExpectedDisp(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={() => addCaseMutation.mutate()} disabled={!newId || addCaseMutation.isPending} data-testid="button-add-case">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Case
                </Button>
                <span className="text-xs text-muted-foreground">Valid canonical dispositions: <span className="font-mono">MONITOR · ER_NOW · URGENT_24H · ROUTINE_72H · SELF_CARE</span></span>
              </div>
            </CardContent>
          </Card>

          {failed > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-400 font-medium">{failed} case{failed > 1 ? "s" : ""} failing — expand to see actual vs expected disposition</span>
            </div>
          )}

          <div className="space-y-2">
            {casesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4"><RefreshCw className="h-4 w-4 animate-spin" /> Loading cases…</div>
            ) : cases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No golden cases yet. Add one above.</div>
            ) : (
              cases.map(c => (
                <EditableCase key={c.id} c={c} onSave={updated => saveCaseMutation.mutate(updated)} onDelete={id => deleteCaseMutation.mutate(id)} />
              ))
            )}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending || cases.length === 0} data-testid="button-run-all-from-cases">
              {runAllMutation.isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…</> : <><Play className="h-3.5 w-3.5 mr-1.5" /> Run All Cases Now</>}
            </Button>
          </div>
        </TabsContent>

        {/* ── Weights & Logic ───────────────────────────────────────────────── */}
        <TabsContent value="weights" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-3"><TrendingUp className="h-5 w-5 text-blue-500" /><span className="font-semibold text-sm">Learning State</span></div>
                {weightStatsQuery.isLoading ? <div className="text-muted-foreground text-sm">Loading…</div> : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={weightStatsQuery.data?.active ? "text-green-600 font-medium" : "text-muted-foreground"}>{weightStatsQuery.data?.active ? "Active" : "Idle"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Updates</span><span className="font-medium">{weightStatsQuery.data?.updates ?? 0}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Avg Delta</span><span className="font-medium">{(weightStatsQuery.data?.avgDelta ?? 0).toFixed(4)}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 md:col-span-2">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-3"><BarChart3 className="h-5 w-5 text-purple-500" /><span className="font-semibold text-sm">Recent Weight Deltas</span></div>
                {weightDeltasQuery.isLoading ? <div className="text-muted-foreground text-sm">Loading…</div>
                  : Object.keys(weightDeltasQuery.data?.deltas ?? {}).length === 0
                    ? <div className="text-muted-foreground text-sm">No weight changes recorded yet. Run cases to generate learning signals.</div>
                    : (
                      <div className="space-y-1.5">
                        {Object.entries(weightDeltasQuery.data?.deltas ?? {}).slice(0, 12).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-48 truncate font-mono">{k}</span>
                            <div className="flex-1 bg-muted rounded-full h-1.5"><div className={`h-1.5 rounded-full ${v >= 0 ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${Math.min(Math.abs(v) * 100, 100)}%` }} /></div>
                            <span className={`font-medium w-16 text-right ${v >= 0 ? "text-green-600" : "text-red-600"}`}>{v >= 0 ? "+" : ""}{v.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Brain className="h-4 w-4 text-orange-500" /> How Weights Work</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-sm text-muted-foreground space-y-2">
              <p>The clinical engine learns from case outcomes through reinforcement signals. When a physician overrides a disposition, or when a case is marked as a golden case failure, the engine adjusts the weights associated with the symptoms, modifiers, and scoring rules that influenced that decision.</p>
              <p>Weights are stored in memory and persisted to Redis. They decay toward zero over time if not reinforced, preventing drift from stale signals.</p>
              <p>Run golden cases after adjusting expected dispositions in the <strong>Golden Cases</strong> tab to generate learning signals.</p>
              <div className="flex gap-3 pt-2">
                <Link href="/decision-tree"><Button size="sm" variant="outline" data-testid="button-weights-to-tree"><GitBranch className="h-3.5 w-3.5 mr-1.5" /> View Decision Tree</Button></Link>
                <Link href="/engine-metrics"><Button size="sm" variant="outline" data-testid="button-weights-to-engine-metrics"><BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Engine Metrics</Button></Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Knowledge Map ─────────────────────────────────────────────────── */}
        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeMapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
