import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Activity, Search, AlertTriangle, Lightbulb, Network,
  TrendingUp, Zap, RefreshCw, CheckCircle, XCircle, Clock,
  BarChart3, BookOpen, Target, Shield, Play, ChevronRight,
  Cpu, Database, GitBranch, Microscope
} from "lucide-react";

const COMPLAINTS = [
  "sore_throat","cough","chest_pain","uti","fever","rash",
  "abdominal_pain","ear_pain","sinus_pressure"
];

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  critical: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-100",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  needs_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  implemented: "bg-blue-100 text-blue-800",
  regression_failed: "bg-red-200 text-red-900",
};

function StatCard({ icon: Icon, label, value, sub, color = "blue" }: any) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300",
    green: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-300",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-300",
    red: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-300",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrchestratorPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [maxCases, setMaxCases] = useState("20");
  const [dryRun, setDryRun] = useState(false);
  const [complaint, setComplaint] = useState<string>("all");
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: statusData } = useQuery({
    queryKey: ["/api/self-improve/orchestrate/status"],
    refetchInterval: 3000,
  });

  const runMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/self-improve/orchestrate", {
      max_cases: parseInt(maxCases),
      complaints_filter: complaint !== "all" ? [complaint] : undefined,
      dry_run: dryRun,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setLastResult(data);
      toast({ title: "Improvement cycle complete", description: data.summary?.slice(0, 120) });
      qc.invalidateQueries({ queryKey: ["/api/self-improve/proposals"] });
      qc.invalidateQueries({ queryKey: ["/api/self-improve/orchestrate/status"] });
    },
    onError: (e: any) => toast({ title: "Cycle failed", description: e.message, variant: "destructive" }),
  });

  const status = (statusData as any);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Cpu} label="Total Cycles Run" value={status?.cycleCount ?? 0} color="blue" />
        <StatCard icon={Database} label="Cases Processed" value={status?.totalTracesProcessed ?? 0} color="green" />
        <StatCard icon={Activity} label="Status" value={status?.isRunning ? "Running..." : "Idle"} color={status?.isRunning ? "orange" : "blue"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="h-4 w-4" /> Run Improvement Cycle</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Max Cases</label>
              <Input data-testid="input-max-cases" type="number" value={maxCases} onChange={e => setMaxCases(e.target.value)} min={1} max={200} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Complaint Filter</label>
              <Select value={complaint} onValueChange={setComplaint}>
                <SelectTrigger data-testid="select-complaint-filter">
                  <SelectValue placeholder="All complaints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All complaints</SelectItem>
                  {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" data-testid="checkbox-dry-run" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded" />
                Dry run (analyze only, no writes)
              </label>
            </div>
          </div>
          <Button data-testid="button-run-cycle" onClick={() => runMut.mutate()} disabled={runMut.isPending || status?.isRunning} className="w-full">
            {runMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running cycle...</> : <><Zap className="h-4 w-4 mr-2" /> Run Improvement Cycle</>}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardHeader><CardTitle className="text-blue-800 dark:text-blue-200 text-sm">Last Cycle Results — {lastResult.cycleId}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "Cases", value: lastResult.tracesProcessed },
                { label: "Gold Evaluated", value: lastResult.goldCasesEvaluated },
                { label: "Failures", value: lastResult.failures?.length ?? 0 },
                { label: "Proposals", value: lastResult.proposalsGenerated },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{s.value}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900 p-2 rounded">{lastResult.summary}</p>
            {lastResult.failures?.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Top Failures:</p>
                {lastResult.failures.slice(0, 3).map((f: any, i: number) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded border ${SEVERITY_COLORS[f.severity]}`}>
                    <span className="font-mono">{f.case_id}</span> — {f.primary_failure} [{f.severity}]
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status?.lastCycle && !lastResult && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Previous Cycle — {status.lastCycle.cycleId}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground font-mono">{status.lastCycle.summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TracesPanel() {
  const [complaint, setComplaint] = useState<string>("all");
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/self-improve/traces", complaint],
    queryFn: () => fetch(`/api/self-improve/traces${complaint !== "all" ? `?complaint=${complaint}` : ""}`).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={complaint} onValueChange={setComplaint}>
          <SelectTrigger data-testid="select-traces-complaint" className="w-56">
            <SelectValue placeholder="Filter by complaint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All complaints</SelectItem>
            {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline">{data?.total ?? 0} traces</Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading traces...</div>
      ) : data?.traces?.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No traces yet. Run an improvement cycle to generate them.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data?.traces?.slice(0, 20).map((t: any) => (
            <Card key={t.case_id} data-testid={`trace-card-${t.case_id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold">{t.case_id}</span>
                      <Badge variant="outline" className="text-xs">{t.complaint?.replace(/_/g," ")}</Badge>
                      <Badge variant="outline" className="text-xs">{t.channel}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Questions: {t.questions_asked?.length ?? 0}</span>
                      <span>Signals: {t.signals_detected?.length ?? 0}</span>
                      <span>Differential: {t.differential_scores?.length ?? 0}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={t.final_output?.review_required ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}>
                      {t.final_output?.disposition ?? "unknown"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{t.timestamp?.slice(0,10)}</p>
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

function GoldCasesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [complaint, setComplaint] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ case_id: "", complaint: "sore_throat", description: "", expected_disposition: "urgent_care", expected_top_diagnoses: "", required_questions: "", forbidden_misses: "", source: "manual" });

  const { data } = useQuery<any>({
    queryKey: ["/api/self-improve/gold-cases", complaint],
    queryFn: () => fetch(`/api/self-improve/gold-cases${complaint !== "all" ? `?complaint=${complaint}` : ""}`).then(r => r.json()),
  });

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/self-improve/gold-cases", {
      ...form,
      expected_top_diagnoses: form.expected_top_diagnoses.split(",").map(s => s.trim()),
      required_questions: form.required_questions.split(",").map(s => s.trim()),
      forbidden_misses: form.forbidden_misses.split(",").map(s => s.trim()),
    }),
    onSuccess: () => { toast({ title: "Gold case added" }); qc.invalidateQueries({ queryKey: ["/api/self-improve/gold-cases"] }); setShowAdd(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cases = data?.cases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={complaint} onValueChange={setComplaint}>
            <SelectTrigger data-testid="select-gold-complaint" className="w-56">
              <SelectValue placeholder="Filter by complaint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All complaints</SelectItem>
              {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="outline">{cases.length} gold cases</Badge>
        </div>
        <Button data-testid="button-add-gold-case" size="sm" onClick={() => setShowAdd(v => !v)}>+ Add Gold Case</Button>
      </div>

      {showAdd && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle className="text-sm">Add Gold Case</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs mb-1 block">Case ID</label><Input data-testid="input-gold-case-id" value={form.case_id} onChange={e => setForm(f => ({...f, case_id: e.target.value}))} placeholder="GT_ST_0099" /></div>
              <div><label className="text-xs mb-1 block">Complaint</label>
                <Select value={form.complaint} onValueChange={v => setForm(f => ({...f, complaint: v}))}>
                  <SelectTrigger data-testid="select-gold-add-complaint"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><label className="text-xs mb-1 block">Description</label><Input data-testid="input-gold-description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs mb-1 block">Expected Disposition</label>
                <Select value={form.expected_disposition} onValueChange={v => setForm(f => ({...f, expected_disposition: v}))}>
                  <SelectTrigger data-testid="select-gold-disposition"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["home_care","routine","urgent_care","er_now","prescription","telehealth_followup"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-xs mb-1 block">Expected Diagnoses (comma-sep)</label><Input data-testid="input-gold-diagnoses" value={form.expected_top_diagnoses} onChange={e => setForm(f => ({...f, expected_top_diagnoses: e.target.value}))} placeholder="Peritonsillar Abscess, Strep" /></div>
            </div>
            <div><label className="text-xs mb-1 block">Required Questions (comma-sep)</label><Input data-testid="input-gold-questions" value={form.required_questions} onChange={e => setForm(f => ({...f, required_questions: e.target.value}))} placeholder="fever, drooling, muffled voice" /></div>
            <div><label className="text-xs mb-1 block">Forbidden Misses (comma-sep)</label><Input data-testid="input-gold-misses" value={form.forbidden_misses} onChange={e => setForm(f => ({...f, forbidden_misses: e.target.value}))} placeholder="undertriage, red_flag_missed" /></div>
            <Button data-testid="button-submit-gold-case" onClick={() => addMut.mutate()} disabled={addMut.isPending || !form.case_id}>
              {addMut.isPending ? "Saving..." : "Save Gold Case"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {cases.map((gc: any) => (
          <Card key={gc.case_id} data-testid={`gold-case-${gc.case_id}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold">{gc.case_id}</span>
                    <Badge variant="outline" className="text-xs">{gc.complaint?.replace(/_/g," ")}</Badge>
                    <Badge variant="outline" className="text-xs">{gc.source}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{gc.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gc.required_questions?.map((q: string) => <span key={q} className="text-xs bg-muted px-1 rounded">{q}</span>)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge className="bg-blue-100 text-blue-800">{gc.expected_disposition}</Badge>
                  <div className="mt-1 flex flex-wrap gap-1 justify-end">
                    {gc.expected_top_diagnoses?.slice(0,2).map((dx: string) => <span key={dx} className="text-xs text-muted-foreground">{dx}</span>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FailureAnalysisPanel() {
  const [complaint, setComplaint] = useState<string>("sore_throat");
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/self-improve/patterns", complaint],
    queryFn: () => fetch(`/api/self-improve/patterns/${complaint}`).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={complaint} onValueChange={setComplaint}>
          <SelectTrigger data-testid="select-failure-complaint" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" data-testid="button-refresh-patterns" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Analyzing patterns...</div> :
        !data?.patterns?.length ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No failure patterns yet for <strong>{complaint.replace(/_/g," ")}</strong>.</p>
            <p className="text-xs mt-1">Run an improvement cycle to generate trace evaluations.</p>
          </CardContent></Card>
        ) : (
          data.patterns.map((p: any) => (
            <Card key={p.complaint} data-testid={`pattern-${p.complaint}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="capitalize">{p.complaint.replace(/_/g," ")}</span>
                  <div className="flex items-center gap-2">
                    <Badge className={p.trend === "improving" ? "bg-green-100 text-green-800" : p.trend === "degrading" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                      {p.trend}
                    </Badge>
                    <span className="text-sm font-normal text-muted-foreground">Pass rate: {(p.pass_rate * 100).toFixed(0)}%</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center"><p className="text-xl font-bold">{p.total_cases}</p><p className="text-xs text-muted-foreground">Total Cases</p></div>
                  <div className="text-center"><p className="text-xl font-bold text-red-600">{p.top_failures?.length ?? 0}</p><p className="text-xs text-muted-foreground">Failure Types</p></div>
                  <div className="text-center"><p className="text-xl font-bold text-orange-600">{p.dangerous_miss_count ?? 0}</p><p className="text-xs text-muted-foreground">Dangerous Misses</p></div>
                </div>
                {p.top_failures?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">TOP FAILURE TYPES</p>
                    {p.top_failures.map((f: any) => (
                      <div key={f.failure_type} className="flex items-center justify-between">
                        <span className="text-sm font-mono">{f.failure_type.replace(/_/g," ")}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-1.5">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{width:`${Math.min(100,f.percentage)}%`}} />
                          </div>
                          <span className="text-xs w-8 text-right">{f.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )
      }
    </div>
  );
}

function ProposalsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [complaint, setComplaint] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data } = useQuery<any>({
    queryKey: ["/api/self-improve/proposals", complaint, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (complaint !== "all") params.set("complaint", complaint);
      if (statusFilter !== "all") params.set("status", statusFilter);
      return fetch(`/api/self-improve/proposals?${params}`).then(r => r.json());
    },
  });

  const { data: dashboard } = useQuery<any>({ queryKey: ["/api/self-improve/proposals/dashboard"] });

  const updateMut = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiRequest("PATCH", `/api/self-improve/proposals/${id}`, { status, reviewer_notes: notes, approved_by: "Physician" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/self-improve/proposals"] }); toast({ title: "Proposal updated" }); },
  });

  return (
    <div className="space-y-4">
      {dashboard && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={Lightbulb} label="Total Proposals" value={dashboard.total} color="blue" />
          <StatCard icon={AlertTriangle} label="Needs Review" value={dashboard.byStatus?.needs_review ?? 0} color="orange" />
          <StatCard icon={CheckCircle} label="Approved" value={dashboard.byStatus?.approved ?? 0} color="green" />
          <StatCard icon={Shield} label="High Risk" value={dashboard.byRisk?.high ?? 0} color="red" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Select value={complaint} onValueChange={setComplaint}>
          <SelectTrigger data-testid="select-proposal-complaint" className="w-48">
            <SelectValue placeholder="All complaints" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All complaints</SelectItem>
            {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-proposal-status" className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["draft","needs_review","approved","rejected","implemented","regression_failed"].map(s => (
              <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">{data?.total ?? 0} proposals</Badge>
      </div>

      {data?.proposals?.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No proposals yet. Run the improvement orchestrator to generate them.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data?.proposals?.map((p: any) => (
            <Card key={p.proposal_id} data-testid={`proposal-${p.proposal_id}`} className={p.risk_level === "high" ? "border-red-200" : ""}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{p.proposal_id}</span>
                      <Badge className={RISK_COLORS[p.risk_level]}>{p.risk_level} risk</Badge>
                      <Badge className={STATUS_COLORS[p.status]}>{p.status.replace(/_/g," ")}</Badge>
                    </div>
                    <p className="text-sm font-semibold">{p.proposal_type.replace(/_/g," ")} → <span className="text-muted-foreground font-normal">{p.target_table}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{p.complaint.replace(/_/g," ")} — {p.rationale?.slice(0,120)}{p.rationale?.length > 120 ? "…" : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">{p.source_failure_cases?.length ?? 0} cases</p>
                    <p className="text-xs text-muted-foreground">{p.created_at?.slice(0,10)}</p>
                  </div>
                </div>
                {p.expected_benefit && <p className="text-xs bg-muted p-2 rounded mb-2">Expected: {p.expected_benefit}</p>}
                {["draft","needs_review"].includes(p.status) && (
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" data-testid={`button-approve-${p.proposal_id}`} className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => updateMut.mutate({ id: p.proposal_id, status: "approved" })}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-reject-${p.proposal_id}`}
                      onClick={() => updateMut.mutate({ id: p.proposal_id, status: "rejected", notes: "Rejected by reviewer" })}>
                      <XCircle className="h-3 w-3 mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-implement-${p.proposal_id}`}
                      onClick={() => updateMut.mutate({ id: p.proposal_id, status: "implemented" })}>
                      <GitBranch className="h-3 w-3 mr-1" /> Mark Implemented
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KnowledgeGraphPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [symptom, setSymptom] = useState("");
  const [rankSymptoms, setRankSymptoms] = useState("");
  const [complaint, setComplaint] = useState<string>("all");
  const [ranked, setRanked] = useState<any[]>([]);
  const [rankLoading, setRankLoading] = useState(false);

  const { data: stats } = useQuery<any>({ queryKey: ["/api/self-improve/graph/stats"] });

  const addMut = useMutation({
    mutationFn: ({ s, dx, confirmed }: any) => apiRequest("POST", "/api/self-improve/graph/add", { symptom: s, diagnosis: dx, confirmed, complaint: complaint !== "all" ? complaint : undefined }),
    onSuccess: () => { toast({ title: "Edge added to knowledge graph" }); qc.invalidateQueries({ queryKey: ["/api/self-improve/graph/stats"] }); },
  });

  const handleRank = async () => {
    if (!rankSymptoms.trim()) return;
    setRankLoading(true);
    try {
      const res = await fetch("/api/self-improve/graph/rank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symptoms: rankSymptoms.split(",").map(s => s.trim()), complaint: complaint !== "all" ? complaint : undefined }) });
      const data = await res.json();
      setRanked(data.ranked_diagnoses ?? []);
    } catch {}
    setRankLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Network} label="Symptom Nodes" value={stats?.totalNodes ?? 0} color="purple" />
        <StatCard icon={GitBranch} label="Total Edges" value={stats?.totalEdges ?? 0} color="blue" />
        <StatCard icon={BookOpen} label="Complaints Mapped" value={Object.keys(stats?.diagnosisByComplaint ?? {}).length} color="green" />
      </div>

      {stats?.topSymptomDiagnosisPairs?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Strongest Symptom → Diagnosis Links</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topSymptomDiagnosisPairs.slice(0,8).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 font-medium">{e.symptom}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span>{e.diagnosis}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-muted rounded-full h-1.5">
                      <div className="bg-purple-500 h-1.5 rounded-full" style={{width:`${Math.min(100,e.strength*10)}%`}} />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{e.strength.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Rank Diagnoses by Symptoms</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={complaint} onValueChange={setComplaint}>
              <SelectTrigger data-testid="select-graph-complaint" className="w-48">
                <SelectValue placeholder="Any complaint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any complaint</SelectItem>
                {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea data-testid="input-rank-symptoms" value={rankSymptoms} onChange={e => setRankSymptoms(e.target.value)} placeholder="fever, drooling, muffled voice (comma-separated)" rows={2} />
          <Button data-testid="button-rank-diagnoses" onClick={handleRank} disabled={rankLoading || !rankSymptoms.trim()}>
            {rankLoading ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" /> Ranking...</> : <><Target className="h-3 w-3 mr-2" /> Rank Diagnoses</>}
          </Button>
          {ranked.length > 0 && (
            <div className="space-y-2 mt-2">
              {ranked.map((r: any, i: number) => (
                <div key={i} data-testid={`ranked-dx-${i}`} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div>
                    <span className="font-semibold">#{i+1} {r.diagnosis}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.evidence?.slice(0,2).join(" · ")}</span>
                  </div>
                  <Badge variant="outline">Score: {r.score}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskModelPanel() {
  const [symptoms, setSymptoms] = useState("");
  const [complaint, setComplaint] = useState<string>("chest_pain");
  const [age, setAge] = useState("");
  const [pregnant, setPregnant] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { data: modelStats } = useQuery<any>({ queryKey: ["/api/self-improve/risk/model-stats"] });

  const handleScore = async () => {
    if (!symptoms.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/self-improve/risk/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ case_id: "PREVIEW", complaint, symptoms: symptoms.split(",").map(s => s.trim()), patient_context: { age: age ? parseInt(age) : undefined, pregnant }, modifiers: {} }) });
      setResult(await res.json());
    } catch {}
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Brain} label="Risk Features" value={modelStats?.featureCount ?? 0} color="purple" />
        <StatCard icon={TrendingUp} label="Training Runs" value={modelStats?.trainingCount ?? 0} color="blue" />
        <StatCard icon={Clock} label="Last Trained" value={modelStats?.lastTrained ? modelStats.lastTrained.slice(0,10) : "Never"} color="green" />
      </div>

      {modelStats?.topFeatures && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Risk Features by Weight</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {modelStats.topFeatures.slice(0,8).map((f: any) => (
                <div key={f.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{f.category}</Badge>
                    <div className="w-20 bg-muted rounded-full h-1.5">
                      <div className="bg-red-500 h-1.5 rounded-full" style={{width:`${Math.min(100,f.weight*400)}%`}} />
                    </div>
                    <span className="text-xs w-10 text-right">{f.weight.toFixed(3)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Score a Case</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block">Complaint</label>
              <Select value={complaint} onValueChange={setComplaint}>
                <SelectTrigger data-testid="select-risk-complaint"><SelectValue /></SelectTrigger>
                <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs mb-1 block">Age</label><Input data-testid="input-risk-age" type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="45" /></div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" data-testid="checkbox-pregnant" checked={pregnant} onChange={e => setPregnant(e.target.checked)} className="rounded" />
                Pregnant
              </label>
            </div>
          </div>
          <Textarea data-testid="input-risk-symptoms" value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="fever, shortness of breath, diaphoresis (comma-separated)" rows={2} />
          <Button data-testid="button-score-risk" onClick={handleScore} disabled={loading || !symptoms.trim()}>
            {loading ? "Scoring..." : <><Microscope className="h-3 w-3 mr-2" /> Score Risk</>}
          </Button>
          {result && (
            <Card className={`border-2 ${result.riskLevel === "critical" ? "border-red-400" : result.riskLevel === "high" ? "border-orange-400" : result.riskLevel === "moderate" ? "border-yellow-400" : "border-green-400"}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-lg">Risk Level</span>
                  <Badge className={RISK_COLORS[result.riskLevel]} data-testid="risk-level-badge">{result.riskLevel.toUpperCase()}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center"><p className="text-2xl font-bold text-red-600" data-testid="admission-risk">{(result.admissionRisk*100).toFixed(0)}%</p><p className="text-xs text-muted-foreground">Admission Risk</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-orange-600">{(result.deteriorationRisk*100).toFixed(0)}%</p><p className="text-xs text-muted-foreground">Deterioration Risk</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-blue-600">{(result.readmissionRisk30d*100).toFixed(0)}%</p><p className="text-xs text-muted-foreground">30d Readmission</p></div>
                </div>
                <p className="text-sm bg-muted p-2 rounded">{result.recommendation}</p>
                {result.activeFeatures?.length > 0 && (
                  <div className="mt-2"><p className="text-xs text-muted-foreground mb-1">Active risk features:</p>
                    <div className="flex flex-wrap gap-1">{result.activeFeatures.map((f: string) => <Badge key={f} variant="outline" className="text-xs">{f}</Badge>)}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RLPanel() {
  const { data } = useQuery<any>({ queryKey: ["/api/self-improve/rl/policy"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" /> Q-Learning Policy Table</CardTitle></CardHeader>
        <CardContent>
          {!data?.stats?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No policy data yet. Run an improvement cycle to train the RL engine.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.stats.map((s: any, i: number) => (
                <div key={i} data-testid={`rl-stat-${i}`} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs truncate">{s.stateKey}</p>
                    <p className="text-xs text-muted-foreground">Action: {s.action}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div><p className="font-bold">{s.qValue}</p><p className="text-xs text-muted-foreground">Q-Value</p></div>
                    <div><p className="font-bold">{s.avgReward}</p><p className="text-xs text-muted-foreground">Avg Reward</p></div>
                    <div><p className="font-bold">{s.updateCount}</p><p className="text-xs text-muted-foreground">Updates</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SelfImproveDashboard() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl text-white">
          <Brain className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Self-Developing Medical AI</h1>
          <p className="text-muted-foreground">10-layer autonomous improvement system — trace capture, failure analysis, proposal generation, reinforcement learning, knowledge graph, and risk modeling.</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 text-center text-xs">
        {[
          { n: "L1", label: "Trace Capture", icon: Database, color: "bg-blue-100 text-blue-800" },
          { n: "L2–3", label: "Eval + Classify", icon: Search, color: "bg-indigo-100 text-indigo-800" },
          { n: "L4", label: "Proposals", icon: Lightbulb, color: "bg-yellow-100 text-yellow-800" },
          { n: "L7", label: "Reinforcement", icon: TrendingUp, color: "bg-green-100 text-green-800" },
          { n: "L8–10", label: "Graph + Risk + AI", icon: Brain, color: "bg-purple-100 text-purple-800" },
        ].map(l => (
          <div key={l.n} className={`rounded-lg p-3 ${l.color}`}>
            <l.icon className="h-5 w-5 mx-auto mb-1" />
            <p className="font-bold">{l.n}</p>
            <p className="opacity-80">{l.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="orchestrator">
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="orchestrator" data-testid="tab-orchestrator"><Zap className="h-3 w-3 mr-1" />Orchestrator</TabsTrigger>
          <TabsTrigger value="traces" data-testid="tab-traces"><Database className="h-3 w-3 mr-1" />Traces</TabsTrigger>
          <TabsTrigger value="gold" data-testid="tab-gold"><BookOpen className="h-3 w-3 mr-1" />Gold Cases</TabsTrigger>
          <TabsTrigger value="failures" data-testid="tab-failures"><AlertTriangle className="h-3 w-3 mr-1" />Failures</TabsTrigger>
          <TabsTrigger value="proposals" data-testid="tab-proposals"><Lightbulb className="h-3 w-3 mr-1" />Proposals</TabsTrigger>
          <TabsTrigger value="graph" data-testid="tab-graph"><Network className="h-3 w-3 mr-1" />Graph</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk"><BarChart3 className="h-3 w-3 mr-1" />Risk + RL</TabsTrigger>
        </TabsList>

        <TabsContent value="orchestrator" className="mt-4"><OrchestratorPanel /></TabsContent>
        <TabsContent value="traces" className="mt-4"><TracesPanel /></TabsContent>
        <TabsContent value="gold" className="mt-4"><GoldCasesPanel /></TabsContent>
        <TabsContent value="failures" className="mt-4"><FailureAnalysisPanel /></TabsContent>
        <TabsContent value="proposals" className="mt-4"><ProposalsPanel /></TabsContent>
        <TabsContent value="graph" className="mt-4"><KnowledgeGraphPanel /></TabsContent>
        <TabsContent value="risk" className="mt-4">
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Level 9 — Predictive Risk Model</h2>
              <RiskModelPanel />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Level 7 — Reinforcement Learning Policy</h2>
              <RLPanel />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
