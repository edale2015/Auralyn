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
  AlertTriangle, Search, MessageSquare, Sparkles,
  Clock, MapPin, Thermometer, TrendingUp, TrendingDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Complaint { id: string; totalRules: number; questionCount: number; redFlagCount: number; }
interface MedSystem { key: string; label: string; color: string; complaints: Complaint[]; complaintCount: number; }
interface SystemsResponse { ok: boolean; systems: MedSystem[]; totalComplaints: number; }

interface QuestionRule {
  rule_id: string; rule_name: string; logic_description: string | null;
  question_dependencies: string | null; safety_level: string; priority: number; complaint_id: string;
}
interface QuestionsResponse {
  ok: boolean; complaintId: string;
  levels: { l1: QuestionRule[]; l2: QuestionRule[]; l3: QuestionRule[] };
  total: number; system: string;
}

interface SimulatedAnswer {
  ruleId: string; questionText: string; answer: "yes" | "no" | "value";
  response: string; populateDeps: boolean; level: 1 | 2 | 3; deps: string[];
}
interface SimulateResponse {
  ok: boolean; complaintId: string; scenario: string; answers: SimulatedAnswer[];
  summary: {
    disposition: string; hardStop: boolean; escalated: boolean;
    stepsExecuted: number; rulesEvaluated: number; rulesFired: number;
    topDiagnoses: Array<{ label?: string; probability?: number }>;
    redFlagsHit: string[]; confidence: number | null; durationMs: number;
  };
  error?: string;
}

interface QuestionMatch {
  ruleId: string; questionText: string; level: 1 | 2 | 3; safety_level: string;
  answeredBy: "narrative" | "unanswered";
  extractedAnswer: "yes" | "no" | "value" | null;
  extractedValue: string | null; confidence: number; deps: string[];
}
interface ClinicalEntities {
  duration: string | null; onset: string | null; severity: number | null;
  location: string | null; quality: string | null; radiation: string | null;
  aggravating: string[]; relieving: string[]; associated: string[];
  pertinentNegatives: string[]; timing: string | null; context: string | null;
  coComplaints: string[];
}
interface NarrativeExtraction {
  rawNarrative: string; detectedComplaint: string; complaintConfidence: number;
  suggestedComplaints: Array<{ id: string; label: string; confidence: number; system: string }>;
  entities: ClinicalEntities; questionMatches: QuestionMatch[];
  answeredCount: number; unansweredCount: number; prefilledPercent: number;
  pipelineInputs: Record<string, boolean | string | number>;
  remainingQuestions: QuestionMatch[];
  durationMs: number; passOneDurationMs: number; passTwoDurationMs: number;
}
interface NarrativeIntakeResponse { ok: boolean; extraction: NarrativeExtraction; error?: string; }
interface NarrativeRunResponse {
  ok: boolean; extraction: NarrativeExtraction;
  summary: {
    disposition: string; hardStop: boolean; stepsExecuted: number;
    rulesEvaluated: number; rulesFired: number;
    topDiagnoses: Array<{ label?: string; probability?: number }>;
    redFlagsHit: string[]; pipelineDurationMs: number;
  };
  error?: string;
}

type Scenario = "high_risk" | "moderate" | "low_risk";
type LevelKey = "l1" | "l2" | "l3";
type CenterTab = "natural" | "l1" | "l2" | "l3";

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("app_auth_token");
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
}

function dispositionBadge(d: string) {
  if (!d || d === "UNKNOWN") return <span className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold bg-slate-100 text-slate-500 border-slate-200">⚪ {d || "—"}</span>;
  const isER = d.includes("ER") || d.includes("EMERGENCY") || d.includes("911");
  const isUrgent = d.includes("URGENT") || d.includes("SAME_DAY");
  const isHome = d.includes("HOME") || d.includes("ROUTINE");
  const cls = isER ? "bg-red-100 text-red-800 border-red-300" : isUrgent ? "bg-amber-100 text-amber-800 border-amber-300" : isHome ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-700 border-slate-300";
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold ${cls}`}>{isER ? "🔴" : isUrgent ? "🟡" : isHome ? "🟢" : "⚪"} {d}</span>;
}

const LEVEL_INFO = [
  { key: "l1" as LevelKey, label: "L1 HPI",      desc: "History of Present Illness",    priorityRange: "priority ≤ 2"  },
  { key: "l2" as LevelKey, label: "L2 Secondary", desc: "Secondary symptom exploration", priorityRange: "priority 3–10" },
  { key: "l3" as LevelKey, label: "L3 Modifying", desc: "PMH / modifying factors",       priorityRange: "priority > 10" },
];
const SCENARIO_LABELS: Record<Scenario, string> = {
  high_risk: "🔴 High Risk (67M, HTN/DM/CAD)", moderate: "🟡 Moderate (48F, HTN)", low_risk: "🟢 Low Risk (26F, healthy)",
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

// ── Natural Intake Panel ──────────────────────────────────────────────────────

function NarrativeIntakePanel({
  complaintId,
  onExtracted,
  onRun,
}: {
  complaintId: string | null;
  onExtracted: (result: NarrativeExtraction) => void;
  onRun:       (result: NarrativeRunResponse) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);

  const PROMPTS = ["What's going on today?", "How can I help you?", "Tell me what brought you in.", "What's been bothering you?"];

  const extractMut = useMutation<NarrativeIntakeResponse, Error, { narrative: string; complaintId?: string }>({
    mutationFn: body => authedFetch("/api/complaint-test-lab/narrative-intake", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess:  d => {
      if (d.ok) onExtracted(d.extraction);
      else toast({ title: "Extraction failed", description: d.error, variant: "destructive" });
    },
    onError: e => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runMut = useMutation<NarrativeRunResponse, Error, { narrative: string; complaintId?: string }>({
    mutationFn: body => authedFetch("/api/complaint-test-lab/narrative-run", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess:  d => {
      if (d.ok) { onExtracted(d.extraction); onRun(d); }
      else toast({ title: "Run failed", description: d.error, variant: "destructive" });
    },
    onError: e => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const loading = extractMut.isPending || runMut.isPending;
  const result  = extractMut.data?.extraction ?? runMut.data?.extraction;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Prompt selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PROMPTS.map((p, i) => (
          <button
            key={i}
            onClick={() => setPromptIdx(i)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${promptIdx === i ? "bg-violet-600 text-white border-violet-600" : "text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-600"}`}
          >
            "{p}"
          </button>
        ))}
      </div>

      {/* Open-ended input */}
      <div className="relative">
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <MessageSquare size={14} className="text-violet-400" />
          <span className="text-xs font-medium text-violet-500">{PROMPTS[promptIdx]}</span>
        </div>
        <Textarea
          data-testid="input-narrative"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Patient speaks freely here… e.g. 'I've had this crushing chest pressure since this morning, it goes down my left arm and I'm sweating a lot. I've had heart problems before.'"
          className="min-h-[110px] pt-8 text-sm resize-none border-violet-200 focus:border-violet-400 focus:ring-violet-200"
        />
        <div className="absolute bottom-2 right-2 text-[10px] text-slate-300">{text.length} chars</div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          data-testid="button-extract-narrative"
          size="sm" variant="outline"
          className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
          onClick={() => extractMut.mutate({ narrative: text, complaintId: complaintId ?? undefined })}
          disabled={!text.trim() || loading}
        >
          {extractMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Extract Entities
        </Button>
        <Button
          data-testid="button-narrative-run"
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700"
          onClick={() => runMut.mutate({ narrative: text, complaintId: complaintId ?? undefined })}
          disabled={!text.trim() || loading}
        >
          {runMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
          Extract + Run Pipeline
        </Button>
        {text && <Button size="sm" variant="ghost" className="text-xs text-slate-400" onClick={() => setText("")}>Clear</Button>}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-lg px-4 py-3">
          <RefreshCw size={16} className="animate-spin text-violet-500" />
          <div>
            <p className="text-sm font-medium text-violet-700">Analyzing narrative…</p>
            <p className="text-[11px] text-violet-500">Pass 1: detecting complaint + extracting entities · Pass 2: matching questions</p>
          </div>
        </div>
      )}

      {/* Extraction results */}
      {result && !loading && (
        <div className="space-y-3">
          {/* Detected complaint */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Brain size={14} className={SYSTEM_COLORS[result.suggestedComplaints[0]?.system ?? ""] ?? "text-slate-600"} />
              <span className="text-sm font-bold text-slate-800">{result.detectedComplaint.replace(/_/g, " ")}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${result.complaintConfidence >= 0.8 ? "bg-emerald-100 text-emerald-700" : result.complaintConfidence >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                {Math.round(result.complaintConfidence * 100)}% confidence
              </span>
              <span className="ml-auto text-[10px] text-slate-400">{result.durationMs}ms total · P1:{result.passOneDurationMs}ms · P2:{result.passTwoDurationMs}ms</span>
            </div>

            {/* Alternative complaints */}
            {result.suggestedComplaints.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400">Also possible:</span>
                {result.suggestedComplaints.slice(1, 4).map(s => (
                  <span key={s.id} className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
                    {s.id.replace(/_/g, " ")} ({Math.round(s.confidence * 100)}%)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pre-fill stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center">
              <p className="text-xl font-black text-emerald-700">{result.answeredCount}</p>
              <p className="text-[9px] text-emerald-600">Questions pre-filled</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
              <p className="text-xl font-black text-amber-700">{result.unansweredCount}</p>
              <p className="text-[9px] text-amber-600">Still need to ask</p>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 text-center">
              <p className="text-xl font-black text-violet-700">{result.prefilledPercent}%</p>
              <p className="text-[9px] text-violet-600">Coverage</p>
            </div>
          </div>

          {/* Clinical entities */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Extracted Clinical Entities</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                { icon: Clock, label: "Duration",  val: result.entities.duration },
                { icon: TrendingUp, label: "Onset",     val: result.entities.onset },
                { icon: Thermometer, label: "Severity",  val: result.entities.severity ? `${result.entities.severity}/10` : null },
                { icon: MapPin, label: "Location",  val: result.entities.location },
                { icon: Activity, label: "Quality",   val: result.entities.quality },
                { icon: Activity, label: "Radiation", val: result.entities.radiation },
                { icon: TrendingUp, label: "Timing",    val: result.entities.timing },
                { icon: Activity, label: "Context",   val: result.entities.context },
              ].filter(e => e.val).map(e => (
                <div key={e.label} className="flex items-start gap-1.5">
                  <e.icon size={10} className="text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-slate-500 shrink-0">{e.label}:</span>
                  <span className="text-slate-800 font-medium truncate">{e.val}</span>
                </div>
              ))}
            </div>

            {/* Tags: associated, relieving, aggravating */}
            {result.entities.associated.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[10px] text-slate-400 mr-1">Associated:</span>
                {result.entities.associated.map(s => (
                  <span key={s} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">{s}</span>
                ))}
              </div>
            )}
            {result.entities.pertinentNegatives.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-[10px] text-slate-400 mr-1">Denied:</span>
                {result.entities.pertinentNegatives.map(s => (
                  <span key={s} className="text-[10px] bg-slate-50 text-slate-500 border border-slate-100 rounded-full px-2 py-0.5 line-through">{s}</span>
                ))}
              </div>
            )}
            {result.entities.aggravating.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <TrendingUp size={9} className="text-red-400 mt-0.5" />
                {result.entities.aggravating.map(s => (
                  <span key={s} className="text-[10px] bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">↑ {s}</span>
                ))}
              </div>
            )}
            {result.entities.relieving.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <TrendingDown size={9} className="text-emerald-400 mt-0.5" />
                {result.entities.relieving.map(s => (
                  <span key={s} className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5">↓ {s}</span>
                ))}
              </div>
            )}
          </div>

          {/* Remaining questions to ask */}
          {result.remainingQuestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2">
                {result.remainingQuestions.length} questions still needed — see L1/L2/L3 tabs
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.remainingQuestions.slice(0, 8).map(q => (
                  <div key={q.ruleId} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                    <span className="text-amber-800 leading-snug">{q.questionText}</span>
                  </div>
                ))}
                {result.remainingQuestions.length > 8 && (
                  <p className="text-[10px] text-amber-500">+{result.remainingQuestions.length - 8} more in L1/L2/L3 tabs</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="py-6 text-center text-slate-400">
          <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Let the patient speak first</p>
          <p className="text-[11px] mt-1 text-slate-300 max-w-xs mx-auto">
            Type or paste what the patient says naturally. The AI extracts clinical entities and pre-fills up to 80% of structured questions — then you only ask what's still missing.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Add Question Form ─────────────────────────────────────────────────────────

function AddQuestionForm({ complaintId, levelKey, onAdd, onCancel }: {
  complaintId: string; levelKey: LevelKey;
  onAdd: (fields: { rule_name: string; logic_description: string; question_dependencies: string; safety_level: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [deps, setDeps] = useState("");
  const [safe, setSafe] = useState("STANDARD");

  return (
    <div className="border-2 border-dashed border-violet-300 rounded-lg p-3 bg-violet-50/50 space-y-2">
      <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">New {LEVEL_INFO.find(l => l.key === levelKey)?.label} Question</p>
      <Input data-testid="input-new-question-name" placeholder="Short name" value={name} onChange={e => setName(e.target.value)} className="text-sm h-8" autoFocus />
      <Textarea data-testid="input-new-question-text" placeholder="Full question text shown to patient…" value={text} onChange={e => setText(e.target.value)} className="text-sm min-h-[56px] resize-none" />
      <div className="flex gap-2 items-center">
        <Input data-testid="input-new-question-deps" placeholder="Dependency field keys (space-separated)" value={deps} onChange={e => setDeps(e.target.value)} className="text-xs font-mono h-7 flex-1" />
        <Select value={safe} onValueChange={setSafe}>
          <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-new-question-safety"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="STANDARD">STANDARD</SelectItem>
            <SelectItem value="HIGH">HIGH</SelectItem>
            <SelectItem value="CRITICAL">CRITICAL</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button data-testid="button-add-question-confirm" size="sm" className="h-7 px-3 gap-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onAdd({ rule_name: name.trim() || text.trim(), logic_description: text.trim() || name.trim(), question_dependencies: deps.trim(), safety_level: safe })} disabled={!name.trim() && !text.trim()}>
          <Plus size={12} /> Add
        </Button>
        <Button data-testid="button-add-question-cancel" size="sm" variant="ghost" className="h-7 px-3" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Question Row ──────────────────────────────────────────────────────────────

function QuestionRow({ q, answer, narrativeMatch, isFirst, isLast, onSave, onDelete, onMove }: {
  q: QuestionRule; answer?: SimulatedAnswer;
  narrativeMatch?: QuestionMatch;
  isFirst: boolean; isLast: boolean;
  onSave: (ruleId: string, patch: Partial<QuestionRule>) => void;
  onDelete: (ruleId: string) => void;
  onMove: (ruleId: string, dir: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText]       = useState(q.logic_description ?? q.rule_name ?? "");
  const [name, setName]       = useState(q.rule_name ?? "");
  const [deps, setDeps]       = useState(Array.isArray(q.question_dependencies) ? (q.question_dependencies as string[]).join(" ") : (q.question_dependencies ?? ""));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const answeredByNarrative = narrativeMatch?.answeredBy === "narrative";
  const safeClass  = SAFETY_COLOR[q.safety_level] ?? SAFETY_COLOR.STANDARD;
  const displayText = q.logic_description ?? q.rule_name;

  return (
    <div
      data-testid={`question-row-${q.rule_id}`}
      className={`group border rounded-lg p-3 transition-all ${
        answeredByNarrative
          ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300"
          : "border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm"
      }`}
    >
      {/* Narrative pre-fill banner */}
      {answeredByNarrative && narrativeMatch && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px]">
          <CheckCircle2 size={11} className="text-emerald-500" />
          <span className="font-semibold text-emerald-700">Answered by narrative</span>
          <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${narrativeMatch.extractedAnswer === "yes" ? "bg-emerald-100 text-emerald-700" : narrativeMatch.extractedAnswer === "no" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>
            {narrativeMatch.extractedAnswer}
          </span>
          {narrativeMatch.extractedValue && (
            <span className="italic text-emerald-600 truncate max-w-[200px]">"{narrativeMatch.extractedValue}"</span>
          )}
          <span className="ml-auto text-slate-400">{Math.round(narrativeMatch.confidence * 100)}% conf</span>
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
          <GripVertical size={12} className="text-slate-300 group-hover:text-slate-400" />
          <span className="text-[9px] text-slate-300 font-mono">{q.priority}</span>
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input data-testid={`input-question-name-${q.rule_id}`} value={name} onChange={e => setName(e.target.value)} className="text-xs font-medium h-7" placeholder="Short name…" />
              <Textarea data-testid={`input-question-text-${q.rule_id}`} value={text} onChange={e => setText(e.target.value)} className="text-sm min-h-[60px] resize-none" />
              <div className="flex items-center gap-2">
                <Input data-testid={`input-deps-${q.rule_id}`} value={deps} onChange={e => setDeps(e.target.value)} className="text-xs font-mono h-7 flex-1" placeholder="Dependency keys (space-separated)" />
                <Button data-testid={`button-save-question-${q.rule_id}`} size="sm" className="h-7 px-2 bg-violet-600 hover:bg-violet-700" onClick={() => { onSave(q.rule_id, { rule_name: name, logic_description: text, question_dependencies: deps }); setEditing(false); }}>
                  <Check size={12} />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}><X size={12} /></Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-500 mb-0.5 truncate">{q.rule_name}</p>
              <p className={`text-sm leading-snug ${answeredByNarrative ? "text-emerald-800" : "text-slate-800"}`}>
                {displayText && displayText !== q.rule_name ? displayText : q.rule_name}
              </p>
              {q.question_dependencies && (
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                  deps: {Array.isArray(q.question_dependencies) ? (q.question_dependencies as string[]).join(", ") : q.question_dependencies}
                </p>
              )}
              {answer && !answeredByNarrative && (
                <div className={`mt-1.5 flex items-start gap-1.5 rounded px-2 py-1 ${answer.populateDeps ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                  <span className={`text-[10px] font-bold uppercase shrink-0 mt-0.5 ${answer.populateDeps ? "text-emerald-600" : "text-slate-400"}`}>{answer.answer}</span>
                  <span className="text-[11px] text-slate-600 italic line-clamp-2">"{answer.response}"</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${safeClass}`}>{q.safety_level}</span>
          <button data-testid={`button-move-up-${q.rule_id}`} onClick={() => onMove(q.rule_id, "up")} disabled={isFirst} className="p-1 rounded hover:bg-slate-100 disabled:opacity-20">
            <ArrowUp size={11} className="text-slate-400" />
          </button>
          <button data-testid={`button-move-down-${q.rule_id}`} onClick={() => onMove(q.rule_id, "down")} disabled={isLast} className="p-1 rounded hover:bg-slate-100 disabled:opacity-20">
            <ArrowDown size={11} className="text-slate-400" />
          </button>
          {!editing && (
            <button data-testid={`button-edit-question-${q.rule_id}`} onClick={() => setEditing(true)} className="p-1 rounded hover:bg-slate-100">
              <Pencil size={11} className="text-slate-400" />
            </button>
          )}
          {!editing && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button data-testid={`button-confirm-delete-${q.rule_id}`} onClick={() => { onDelete(q.rule_id); setConfirmDelete(false); }} className="p-1 rounded bg-red-100 hover:bg-red-200"><Check size={11} className="text-red-600" /></button>
                <button onClick={() => setConfirmDelete(false)} className="p-1 rounded hover:bg-slate-100"><X size={11} className="text-slate-400" /></button>
              </div>
            ) : (
              <button data-testid={`button-delete-question-${q.rule_id}`} onClick={() => setConfirmDelete(true)} className="p-1 rounded hover:bg-red-50">
                <Trash2 size={11} className="text-slate-300 hover:text-red-400" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ComplaintTestLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [openSystems,       setOpenSystems]       = useState<Set<string>>(new Set(["cardiovascular"]));
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [selectedSystem,    setSelectedSystem]    = useState<string | null>(null);
  const [scenario,          setScenario]          = useState<Scenario>("high_risk");
  const [activeTab,         setActiveTab]         = useState<CenterTab>("natural");
  const [addingLevel,       setAddingLevel]       = useState<LevelKey | null>(null);
  const [searchFilter,      setSearchFilter]      = useState("");

  // Narrative state
  const [narrativeResult,   setNarrativeResult]   = useState<NarrativeExtraction | null>(null);
  const [narrativeRunResult,setNarrativeRunResult]= useState<NarrativeRunResponse | null>(null);

  // Build a lookup: ruleId → QuestionMatch (from narrative extraction)
  const narrativeMatchMap: Record<string, QuestionMatch> = {};
  for (const m of narrativeResult?.questionMatches ?? []) {
    narrativeMatchMap[m.ruleId] = m;
  }

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

  const addQuestionMut = useMutation<{ ok: boolean }, Error, { complaint_id: string; rule_name: string; logic_description: string; question_dependencies: string; safety_level: string; level: 1|2|3 }>({
    mutationFn: body => authedFetch("/api/complaint-test-lab/question", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] }); qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/systems"] }); setAddingLevel(null); toast({ title: "Question added" }); },
    onError:    e => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const updateQuestionMut = useMutation<{ ok: boolean }, Error, { ruleId: string; patch: Partial<QuestionRule> }>({
    mutationFn: ({ ruleId, patch }) => authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "PATCH", body: JSON.stringify(patch) }).then(r => r.json()),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] }); toast({ title: "Saved" }); },
    onError:    e => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteQuestionMut = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: ruleId => authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] }); qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/systems"] }); toast({ title: "Question removed" }); },
    onError:    e => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const moveMut = useMutation<{ ok: boolean }, Error, { ruleId: string; priority: number }>({
    mutationFn: ({ ruleId, priority }) => authedFetch(`/api/complaint-test-lab/question/${ruleId}`, { method: "PATCH", body: JSON.stringify({ priority }) }).then(r => r.json()),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["/api/complaint-test-lab/questions", selectedComplaint] }),
    onError:    e => toast({ title: "Reorder failed", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSystem = useCallback((key: string) => {
    setOpenSystems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  function selectComplaint(id: string, sysKey: string) {
    setSelectedComplaint(id);
    setSelectedSystem(sysKey);
    setAddingLevel(null);
    setNarrativeResult(null);
    setNarrativeRunResult(null);
    simulateMut.reset();
  }

  function handleMove(ruleId: string, dir: "up" | "down", list: QuestionRule[]) {
    const idx = list.findIndex(q => q.rule_id === ruleId);
    if (idx < 0) return;
    const target = dir === "up" ? list[idx - 1] : list[idx + 1];
    if (!target) return;
    moveMut.mutate({ ruleId, priority: target.priority });
    moveMut.mutate({ ruleId: target.rule_id, priority: list[idx].priority });
  }

  // Results to show in right panel (narrative run OR simulation)
  const activeSummary = narrativeRunResult?.summary ?? (simulateMut.data?.summary as any);
  const isNarrativeRun = !!narrativeRunResult;

  const levels   = questionsQ.data?.levels;
  const answerMap: Record<string, SimulatedAnswer> = {};
  for (const a of simulateMut.data?.answers ?? []) answerMap[a.ruleId] = a;

  const filteredSystems = systemsQ.data?.systems.map(sys => ({
    ...sys,
    complaints: searchFilter ? sys.complaints.filter(c => c.id.toLowerCase().includes(searchFilter.toLowerCase())) : sys.complaints,
  })).filter(sys => sys.complaints.length > 0 || !searchFilter);

  // Count how many questions in each level are answered by narrative
  const narrativeAnsweredInLevel = (lk: LevelKey) => {
    const qs = levels?.[lk] ?? [];
    return qs.filter(q => narrativeMatchMap[q.rule_id]?.answeredBy === "narrative").length;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <FlaskConical size={18} className="text-violet-600" />
        <div>
          <h1 className="text-base font-bold text-slate-900">Complaint Testing Lab</h1>
          <p className="text-[11px] text-slate-500">1,025 complaints · Natural intake + 3 question levels · MedDialog simulation</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={scenario} onValueChange={v => setScenario(v as Scenario)}>
            <SelectTrigger data-testid="select-scenario" className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
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
            Run Simulation
          </Button>
          <Button
            data-testid="button-run-system" size="sm" variant="outline" className="h-8 gap-1.5"
            onClick={() => selectedSystem && authedFetch("/api/complaint-test-lab/run-system", { method: "POST", body: JSON.stringify({ systemKey: selectedSystem, scenario }) }).then(r => r.json()).then(d => toast({ title: `System: ${d.total} complaints`, description: `🔴 ER: ${d.erNow}  🟢 Home: ${d.homeCare}  ❌ Err: ${d.errors}` }))}
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
              <input data-testid="input-search-complaints" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Filter complaints…"
                className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-300" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {systemsQ.isLoading && <div className="p-4 text-xs text-slate-400">Loading systems…</div>}
            {filteredSystems?.map(sys => (
              <div key={sys.key}>
                <button data-testid={`button-system-${sys.key}`} onClick={() => toggleSystem(sys.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${selectedSystem === sys.key ? "bg-violet-50" : ""}`}>
                  {openSystems.has(sys.key) ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                  <span className={`text-xs font-semibold truncate ${SYSTEM_COLORS[sys.key] ?? "text-slate-700"}`}>{sys.label}</span>
                  <span className="ml-auto text-[10px] text-slate-400 shrink-0">{sys.complaintCount}</span>
                </button>
                {(openSystems.has(sys.key) || searchFilter) && sys.complaints.map(c => (
                  <button key={c.id} data-testid={`button-complaint-${c.id}`} onClick={() => selectComplaint(c.id, sys.key)}
                    className={`w-full text-left pl-8 pr-3 py-1.5 hover:bg-slate-50 transition-colors border-l-2 ${selectedComplaint === c.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-transparent text-slate-600"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono truncate flex-1">{c.id}</span>
                      <span className="text-[9px] text-slate-400 shrink-0">{c.questionCount > 0 ? `${c.questionCount}q` : <span className="text-slate-300">—</span>}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: Intake + Question Editor ── */}
        <div className="flex-[2] flex flex-col overflow-hidden border-r border-slate-200">
          {!selectedComplaint ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <MessageSquare size={36} className="opacity-30" />
              <p className="text-sm">Select a complaint to begin natural intake or question editing</p>
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
                {narrativeResult && (
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                    {narrativeResult.prefilledPercent}% pre-filled
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] ml-0.5 capitalize">{questionsQ.data?.system ?? ""}</Badge>
              </div>

              {/* Tabs: Natural + L1 + L2 + L3 */}
              <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as CenterTab); setAddingLevel(null); }} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="shrink-0 mx-4 mt-3 grid grid-cols-4 h-8">
                  <TabsTrigger value="natural" data-testid="tab-natural" className="text-xs gap-1 col-span-1">
                    <Sparkles size={10} />
                    Natural
                  </TabsTrigger>
                  {LEVEL_INFO.map(li => {
                    const count   = (levels?.[li.key] ?? []).length;
                    const prefill = narrativeResult ? narrativeAnsweredInLevel(li.key) : 0;
                    return (
                      <TabsTrigger key={li.key} value={li.key} data-testid={`tab-${li.key}`} className="text-xs gap-1">
                        {li.label}
                        <span className={`text-[9px] px-1 rounded-full ${prefill > 0 ? "bg-emerald-100 text-emerald-700" : count > 0 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                          {prefill > 0 ? `${count - prefill}▲` : count}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {/* Natural Intake tab */}
                <TabsContent value="natural" className="flex-1 overflow-hidden flex flex-col mt-2">
                  <NarrativeIntakePanel
                    complaintId={selectedComplaint}
                    onExtracted={result => {
                      setNarrativeResult(result);
                      // If narrative detected a different complaint, optionally switch
                    }}
                    onRun={result => {
                      setNarrativeRunResult(result);
                    }}
                  />
                </TabsContent>

                {/* L1 / L2 / L3 tabs */}
                {LEVEL_INFO.map((li) => {
                  const qs = levels?.[li.key] ?? [];
                  const prefillCount = narrativeResult ? narrativeAnsweredInLevel(li.key) : 0;
                  return (
                    <TabsContent key={li.key} value={li.key} className="flex-1 overflow-y-auto px-4 pb-4 mt-2">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-slate-600">{li.desc}</p>
                          <p className="text-[10px] text-slate-400">
                            {li.priorityRange} · {qs.length} question{qs.length !== 1 ? "s" : ""}
                            {prefillCount > 0 && <span className="ml-2 text-emerald-600 font-medium">· {prefillCount} pre-filled by narrative</span>}
                          </p>
                        </div>
                        <Button data-testid={`button-add-question-${li.key}`} size="sm" variant="outline"
                          className="h-7 px-2 gap-1 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                          onClick={() => setAddingLevel(addingLevel === li.key ? null : li.key)}>
                          <Plus size={11} /> Add
                        </Button>
                      </div>

                      {addingLevel === li.key && (
                        <div className="mb-3">
                          <AddQuestionForm complaintId={selectedComplaint} levelKey={li.key}
                            onAdd={fields => addQuestionMut.mutate({ complaint_id: selectedComplaint, level: (li.key === "l1" ? 1 : li.key === "l2" ? 2 : 3) as 1|2|3, ...fields })}
                            onCancel={() => setAddingLevel(null)} />
                        </div>
                      )}

                      {questionsQ.isLoading ? (
                        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
                      ) : qs.length === 0 ? (
                        <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                          <ClipboardList size={24} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-sm text-slate-400 font-medium">No {li.label} questions yet</p>
                          <p className="text-[11px] text-slate-300 mt-1 mb-3">{li.desc}</p>
                          <Button data-testid={`button-add-first-question-${li.key}`} size="sm" variant="outline"
                            className="gap-1 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                            onClick={() => setAddingLevel(li.key)}>
                            <Plus size={11} /> Add First Question
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {qs.map((q, idx) => (
                            <QuestionRow key={q.rule_id} q={q}
                              answer={answerMap[q.rule_id]}
                              narrativeMatch={narrativeMatchMap[q.rule_id]}
                              isFirst={idx === 0} isLast={idx === qs.length - 1}
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

        {/* ── RIGHT: Results Panel ── */}
        <div className="w-72 flex flex-col overflow-hidden bg-white shrink-0">
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Test Results</span>
            {isNarrativeRun && <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-200">Narrative Run</Badge>}
            {activeSummary && <span className="ml-auto text-[10px] text-slate-400">{activeSummary.pipelineDurationMs ?? activeSummary.durationMs}ms</span>}
          </div>

          {!activeSummary && !simulateMut.isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2 px-4 text-center">
              <Activity size={28} className="opacity-40" />
              <p className="text-xs text-slate-400">
                Use the <strong className="text-slate-500">Natural</strong> tab to describe symptoms and run the pipeline from free text, or <strong className="text-slate-500">Run Simulation</strong> for structured testing.
              </p>
            </div>
          ) : simulateMut.isPending ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw size={20} className="animate-spin" />
              <p className="text-xs">Running pipeline…</p>
            </div>
          ) : activeSummary && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Disposition</p>
                {dispositionBadge(activeSummary.disposition)}
                {activeSummary.hardStop && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={9} /> HARD STOP
                  </span>
                )}
              </div>

              {/* Narrative extraction summary if available */}
              {narrativeResult && isNarrativeRun && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 space-y-1">
                  <p className="text-[10px] font-semibold text-violet-700">Narrative Intake</p>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className="text-slate-500">Pre-filled:</span>
                    <span className="font-bold text-emerald-700">{narrativeResult.answeredCount} questions ({narrativeResult.prefilledPercent}%)</span>
                    <span className="text-slate-500">Still asked:</span>
                    <span className="font-bold text-amber-700">{narrativeResult.unansweredCount} questions</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Steps Run",     val: activeSummary.stepsExecuted },
                  { label: "Rules Fired",   val: activeSummary.rulesFired },
                  { label: "Rules Checked", val: activeSummary.rulesEvaluated },
                  { label: "Confidence",    val: (activeSummary as any).confidence != null ? `${((activeSummary as any).confidence * 100).toFixed(0)}%` : "—" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                    <p className="text-base font-black text-slate-800">{s.val}</p>
                    <p className="text-[9px] text-slate-500 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Simulated patient responses */}
              {!isNarrativeRun && simulateMut.data?.answers && simulateMut.data.answers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Patient Responses <span className="font-normal text-slate-400">{simulateMut.data.answers.filter(a => a.populateDeps).length}/{simulateMut.data.answers.length} yes</span>
                  </p>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {simulateMut.data.answers.slice(0, 12).map(a => (
                      <div key={a.ruleId} className={`flex gap-1.5 items-start text-[10px] px-2 py-1 rounded ${a.populateDeps ? "bg-emerald-50" : "bg-slate-50"}`}>
                        <span className={`font-bold uppercase shrink-0 w-5 ${a.populateDeps ? "text-emerald-600" : "text-slate-400"}`}>{a.answer}</span>
                        <span className="text-slate-600 line-clamp-1 flex-1">{a.questionText}</span>
                      </div>
                    ))}
                    {simulateMut.data.answers.length > 12 && <p className="text-[10px] text-slate-400 text-center">+{simulateMut.data.answers.length - 12} more</p>}
                  </div>
                </div>
              )}

              {/* Red flags */}
              {activeSummary.redFlagsHit?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">Red Flags</p>
                  <div className="space-y-1">
                    {activeSummary.redFlagsHit.map((rf: string) => (
                      <div key={rf} className="flex items-center gap-1.5 text-[10px] bg-red-50 border border-red-100 rounded px-2 py-1">
                        <AlertTriangle size={9} className="text-red-500 shrink-0" />
                        <span className="text-red-700 font-mono">{rf}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top diagnoses */}
              {activeSummary.topDiagnoses?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Top Diagnoses</p>
                  <div className="space-y-1">
                    {activeSummary.topDiagnoses.map((dx: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] bg-slate-50 rounded px-2 py-1">
                        <span className="text-slate-400 font-mono w-3">{i + 1}</span>
                        <span className="flex-1 text-slate-700 truncate">{dx.label}</span>
                        {dx.probability != null && <span className="text-slate-400 shrink-0">{(dx.probability * 100).toFixed(0)}%</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSummary.rulesFired === 0 && !simulateMut.data?.error && (
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
