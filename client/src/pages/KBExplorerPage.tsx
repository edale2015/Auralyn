import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search, ChevronRight, ChevronDown, AlertTriangle, Pill,
  GitBranch, ClipboardList, Edit2, Check, X, FlaskConical,
  ShieldAlert, BookOpen, Layers, RefreshCw, TriangleAlert,
  ArrowRight, ArrowDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Complaint {
  complaint_id: string;
  system: string;
  label: string;
  enabled: boolean;
  engine_type: string;
  diagnosis_count: number;
  red_flag_count: number;
  disposition_count: number;
  treatment_count: number;
}

interface DiagnosisRule {
  id: number;
  rule_id: string;
  complaint_id: string;
  diagnosis_id: string;
  diagnosis_label: string;
  icd_code: string | null;
  base_probability: number;
  cannot_miss: boolean;
  feature_likelihoods: Record<string, number>;
  active: boolean;
}

interface RedFlagRule {
  id: number;
  rule_id: string;
  complaint_id: string;
  label: string;
  trigger_expr: string;
  severity: "HARD" | "SOFT";
  action: "ER_SEND" | "ESCALATE";
  immediate_actions: string | null;
  rationale: string | null;
  active: boolean;
}

interface DispositionRule {
  id: number;
  rule_id: string;
  complaint_id: string;
  priority: number;
  when_expr: string;
  disposition_level: string;
  confidence_hint: string;
  active: boolean;
}

interface TreatmentRule {
  id: number;
  rule_id: string;
  complaint_id: string;
  diagnosis_id: string | null;
  medication_name: string;
  medication_group: string | null;
  is_first_line: boolean;
  adult_dose: string | null;
  adult_max_dose: string | null;
  pediatric_dose: string | null;
  route: string | null;
  renal_adjust: string | null;
  hepatic_adjust: string | null;
  pregnancy_category: string | null;
  contraindications: string | null;
  key_interactions: string | null;
  common_side_effects: string | null;
  notes: string | null;
  active: boolean;
}

interface QuestionRule {
  id: number;
  complaint_id: string;
  question_id: string;
  prompt: string;
  type: string;
  required: boolean;
  priority: number;
  category: string | null;
  ask_if: string | null;
  linked_diagnoses: string[];
  active: boolean;
}

interface WorkupRule {
  id: number;
  rule_id: string;
  complaint_id: string;
  test_name: string;
  test_type: string;
  trigger_expr: string | null;
  priority: number;
  rationale: string | null;
  active: boolean;
}

interface PlanTemplate {
  id: number;
  template_key: string;
  complaint_id: string | null;
  diagnosis_label: string;
  default_disposition: string;
  summary: string | null;
  home_care: string[];
  follow_up: string[];
  return_precautions: string[];
  patient_message: string | null;
  discharge_text: string | null;
  er_precautions: string | null;
  medication_instructions: string | null;
  active: boolean;
}

interface Protocol {
  complaint: Complaint;
  diagnoses: DiagnosisRule[];
  redFlags: RedFlagRule[];
  dispositions: DispositionRule[];
  treatments: TreatmentRule[];
  questions: QuestionRule[];
  workup: WorkupRule[];
  plans: PlanTemplate[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYSTEM_LABELS: Record<string, string> = {
  CARD: "Cardiology", CARDIO: "Cardiology+", DERM: "Dermatology",
  ENDO: "Endocrinology", ENT: "ENT", ENV: "Environmental",
  GENERAL: "General", GI: "Gastroenterology", GU: "Genitourinary",
  GYN: "Gynecology", ID: "Infectious Disease", MSK: "Musculoskeletal",
  NEURO: "Neurology", OPHTHO: "Ophthalmology", ORAL: "Oral / Dental",
  ORTHO_TRAUMA: "Ortho / Trauma", PSYCH: "Psychiatry",
  PULM: "Pulmonary", TOX: "Toxicology",
};

const SYSTEM_COLORS: Record<string, string> = {
  CARD: "bg-red-100 text-red-700", CARDIO: "bg-red-100 text-red-700",
  DERM: "bg-pink-100 text-pink-700", ENDO: "bg-violet-100 text-violet-700",
  ENT: "bg-teal-100 text-teal-700", ENV: "bg-green-100 text-green-700",
  GENERAL: "bg-slate-100 text-slate-600", GI: "bg-orange-100 text-orange-700",
  GU: "bg-blue-100 text-blue-700", GYN: "bg-fuchsia-100 text-fuchsia-700",
  ID: "bg-amber-100 text-amber-700", MSK: "bg-lime-100 text-lime-700",
  NEURO: "bg-indigo-100 text-indigo-700", OPHTHO: "bg-cyan-100 text-cyan-700",
  ORAL: "bg-sky-100 text-sky-700", ORTHO_TRAUMA: "bg-stone-100 text-stone-700",
  PSYCH: "bg-purple-100 text-purple-700", PULM: "bg-emerald-100 text-emerald-700",
  TOX: "bg-yellow-100 text-yellow-800",
};

const DISP_COLORS: Record<string, string> = {
  er_send: "bg-red-500 text-white",
  urgent_care: "bg-amber-500 text-white",
  routine_urgent: "bg-yellow-400 text-slate-900",
  routine: "bg-emerald-500 text-white",
  self_care: "bg-blue-400 text-white",
  observation: "bg-orange-400 text-white",
};

const DISP_LABELS: Record<string, string> = {
  er_send: "ER",
  urgent_care: "Urgent Care",
  routine_urgent: "Routine Urgent",
  routine: "Primary Care",
  self_care: "Self Care",
  observation: "Observation",
};

function probPercent(p: number): string {
  return (p > 1 ? p : p * 100).toFixed(0) + "%";
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  value, onSave, multiline = false, testId,
}: {
  value: string | null;
  onSave: (v: string) => void;
  multiline?: boolean;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (!editing) {
    return (
      <span className="group flex items-start gap-1 cursor-pointer" onClick={() => { setDraft(value ?? ""); setEditing(true); }}>
        <span className="text-slate-700 dark:text-slate-200 leading-snug">{value || <em className="text-slate-400">—</em>}</span>
        <Edit2 className="h-3 w-3 mt-0.5 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {multiline ? (
        <Textarea value={draft} onChange={e => setDraft(e.target.value)}
          className="text-xs min-h-16" data-testid={testId} autoFocus />
      ) : (
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          className="text-xs h-7" data-testid={testId} autoFocus />
      )}
      <div className="flex gap-1">
        <button onClick={() => { onSave(draft); setEditing(false); }}
          className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={() => setEditing(false)}
          className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Decision Tree ────────────────────────────────────────────────────────────

function DecisionTree({ redFlags, dispositions }: { redFlags: RedFlagRule[]; dispositions: DispositionRule[] }) {
  const hardFlags = redFlags.filter(r => r.severity === "HARD" && r.active);
  const softFlags = redFlags.filter(r => r.severity === "SOFT" && r.active);
  const activeDisp = dispositions.filter(d => d.active);

  return (
    <div className="p-4 space-y-5 font-mono text-xs">

      {/* Root */}
      <div className="flex flex-col items-center gap-1">
        <div className="px-4 py-2.5 rounded-lg border-2 border-slate-400 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 text-center shadow-sm min-w-48 text-center" data-testid="tree-root">
          PATIENT ENCOUNTER
        </div>
        <ArrowDown className="h-4 w-4 text-slate-400" />
      </div>

      {/* Red flag gate */}
      {(hardFlags.length > 0 || softFlags.length > 0) && (
        <div className="flex flex-col items-center gap-1">
          <div className="w-full max-w-2xl rounded-lg border-2 border-red-300 bg-red-50 dark:bg-red-950/30 p-3" data-testid="tree-red-flag-gate">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span className="font-bold text-red-700 dark:text-red-300 text-sm">RED FLAG GATE</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Hard flags */}
              {hardFlags.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-bold text-red-600 mb-1.5">HARD (→ ER immediately)</div>
                  <div className="space-y-1">
                    {hardFlags.map(f => (
                      <div key={f.rule_id} className="flex items-start gap-1.5" data-testid={`tree-flag-${f.rule_id}`}>
                        <span className="text-red-500 mt-0.5">●</span>
                        <div>
                          <span className="font-semibold text-red-700 dark:text-red-300">{f.label}</span>
                          {f.rationale && (
                            <p className="text-[10px] text-slate-500 normal-case font-normal mt-0.5 leading-snug">{f.rationale}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Soft flags */}
              {softFlags.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-600 mb-1.5">SOFT (→ Escalate)</div>
                  <div className="space-y-1">
                    {softFlags.map(f => (
                      <div key={f.rule_id} className="flex items-start gap-1.5" data-testid={`tree-flag-${f.rule_id}`}>
                        <span className="text-amber-500 mt-0.5">◆</span>
                        <div>
                          <span className="font-semibold text-amber-700 dark:text-amber-300">{f.label}</span>
                          {f.immediate_actions && (
                            <p className="text-[10px] text-slate-500 normal-case font-normal mt-0.5 leading-snug">{f.immediate_actions}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <ArrowDown className="h-4 w-4 text-slate-400" />
        </div>
      )}

      {/* Disposition chain */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-full max-w-2xl rounded-lg border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3" data-testid="tree-disposition-chain">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="h-4 w-4 text-blue-500" />
            <span className="font-bold text-blue-700 dark:text-blue-300 text-sm">DISPOSITION RULES</span>
            <span className="text-[10px] text-slate-400">(first match wins)</span>
          </div>
          <div className="space-y-2">
            {activeDisp.map((d, i) => (
              <div key={d.rule_id} className="flex items-start gap-3" data-testid={`tree-disp-${d.rule_id}`}>
                <div className="flex items-center gap-1.5 shrink-0 w-6">
                  <span className="text-slate-400 font-bold">{d.priority === 99 ? "✱" : i + 1}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">IF</span>
                  <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-700 dark:text-slate-300 break-all">
                    {d.when_expr}
                  </code>
                  <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${DISP_COLORS[d.disposition_level] ?? "bg-slate-200 text-slate-700"}`}>
                    {DISP_LABELS[d.disposition_level] ?? d.disposition_level.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-400">({d.confidence_hint})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <ArrowDown className="h-4 w-4 text-slate-400" />
      </div>

      {/* Outcome buckets */}
      <div className="flex justify-center">
        <div className="flex gap-2 flex-wrap justify-center">
          {["er_send", "urgent_care", "routine_urgent", "routine", "self_care"].map(level => {
            const hasRule = activeDisp.some(d => d.disposition_level === level);
            if (!hasRule) return null;
            return (
              <div key={level}
                className={`px-4 py-2.5 rounded-lg font-bold text-center min-w-28 shadow-sm text-sm ${DISP_COLORS[level] ?? "bg-slate-200 text-slate-700"}`}
                data-testid={`tree-outcome-${level}`}>
                {DISP_LABELS[level]}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ─── Protocol Panel ───────────────────────────────────────────────────────────

type Tab = "overview" | "diagnoses" | "tree" | "treatments" | "questions" | "workup" | "plans";

function ProtocolPanel({ complaintId, onClose }: { complaintId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading, refetch } = useQuery<Protocol>({
    queryKey: ["/api/kb-explorer/complaints", complaintId],
    queryFn: () => fetch(`/api/kb-explorer/complaints/${encodeURIComponent(complaintId)}`).then(r => r.json()),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/kb-explorer/complaints", complaintId] });
    qc.invalidateQueries({ queryKey: ["/api/kb-explorer/complaints"] });
  };

  const patchComplaint = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/kb-explorer/complaints/${encodeURIComponent(complaintId)}`, body),
    onSuccess: () => { toast({ title: "Saved" }); invalidate(); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const patchDx = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/diagnosis-rules/${id}`, body),
    onSuccess: () => { toast({ title: "Diagnosis updated" }); invalidate(); },
  });

  const patchRf = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/red-flag-rules/${id}`, body),
    onSuccess: () => { toast({ title: "Red flag updated" }); invalidate(); },
  });

  const patchTx = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/treatment-rules/${id}`, body),
    onSuccess: () => { toast({ title: "Treatment updated" }); invalidate(); },
  });

  const patchQ = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/questions/${id}`, body),
    onSuccess: () => { toast({ title: "Question updated" }); invalidate(); },
  });

  const patchWu = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/workup-rules/${id}`, body),
    onSuccess: () => { toast({ title: "Workup rule updated" }); invalidate(); },
  });

  const patchPlan = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/kb-explorer/plan-templates/${id}`, body),
    onSuccess: () => { toast({ title: "Discharge plan updated" }); invalidate(); },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Loading protocol…
      </div>
    );
  }

  if (!data) return null;

  const { complaint, diagnoses, redFlags, dispositions, treatments, questions, workup, plans } = data;
  const hardFlags = redFlags.filter(r => r.severity === "HARD");
  const canMissDx = diagnoses.filter(d => d.cannot_miss);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview", label: "Overview", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { key: "questions", label: "Questions", icon: <ClipboardList className="h-3.5 w-3.5" />, count: questions.length },
    { key: "diagnoses", label: "Diagnoses", icon: <FlaskConical className="h-3.5 w-3.5" />, count: diagnoses.length },
    { key: "tree", label: "Decision Tree", icon: <GitBranch className="h-3.5 w-3.5" /> },
    { key: "workup", label: "Workup / Tests", icon: <FlaskConical className="h-3.5 w-3.5" />, count: workup.length },
    { key: "treatments", label: "Medications", icon: <Pill className="h-3.5 w-3.5" />, count: treatments.length },
    { key: "plans", label: "Discharge Plan", icon: <ClipboardList className="h-3.5 w-3.5" />, count: plans.length },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="protocol-panel">

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SYSTEM_COLORS[complaint.system] ?? "bg-slate-100 text-slate-600"}`}>
              {SYSTEM_LABELS[complaint.system] ?? complaint.system}
            </span>
            <h2 className="text-base font-bold text-slate-800 dark:text-white">{complaint.label}</h2>
            {hardFlags.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                {hardFlags.length} hard flag{hardFlags.length !== 1 ? "s" : ""}
              </span>
            )}
            {canMissDx.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-orange-600 font-medium">
                <TriangleAlert className="h-3.5 w-3.5" />
                {canMissDx.length} cannot-miss
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Switch
                checked={complaint.enabled}
                onCheckedChange={(v) => patchComplaint.mutate({ enabled: v })}
                className="scale-75 data-[state=checked]:bg-emerald-500"
                data-testid="complaint-toggle"
              />
              <span>{complaint.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <button onClick={() => refetch()} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" data-testid="protocol-refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" data-testid="protocol-close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
          <span data-testid="stat-diagnoses"><strong className="text-slate-700 dark:text-slate-300">{diagnoses.length}</strong> dx</span>
          <span data-testid="stat-redflags"><strong className="text-slate-700 dark:text-slate-300">{redFlags.length}</strong> flags</span>
          <span data-testid="stat-dispositions"><strong className="text-slate-700 dark:text-slate-300">{dispositions.length}</strong> disposition rules</span>
          <span data-testid="stat-questions"><strong className="text-slate-700 dark:text-slate-300">{questions.length}</strong> questions</span>
          <span data-testid="stat-workup"><strong className="text-slate-700 dark:text-slate-300">{workup.length}</strong> workup rules</span>
          <span data-testid="stat-treatments"><strong className="text-slate-700 dark:text-slate-300">{treatments.length}</strong> meds</span>
          <span data-testid="stat-plans"><strong className="text-slate-700 dark:text-slate-300">{plans.length}</strong> discharge plans</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${tab === t.key
                  ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span className={`text-[10px] font-bold px-1 rounded-full ${tab === t.key ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">

        {/* ─── Overview ──────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="p-4 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Complaint ID</p>
                <code className="text-slate-600 dark:text-slate-300">{complaint.complaint_id}</code>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">System</p>
                <span>{SYSTEM_LABELS[complaint.system] ?? complaint.system}</span>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Engine Type</p>
                <span>{complaint.engine_type}</span>
              </div>
            </div>

            {/* Red Flags summary */}
            {redFlags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> Red Flags
                </h3>
                <div className="space-y-2">
                  {redFlags.map(rf => (
                    <div key={rf.rule_id} className={`rounded-lg p-3 border text-xs ${rf.severity === "HARD" ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}
                      data-testid={`rf-card-${rf.rule_id}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rf.severity === "HARD" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                          {rf.severity}
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          <EditableField
                            value={rf.label}
                            onSave={(v) => patchRf.mutate({ id: rf.id, body: { label: v } })}
                            testId={`rf-label-${rf.id}`}
                          />
                        </span>
                        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${rf.action === "ER_SEND" ? "bg-red-600 text-white" : "bg-amber-600 text-white"}`}>
                          {rf.action === "ER_SEND" ? "→ ER" : "→ ESCALATE"}
                        </span>
                      </div>
                      {rf.immediate_actions && (
                        <div className="text-slate-600 dark:text-slate-400 text-[11px] mb-1">
                          <span className="font-semibold">Actions: </span>
                          <EditableField
                            value={rf.immediate_actions}
                            onSave={(v) => patchRf.mutate({ id: rf.id, body: { immediate_actions: v } })}
                            multiline
                            testId={`rf-actions-${rf.id}`}
                          />
                        </div>
                      )}
                      {rf.rationale && (
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                          <span className="font-semibold">Rationale: </span>
                          <EditableField
                            value={rf.rationale}
                            onSave={(v) => patchRf.mutate({ id: rf.id, body: { rationale: v } })}
                            multiline
                            testId={`rf-rationale-${rf.id}`}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                        <Switch checked={rf.active}
                          onCheckedChange={(v) => patchRf.mutate({ id: rf.id, body: { active: v } })}
                          className="scale-75 data-[state=checked]:bg-emerald-500"
                          data-testid={`rf-active-${rf.id}`}
                        />
                        <span className="text-[10px] text-slate-400">{rf.active ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disposition rules summary */}
            {dispositions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-blue-500" /> Disposition Rules
                </h3>
                <div className="space-y-1">
                  {dispositions.map(d => (
                    <div key={d.rule_id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800"
                      data-testid={`disp-row-${d.rule_id}`}>
                      <span className="w-6 text-center text-slate-400 font-mono font-bold shrink-0">
                        {d.priority === 99 ? "✱" : d.priority}
                      </span>
                      <code className="flex-1 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded truncate">
                        {d.when_expr}
                      </code>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${DISP_COLORS[d.disposition_level] ?? "bg-slate-200 text-slate-700"}`}>
                        {DISP_LABELS[d.disposition_level] ?? d.disposition_level}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{d.confidence_hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Diagnoses ─────────────────────────────────────────────────────── */}
        {tab === "diagnoses" && (
          <div className="p-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                  <th className="text-left pb-2 pr-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Diagnosis</th>
                  <th className="text-left pb-2 pr-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">ICD</th>
                  <th className="text-left pb-2 pr-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Base Prob</th>
                  <th className="text-left pb-2 pr-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold w-24">Cannot Miss</th>
                  <th className="text-left pb-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold w-16">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {diagnoses.map(dx => (
                  <tr key={dx.id} className={`${dx.cannot_miss ? "bg-orange-50/40 dark:bg-orange-950/10" : ""}`}
                    data-testid={`dx-row-${dx.id}`}>
                    <td className="py-2 pr-3">
                      <EditableField
                        value={dx.diagnosis_label}
                        onSave={(v) => patchDx.mutate({ id: dx.id, body: { diagnosis_label: v } })}
                        testId={`dx-label-${dx.id}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <EditableField
                        value={dx.icd_code}
                        onSave={(v) => patchDx.mutate({ id: dx.id, body: { icd_code: v } })}
                        testId={`dx-icd-${dx.id}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, (dx.base_probability > 1 ? dx.base_probability : dx.base_probability * 100))}%` }} />
                        </div>
                        <span className="font-mono text-slate-600 dark:text-slate-400">{probPercent(dx.base_probability)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {dx.cannot_miss ? (
                        <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                          <TriangleAlert className="h-3 w-3" /> YES
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <Switch checked={dx.active}
                        onCheckedChange={(v) => patchDx.mutate({ id: dx.id, body: { active: v } })}
                        className="scale-75 data-[state=checked]:bg-emerald-500"
                        data-testid={`dx-active-${dx.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Decision Tree ──────────────────────────────────────────────────── */}
        {tab === "tree" && (
          <DecisionTree redFlags={redFlags} dispositions={dispositions} />
        )}

        {/* ─── Treatments ────────────────────────────────────────────────────── */}
        {tab === "treatments" && (
          <div className="p-4 space-y-3">
            {treatments.length === 0 && (
              <p className="text-slate-400 text-xs text-center py-8">No medication protocols in KB for this complaint.</p>
            )}
            {treatments.map(tx => (
              <div key={tx.id} className={`rounded-lg border p-3 text-xs ${tx.is_first_line ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-slate-200 dark:border-slate-700"}`}
                data-testid={`tx-card-${tx.id}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-bold text-slate-800 dark:text-white text-sm">{tx.medication_name}</span>
                  {tx.medication_group && (
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded">{tx.medication_group}</span>
                  )}
                  {tx.route && (
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded">{tx.route}</span>
                  )}
                  {tx.is_first_line ? (
                    <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">1st line</span>
                  ) : (
                    <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">Alternative</span>
                  )}
                  <Switch checked={tx.active}
                    onCheckedChange={(v) => patchTx.mutate({ id: tx.id, body: { active: v } })}
                    className="scale-75 ml-auto data-[state=checked]:bg-emerald-500"
                    data-testid={`tx-active-${tx.id}`}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Adult Dose</p>
                    <EditableField value={tx.adult_dose}
                      onSave={(v) => patchTx.mutate({ id: tx.id, body: { adult_dose: v } })}
                      testId={`tx-dose-${tx.id}`}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Max Dose</p>
                    <EditableField value={tx.adult_max_dose}
                      onSave={(v) => patchTx.mutate({ id: tx.id, body: { adult_max_dose: v } })}
                      testId={`tx-maxdose-${tx.id}`}
                    />
                  </div>
                  {tx.pediatric_dose && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Pediatric Dose</p>
                      <EditableField value={tx.pediatric_dose}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { pediatric_dose: v } })}
                        testId={`tx-peddose-${tx.id}`}
                      />
                    </div>
                  )}
                  {tx.contraindications && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5 text-red-400" /> Contraindications
                      </p>
                      <EditableField value={tx.contraindications}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { contraindications: v } })}
                        multiline testId={`tx-contra-${tx.id}`}
                      />
                    </div>
                  )}
                  {tx.key_interactions && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Key Interactions</p>
                      <EditableField value={tx.key_interactions}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { key_interactions: v } })}
                        multiline testId={`tx-interactions-${tx.id}`}
                      />
                    </div>
                  )}
                  {tx.common_side_effects && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Side Effects</p>
                      <EditableField value={tx.common_side_effects}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { common_side_effects: v } })}
                        testId={`tx-sideeffects-${tx.id}`}
                      />
                    </div>
                  )}
                  {tx.renal_adjust && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Renal Adjust</p>
                      <span>{tx.renal_adjust}</span>
                    </div>
                  )}
                  {tx.pregnancy_category && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Pregnancy</p>
                      <EditableField value={tx.pregnancy_category}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { pregnancy_category: v } })}
                        testId={`tx-preg-${tx.id}`}
                      />
                    </div>
                  )}
                  {tx.notes && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Notes</p>
                      <EditableField value={tx.notes}
                        onSave={(v) => patchTx.mutate({ id: tx.id, body: { notes: v } })}
                        multiline testId={`tx-notes-${tx.id}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Questions ─────────────────────────────────────────────────────── */}
        {tab === "questions" && (
          <div className="p-4">
            {questions.length === 0 && (
              <p className="text-slate-400 text-xs text-center py-8">No questions in KB for this complaint.</p>
            )}
            <div className="space-y-0">
              {questions.map((q, i) => (
                <div key={q.id} className={`flex gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 text-xs ${!q.active ? "opacity-50" : ""}`}
                  data-testid={`q-row-${q.id}`}>
                  {/* Priority badge */}
                  <div className="shrink-0 flex flex-col items-center gap-1 w-14">
                    <span className="font-mono font-bold text-slate-400 text-[11px]">#{i + 1}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      q.category === "safety" ? "bg-red-100 text-red-600" :
                      q.category === "centor" ? "bg-blue-100 text-blue-600" :
                      q.category === "history" ? "bg-slate-100 text-slate-600" :
                      "bg-slate-100 text-slate-500"
                    }`}>{q.category ?? "—"}</span>
                    {q.required && <span className="text-[9px] text-amber-600 font-bold">REQ</span>}
                  </div>

                  {/* Prompt */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 dark:text-slate-200 leading-snug mb-0.5">
                      <EditableField value={q.prompt}
                        onSave={(v) => patchQ.mutate({ id: q.id, body: { prompt: v } })}
                        multiline testId={`q-prompt-${q.id}`}
                      />
                    </div>
                    {q.ask_if && (
                      <div className="text-[10px] text-slate-400">
                        Ask if: <code className="bg-slate-50 dark:bg-slate-800 px-1 rounded">{q.ask_if}</code>
                      </div>
                    )}
                    {q.linked_diagnoses.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {q.linked_diagnoses.map(d => (
                          <span key={d} className="text-[9px] bg-violet-50 text-violet-600 px-1 rounded">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Type + toggle */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">{q.type}</span>
                    <Switch checked={q.active}
                      onCheckedChange={(v) => patchQ.mutate({ id: q.id, body: { active: v } })}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                      data-testid={`q-active-${q.id}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Workup / Tests ────────────────────────────────────────────────── */}
        {tab === "workup" && (
          <div className="p-4">
            {workup.length === 0 && (
              <p className="text-slate-400 text-xs text-center py-8">No workup rules in KB for this complaint.</p>
            )}
            <div className="space-y-2">
              {workup.map(w => (
                <div key={w.id} className={`rounded-lg border p-3 text-xs ${
                  w.test_type === "bedside" ? "border-teal-200 bg-teal-50/30 dark:bg-teal-950/10" :
                  w.test_type === "EKG" ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" :
                  w.test_type === "imaging" ? "border-blue-200 bg-blue-50/30 dark:bg-blue-950/10" :
                  "border-slate-200 dark:border-slate-700"
                } ${!w.active ? "opacity-50" : ""}`} data-testid={`wu-card-${w.id}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      w.test_type === "bedside" ? "bg-teal-500 text-white" :
                      w.test_type === "EKG" ? "bg-red-500 text-white" :
                      w.test_type === "imaging" ? "bg-blue-500 text-white" :
                      w.test_type === "labs" ? "bg-violet-500 text-white" :
                      "bg-slate-400 text-white"
                    }`}>{w.test_type}</span>
                    <span className="font-bold text-slate-800 dark:text-white text-sm">
                      <EditableField value={w.test_name}
                        onSave={(v) => patchWu.mutate({ id: w.id, body: { test_name: v } })}
                        testId={`wu-name-${w.id}`}
                      />
                    </span>
                    <Switch checked={w.active}
                      onCheckedChange={(v) => patchWu.mutate({ id: w.id, body: { active: v } })}
                      className="scale-75 ml-auto data-[state=checked]:bg-emerald-500"
                      data-testid={`wu-active-${w.id}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    {w.trigger_expr && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Order when</p>
                        <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 block">
                          {w.trigger_expr}
                        </code>
                      </div>
                    )}
                    {w.rationale && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Rationale</p>
                        <EditableField value={w.rationale}
                          onSave={(v) => patchWu.mutate({ id: w.id, body: { rationale: v } })}
                          multiline testId={`wu-rationale-${w.id}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Discharge Plans ───────────────────────────────────────────────── */}
        {tab === "plans" && (
          <div className="p-4 space-y-3">
            {plans.length === 0 && (
              <p className="text-slate-400 text-xs text-center py-8">No discharge plan templates for this complaint.</p>
            )}
            {plans.map(p => (
              <div key={p.id} className={`rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-xs ${!p.active ? "opacity-50" : ""}`}
                data-testid={`plan-card-${p.id}`}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white text-sm">{p.diagnosis_label}</span>
                    {p.complaint_id && (
                      <span className="ml-2 text-[10px] text-slate-400">({p.complaint_id})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${DISP_COLORS[p.default_disposition] ?? "bg-slate-200 text-slate-700"}`}>
                      {DISP_LABELS[p.default_disposition] ?? p.default_disposition}
                    </span>
                    <Switch checked={p.active}
                      onCheckedChange={(v) => patchPlan.mutate({ id: p.id, body: { active: v } })}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                      data-testid={`plan-active-${p.id}`}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {p.summary && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Summary</p>
                      <EditableField value={p.summary}
                        onSave={(v) => patchPlan.mutate({ id: p.id, body: { summary: v } })}
                        multiline testId={`plan-summary-${p.id}`}
                      />
                    </div>
                  )}

                  {p.patient_message && (
                    <div className="rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-2">
                      <p className="text-[10px] font-semibold uppercase text-blue-500 mb-0.5">Patient Message</p>
                      <EditableField value={p.patient_message}
                        onSave={(v) => patchPlan.mutate({ id: p.id, body: { patient_message: v } })}
                        multiline testId={`plan-msg-${p.id}`}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {p.home_care.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Home Care</p>
                        <ul className="space-y-0.5">
                          {p.home_care.map((item, i) => (
                            <li key={i} className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="text-emerald-400 shrink-0">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {p.follow_up.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Follow-up</p>
                        <ul className="space-y-0.5">
                          {p.follow_up.map((item, i) => (
                            <li key={i} className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="text-blue-400 shrink-0">→</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {p.return_precautions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Return If…</p>
                        <ul className="space-y-0.5">
                          {p.return_precautions.map((item, i) => (
                            <li key={i} className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                              <span className="text-red-400 shrink-0">!</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {p.er_precautions && (
                    <div className="rounded bg-red-50 dark:bg-red-950/20 border border-red-200 p-2">
                      <p className="text-[10px] font-semibold uppercase text-red-500 mb-0.5">ER Precautions</p>
                      <EditableField value={p.er_precautions}
                        onSave={(v) => patchPlan.mutate({ id: p.id, body: { er_precautions: v } })}
                        multiline testId={`plan-er-${p.id}`}
                      />
                    </div>
                  )}

                  {p.discharge_text && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400 mb-0.5">Discharge Text</p>
                      <EditableField value={p.discharge_text}
                        onSave={(v) => patchPlan.mutate({ id: p.id, body: { discharge_text: v } })}
                        multiline testId={`plan-discharge-${p.id}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Complaint List Item ──────────────────────────────────────────────────────

function ComplaintItem({ c, selected, onClick }: {
  c: Complaint;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`complaint-${c.complaint_id}`}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors group
        ${selected
          ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
          : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        }
        ${!c.enabled ? "opacity-50" : ""}
      `}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium truncate">{c.label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {c.red_flag_count > 0 && (
            <span className={`text-[9px] font-bold rounded px-1 ${selected ? "bg-red-500 text-white" : "bg-red-100 text-red-600"}`}>
              {c.red_flag_count}🚩
            </span>
          )}
          <ChevronRight className={`h-3 w-3 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`} />
        </div>
      </div>
      <div className={`text-[10px] mt-0.5 flex gap-2 ${selected ? "text-slate-300" : "text-slate-400"}`}>
        <span>{c.diagnosis_count} dx</span>
        <span>{c.disposition_count} rules</span>
        {c.treatment_count > 0 && <span>{c.treatment_count} meds</span>}
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KBExplorerPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ complaints: Complaint[]; grouped: Record<string, Complaint[]>; total: number }>({
    queryKey: ["/api/kb-explorer/complaints"],
    queryFn: () => fetch("/api/kb-explorer/complaints").then(r => r.json()),
  });

  const grouped = data?.grouped ?? {};
  const systems = Object.keys(grouped).sort();

  // Expand all systems containing matches
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result: Record<string, Complaint[]> = {};
    for (const sys of systems) {
      const filtered = grouped[sys].filter(c =>
        c.label.toLowerCase().includes(q) || c.complaint_id.toLowerCase().includes(q)
      );
      if (filtered.length > 0) result[sys] = filtered;
    }
    return result;
  }, [grouped, search, systems]);

  const filteredSystems = Object.keys(filteredGrouped).sort();

  // Auto-expand when searching
  const effectiveSystems = search.trim()
    ? new Set(filteredSystems)
    : expandedSystems;

  const toggleSystem = (sys: string) => {
    setExpandedSystems(prev => {
      const next = new Set(prev);
      if (next.has(sys)) next.delete(sys);
      else next.add(sys);
      return next;
    });
  };

  const totalComplaints = data?.total ?? 0;
  const enabledCount = data?.complaints.filter(c => c.enabled).length ?? 0;

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">

      {/* ── Left sidebar: complaint list ── */}
      <div className="w-64 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">

        {/* Sidebar header */}
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-slate-500" />
            <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">KB Explorer</h1>
          </div>
          <p className="text-[10px] text-slate-400 mb-2">
            {isLoading ? "Loading…" : `${enabledCount} / ${totalComplaints} complaints active`}
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search complaints…"
              className="pl-7 h-8 text-xs"
              data-testid="kb-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Complaint list grouped by system */}
        <div className="flex-1 overflow-auto py-1" data-testid="complaint-list">
          {isLoading && (
            <p className="text-slate-400 text-xs text-center py-8">Loading…</p>
          )}
          {filteredSystems.map(sys => {
            const complaints = filteredGrouped[sys];
            const isExpanded = effectiveSystems.has(sys);
            return (
              <div key={sys}>
                <button
                  onClick={() => toggleSystem(sys)}
                  data-testid={`system-${sys}`}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${SYSTEM_COLORS[sys] ?? "bg-slate-100 text-slate-600"}`}>
                      {SYSTEM_LABELS[sys] ?? sys}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{complaints.length}</span>
                </button>
                {isExpanded && (
                  <div className="px-2 pb-1 space-y-0.5">
                    {complaints.map(c => (
                      <ComplaintItem
                        key={c.complaint_id}
                        c={c}
                        selected={selectedId === c.complaint_id}
                        onClick={() => setSelectedId(c.complaint_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && filteredSystems.length === 0 && (
            <p className="text-slate-400 text-xs text-center py-8">No complaints match.</p>
          )}
        </div>
      </div>

      {/* ── Right panel: protocol detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedId ? (
          <ProtocolPanel
            key={selectedId}
            complaintId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 p-8">
            <Layers className="h-12 w-12 text-slate-200" />
            <div className="text-center">
              <p className="font-medium text-slate-500 mb-1">Select a complaint to view its protocol</p>
              <p className="text-xs max-w-80 leading-relaxed">
                Browse {totalComplaints} chief complaints across {systems.length} medical systems.
                Each protocol shows diagnoses, red flags, disposition logic, and medication protocols —
                all editable in place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {systems.slice(0, 8).map(sys => (
                <button
                  key={sys}
                  onClick={() => {
                    setExpandedSystems(prev => new Set([...prev, sys]));
                    const first = grouped[sys]?.[0];
                    if (first) setSelectedId(first.complaint_id);
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors hover:opacity-80 ${SYSTEM_COLORS[sys] ?? "bg-slate-100 text-slate-600"}`}
                  data-testid={`quick-${sys}`}
                >
                  {SYSTEM_LABELS[sys] ?? sys}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
