import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronRight, FlaskConical, Play, Zap,
  Pencil, Check, X, AlertTriangle, Activity, Brain,
  ClipboardList, Settings2, RefreshCw, CheckCircle2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Complaint {
  id:            string;
  totalRules:    number;
  questionCount: number;
  redFlagCount:  number;
}
interface MedSystem {
  key:            string;
  label:          string;
  color:          string;
  complaints:     Complaint[];
  complaintCount: number;
}
interface SystemsResponse {
  ok:               boolean;
  systems:          MedSystem[];
  totalComplaints:  number;
}

interface QuestionRule {
  rule_id:               string;
  rule_name:             string;
  logic_description:     string | null;
  question_dependencies: string | null;
  safety_level:          string;
  priority:              number;
  complaint_id:          string;
}
interface QuestionsResponse {
  ok:          boolean;
  complaintId: string;
  levels:      { l1: QuestionRule[]; l2: QuestionRule[]; l3: QuestionRule[] };
  total:       number;
  system:      string;
}

interface SimulatedAnswer {
  ruleId:       string;
  questionText: string;
  answer:       "yes" | "no" | "value";
  response:     string;
  populateDeps: boolean;
  level:        1 | 2 | 3;
  deps:         string[];
}
interface SimulateResponse {
  ok:          boolean;
  complaintId: string;
  scenario:    string;
  answers:     SimulatedAnswer[];
  summary: {
    disposition:    string;
    hardStop:       boolean;
    escalated:      boolean;
    stepsExecuted:  number;
    rulesEvaluated: number;
    rulesFired:     number;
    topDiagnoses:   Array<{ diagnosis_id?: string; label?: string; probability?: number }>;
    redFlagsHit:    string[];
    confidence:     number | null;
    durationMs:     number;
  };
  error?: string;
}
interface RunSystemResponse {
  ok:       boolean;
  systemKey:string;
  scenario: string;
  total:    number;
  erNow:    number;
  homeCare: number;
  errors:   number;
  results:  Array<{ complaintId: string; disposition: string; hardStop: boolean; rulesFired: number; durationMs: number; error?: string }>;
}

type Scenario = "high_risk" | "moderate" | "low_risk";

// ── Helpers ──────────────────────────────────────────────────────────────────

function authedFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("app_auth_token");
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

function dispositionBadge(d: string) {
  if (!d) return null;
  const isER    = d.includes("ER") || d.includes("EMERGENCY");
  const isUrgent= d.includes("URGENT") || d.includes("SAME_DAY");
  const isHome  = d.includes("HOME") || d.includes("ROUTINE");
  const cls = isER ? "bg-red-100 text-red-800 border-red-300"
    : isUrgent    ? "bg-amber-100 text-amber-800 border-amber-300"
    : isHome      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-slate-100 text-slate-700 border-slate-300";
  const icon = isER ? "🔴" : isUrgent ? "🟡" : isHome ? "🟢" : "⚪";
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold ${cls}`}>{icon} {d}</span>;
}

const LEVEL_LABELS = ["L1 — HPI / Clarifying", "L2 — Secondary Symptoms", "L3 — Modifying / PMH"];
const SCENARIO_LABELS: Record<Scenario, string> = {
  high_risk: "🔴 High Risk (67M, HTN/DM/CAD)",
  moderate:  "🟡 Moderate (48F, HTN)",
  low_risk:  "🟢 Low Risk (26F, healthy)",
};
const SYSTEM_COLORS: Record<string, string> = {
  cardiovascular:   "text-red-600",
  dermatology:      "text-amber-600",
  ent:              "text-yellow-600",
  endocrine:        "text-orange-600",
  gastrointestinal: "text-green-600",
  general:          "text-slate-600",
  genitourinary:    "text-pink-600",
  infectious:       "text-lime-600",
  musculoskeletal:  "text-cyan-600",
  neurological:     "text-purple-600",
  ophthalmology:    "text-sky-600",
  psychiatry:       "text-violet-600",
  respiratory:      "text-blue-600",
  toxicology:       "text-rose-600",
};

// ── Inline question editor ────────────────────────────────────────────────────

function QuestionRow({
  q,
  answer,
  onSave,
}: {
  q:       QuestionRule;
  answer?: SimulatedAnswer;
  onSave:  (ruleId: string, patch: Partial<QuestionRule>) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [text,    setText]      = useState(q.logic_description ?? q.rule_name ?? "");
  const [deps,    setDeps]      = useState(q.question_dependencies ?? "");

  function commit() {
    onSave(q.rule_id, { logic_description: text, question_dependencies: deps });
    setEditing(false);
  }
  function cancel() {
    setText(q.logic_description ?? q.rule_name ?? "");
    setDeps(q.question_dependencies ?? "");
    setEditing(false);
  }

  const safeColor = q.safety_level === "CRITICAL" ? "bg-red-100 text-red-700"
    : q.safety_level === "HIGH"                    ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";

  return (
    <div
      data-testid={`question-row-${q.rule_id}`}
      className="group border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors bg-white"
    >
      <div className="flex items-start gap-2">
        <span className="text-[11px] text-slate-400 font-mono pt-0.5 w-5 shrink-0">{q.priority}</span>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                data-testid={`input-question-text-${q.rule_id}`}
                value={text}
                onChange={e => setText(e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                placeholder="Question text…"
              />
              <div className="flex items-center gap-2">
                <Input
                  data-testid={`input-deps-${q.rule_id}`}
                  value={deps}
                  onChange={e => setDeps(e.target.value)}
                  className="text-xs font-mono h-7 flex-1"
                  placeholder="Dependencies (space-separated)"
                />
                <Button
                  data-testid={`button-save-question-${q.rule_id}`}
                  size="sm" variant="default" className="h-7 px-2"
                  onClick={commit}
                >
                  <Check size={12} />
                </Button>
                <Button
                  data-testid={`button-cancel-question-${q.rule_id}`}
                  size="sm" variant="ghost" className="h-7 px-2"
                  onClick={cancel}
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-800 leading-snug">
                {q.logic_description ?? q.rule_name}
              </p>
              {q.question_dependencies && (
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                  deps: {q.question_dependencies}
                </p>
              )}
              {answer && (
                <div className="mt-1.5 flex items-start gap-1.5 bg-slate-50 rounded px-2 py-1">
                  <span className={`text-[10px] font-bold uppercase shrink-0 ${answer.populateDeps ? "text-emerald-600" : "text-slate-400"}`}>
                    {answer.answer}
                  </span>
                  <span className="text-[11px] text-slate-600 italic line-clamp-2">"{answer.response}"</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${safeColor}`}>
            {q.safety_level}
          </span>
          {!editing && (
            <button
              data-testid={`button-edit-question-${q.rule_id}`}
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100"
            >
              <Pencil size={11} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ComplaintTestLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Selection state
  const [openSystems, setOpenSystems]       = useState<Set<string>>(new Set(["cardiovascular"]));
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [selectedSystem,    setSelectedSystem]    = useState<string | null>(null);
  const [scenario, setScenario]                   = useState<Scenario>("high_risk");
  const [customAnswers, setCustomAnswers]          = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]                 = useState("l1");

  // ── Data queries ────────────────────────────────────────────────────────

  const systemsQ = useQuery<SystemsResponse>({
    queryKey: ["/api/complaint-test-lab/systems"],
    queryFn:  () => authedFetch("/api/complaint-test-lab/systems").then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const questionsQ = useQuery<QuestionsResponse>({
    queryKey: ["/api/complaint-test-lab/questions", selectedComplaint],
    queryFn:  () =>
      authedFetch(`/api/complaint-test-lab/questions/${selectedComplaint}`).then(r => r.json()),
    enabled: !!selectedComplaint,
    staleTime: 2 * 60_000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────

  const simulateMut = useMutation<SimulateResponse, Error, { complaintId: string; scenario: Scenario; customAnswers?: Record<string, string> }>({
    mutationFn: body =>
      authedFetch("/api/complaint-test-lab/simulate", {
        method: "POST",
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: d => {
      if (!d.ok) toast({ title: "Simulation error", description: d.error, variant: "destructive" });
    },
    onError: e => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runSystemMut = useMutation<RunSystemResponse, Error, { systemKey: string; scenario: Scenario }>({
    mutationFn: body =>
      authedFetch("/api/complaint-test-lab/run-system", {
        method: "POST",
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: d => {
      if (d.ok) {
        toast({
          title: `System run complete — ${d.total} complaints`,
          description: `🔴 ER_NOW: ${d.erNow}  🟢 HOME_CARE: ${d.homeCare}  ❌ Errors: ${d.errors}`,
        });
      }
    },
    onError: e => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateQuestionMut = useMutation<{ ok: boolean }, Error, { ruleId: string; patch: Partial<QuestionRule> }>({
    mutationFn: ({ ruleId, patch }) =>
      authedFetch(`/api/complaint-test-lab/question/${ruleId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] });
      toast({ title: "Question saved" });
    },
    onError: e => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleSystem = useCallback((key: string) => {
    setOpenSystems(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  function selectComplaint(id: string, sysKey: string) {
    setSelectedComplaint(id);
    setSelectedSystem(sysKey);
    setCustomAnswers({});
    simulateMut.reset();
    runSystemMut.reset();
  }

  function runTest() {
    if (!selectedComplaint) return;
    simulateMut.mutate({ complaintId: selectedComplaint, scenario, customAnswers });
  }

  function runSystem() {
    if (!selectedSystem) return;
    runSystemMut.mutate({ systemKey: selectedSystem, scenario });
  }

  // Build answer map keyed by ruleId for easy lookup
  const answerMap: Record<string, SimulatedAnswer> = {};
  for (const a of simulateMut.data?.answers ?? []) {
    answerMap[a.ruleId] = a;
  }

  const levels = questionsQ.data?.levels;
  const allQ   = [...(levels?.l1 ?? []), ...(levels?.l2 ?? []), ...(levels?.l3 ?? [])];
  const summary = simulateMut.data?.summary;
  const sysRunResults = runSystemMut.data?.results;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <FlaskConical size={18} className="text-violet-600" />
        <div>
          <h1 className="text-base font-bold text-slate-900">Complaint Testing Lab</h1>
          <p className="text-[11px] text-slate-500">
            All chief complaints · 3 question levels · MedDialog / HealthCareMagic100k patient simulation
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={scenario} onValueChange={v => setScenario(v as Scenario)}>
            <SelectTrigger
              data-testid="select-scenario"
              className="w-52 h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SCENARIO_LABELS) as [Scenario, string][]).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            data-testid="button-run-test"
            size="sm" className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700"
            onClick={runTest}
            disabled={!selectedComplaint || simulateMut.isPending}
          >
            {simulateMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            Run Complaint
          </Button>

          <Button
            data-testid="button-run-system"
            size="sm" variant="outline" className="h-8 gap-1.5"
            onClick={runSystem}
            disabled={!selectedSystem || runSystemMut.isPending}
          >
            {runSystemMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            Run System
          </Button>
        </div>
      </div>

      {/* ── Three-panel layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: System tree ── */}
        <div className="w-60 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {systemsQ.data ? `${systemsQ.data.totalComplaints} Complaints` : "Loading…"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {systemsQ.isLoading && (
              <div className="p-4 text-xs text-slate-400">Loading systems…</div>
            )}
            {systemsQ.data?.systems.map(sys => (
              <div key={sys.key}>
                {/* System header */}
                <button
                  data-testid={`button-system-${sys.key}`}
                  onClick={() => toggleSystem(sys.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${selectedSystem === sys.key ? "bg-violet-50" : ""}`}
                >
                  {openSystems.has(sys.key)
                    ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                  <span className={`text-xs font-semibold truncate ${SYSTEM_COLORS[sys.key] ?? "text-slate-700"}`}>
                    {sys.label}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-400 shrink-0">{sys.complaintCount}</span>
                </button>

                {/* Complaint list */}
                {openSystems.has(sys.key) && sys.complaints.map(c => (
                  <button
                    key={c.id}
                    data-testid={`button-complaint-${c.id}`}
                    onClick={() => selectComplaint(c.id, sys.key)}
                    className={`w-full text-left pl-8 pr-3 py-1.5 hover:bg-slate-50 transition-colors border-l-2 ${
                      selectedComplaint === c.id
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-transparent text-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono truncate flex-1">{c.id}</span>
                      {c.questionCount > 0 && (
                        <span className="text-[9px] text-slate-400 shrink-0">{c.questionCount}q</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: Question editor ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedComplaint ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <ClipboardList size={36} className="opacity-30" />
              <p className="text-sm">Select a complaint from the left to view its questions</p>
            </div>
          ) : (
            <>
              {/* Complaint header */}
              <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 shrink-0">
                <Brain size={15} className={SYSTEM_COLORS[selectedSystem ?? ""] ?? "text-slate-600"} />
                <span className="text-sm font-semibold text-slate-800">{selectedComplaint}</span>
                {questionsQ.data && (
                  <Badge variant="outline" className="text-[10px]">
                    {questionsQ.data.total} questions
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] ml-1">
                  {questionsQ.data?.system ?? ""}
                </Badge>
                {questionsQ.isLoading && (
                  <RefreshCw size={12} className="animate-spin text-slate-400" />
                )}
              </div>

              {/* Level tabs */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-3 grid grid-cols-3 h-8">
                    {(["l1", "l2", "l3"] as const).map((lk, i) => {
                      const count = (levels?.[lk] ?? []).length;
                      return (
                        <TabsTrigger
                          key={lk}
                          value={lk}
                          data-testid={`tab-${lk}`}
                          className="text-xs gap-1"
                        >
                          {["L1 HPI", "L2 Secondary", "L3 Modifying"][i]}
                          {count > 0 && (
                            <span className="text-[9px] bg-slate-200 text-slate-600 px-1 rounded-full">{count}</span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {(["l1", "l2", "l3"] as const).map((lk, i) => (
                    <TabsContent key={lk} value={lk} className="flex-1 overflow-y-auto px-4 pb-4 mt-3">
                      {questionsQ.isLoading ? (
                        <p className="text-xs text-slate-400 py-8 text-center">Loading…</p>
                      ) : (levels?.[lk] ?? []).length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-xs text-slate-400">No {LEVEL_LABELS[i]} questions for this complaint</p>
                          <p className="text-[11px] text-slate-300 mt-1">Questions are sourced from kb_master_rules (priority {[1, 4, 7][i]}–{[3, 6, 10][i]})</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-400 pb-1">{LEVEL_LABELS[i]} — {(levels?.[lk] ?? []).length} questions</p>
                          {(levels?.[lk] ?? []).map(q => (
                            <QuestionRow
                              key={q.rule_id}
                              q={q}
                              answer={answerMap[q.rule_id]}
                              onSave={(ruleId, patch) => updateQuestionMut.mutate({ ruleId, patch })}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Results panel ── */}
        <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <Activity size={13} className="text-violet-600" />
            <span className="text-[11px] font-semibold text-slate-700">Test Results</span>
            {summary && (
              <span className="ml-auto text-[10px] text-slate-400">{summary.durationMs}ms</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">

            {/* ── Idle state ── */}
            {!simulateMut.data && !simulateMut.isPending && !runSystemMut.data && !runSystemMut.isPending && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical size={32} className="text-slate-200 mb-3" />
                <p className="text-xs text-slate-400">Select a complaint and scenario,<br/>then click <strong>Run Complaint</strong></p>
              </div>
            )}

            {/* ── Running ── */}
            {(simulateMut.isPending || runSystemMut.isPending) && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCw size={20} className="animate-spin text-violet-500" />
                <p className="text-xs text-slate-500">
                  {simulateMut.isPending ? "Simulating patient & running pipeline…" : "Running all complaints in system…"}
                </p>
              </div>
            )}

            {/* ── Single complaint results ── */}
            {summary && !simulateMut.isPending && (
              <>
                {/* Disposition */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Disposition</p>
                  <div className="flex items-center gap-2">
                    {dispositionBadge(summary.disposition)}
                    {summary.hardStop && (
                      <Badge className="text-[10px] bg-red-600">HARD STOP</Badge>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Steps Run",      val: summary.stepsExecuted  },
                    { label: "Rules Fired",    val: summary.rulesFired     },
                    { label: "Rules Checked",  val: summary.rulesEvaluated },
                    { label: "Confidence",     val: summary.confidence != null ? `${(summary.confidence * 100).toFixed(0)}%` : "—" },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 rounded p-2 text-center">
                      <p className="text-base font-bold text-slate-800">{s.val}</p>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Red flags */}
                {summary.redFlagsHit.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <AlertTriangle size={10} className="text-red-500" /> Red Flags Hit
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {summary.redFlagsHit.map(rf => (
                        <span key={rf} className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">{rf}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top diagnoses */}
                {summary.topDiagnoses.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Top Diagnoses</p>
                    <div className="space-y-1">
                      {summary.topDiagnoses.map((dx, i) => {
                        const label = dx.label ?? dx.diagnosis_id ?? `Dx ${i + 1}`;
                        const prob  = dx.probability != null ? Math.round(dx.probability * 100) : null;
                        return (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-400 w-3">{i + 1}.</span>
                            <span className="text-slate-700 flex-1 truncate">{label}</span>
                            {prob != null && (
                              <span className="text-slate-500 shrink-0">{prob}%</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Q&A summary */}
                {simulateMut.data?.answers && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Settings2 size={10} /> Patient Responses
                      <span className="ml-auto font-normal normal-case">
                        {simulateMut.data.answers.filter(a => a.populateDeps).length} / {simulateMut.data.answers.length} yes
                      </span>
                    </p>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {simulateMut.data.answers.map(a => (
                        <div
                          key={a.ruleId}
                          data-testid={`result-answer-${a.ruleId}`}
                          className={`text-[10px] p-1.5 rounded border ${a.populateDeps ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}
                        >
                          <div className="flex gap-1 items-start">
                            <span className={`font-bold shrink-0 ${a.populateDeps ? "text-red-600" : "text-slate-400"}`}>
                              {a.populateDeps ? "YES" : "NO"}
                            </span>
                            <span className="text-slate-500 line-clamp-1">{a.questionText}</span>
                          </div>
                          <p className="text-slate-600 italic pl-7 line-clamp-1">"{a.response}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {simulateMut.data?.error && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-[11px] text-red-700">
                    <AlertTriangle size={12} className="inline mr-1" />
                    {simulateMut.data.error}
                  </div>
                )}
              </>
            )}

            {/* ── System run results ── */}
            {runSystemMut.data && !runSystemMut.isPending && (
              <>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">System Run — {runSystemMut.data.systemKey}</p>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: "Total",      val: runSystemMut.data.total,    cls: "bg-slate-50" },
                      { label: "ER_NOW",     val: runSystemMut.data.erNow,    cls: "bg-red-50 text-red-800" },
                      { label: "HOME_CARE",  val: runSystemMut.data.homeCare, cls: "bg-emerald-50 text-emerald-800" },
                    ].map(s => (
                      <div key={s.label} className={`rounded p-2 ${s.cls}`}>
                        <p className="text-lg font-bold">{s.val}</p>
                        <p className="text-[9px]">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {sysRunResults?.map(r => (
                    <div
                      key={r.complaintId}
                      data-testid={`result-system-${r.complaintId}`}
                      className="flex items-center gap-2 text-[10px] py-1 border-b border-slate-50"
                    >
                      {r.error
                        ? <X size={10} className="text-red-500 shrink-0" />
                        : r.disposition === "ER_NOW" || r.hardStop
                          ? <AlertTriangle size={10} className="text-red-500 shrink-0" />
                          : <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                      }
                      <span className="font-mono text-slate-600 flex-1 truncate">{r.complaintId}</span>
                      <span className={`font-medium shrink-0 ${r.disposition === "ER_NOW" ? "text-red-600" : "text-emerald-600"}`}>
                        {r.disposition}
                      </span>
                      <span className="text-slate-300 shrink-0">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
