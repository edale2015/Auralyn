import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimJob {
  jobId: string;
  status: "queued" | "running" | "complete" | "cancelled" | "error";
  progress: number;
  totalCases: number;
  params: { complaint: string; count: number; difficulty: string };
}

interface SimResults {
  jobId: string;
  params: { complaint: string; count: number; difficulty: string };
  metrics: {
    total: number;
    passed: number;
    failed: number;
    accuracy: number;
    safetyAccuracy: number;
    falseReassuranceRate: number;
    avgConfidence: number;
    avgLatencyMs: number;
    er_now_sensitivity: number;
    safetyFlagRate: number;
    failureClusters: Array<{ cluster: string; count: number; examples: string[] }>;
    accuracyByComplaint: Record<string, { passed: number; total: number }>;
  };
  cases: Array<{
    complaint: string;
    difficulty: string;
    passed: boolean;
    dispositionCorrect: boolean;
    explanation: string;
    expected: string;
    actual: string;
    confidence: number;
    safetyFlag: boolean;
    latencyMs: number;
  }>;
}

interface KbQuestion {
  id: number;
  complaintId: string;
  questionId: string;
  prompt: string;
  type: string;
  required: boolean;
  priority: number;
  category?: string;
  active: boolean;
}

interface KbDiagnosis {
  id: number;
  ruleId: string;
  complaintId: string;
  diagnosisId: string;
  diagnosisLabel: string;
  icdCode?: string;
  baseProbability: number;
  cannotMiss: boolean;
  active: boolean;
}

interface KbRedFlag {
  id: number;
  ruleId: string;
  complaintId: string;
  label: string;
  triggerExpr: string;
  severity: string;
  action: string;
  active: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function ms(n: number) { return `${Math.round(n)}ms`; }

function AccBadge({ val }: { val: number }) {
  const color = val >= 0.85 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    : val >= 0.65 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${color}`}>{pct(val)}</span>;
}

// ─── KB Question Editor ───────────────────────────────────────────────────────

function QuestionEditor({ complaintId }: { complaintId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("yes_no");
  const [required, setRequired] = useState(false);
  const [category, setCategory] = useState("");

  const { data: questions = [], isLoading } = useQuery<KbQuestion[]>({
    queryKey: ["/api/kb/questions", complaintId],
    queryFn: () => fetch(`/api/kb/questions?complaintId=${encodeURIComponent(complaintId)}`).then(r => r.json()),
    enabled: !!complaintId,
  });

  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/questions", {
      complaintId,
      questionId: `Q_${Date.now()}`,
      prompt,
      type,
      required,
      category: category || null,
      priority: 50,
      conditionalOn: {},
      linkedDiagnoses: [],
      active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/questions", complaintId] });
      setPrompt(""); setCategory("");
      toast({ title: "Question added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/kb/questions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/questions", complaintId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-xs text-gray-400 animate-pulse">Loading questions…</div>
      ) : questions.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No questions — add the first one below.</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {questions.map(q => (
            <div key={q.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-xs" data-testid={`q-row-${q.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{q.prompt}</div>
                <div className="text-gray-400 mt-0.5 flex gap-2">
                  <span>{q.type}</span>
                  {q.required && <span className="text-red-400">required</span>}
                  {q.category && <span className="text-blue-400">{q.category}</span>}
                </div>
              </div>
              <button
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                onClick={() => remove.mutate(q.id)}
                data-testid={`btn-delete-question-${q.id}`}
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Question</div>
        <Input
          placeholder="Question prompt…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="text-xs h-8"
          data-testid="input-question-prompt"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-question-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes_no">Yes / No</SelectItem>
              <SelectItem value="scale_1_10">Scale 1-10</SelectItem>
              <SelectItem value="free_text">Free Text</SelectItem>
              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Category (optional)"
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="text-xs h-8"
            data-testid="input-question-category"
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} data-testid="cb-question-required" />
          <span>Required</span>
        </label>
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          disabled={!prompt.trim() || add.isPending}
          onClick={() => add.mutate()}
          data-testid="btn-add-question"
        >
          {add.isPending ? "Adding…" : "Add Question"}
        </Button>
      </div>
    </div>
  );
}

// ─── KB Differentials Editor ──────────────────────────────────────────────────

function DifferentialsEditor({ complaintId }: { complaintId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [icd, setIcd] = useState("");
  const [prob, setProb] = useState("0.1");
  const [cannotMiss, setCannotMiss] = useState(false);

  const { data: diffs = [], isLoading } = useQuery<KbDiagnosis[]>({
    queryKey: ["/api/kb/diagnosis", complaintId],
    queryFn: () => fetch(`/api/kb/diagnosis?complaintId=${encodeURIComponent(complaintId)}`).then(r => r.json()),
    enabled: !!complaintId,
  });

  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/diagnosis", {
      complaintId,
      ruleId: `DR_${Date.now()}`,
      diagnosisId: label.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      diagnosisLabel: label,
      icdCode: icd || null,
      baseProbability: parseFloat(prob) || 0.1,
      cannotMiss,
      featureLikelihoods: {},
      basePoints: 1,
      clusterPriority: 50,
      active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/diagnosis", complaintId] });
      setLabel(""); setIcd(""); setProb("0.1"); setCannotMiss(false);
      toast({ title: "Differential added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => apiRequest("DELETE", `/api/kb/diagnosis/${ruleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/diagnosis", complaintId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-xs text-gray-400 animate-pulse">Loading differentials…</div>
      ) : diffs.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No differentials yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {diffs.map(d => (
            <div key={d.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-xs" data-testid={`diff-row-${d.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{d.diagnosisLabel}</div>
                <div className="text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                  {d.icdCode && <span className="font-mono">{d.icdCode}</span>}
                  <span>p={d.baseProbability}</span>
                  {d.cannotMiss && <span className="text-red-400 font-semibold">cannot-miss</span>}
                </div>
              </div>
              <button
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                onClick={() => remove.mutate(d.ruleId)}
                data-testid={`btn-delete-diff-${d.id}`}
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Differential</div>
        <Input
          placeholder="Diagnosis label…"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="text-xs h-8"
          data-testid="input-diff-label"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="ICD code (optional)"
            value={icd}
            onChange={e => setIcd(e.target.value)}
            className="text-xs h-8 font-mono"
            data-testid="input-diff-icd"
          />
          <Input
            type="number"
            placeholder="Base probability"
            value={prob}
            min={0}
            max={1}
            step={0.05}
            onChange={e => setProb(e.target.value)}
            className="text-xs h-8"
            data-testid="input-diff-prob"
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={cannotMiss} onChange={e => setCannotMiss(e.target.checked)} data-testid="cb-diff-cannot-miss" />
          <span className="text-red-500">Cannot-miss diagnosis</span>
        </label>
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          disabled={!label.trim() || add.isPending}
          onClick={() => add.mutate()}
          data-testid="btn-add-diff"
        >
          {add.isPending ? "Adding…" : "Add Differential"}
        </Button>
      </div>
    </div>
  );
}

// ─── KB Red Flags Editor ──────────────────────────────────────────────────────

function RedFlagsEditor({ complaintId }: { complaintId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [flagLabel, setFlagLabel] = useState("");
  const [triggerExpr, setTriggerExpr] = useState("");
  const [severity, setSeverity] = useState("HARD");
  const [action, setAction] = useState("ER_SEND");

  const { data: flags = [], isLoading } = useQuery<KbRedFlag[]>({
    queryKey: ["/api/kb/red-flags", complaintId],
    queryFn: () => fetch(`/api/kb/red-flags?complaintId=${encodeURIComponent(complaintId)}`).then(r => r.json()),
    enabled: !!complaintId,
  });

  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/red-flags", {
      complaintId,
      ruleId: `RF_${Date.now()}`,
      label: flagLabel,
      triggerExpr,
      severity,
      action,
      active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/red-flags", complaintId] });
      setFlagLabel(""); setTriggerExpr("");
      toast({ title: "Red flag added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => apiRequest("DELETE", `/api/kb/red-flags/${ruleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/red-flags", complaintId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-xs text-gray-400 animate-pulse">Loading red flags…</div>
      ) : flags.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No red flags yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {flags.map(f => (
            <div key={f.id} className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-xs" data-testid={`rf-row-${f.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-red-700 dark:text-red-300">{f.label}</div>
                <div className="text-gray-500 mt-0.5 font-mono truncate">{f.triggerExpr}</div>
                <div className="mt-0.5 flex gap-2">
                  <span className="text-red-500">{f.severity}</span>
                  <span className="text-gray-400">{f.action}</span>
                </div>
              </div>
              <button
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                onClick={() => remove.mutate(f.ruleId)}
                data-testid={`btn-delete-rf-${f.id}`}
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Red Flag</div>
        <Input
          placeholder="Label (e.g. Chest pain + diaphoresis)…"
          value={flagLabel}
          onChange={e => setFlagLabel(e.target.value)}
          className="text-xs h-8"
          data-testid="input-rf-label"
        />
        <Input
          placeholder="Trigger expression (e.g. fever AND stiff_neck)…"
          value={triggerExpr}
          onChange={e => setTriggerExpr(e.target.value)}
          className="text-xs h-8 font-mono"
          data-testid="input-rf-trigger"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-rf-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HARD">HARD</SelectItem>
              <SelectItem value="SOFT">SOFT</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-rf-action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ER_SEND">ER Send</SelectItem>
              <SelectItem value="URGENT_CARE">Urgent Care</SelectItem>
              <SelectItem value="CALL_911">Call 911</SelectItem>
              <SelectItem value="PHYSICIAN_REVIEW">Physician Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="w-full h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
          disabled={!flagLabel.trim() || !triggerExpr.trim() || add.isPending}
          onClick={() => add.mutate()}
          data-testid="btn-add-rf"
        >
          {add.isPending ? "Adding…" : "Add Red Flag"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComplaintLabPage() {
  const { toast } = useToast();

  // Sim state
  const [selectedComplaint, setSelectedComplaint] = useState("");
  const [count, setCount] = useState("50");
  const [difficulty, setDifficulty] = useState("moderate");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [results, setResults] = useState<SimResults | null>(null);
  const [caseFilter, setCaseFilter] = useState<"all" | "pass" | "fail">("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch enabled complaints
  const { data: complaintsData } = useQuery<{ complaints: Array<{ id: string; label: string }> }>({
    queryKey: ["/api/kb/complaints"],
    queryFn: () => fetch("/api/kb/complaints?enabled=true&limit=200").then(r => r.json()),
  });
  const complaints = complaintsData?.complaints ?? [];

  // Poll active job status
  const { data: jobStatus } = useQuery<SimJob>({
    queryKey: ["/api/ci/sim/status", activeJobId],
    queryFn: () => fetch(`/api/ci/sim/status/${activeJobId}`).then(r => r.json()),
    enabled: !!activeJobId && !results,
    refetchInterval: activeJobId && !results ? 1500 : false,
  });

  // When job completes, fetch results
  useEffect(() => {
    if (!jobStatus || results) return;
    if (jobStatus.status === "complete") {
      fetch(`/api/ci/sim/results/${activeJobId}`)
        .then(r => r.json())
        .then(data => setResults(data))
        .catch(err => toast({ title: "Failed to load results", description: err.message, variant: "destructive" }));
    } else if (jobStatus.status === "error") {
      toast({ title: "Simulation failed", variant: "destructive" });
      setActiveJobId(null);
    }
  }, [jobStatus, results, activeJobId, toast]);

  const startSim = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ci/sim/start", {
      complaint: selectedComplaint || "all",
      count: parseInt(count) || 50,
      difficulty,
      mode: "generated",
      label: `Lab: ${selectedComplaint || "all"} × ${count}`,
    }),
    onSuccess: (data: any) => {
      setActiveJobId(data.jobId);
      setResults(null);
      toast({ title: "Simulation started", description: `Job ${data.jobId} — ${data.totalCases} cases` });
    },
    onError: (e: any) => toast({ title: "Failed to start", description: e.message, variant: "destructive" }),
  });

  const cancelSim = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/ci/sim/cancel/${activeJobId}`),
    onSuccess: () => { setActiveJobId(null); toast({ title: "Cancelled" }); },
  });

  const isRunning = !!activeJobId && !results && (jobStatus?.status === "running" || jobStatus?.status === "queued");
  const progress = jobStatus?.progress ?? 0;
  const totalCases = jobStatus?.totalCases ?? parseInt(count);

  const filteredCases = (results?.cases ?? []).filter(c =>
    caseFilter === "all" ? true : caseFilter === "pass" ? c.passed : !c.passed
  );

  const metrics = results?.metrics;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 pt-6 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title-complaint-lab">Complaint Lab</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Select a complaint → run simulations → watch processing → edit KB rules inline
        </p>
      </div>

      <div className="flex flex-1 min-h-0 gap-0 overflow-hidden">

        {/* ── Left panel: controls ───────────────────────────────────── */}
        <aside className="w-64 shrink-0 border-r flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 block">
                Complaint
              </Label>
              <Select value={selectedComplaint} onValueChange={v => { setSelectedComplaint(v); setResults(null); setActiveJobId(null); }}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-complaint">
                  <SelectValue placeholder="All complaints" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">All complaints</SelectItem>
                  {complaints.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label || c.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 block">
                Case count
              </Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["10", "25", "50", "100", "250", "500"].map(n => (
                    <SelectItem key={n} value={n}>{n} cases</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 block">
                Difficulty
              </Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isRunning ? (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => cancelSim.mutate()}
                data-testid="btn-cancel-sim"
              >
                Cancel
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={() => startSim.mutate()}
                disabled={startSim.isPending}
                data-testid="btn-run-sim"
              >
                {startSim.isPending ? "Starting…" : "Run Simulation"}
              </Button>
            )}

            {/* Progress bar */}
            {isRunning && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{jobStatus?.status}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                    data-testid="progress-bar"
                  />
                </div>
                <div className="text-xs text-gray-400 text-center">
                  {Math.round((progress / 100) * totalCases)} / {totalCases} cases
                </div>
              </div>
            )}

            {/* Quick summary after run */}
            {metrics && (
              <div className="rounded-xl border p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Run</div>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <span className="text-gray-500">Accuracy</span>
                  <AccBadge val={metrics.accuracy} />
                  <span className="text-gray-500">Safety acc.</span>
                  <AccBadge val={metrics.safetyAccuracy} />
                  <span className="text-gray-500">ER sensitivity</span>
                  <AccBadge val={metrics.er_now_sensitivity} />
                  <span className="text-gray-500">Avg latency</span>
                  <span className="font-mono">{ms(metrics.avgLatencyMs)}</span>
                  <span className="text-gray-500">Cases</span>
                  <span className="font-mono">{metrics.passed}/{metrics.total}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Center panel: results ──────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden border-r">

          {/* Idle state */}
          {!isRunning && !results && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm" data-testid="idle-state">
              <div className="text-center space-y-2">
                <div className="text-4xl">🧪</div>
                <div className="font-medium">Select a complaint and run a simulation</div>
                <div className="text-xs text-gray-400">Results will appear here in real-time</div>
              </div>
            </div>
          )}

          {/* Running state */}
          {isRunning && !results && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8" data-testid="running-state">
              <div className="text-center">
                <div className="text-lg font-semibold mb-1">Running simulation…</div>
                <div className="text-sm text-gray-500">
                  {selectedComplaint || "All complaints"} — {count} cases — {difficulty}
                </div>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{Math.round((progress / 100) * totalCases)} processed</span>
                  <span>{progress}%</span>
                </div>
              </div>
              {metrics && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-green-600">{pct(metrics.accuracy)}</div>
                    <div className="text-xs text-gray-400">Accuracy</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{ms(metrics.avgLatencyMs)}</div>
                    <div className="text-xs text-gray-400">Avg latency</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-500">{metrics.failed}</div>
                    <div className="text-xs text-gray-400">Failures</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results state */}
          {results && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Summary bar */}
              <div className="shrink-0 border-b px-4 py-3 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-4 items-center">
                <div className="flex gap-4 text-sm">
                  <span><span className="font-semibold">{results.metrics.total}</span> <span className="text-gray-400">total</span></span>
                  <span className="text-green-600"><span className="font-semibold">{results.metrics.passed}</span> passed</span>
                  <span className="text-red-500"><span className="font-semibold">{results.metrics.failed}</span> failed</span>
                </div>
                <AccBadge val={results.metrics.accuracy} />
                <div className="ml-auto flex gap-1">
                  {(["all", "pass", "fail"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setCaseFilter(f)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${caseFilter === f ? "bg-violet-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
                      data-testid={`filter-${f}`}
                    >
                      {f === "all" ? "All" : f === "pass" ? "Passed" : "Failed"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Failure clusters */}
              {results.metrics.failureClusters.length > 0 && (
                <div className="shrink-0 border-b px-4 py-2 bg-red-50 dark:bg-red-900/10 flex gap-3 overflow-x-auto">
                  <span className="text-xs text-red-600 font-semibold shrink-0">Failure clusters:</span>
                  {results.metrics.failureClusters.slice(0, 5).map((fc, i) => (
                    <span key={i} className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full shrink-0">
                      {fc.cluster} ({fc.count})
                    </span>
                  ))}
                </div>
              )}

              {/* Per-case feed */}
              <div className="flex-1 overflow-y-auto" data-testid="cases-feed">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-gray-900 border-b">
                    <tr>
                      <th className="text-left p-2.5 font-medium text-gray-500 w-6">#</th>
                      <th className="text-left p-2.5 font-medium text-gray-500">Complaint</th>
                      <th className="text-left p-2.5 font-medium text-gray-500">Expected</th>
                      <th className="text-left p-2.5 font-medium text-gray-500">Actual</th>
                      <th className="text-center p-2.5 font-medium text-gray-500">Conf</th>
                      <th className="text-center p-2.5 font-medium text-gray-500">Latency</th>
                      <th className="text-center p-2.5 font-medium text-gray-500 w-16">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c, i) => (
                      <tr
                        key={i}
                        className={`border-b transition-colors ${c.passed ? "hover:bg-green-50 dark:hover:bg-green-900/10" : "hover:bg-red-50 dark:hover:bg-red-900/10"}`}
                        data-testid={`case-row-${i}`}
                        title={c.explanation}
                      >
                        <td className="p-2.5 text-gray-400">{i + 1}</td>
                        <td className="p-2.5 font-medium max-w-xs truncate">{c.complaint}</td>
                        <td className="p-2.5 text-gray-500 font-mono">{c.expected || "—"}</td>
                        <td className="p-2.5 font-mono">{c.actual || "—"}</td>
                        <td className="p-2.5 text-center font-mono">{c.confidence !== undefined ? Math.round(c.confidence * 100) : "—"}%</td>
                        <td className="p-2.5 text-center text-gray-400">{c.latencyMs ? ms(c.latencyMs) : "—"}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full font-medium ${c.passed ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                            {c.passed ? "✓" : "✗"}
                          </span>
                          {c.safetyFlag && <span className="ml-1 text-red-500" title="Safety flag">⚠</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCases.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">No cases match filter</div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── Right panel: KB editor ─────────────────────────────────── */}
        <aside className="w-72 shrink-0 overflow-y-auto">
          <div className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              KB Editor
              {selectedComplaint && (
                <Badge variant="secondary" className="text-xs font-mono">{selectedComplaint}</Badge>
              )}
            </div>

            {!selectedComplaint ? (
              <div className="text-xs text-gray-400 italic" data-testid="kb-no-complaint">
                Select a specific complaint to edit its KB rules.
              </div>
            ) : (
              <Tabs defaultValue="questions">
                <TabsList className="w-full h-8 mb-3">
                  <TabsTrigger value="questions" className="flex-1 text-xs" data-testid="tab-questions">Questions</TabsTrigger>
                  <TabsTrigger value="differentials" className="flex-1 text-xs" data-testid="tab-differentials">Differentials</TabsTrigger>
                  <TabsTrigger value="redflags" className="flex-1 text-xs" data-testid="tab-redflags">Red Flags</TabsTrigger>
                </TabsList>
                <TabsContent value="questions">
                  <QuestionEditor complaintId={selectedComplaint} />
                </TabsContent>
                <TabsContent value="differentials">
                  <DifferentialsEditor complaintId={selectedComplaint} />
                </TabsContent>
                <TabsContent value="redflags">
                  <RedFlagsEditor complaintId={selectedComplaint} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
