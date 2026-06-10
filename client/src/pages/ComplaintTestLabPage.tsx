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
  Pencil, Check, X, Activity, Brain,
  ClipboardList, RefreshCw, CheckCircle2,
  Trash2, Plus, ArrowUp, ArrowDown, GripVertical,
  AlertTriangle, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  ok: boolean; systems: MedSystem[]; totalComplaints: number;
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
  ok: boolean; complaintId: string;
  levels: { l1: QuestionRule[]; l2: QuestionRule[]; l3: QuestionRule[] };
  total: number; system: string;
}

interface SimulatedAnswer {
  ruleId: string; questionText: string;
  answer: "yes" | "no" | "value"; response: string;
  populateDeps: boolean; level: 1 | 2 | 3; deps: string[];
}
interface SimulateResponse {
  ok: boolean; complaintId: string; scenario: string;
  answers: SimulatedAnswer[];
  summary: {
    disposition: string; hardStop: boolean; escalated: boolean;
    stepsExecuted: number; rulesEvaluated: number; rulesFired: number;
    topDiagnoses: Array<{ label?: string; probability?: number }>;
    redFlagsHit: string[]; confidence: number | null; durationMs: number;
  };
  error?: string;
}

type Scenario = "high_risk" | "moderate" | "low_risk";
type LevelKey = "l1" | "l2" | "l3";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (!d || d === "UNKNOWN") return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold bg-slate-100 text-slate-500 border-slate-200">
      ⚪ {d || "—"}
    </span>
  );
  const isER     = d.includes("ER") || d.includes("EMERGENCY") || d.includes("911");
  const isUrgent = d.includes("URGENT") || d.includes("SAME_DAY");
  const isHome   = d.includes("HOME") || d.includes("ROUTINE");
  const cls = isER ? "bg-red-100 text-red-800 border-red-300"
    : isUrgent    ? "bg-amber-100 text-amber-800 border-amber-300"
    : isHome      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-slate-100 text-slate-700 border-slate-300";
  const icon = isER ? "🔴" : isUrgent ? "🟡" : isHome ? "🟢" : "⚪";
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold ${cls}`}>{icon} {d}</span>;
}

const LEVEL_INFO = [
  { key: "l1" as LevelKey, label: "L1 HPI",        desc: "History of Present Illness — primary clarifying questions", priorityRange: "priority ≤ 2" },
  { key: "l2" as LevelKey, label: "L2 Secondary",   desc: "Secondary symptom exploration",                            priorityRange: "priority 3–10" },
  { key: "l3" as LevelKey, label: "L3 Modifying",   desc: "PMH / modifying factors / social history",                 priorityRange: "priority > 10" },
];
const LEVEL_PRIORITY_DEFAULT: Record<LevelKey, number> = { l1: 1, l2: 5, l3: 15 };

const SCENARIO_LABELS: Record<Scenario, string> = {
  high_risk: "🔴 High Risk (67M, HTN/DM/CAD)",
  moderate:  "🟡 Moderate (48F, HTN)",
  low_risk:  "🟢 Low Risk (26F, healthy)",
};
const SYSTEM_COLORS: Record<string, string> = {
  cardiovascular: "text-red-600", dermatology: "text-amber-600", ent: "text-yellow-600",
  endocrine: "text-orange-600", gastrointestinal: "text-green-600", general: "text-slate-600",
  genitourinary: "text-pink-600", infectious: "text-lime-600", musculoskeletal: "text-cyan-600",
  neurological: "text-purple-600", ophthalmology: "text-sky-600", psychiatry: "text-violet-600",
  respiratory: "text-blue-600", toxicology: "text-rose-600",
};
const SAFETY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
  HIGH:     "bg-amber-100 text-amber-700 border-amber-200",
  STANDARD: "bg-slate-100 text-slate-600 border-slate-200",
};

// ── Inline "Add Question" form ────────────────────────────────────────────────

function AddQuestionForm({
  complaintId,
  levelKey,
  onAdd,
  onCancel,
}: {
  complaintId: string;
  levelKey: LevelKey;
  onAdd: (fields: { rule_name: string; logic_description: string; question_dependencies: string; safety_level: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName]   = useState("");
  const [text, setText]   = useState("");
  const [deps, setDeps]   = useState("");
  const [safe, setSafe]   = useState("STANDARD");

  function submit() {
    if (!name.trim() && !text.trim()) return;
    onAdd({ rule_name: name.trim() || text.trim(), logic_description: text.trim() || name.trim(), question_dependencies: deps.trim(), safety_level: safe });
  }

  return (
    <div className="border-2 border-dashed border-violet-300 rounded-lg p-3 bg-violet-50/50 space-y-2">
      <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">New Question — {LEVEL_INFO.find(l => l.key === levelKey)?.label}</p>
      <Input
        data-testid="input-new-question-name"
        placeholder="Short name (e.g. Does the pain radiate?)"
        value={name}
        onChange={e => setName(e.target.value)}
        className="text-sm h-8"
        autoFocus
      />
      <Textarea
        data-testid="input-new-question-text"
        placeholder="Full question text shown to the patient…"
        value={text}
        onChange={e => setText(e.target.value)}
        className="text-sm min-h-[56px] resize-none"
      />
      <div className="flex gap-2 items-center">
        <Input
          data-testid="input-new-question-deps"
          placeholder="Dependencies (space-separated field keys)"
          value={deps}
          onChange={e => setDeps(e.target.value)}
          className="text-xs font-mono h-7 flex-1"
        />
        <Select value={safe} onValueChange={setSafe}>
          <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-new-question-safety">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STANDARD">STANDARD</SelectItem>
            <SelectItem value="HIGH">HIGH</SelectItem>
            <SelectItem value="CRITICAL">CRITICAL</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          data-testid="button-add-question-confirm"
          size="sm" className="h-7 px-3 gap-1 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={submit}
          disabled={!name.trim() && !text.trim()}
        >
          <Plus size={12} /> Add Question
        </Button>
        <Button data-testid="button-add-question-cancel" size="sm" variant="ghost" className="h-7 px-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Question row ──────────────────────────────────────────────────────────────

function QuestionRow({
  q,
  answer,
  isFirst,
  isLast,
  onSave,
  onDelete,
  onMove,
}: {
  q:       QuestionRule;
  answer?: SimulatedAnswer;
  isFirst: boolean;
  isLast:  boolean;
  onSave:  (ruleId: string, patch: Partial<QuestionRule>) => void;
  onDelete:(ruleId: string) => void;
  onMove:  (ruleId: string, dir: "up" | "down") => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [text,    setText]      = useState(q.logic_description ?? q.rule_name ?? "");
  const [name,    setName]      = useState(q.rule_name ?? "");
  const [deps,    setDeps]      = useState(
    Array.isArray(q.question_dependencies)
      ? (q.question_dependencies as string[]).join(" ")
      : (q.question_dependencies ?? "")
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  function commit() {
    onSave(q.rule_id, { rule_name: name, logic_description: text, question_dependencies: deps });
    setEditing(false);
  }
  function cancel() {
    setText(q.logic_description ?? q.rule_name ?? "");
    setName(q.rule_name ?? "");
    setDeps(Array.isArray(q.question_dependencies) ? (q.question_dependencies as string[]).join(" ") : (q.question_dependencies ?? ""));
    setEditing(false);
  }

  const safeClass = SAFETY_COLOR[q.safety_level] ?? SAFETY_COLOR.STANDARD;
  const displayText = q.logic_description ?? q.rule_name;

  return (
    <div
      data-testid={`question-row-${q.rule_id}`}
      className="group border border-slate-200 rounded-lg p-3 hover:border-violet-300 hover:shadow-sm transition-all bg-white"
    >
      <div className="flex items-start gap-2">
        {/* Drag handle / reorder */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
          <GripVertical size={12} className="text-slate-300 group-hover:text-slate-400" />
          <span className="text-[9px] text-slate-300 font-mono">{q.priority}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input
                data-testid={`input-question-name-${q.rule_id}`}
                value={name}
                onChange={e => setName(e.target.value)}
                className="text-xs font-medium h-7"
                placeholder="Short name…"
              />
              <Textarea
                data-testid={`input-question-text-${q.rule_id}`}
                value={text}
                onChange={e => setText(e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                placeholder="Full question text…"
              />
              <div className="flex items-center gap-2">
                <Input
                  data-testid={`input-deps-${q.rule_id}`}
                  value={deps}
                  onChange={e => setDeps(e.target.value)}
                  className="text-xs font-mono h-7 flex-1"
                  placeholder="Dependency field keys (space-separated)"
                />
                <Button data-testid={`button-save-question-${q.rule_id}`} size="sm" variant="default" className="h-7 px-2 bg-violet-600 hover:bg-violet-700" onClick={commit}>
                  <Check size={12} />
                </Button>
                <Button data-testid={`button-cancel-question-${q.rule_id}`} size="sm" variant="ghost" className="h-7 px-2" onClick={cancel}>
                  <X size={12} />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-500 mb-0.5 truncate">{q.rule_name}</p>
              <p className="text-sm text-slate-800 leading-snug">
                {displayText && displayText !== q.rule_name ? displayText : q.rule_name}
              </p>
              {q.question_dependencies && (
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                  deps: {Array.isArray(q.question_dependencies) ? (q.question_dependencies as string[]).join(", ") : q.question_dependencies}
                </p>
              )}
              {answer && (
                <div className={`mt-1.5 flex items-start gap-1.5 rounded px-2 py-1 ${answer.populateDeps ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                  <span className={`text-[10px] font-bold uppercase shrink-0 mt-0.5 ${answer.populateDeps ? "text-emerald-600" : "text-slate-400"}`}>
                    {answer.answer}
                  </span>
                  <span className="text-[11px] text-slate-600 italic line-clamp-2">"{answer.response}"</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${safeClass}`}>
            {q.safety_level}
          </span>
          <button
            data-testid={`button-move-up-${q.rule_id}`}
            onClick={() => onMove(q.rule_id, "up")}
            disabled={isFirst}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ArrowUp size={11} className="text-slate-400" />
          </button>
          <button
            data-testid={`button-move-down-${q.rule_id}`}
            onClick={() => onMove(q.rule_id, "down")}
            disabled={isLast}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ArrowDown size={11} className="text-slate-400" />
          </button>
          {!editing && (
            <button
              data-testid={`button-edit-question-${q.rule_id}`}
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-slate-100"
              title="Edit"
            >
              <Pencil size={11} className="text-slate-400" />
            </button>
          )}
          {!editing && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  data-testid={`button-confirm-delete-${q.rule_id}`}
                  onClick={() => { onDelete(q.rule_id); setConfirmDelete(false); }}
                  className="p-1 rounded bg-red-100 hover:bg-red-200"
                  title="Confirm delete"
                >
                  <Check size={11} className="text-red-600" />
                </button>
                <button
                  data-testid={`button-cancel-delete-${q.rule_id}`}
                  onClick={() => setConfirmDelete(false)}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <X size={11} className="text-slate-400" />
                </button>
              </div>
            ) : (
              <button
                data-testid={`button-delete-question-${q.rule_id}`}
                onClick={() => setConfirmDelete(true)}
                className="p-1 rounded hover:bg-red-50"
                title="Delete"
              >
                <Trash2 size={11} className="text-slate-300 hover:text-red-400" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComplaintTestLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [openSystems,        setOpenSystems]        = useState<Set<string>>(new Set(["cardiovascular"]));
  const [selectedComplaint,  setSelectedComplaint]  = useState<string | null>(null);
  const [selectedSystem,     setSelectedSystem]     = useState<string | null>(null);
  const [scenario,           setScenario]           = useState<Scenario>("high_risk");
  const [activeTab,          setActiveTab]          = useState<LevelKey>("l1");
  const [addingLevel,        setAddingLevel]        = useState<LevelKey | null>(null);
  const [searchFilter,       setSearchFilter]       = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const systemsQ = useQuery<SystemsResponse>({
    queryKey: ["/api/complaint-test-lab/systems"],
    queryFn:  () => authedFetch("/api/complaint-test-lab/systems").then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const questionsQ = useQuery<QuestionsResponse>({
    queryKey: ["/api/complaint-test-lab/questions", selectedComplaint],
    queryFn:  () => authedFetch(`/api/complaint-test-lab/questions/${selectedComplaint}`).then(r => r.json()),
    enabled:  !!selectedComplaint,
    staleTime: 0,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const simulateMut = useMutation<SimulateResponse, Error, { complaintId: string; scenario: Scenario }>({
    mutationFn: body => authedFetch("/api/complaint-test-lab/simulate", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess:  d => { if (!d.ok) toast({ title: "Simulation error", description: d.error, variant: "destructive" }); },
    onError:    e => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addQuestionMut = useMutation<{ ok: boolean; rule: QuestionRule | null }, Error, {
    complaint_id: string; rule_name: string; logic_description: string;
    question_dependencies: string; safety_level: string; level: 1 | 2 | 3;
  }>({
    mutationFn: body => authedFetch("/api/complaint-test-lab/question", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess:  (d) => {
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] });
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/systems"] });
      setAddingLevel(null);
      toast({ title: "Question added" });
    },
    onError: e => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const updateQuestionMut = useMutation<{ ok: boolean }, Error, { ruleId: string; patch: Partial<QuestionRule> }>({
    mutationFn: ({ ruleId, patch }) =>
      authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "PATCH", body: JSON.stringify(patch) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] });
      toast({ title: "Saved" });
    },
    onError: e => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteQuestionMut = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: ruleId => authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] });
      qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/systems"] });
      toast({ title: "Question removed" });
    },
    onError: e => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const moveMut = useMutation<{ ok: boolean }, Error, { ruleId: string; priority: number }>({
    mutationFn: ({ ruleId, priority }) =>
      authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "PATCH", body: JSON.stringify({ priority }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] }),
    onError:   e => toast({ title: "Reorder failed", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSystem = useCallback((key: string) => {
    setOpenSystems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  function selectComplaint(id: string, sysKey: string) {
    setSelectedComplaint(id);
    setSelectedSystem(sysKey);
    setAddingLevel(null);
    simulateMut.reset();
  }

  function handleMove(ruleId: string, dir: "up" | "down", list: QuestionRule[]) {
    const idx = list.findIndex(q => q.rule_id === ruleId);
    if (idx < 0) return;
    const target = dir === "up" ? list[idx - 1] : list[idx + 1];
    if (!target) return;
    // Swap priorities
    moveMut.mutate({ ruleId, priority: target.priority });
    moveMut.mutate({ ruleId: target.rule_id, priority: list[idx].priority });
  }

  function handleAdd(levelKey: LevelKey, fields: { rule_name: string; logic_description: string; question_dependencies: string; safety_level: string }) {
    if (!selectedComplaint) return;
    const levelNum = levelKey === "l1" ? 1 : levelKey === "l2" ? 2 : 3;
    addQuestionMut.mutate({ complaint_id: selectedComplaint, level: levelNum as 1|2|3, ...fields });
  }

  const levels  = questionsQ.data?.levels;
  const allQ    = [...(levels?.l1 ?? []), ...(levels?.l2 ?? []), ...(levels?.l3 ?? [])];
  const summary = simulateMut.data?.summary;
  const answerMap: Record<string, SimulatedAnswer> = {};
  for (const a of simulateMut.data?.answers ?? []) answerMap[a.ruleId] = a;

  // Filter complaints by search
  const filteredSystems = systemsQ.data?.systems.map(sys => ({
    ...sys,
    complaints: searchFilter
      ? sys.complaints.filter(c => c.id.toLowerCase().includes(searchFilter.toLowerCase()))
      : sys.complaints,
  })).filter(sys => sys.complaints.length > 0 || !searchFilter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <FlaskConical size={18} className="text-violet-600" />
        <div>
          <h1 className="text-base font-bold text-slate-900">Complaint Testing Lab</h1>
          <p className="text-[11px] text-slate-500">All chief complaints · 3 question levels · MedDialog / HealthCareMagic100k simulation</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={scenario} onValueChange={v => setScenario(v as Scenario)}>
            <SelectTrigger data-testid="select-scenario" className="w-52 h-8 text-xs">
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
            onClick={() => selectedComplaint && simulateMut.mutate({ complaintId: selectedComplaint, scenario })}
            disabled={!selectedComplaint || simulateMut.isPending}
          >
            {simulateMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            Run Complaint
          </Button>
          <Button
            data-testid="button-run-system"
            size="sm" variant="outline" className="h-8 gap-1.5"
            onClick={() => selectedSystem && authedFetch("/api/complaint-test-lab/run-system", {
              method: "POST", body: JSON.stringify({ systemKey: selectedSystem, scenario }),
            }).then(r => r.json()).then(d => toast({ title: `System: ${d.total} complaints`, description: `🔴 ER: ${d.erNow}  🟢 Home: ${d.homeCare}  ❌ Err: ${d.errors}` }))}
            disabled={!selectedSystem}
          >
            <Zap size={13} /> Run System
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: System tree ── */}
        <div className="w-60 border-r border-slate-200 bg-white flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              {systemsQ.data ? `${systemsQ.data.totalComplaints} Complaints` : "Loading…"}
            </span>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="input-search-complaints"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Filter complaints…"
                className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-300"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {systemsQ.isLoading && <div className="p-4 text-xs text-slate-400">Loading systems…</div>}
            {filteredSystems?.map(sys => (
              <div key={sys.key}>
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

                {(openSystems.has(sys.key) || searchFilter) && sys.complaints.map(c => (
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
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {c.questionCount > 0 ? `${c.questionCount}q` : <span className="text-slate-300">—</span>}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: Question editor ── */}
        <div className="flex-[2] flex flex-col overflow-hidden border-r border-slate-200">
          {!selectedComplaint ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <ClipboardList size={36} className="opacity-30" />
              <p className="text-sm">Select a complaint from the left to view and edit its questions</p>
            </div>
          ) : (
            <>
              {/* Complaint header */}
              <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 shrink-0">
                <Brain size={15} className={SYSTEM_COLORS[selectedSystem ?? ""] ?? "text-slate-600"} />
                <span className="text-sm font-semibold text-slate-800">{selectedComplaint}</span>
                {questionsQ.isLoading
                  ? <RefreshCw size={12} className="animate-spin text-slate-400" />
                  : <Badge variant="outline" className="text-[10px]">{questionsQ.data?.total ?? 0} questions</Badge>
                }
                <Badge variant="outline" className="text-[10px] ml-0.5 capitalize">{questionsQ.data?.system ?? ""}</Badge>
              </div>

              {/* Level tabs */}
              <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as LevelKey); setAddingLevel(null); }} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="shrink-0 mx-4 mt-3 grid grid-cols-3 h-8">
                  {LEVEL_INFO.map(li => {
                    const count = (levels?.[li.key] ?? []).length;
                    return (
                      <TabsTrigger key={li.key} value={li.key} data-testid={`tab-${li.key}`} className="text-xs gap-1">
                        {li.label}
                        <span className={`text-[9px] px-1 rounded-full ${count > 0 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                          {count}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {LEVEL_INFO.map((li, i) => {
                  const qs = levels?.[li.key] ?? [];
                  return (
                    <TabsContent key={li.key} value={li.key} className="flex-1 overflow-y-auto px-4 pb-4 mt-2">
                      {/* Level description + Add button */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-slate-600">{li.desc}</p>
                          <p className="text-[10px] text-slate-400">{li.priorityRange} · {qs.length} question{qs.length !== 1 ? "s" : ""}</p>
                        </div>
                        <Button
                          data-testid={`button-add-question-${li.key}`}
                          size="sm" variant="outline"
                          className="h-7 px-2 gap-1 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                          onClick={() => setAddingLevel(addingLevel === li.key ? null : li.key)}
                        >
                          <Plus size={11} /> Add
                        </Button>
                      </div>

                      {/* Add form */}
                      {addingLevel === li.key && (
                        <div className="mb-3">
                          <AddQuestionForm
                            complaintId={selectedComplaint}
                            levelKey={li.key}
                            onAdd={fields => handleAdd(li.key, fields)}
                            onCancel={() => setAddingLevel(null)}
                          />
                        </div>
                      )}

                      {/* Questions list */}
                      {questionsQ.isLoading ? (
                        <div className="space-y-2">
                          {[1,2,3].map(n => (
                            <div key={n} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                          ))}
                        </div>
                      ) : qs.length === 0 ? (
                        <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                          <ClipboardList size={24} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-sm text-slate-400 font-medium">No {li.label} questions yet</p>
                          <p className="text-[11px] text-slate-300 mt-1 mb-3">{li.desc}</p>
                          <Button
                            data-testid={`button-add-first-question-${li.key}`}
                            size="sm" variant="outline"
                            className="gap-1 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                            onClick={() => setAddingLevel(li.key)}
                          >
                            <Plus size={11} /> Add First Question
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {qs.map((q, idx) => (
                            <QuestionRow
                              key={q.rule_id}
                              q={q}
                              answer={answerMap[q.rule_id]}
                              isFirst={idx === 0}
                              isLast={idx === qs.length - 1}
                              onSave={(ruleId, patch) => updateQuestionMut.mutate({ ruleId, patch })}
                              onDelete={ruleId => deleteQuestionMut.mutate(ruleId)}
                              onMove={(ruleId, dir) => handleMove(ruleId, dir, qs)}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </>
          )}
        </div>

        {/* ── RIGHT: Results panel ── */}
        <div className="w-72 flex flex-col overflow-hidden bg-white shrink-0">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-600">Test Results</span>
            {summary && <span className="ml-2 text-[10px] text-slate-400">{summary.durationMs}ms</span>}
          </div>

          {!summary && !simulateMut.isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2 px-4 text-center">
              <Activity size={28} className="opacity-40" />
              <p className="text-xs">Select a complaint and click <strong className="text-slate-400">Run Complaint</strong> to see results</p>
            </div>
          ) : simulateMut.isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw size={20} className="animate-spin" />
              <p className="text-xs">Running pipeline…</p>
            </div>
          ) : summary && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              {/* Disposition */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Disposition</p>
                {dispositionBadge(summary.disposition)}
                {summary.hardStop && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={9} /> HARD STOP
                  </span>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Steps Run",     val: summary.stepsExecuted },
                  { label: "Rules Fired",   val: summary.rulesFired },
                  { label: "Rules Checked", val: summary.rulesEvaluated },
                  { label: "Confidence",    val: summary.confidence != null ? `${(summary.confidence * 100).toFixed(0)}%` : "—" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                    <p className="text-base font-black text-slate-800">{s.val}</p>
                    <p className="text-[9px] text-slate-500 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Patient responses */}
              {simulateMut.data?.answers && simulateMut.data.answers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Patient Responses
                    <span className="ml-1 font-normal text-slate-400">
                      {simulateMut.data.answers.filter(a => a.populateDeps).length}/{simulateMut.data.answers.length} yes
                    </span>
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {simulateMut.data.answers.slice(0, 12).map(a => (
                      <div key={a.ruleId} className={`flex gap-1.5 items-start text-[10px] px-2 py-1 rounded ${a.populateDeps ? "bg-emerald-50" : "bg-slate-50"}`}>
                        <span className={`font-bold uppercase shrink-0 w-5 ${a.populateDeps ? "text-emerald-600" : "text-slate-400"}`}>{a.answer}</span>
                        <span className="text-slate-600 line-clamp-1 flex-1">{a.questionText}</span>
                      </div>
                    ))}
                    {simulateMut.data.answers.length > 12 && (
                      <p className="text-[10px] text-slate-400 text-center">+{simulateMut.data.answers.length - 12} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Red flags */}
              {summary.redFlagsHit.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">Red Flags Hit</p>
                  <div className="space-y-1">
                    {summary.redFlagsHit.map(rf => (
                      <div key={rf} className="flex items-center gap-1.5 text-[10px] bg-red-50 border border-red-100 rounded px-2 py-1">
                        <AlertTriangle size={9} className="text-red-500 shrink-0" />
                        <span className="text-red-700 font-mono">{rf}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top diagnoses */}
              {summary.topDiagnoses.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Top Diagnoses</p>
                  <div className="space-y-1">
                    {summary.topDiagnoses.map((dx, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] bg-slate-50 rounded px-2 py-1">
                        <span className="text-slate-400 font-mono w-3">{i + 1}</span>
                        <span className="flex-1 text-slate-700 truncate">{dx.label}</span>
                        {dx.probability != null && (
                          <span className="text-slate-400 shrink-0">{(dx.probability * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {simulateMut.data?.error && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <p className="text-[10px] text-red-700 font-medium">Pipeline error</p>
                  <p className="text-[10px] text-red-600 mt-0.5">{simulateMut.data.error}</p>
                </div>
              )}

              {/* All-clear */}
              {!simulateMut.data?.error && summary.rulesFired === 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded p-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <p className="text-[11px] text-emerald-700">Pipeline complete — no rules fired</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
