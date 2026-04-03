import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle, ChevronRight, Loader2, RefreshCw,
  Stethoscope, Shield, Clock, Activity, Search, ExternalLink,
} from "lucide-react";
import { COMPLAINTS } from "@shared/complaints";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: number;
  question_id: string;
  prompt: string;
  type: string;
  required: boolean;
  priority: number;
  category: string | null;
  ask_if: string | null;
  options?: string[];
  active: boolean;
}

interface TriageResult {
  ok: boolean;
  disposition?: string;
  disposition_level?: string;
  disposition_confidence?: string;
  top_diagnoses?: Array<{ label: string; probability: number }>;
  red_flags?: string[];
  recommendation?: string;
  next_steps?: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { value: "less than 1 hour", label: "<1 hr" },
  { value: "1 to 6 hours", label: "1–6 h" },
  { value: "6 to 24 hours", label: "6–24 h" },
  { value: "1 to 3 days", label: "1–3 d" },
  { value: "3 to 7 days", label: "3–7 d" },
  { value: "more than 1 week", label: ">1 wk" },
  { value: "chronic or recurring", label: "Chronic" },
];

const AGE_OPTIONS = [
  { value: "infant (under 1 year)", label: "Infant" },
  { value: "toddler (1-3)", label: "1–3" },
  { value: "child (4-12)", label: "4–12" },
  { value: "teenager (13-17)", label: "Teen" },
  { value: "young adult (18-35)", label: "18–35" },
  { value: "adult (36-60)", label: "36–60" },
  { value: "older adult (60+)", label: "60+" },
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const DISP_CONFIG: Record<string, { bg: string; text: string; label: string; border: string }> = {
  HOME_CARE:              { bg: "bg-green-50",  text: "text-green-800",  border: "border-green-300", label: "Home Care" },
  VIDEO_VISIT:            { bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-300",  label: "Video Visit" },
  OFFICE_24H:             { bg: "bg-cyan-50",   text: "text-cyan-800",   border: "border-cyan-300",  label: "Office in 24 h" },
  URGENT_SAME_DAY:        { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-300",label: "Same-Day Urgent" },
  ER_NOW:                 { bg: "bg-red-50",    text: "text-red-800",    border: "border-red-400",   label: "Go to ER Now" },
  NEEDS_PHYSICIAN_REVIEW: { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-300",label: "Physician Review" },
  NEEDS_WORKUP:           { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-300",label: "Needs Workup" },
  BLOCK:                  { bg: "bg-gray-100",  text: "text-gray-700",   border: "border-gray-300",  label: "Refer / Block" },
};

function formatComplaintLabel(id: string) {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleCard({
  label, value, onChange, danger = false, required = false, testId,
}: { label: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean; required?: boolean; testId: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      data-testid={testId}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm flex items-center justify-between gap-3 ${
        value
          ? danger
            ? "bg-red-50 border-red-400 text-red-800"
            : "bg-emerald-50 border-emerald-400 text-emerald-800"
          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      <span className="font-medium leading-snug">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${
        value
          ? danger ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
          : "bg-slate-100 text-slate-400"
      }`}>
        {value ? "YES" : "NO"}
      </span>
    </button>
  );
}

function RadioRow({
  options, value, onChange, testId,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            value === opt.value
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CheckboxCloud({
  options, selected, onToggle, testId,
}: { options: string[]; selected: string[]; onToggle: (o: string) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map(opt => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1 rounded-full text-xs border transition-all ${
              on
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompactIntakePage() {
  const { toast } = useToast();
  const [complaintId, setComplaintId] = useState("");
  const [search, setSearch] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [duration, setDuration] = useState("");
  const [severity, setSeverity] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);

  const filteredComplaints = COMPLAINTS.filter(c =>
    !search || formatComplaintLabel(c).toLowerCase().includes(search.toLowerCase())
  ).slice(0, 60);

  const { data: protocol, isLoading: protocolLoading } = useQuery({
    queryKey: ["/api/kb-explorer/complaints", complaintId],
    queryFn: () => fetch(`/api/kb-explorer/complaints/${encodeURIComponent(complaintId)}`).then(r => r.json()),
    enabled: !!complaintId,
  });

  const questions: Question[] = (protocol?.questions ?? []).filter((q: Question) => q.active);
  const safetyQs = questions.filter(q => q.category === "safety").sort((a, b) => a.priority - b.priority);
  const historyQs = questions.filter(q => q.category === "history" || q.category === "centor" || q.category === "wells" || q.category === "criteria").sort((a, b) => a.priority - b.priority);
  const symptomQs = questions.filter(q => !["safety", "history", "centor", "wells", "criteria"].includes(q.category ?? "")).sort((a, b) => a.priority - b.priority);

  const setAnswer = useCallback((key: string, val: unknown) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleMulti = useCallback((key: string, opt: string) => {
    setAnswers(prev => {
      const cur = (prev[key] as string[]) ?? [];
      return { ...prev, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] };
    });
  }, []);

  function buildSummary(): string {
    const label = formatComplaintLabel(complaintId);
    const parts: string[] = [`Patient presents with ${label}.`];
    if (age) parts.push(`Age: ${age}.`);
    if (sex) parts.push(`Sex: ${sex}.`);
    if (duration) parts.push(`Duration: ${duration}.`);
    parts.push(`Pain/severity: ${severity}/10.`);

    const safetyYes = safetyQs.filter(q => answers[q.question_id] === true).map(q => q.prompt);
    if (safetyYes.length) parts.push(`Safety concerns: ${safetyYes.join("; ")}.`);

    for (const q of [...historyQs, ...symptomQs]) {
      const v = answers[q.question_id];
      if (v === undefined || v === null || v === false || (Array.isArray(v) && !v.length)) continue;
      if (v === true) parts.push(`${q.prompt}: yes.`);
      else if (Array.isArray(v)) parts.push(`${q.prompt}: ${v.join(", ")}.`);
      else parts.push(`${q.prompt}: ${v}.`);
    }
    return parts.join(" ");
  }

  async function handleSubmit() {
    if (!complaintId) { toast({ title: "Select a complaint first", variant: "destructive" }); return; }
    const missingRequired = safetyQs.filter(q => q.required && answers[q.question_id] === undefined);
    if (missingRequired.length) {
      toast({ title: `Answer ${missingRequired.length} required safety question${missingRequired.length > 1 ? "s" : ""}`, variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const summary = buildSummary();
      const res = await apiRequest("POST", "/api/clinical/triage", { rawText: summary, complaint: complaintId });
      const data = await res.json();
      setResult(data);
    } catch {
      toast({ title: "Triage failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setComplaintId("");
    setSearch("");
    setAnswers({});
    setAge("");
    setSex("");
    setDuration("");
    setSeverity(5);
    setResult(null);
  }

  const dispConfig = result?.disposition_level
    ? DISP_CONFIG[result.disposition_level] ?? DISP_CONFIG[result.disposition ?? ""] ?? null
    : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-violet-600" />
            <span className="font-bold text-slate-800 dark:text-white">Auralyn Intake</span>
            <Badge variant="outline" className="text-[10px] px-1.5">Compact</Badge>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <button onClick={reset} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-700 transition-colors" data-testid="btn-reset">
                <RefreshCw className="h-3.5 w-3.5" /> Start over
              </button>
            )}
            <a href="/autonomous-intake" className="text-xs text-violet-600 flex items-center gap-1 hover:underline" data-testid="link-chat-mode">
              Chat mode <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* ── Complaint selector ───────────────────────────────────────────── */}
        {!complaintId ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">What's the main concern today?</h2>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search symptoms…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                data-testid="input-complaint-search"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredComplaints.map(c => (
                <button
                  key={c}
                  onClick={() => { setComplaintId(c); setSearch(""); }}
                  data-testid={`complaint-select-${c}`}
                  className="text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-violet-300 hover:bg-violet-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all dark:border-slate-700 dark:hover:bg-violet-950/30 flex items-center justify-between gap-1 group"
                >
                  <span>{formatComplaintLabel(c)}</span>
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-violet-400 shrink-0" />
                </button>
              ))}
            </div>
            {filteredComplaints.length === 0 && (
              <p className="text-center text-slate-400 text-xs py-6">No match — try a different term</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Complaint header ───────────────────────────────────────── */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Chief Complaint</p>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{formatComplaintLabel(complaintId)}</p>
              </div>
              <button onClick={() => { setComplaintId(""); setAnswers({}); setResult(null); }}
                className="text-xs text-slate-400 hover:text-slate-600 underline" data-testid="btn-change-complaint">
                Change
              </button>
            </div>

            {/* ── Demographics row ───────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">About the Patient</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Age group</p>
                  <RadioRow options={AGE_OPTIONS} value={age} onChange={setAge} testId="radio-age" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Sex</p>
                  <RadioRow options={SEX_OPTIONS} value={sex} onChange={setSex} testId="radio-sex" />
                </div>
              </div>
            </div>

            {/* ── Symptom duration ───────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">How long has this been going on?</h3>
              <RadioRow options={DURATION_OPTIONS} value={duration} onChange={setDuration} testId="radio-duration" />
            </div>

            {/* ── Severity slider ────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Severity / Discomfort</h3>
                <span className={`text-2xl font-black tabular-nums ${severity >= 8 ? "text-red-600" : severity >= 5 ? "text-yellow-500" : "text-green-500"}`}>
                  {severity}<span className="text-sm text-slate-300 font-normal">/10</span>
                </span>
              </div>
              <Slider
                min={1} max={10} step={1}
                value={[severity]}
                onValueChange={([v]) => setSeverity(v)}
                className="mt-1"
                data-testid="slider-severity"
              />
              <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                <span>Mild</span>
                <span>Moderate</span>
                <span>Severe</span>
              </div>
            </div>

            {/* ── Safety questions (RED) ─────────────────────────────────── */}
            {protocolLoading && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border p-6 flex items-center gap-3 text-slate-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading clinical questions…
              </div>
            )}

            {!protocolLoading && safetyQs.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-red-300 dark:border-red-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-red-600" />
                  <h3 className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Safety Screening — Answer All</h3>
                </div>
                <div className="space-y-2">
                  {safetyQs.map(q => (
                    <ToggleCard
                      key={q.question_id}
                      label={q.prompt}
                      value={Boolean(answers[q.question_id])}
                      onChange={v => setAnswer(q.question_id, v)}
                      danger
                      required={q.required}
                      testId={`safety-${q.question_id}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── History / Clinical criteria questions ──────────────────── */}
            {!protocolLoading && historyQs.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">History & Clinical Criteria</h3>
                </div>
                <div className="space-y-2">
                  {historyQs.map(q => {
                    if (q.type === "boolean") {
                      return (
                        <ToggleCard key={q.question_id} label={q.prompt}
                          value={Boolean(answers[q.question_id])}
                          onChange={v => setAnswer(q.question_id, v)}
                          required={q.required} testId={`hist-${q.question_id}`} />
                      );
                    }
                    if (q.type === "select" && q.options?.length) {
                      return (
                        <div key={q.question_id} className="text-xs">
                          <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{q.prompt}</p>
                          <RadioRow options={q.options.map(o => ({ value: o, label: o }))}
                            value={String(answers[q.question_id] ?? "")}
                            onChange={v => setAnswer(q.question_id, v)}
                            testId={`hist-select-${q.question_id}`} />
                        </div>
                      );
                    }
                    return (
                      <ToggleCard key={q.question_id} label={q.prompt}
                        value={Boolean(answers[q.question_id])}
                        onChange={v => setAnswer(q.question_id, v)}
                        required={q.required} testId={`hist-bool-${q.question_id}`} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Symptom questions ──────────────────────────────────────── */}
            {!protocolLoading && symptomQs.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-violet-500" />
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Symptoms & Details</h3>
                </div>
                <div className="space-y-3">
                  {symptomQs.map(q => {
                    if (q.type === "boolean") {
                      return (
                        <ToggleCard key={q.question_id} label={q.prompt}
                          value={Boolean(answers[q.question_id])}
                          onChange={v => setAnswer(q.question_id, v)}
                          required={q.required} testId={`sym-${q.question_id}`} />
                      );
                    }
                    if (q.type === "multiselect" && q.options?.length) {
                      return (
                        <div key={q.question_id}>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{q.prompt}</p>
                          <CheckboxCloud
                            options={q.options}
                            selected={(answers[q.question_id] as string[]) ?? []}
                            onToggle={opt => toggleMulti(q.question_id, opt)}
                            testId={`sym-multi-${q.question_id}`}
                          />
                        </div>
                      );
                    }
                    if (q.type === "select" && q.options?.length) {
                      return (
                        <div key={q.question_id}>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{q.prompt}</p>
                          <RadioRow options={q.options.map(o => ({ value: o, label: o }))}
                            value={String(answers[q.question_id] ?? "")}
                            onChange={v => setAnswer(q.question_id, v)}
                            testId={`sym-select-${q.question_id}`} />
                        </div>
                      );
                    }
                    if (q.type === "numeric" || q.type === "slider") {
                      const val = (answers[q.question_id] as number) ?? 5;
                      return (
                        <div key={q.question_id}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{q.prompt}</p>
                            <span className="text-sm font-bold text-slate-700">{val}</span>
                          </div>
                          <Slider min={0} max={10} step={1} value={[val]}
                            onValueChange={([v]) => setAnswer(q.question_id, v)}
                            data-testid={`sym-slider-${q.question_id}`} />
                        </div>
                      );
                    }
                    return (
                      <ToggleCard key={q.question_id} label={q.prompt}
                        value={Boolean(answers[q.question_id])}
                        onChange={v => setAnswer(q.question_id, v)}
                        required={q.required} testId={`sym-bool-${q.question_id}`} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Result card ────────────────────────────────────────────── */}
            {result && (
              <div className={`rounded-xl border-2 p-5 ${
                dispConfig ? `${dispConfig.bg} ${dispConfig.border}` : "bg-white border-slate-200"
              }`} data-testid="triage-result">
                <div className="flex items-center gap-3 mb-4">
                  {(result.disposition_level === "ER_NOW") ? (
                    <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Triage Result</p>
                    <p className={`text-lg font-black ${dispConfig?.text ?? "text-slate-800"}`}>
                      {dispConfig?.label ?? result.disposition_level ?? result.disposition ?? "Review Needed"}
                    </p>
                  </div>
                </div>

                {result.top_diagnoses && result.top_diagnoses.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Possible Conditions</p>
                    <div className="space-y-1">
                      {result.top_diagnoses.slice(0, 4).map((dx, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-5 text-center font-mono text-slate-400">{i + 1}</span>
                          <span className="font-medium text-slate-700 flex-1">{dx.label}</span>
                          <span className="text-slate-400 tabular-nums">{Math.round(dx.probability * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.red_flags && result.red_flags.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold uppercase text-red-500 mb-1.5">Red Flags Found</p>
                    <div className="flex flex-wrap gap-1">
                      {result.red_flags.map((flag, i) => (
                        <span key={i} className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(result.recommendation || result.next_steps) && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-600 leading-relaxed">{result.recommendation ?? result.next_steps}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Submit button ──────────────────────────────────────────── */}
            {!result && (
              <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 pt-4 pb-6">
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !complaintId}
                  className="w-full h-12 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-lg"
                  data-testid="btn-submit-intake"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyzing…</>
                  ) : (
                    "Get Triage Assessment →"
                  )}
                </Button>
              </div>
            )}

            {result && (
              <div className="pb-8 flex gap-2">
                <Button variant="outline" onClick={reset} className="flex-1" data-testid="btn-new-intake">
                  New Intake
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} variant="outline" className="flex-1" data-testid="btn-reassess">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-assess"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
