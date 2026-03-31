import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Plus, Trash2, Save, Edit3, FlaskConical, Zap, Brain,
  BarChart3, GitBranch, ExternalLink, ChevronDown, ChevronUp,
  Clock, Target, TrendingUp,
} from "lucide-react";
import { Link } from "wouter";

interface GoldenCase {
  id: string;
  input?: {
    complaint?: string;
    symptoms?: string[];
    age?: number;
  };
  expected?: {
    diagnosis?: string;
    disposition?: string;
  };
  result?: any;
  status?: "pass" | "fail" | "pending";
  ranAt?: string;
}

interface RunResult {
  id: string;
  passed: boolean;
  latencyMs: number;
  actual?: any;
  expected?: any;
  failReason?: string | null;
  error?: string;
}

interface BatchRunResponse {
  ok: boolean;
  ran: number;
  passed: number;
  failed: number;
  passRate: number;
  results: RunResult[];
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

function PassBadge({ status }: { status?: string }) {
  if (status === "pass") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle2 className="h-3 w-3" /> Pass</span>;
  if (status === "fail") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><XCircle className="h-3 w-3" /> Fail</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Clock className="h-3 w-3" /> Pending</span>;
}

function BigStat({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-4xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide font-medium">{label}</div>
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
  const [expectedDisp, setExpectedDisp] = useState(c.expected?.disposition ?? "");

  function save() {
    onSave({
      ...c,
      id,
      input: { complaint, symptoms: symptoms.split(",").map(s => s.trim()).filter(Boolean), age: age ? Number(age) : undefined },
      expected: { diagnosis: expectedDx, disposition: expectedDisp },
    });
    setOpen(false);
  }

  return (
    <div className={`rounded-lg border ${c.status === "fail" ? "border-red-300 bg-red-50/30 dark:bg-red-900/10" : c.status === "pass" ? "border-green-300 bg-green-50/30 dark:bg-green-900/10" : "border-border bg-card"}`}
      data-testid={`case-item-${c.id}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <PassBadge status={c.status} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{c.id}</p>
          <p className="text-xs text-muted-foreground truncate">
            {c.input?.complaint ?? "—"} · age {c.input?.age ?? "?"} · {(c.input?.symptoms ?? []).join(", ")}
          </p>
        </div>
        {c.ranAt && <span className="text-xs text-muted-foreground hidden sm:block">{new Date(c.ranAt).toLocaleTimeString()}</span>}
        <div className="flex gap-2">
          <button className="text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(c.id); }} data-testid={`delete-case-${c.id}`}>
            <Trash2 className="h-4 w-4" />
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-3">
          {c.status === "fail" && c.result && (
            <div className="p-3 rounded bg-red-100 dark:bg-red-900/20 text-xs text-red-800 dark:text-red-300">
              <strong>Failure:</strong> expected <code>{c.expected?.disposition}</code> but got{" "}
              <code>{c.result?.disposition ?? c.result?.status ?? "unknown"}</code>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Case ID</Label><Input data-testid={`input-case-id-${c.id}`} className="h-8 text-sm mt-1" value={id} onChange={e => setId(e.target.value)} /></div>
            <div><Label className="text-xs">Complaint</Label><Input data-testid={`input-complaint-${c.id}`} className="h-8 text-sm mt-1" value={complaint} onChange={e => setComplaint(e.target.value)} /></div>
            <div><Label className="text-xs">Symptoms (comma-separated)</Label><Input data-testid={`input-symptoms-${c.id}`} className="h-8 text-sm mt-1" value={symptoms} onChange={e => setSymptoms(e.target.value)} /></div>
            <div><Label className="text-xs">Age</Label><Input data-testid={`input-age-${c.id}`} type="number" className="h-8 text-sm mt-1" value={age} onChange={e => setAge(e.target.value)} /></div>
            <div><Label className="text-xs">Expected Diagnosis</Label><Input data-testid={`input-expected-dx-${c.id}`} className="h-8 text-sm mt-1" value={expectedDx} onChange={e => setExpectedDx(e.target.value)} /></div>
            <div><Label className="text-xs">Expected Disposition</Label><Input data-testid={`input-expected-disp-${c.id}`} className="h-8 text-sm mt-1" value={expectedDisp} onChange={e => setExpectedDisp(e.target.value)} /></div>
          </div>
          <Button size="sm" onClick={save} data-testid={`save-case-${c.id}`}><Save className="h-3.5 w-3.5 mr-1.5" /> Save Changes</Button>
        </div>
      )}
    </div>
  );
}

export default function ClinicalTestBenchPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("run");
  const [lastRunResult, setLastRunResult] = useState<BatchRunResponse | null>(null);
  const [stressTotal, setStressTotal] = useState("100");
  const [stressConcurrency, setStressConcurrency] = useState("10");
  const [lastStressResult, setLastStressResult] = useState<StressResult | null>(null);
  const [newId, setNewId] = useState("");
  const [newComplaint, setNewComplaint] = useState("");
  const [newSymptoms, setNewSymptoms] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newExpectedDx, setNewExpectedDx] = useState("");
  const [newExpectedDisp, setNewExpectedDisp] = useState("");

  const casesQuery = useQuery<{ ok: boolean; cases: GoldenCase[] }>({
    queryKey: ["/api/test/golden"],
  });

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
    mutationFn: () => apiRequest("POST", "/api/stress/run-sync", {
      total: parseInt(stressTotal) || 100,
      concurrency: parseInt(stressConcurrency) || 10,
    }),
    onSuccess: (data: any) => {
      setLastStressResult(data.result);
      toast({ title: "Stress test complete", description: `${data.result?.completed}/${data.result?.total} succeeded, avg ${data.result?.avgLatencyMs}ms` });
    },
    onError: (e: any) => toast({ title: "Stress test failed", description: e?.message, variant: "destructive" }),
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
      expected: { diagnosis: newExpectedDx, disposition: newExpectedDisp },
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

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-blue-500" /> Clinical Test Bench
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Run golden cases, stress-test the engine, edit test cases, and tune decision weights — all in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/decision-tree">
            <Button variant="outline" size="sm" data-testid="button-open-decision-tree">
              <GitBranch className="h-4 w-4 mr-1.5" /> Decision Tree <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-black text-slate-700 dark:text-slate-300">{cases.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Total Cases</div>
          </CardContent>
        </Card>
        <Card className={`border-border/60 ${passed > 0 ? "border-green-200 bg-green-50/50 dark:bg-green-900/10" : ""}`}>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-black text-green-600">{passed}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Passing</div>
          </CardContent>
        </Card>
        <Card className={`border-border/60 ${failed > 0 ? "border-red-200 bg-red-50/50 dark:bg-red-900/10" : ""}`}>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-black text-red-600">{failed}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Failing</div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-3 text-center">
            <div className={`text-3xl font-black ${passRate === 100 ? "text-green-600" : passRate >= 80 ? "text-yellow-600" : "text-red-600"}`}>{cases.some(c => c.status !== "pending") ? `${passRate}%` : "—"}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Pass Rate</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="run" data-testid="tab-run">Run Tests</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">Golden Cases ({cases.length})</TabsTrigger>
          <TabsTrigger value="weights" data-testid="tab-weights">Weights & Logic</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-500" /> Golden Case Suite
                </CardTitle>
                <p className="text-xs text-muted-foreground">Runs all {cases.length} golden cases through the full clinical engine and compares results to expected dispositions.</p>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => runAllMutation.mutate()}
                  disabled={runAllMutation.isPending || cases.length === 0}
                  data-testid="button-run-all-golden"
                >
                  {runAllMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running {cases.length} cases…</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" /> Run All {cases.length} Golden Cases</>
                  )}
                </Button>

                {lastRunResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <BigStat value={`${lastRunResult.passRate}%`}
                        label="Pass Rate"
                        color={lastRunResult.passRate === 100 ? "text-green-600" : lastRunResult.passRate >= 75 ? "text-yellow-600" : "text-red-600"} />
                      <BigStat value={lastRunResult.passed} label="Passed" color="text-green-600" />
                      <BigStat value={lastRunResult.failed} label="Failed" color="text-red-600" />
                    </div>
                    <Progress value={lastRunResult.passRate} className="h-3" />

                    <div className="space-y-1.5">
                      {lastRunResult.results.map(r => (
                        <div key={r.id} data-testid={`run-result-${r.id}`}
                          className={`flex items-start justify-between gap-2 px-3 py-2 rounded text-xs ${r.passed ? "bg-green-50 dark:bg-green-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                            <span className="font-mono font-medium">{r.id}</span>
                          </div>
                          <div className="text-right text-muted-foreground shrink-0">
                            {r.latencyMs}ms
                            {!r.passed && r.failReason && (
                              <div className="text-red-600 dark:text-red-400">{r.failReason}</div>
                            )}
                            {!r.passed && r.error && (
                              <div className="text-red-600 dark:text-red-400">{r.error}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" /> Stress Test (Scale Run)
                </CardTitle>
                <p className="text-xs text-muted-foreground">Generate synthetic complaints and run them through the engine in parallel. Use this to find latency spikes and failure modes at scale.</p>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Number of complaints</Label>
                    <Input
                      type="number"
                      value={stressTotal}
                      onChange={e => setStressTotal(e.target.value)}
                      className="h-9 mt-1"
                      data-testid="input-stress-total"
                      min={1} max={5000}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Concurrency</Label>
                    <Input
                      type="number"
                      value={stressConcurrency}
                      onChange={e => setStressConcurrency(e.target.value)}
                      className="h-9 mt-1"
                      data-testid="input-stress-concurrency"
                      min={1} max={50}
                    />
                  </div>
                </div>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                  onClick={() => stressMutation.mutate()}
                  disabled={stressMutation.isPending}
                  data-testid="button-run-stress"
                >
                  {stressMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running {stressTotal} complaints…</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" /> Run {stressTotal} Complaints</>
                  )}
                </Button>

                {lastStressResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <BigStat value={`${Math.round(lastStressResult.successRate * 100)}%`}
                        label="Success"
                        color={lastStressResult.successRate >= 0.95 ? "text-green-600" : "text-orange-600"} />
                      <BigStat value={`${lastStressResult.avgLatencyMs}ms`} label="Avg Latency" color="text-blue-600" />
                      <BigStat value={`${lastStressResult.p95LatencyMs}ms`} label="P95" color="text-purple-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium">{lastStressResult.completed}/{lastStressResult.total}</span>
                      </div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between">
                        <span className="text-muted-foreground">Throughput</span>
                        <span className="font-medium">{lastStressResult.throughputPerSecond?.toFixed(1)}/s</span>
                      </div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between">
                        <span className="text-muted-foreground">Max latency</span>
                        <span className="font-medium">{lastStressResult.maxLatencyMs}ms</span>
                      </div>
                      <div className="px-3 py-2 rounded bg-muted/50 flex justify-between">
                        <span className="text-muted-foreground">Failed</span>
                        <span className={`font-medium ${lastStressResult.failed > 0 ? "text-red-600" : "text-green-600"}`}>{lastStressResult.failed}</span>
                      </div>
                    </div>
                    {Object.keys(lastStressResult.breakdown ?? {}).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Disposition Breakdown</p>
                        <div className="space-y-1">
                          {Object.entries(lastStressResult.breakdown).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-32 truncate">{k}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round((v / lastStressResult.total) * 100)}%` }} />
                              </div>
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
                  <p className="text-xs text-muted-foreground">Visual graph of the clinical decision pipeline — nodes, red flags, scoring rules, and dispositions. Heatmap shows test coverage.</p>
                </div>
                <Link href="/decision-tree">
                  <Button variant="outline" size="sm" data-testid="button-goto-decision-tree">
                    Open Tree <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cases" className="space-y-4 mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-green-500" /> Add New Golden Case</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Case ID *</Label><Input data-testid="input-new-id" className="h-8 text-sm mt-1" placeholder="eg. chest_pain_01" value={newId} onChange={e => setNewId(e.target.value)} /></div>
                <div><Label className="text-xs">Complaint</Label><Input data-testid="input-new-complaint" className="h-8 text-sm mt-1" placeholder="eg. chest_pain" value={newComplaint} onChange={e => setNewComplaint(e.target.value)} /></div>
                <div><Label className="text-xs">Age</Label><Input data-testid="input-new-age" type="number" className="h-8 text-sm mt-1" placeholder="eg. 45" value={newAge} onChange={e => setNewAge(e.target.value)} /></div>
                <div className="sm:col-span-2"><Label className="text-xs">Symptoms (comma-separated)</Label><Input data-testid="input-new-symptoms" className="h-8 text-sm mt-1" placeholder="eg. chest pain, shortness of breath, sweating" value={newSymptoms} onChange={e => setNewSymptoms(e.target.value)} /></div>
                <div><Label className="text-xs">Expected Diagnosis</Label><Input data-testid="input-new-dx" className="h-8 text-sm mt-1" placeholder="eg. myocardial_infarction" value={newExpectedDx} onChange={e => setNewExpectedDx(e.target.value)} /></div>
                <div><Label className="text-xs">Expected Disposition</Label><Input data-testid="input-new-disp" className="h-8 text-sm mt-1" placeholder="eg. er_now" value={newExpectedDisp} onChange={e => setNewExpectedDisp(e.target.value)} /></div>
              </div>
              <Button size="sm" className="mt-3" onClick={() => addCaseMutation.mutate()} disabled={!newId || addCaseMutation.isPending} data-testid="button-add-case">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Case
              </Button>
            </CardContent>
          </Card>

          {failed > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-400 font-medium">{failed} case{failed > 1 ? "s" : ""} failing — expand to see what the engine returned vs. expected</span>
            </div>
          )}

          <div className="space-y-2">
            {casesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4"><RefreshCw className="h-4 w-4 animate-spin" /> Loading cases…</div>
            ) : cases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No golden cases yet. Add one above.</div>
            ) : (
              cases.map(c => (
                <EditableCase
                  key={c.id}
                  c={c}
                  onSave={updated => saveCaseMutation.mutate(updated)}
                  onDelete={id => deleteCaseMutation.mutate(id)}
                />
              ))
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending || cases.length === 0}
              data-testid="button-run-all-from-cases"
            >
              {runAllMutation.isPending ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…</> : <><Play className="h-3.5 w-3.5 mr-1.5" /> Run All Cases Now</>}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="weights" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <span className="font-semibold text-sm">Learning State</span>
                </div>
                {weightStatsQuery.isLoading ? (
                  <div className="text-muted-foreground text-sm">Loading…</div>
                ) : (
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
                <div className="flex items-center gap-3 mb-3">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                  <span className="font-semibold text-sm">Recent Weight Deltas</span>
                </div>
                {weightDeltasQuery.isLoading ? (
                  <div className="text-muted-foreground text-sm">Loading…</div>
                ) : Object.keys(weightDeltasQuery.data?.deltas ?? {}).length === 0 ? (
                  <div className="text-muted-foreground text-sm">No weight changes recorded yet. Run cases to generate learning signals.</div>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(weightDeltasQuery.data?.deltas ?? {}).slice(0, 12).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-48 truncate font-mono">{k}</span>
                        <div className="flex-1 bg-muted rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${v >= 0 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(Math.abs(v) * 100, 100)}%` }} />
                        </div>
                        <span className={`font-medium w-16 text-right ${v >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {v >= 0 ? "+" : ""}{v.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-orange-500" /> How Weights Work
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-sm text-muted-foreground space-y-2">
              <p>The clinical engine learns from case outcomes through reinforcement signals. When a physician overrides a disposition, or when a case is marked as a golden case failure, the engine adjusts the weights associated with the symptoms, modifiers, and scoring rules that influenced that decision.</p>
              <p>Weights are stored in memory and persisted to Redis. They decay toward zero over time if not reinforced, preventing drift from stale signals.</p>
              <p>To manually force a weight update, run your golden cases after adjusting the expected dispositions in the <strong>Golden Cases</strong> tab, then hit "Run All Cases Now".</p>
              <div className="flex gap-3 pt-2">
                <Link href="/decision-tree">
                  <Button size="sm" variant="outline" data-testid="button-weights-to-tree">
                    <GitBranch className="h-3.5 w-3.5 mr-1.5" /> View Decision Tree
                  </Button>
                </Link>
                <Link href="/engine-metrics">
                  <Button size="sm" variant="outline" data-testid="button-weights-to-engine-metrics">
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Engine Metrics
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
