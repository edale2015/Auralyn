/**
 * EncounterSimulatorPage.tsx
 *
 * Clinical encounter that flows like a real patient interview.
 * All questions are gathered in one place (in clinical order), then
 * applied to each differential live on the right panel.
 * Four workup components (EKG, CXR, Troponin, Nebulizer) feed disposition.
 */

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Stethoscope, Play, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, Pencil, Save, X, Zap, Heart,
  Activity, Thermometer, Wind, Droplets, User, RefreshCw,
  ShieldAlert, ArrowRight, FlaskConical, Pill, ClipboardList,
  ListTree, BookOpen, RotateCcw, Users, MessageSquare, FileText,
  Circle, CircleCheck, CircleX, Minus,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ──────────────────────────────────────────────────────────────────────
type YNVal = "yes" | "no" | undefined;
type Inputs = Record<string, any>;

// ── Chest Pain Clinical Configuration ─────────────────────────────────────────
// Questions organized in exactly the order a real encounter flows.
// Each section maps to the clinical interview stage.

const CP_HPI_QUESTIONS = [
  { field: "Q_CP_EXERTIONAL",    label: "Came on with exertion or physical activity" },
  { field: "worst_at_onset",     label: "Worst at onset (sudden maximum — thunderclap)" },
  { field: "Q_CP_RADIATES",      label: "Radiates to arm, jaw, neck, or between shoulder blades" },
  { field: "Q_CP_PLEURITIC",     label: "Changes with breathing (worse with deep breath)" },
  { field: "Q_CP_WORSE_FLAT",    label: "Worse lying flat, better leaning forward" },
  { field: "Q_CP_ANTACID_RELIEF",label: "Improves with antacids" },
  { field: "had_before",         label: "Had this same pain before" },
];

const CP_ROS_QUESTIONS = [
  { field: "Q_CP_SOB",           label: "Shortness of breath" },
  { field: "Q_CP_DIAPHORESIS",   label: "Diaphoresis (sweating / clammy)" },
  { field: "nausea",             label: "Nausea or vomiting" },
  { field: "Q_CP_PALPITATIONS",  label: "Palpitations (heart racing)" },
  { field: "Q_CP_SYNCOPE",       label: "Syncope or near-syncope (fainting)" },
  { field: "Q_CP_CALF_SWELL",    label: "Leg pain or calf swelling" },
  { field: "Q_CP_FEVER",         label: "Fever" },
  { field: "Q_CP_COUGH",         label: "Cough" },
  { field: "Q_CP_NEURO",         label: "New neurological symptoms (vision changes, limb weakness)" },
  { field: "Q_CP_HTN_SYMPTOMS",  label: "Severe headache or vision changes" },
  { field: "Q_CP_TINGLING",      label: "Tingling in hands or around mouth" },
];

const CP_PMH_QUESTIONS = [
  { field: "cardiac_history",        label: "Heart disease or prior MI" },
  { field: "copd",                   label: "COPD" },
  { field: "asthma",                 label: "Asthma" },
  { field: "hypertension",           label: "Hypertension" },
  { field: "diabetes",               label: "Diabetes" },
  { field: "Q_CP_IMMOBILITY",        label: "Recent surgery or prolonged immobility / travel" },
  { field: "Q_CP_RECENT_VIRAL",      label: "Recent cold or viral illness (past 1–2 weeks)" },
  { field: "seen_cardiologist",      label: "Seen a cardiologist" },
  { field: "prior_cath",             label: "Prior cardiac catheterization, stent, or procedure" },
  { field: "prior_cardiac_testing",  label: "Prior cardiac or pulmonary testing (stress test, echo, PFTs)" },
];

const CP_FHX_QUESTIONS = [
  { field: "family_early_mi",    label: "Parent with early heart attack (dad <55 · mom <65)" },
  { field: "family_stroke",      label: "Parent with early stroke" },
];

const CP_MEDS_TOGGLES = [
  { field: "on_aspirin",         label: "On aspirin" },
  { field: "on_betablocker",     label: "On beta-blocker" },
  { field: "on_nitrates",        label: "On nitrates" },
  { field: "anticoagulated",     label: "On anticoagulants (warfarin / NOAC)" },
  { field: "immunocompromised",  label: "Immunocompromised" },
  { field: "nkda",               label: "NKDA (no known drug allergies)" },
  { field: "allergy_pcn",        label: "Allergy: Penicillin" },
  { field: "allergy_sulfa",      label: "Allergy: Sulfa" },
];

// Character picker options → sets both a display field AND pipe-relevant fields
const CP_CHARACTERS = [
  { label: "Pressure / Squeezing", field: "char_pressure" },
  { label: "Sharp / Stabbing",     field: "char_sharp" },
  { label: "Burning",              field: "char_burning",  also: "Q_CP_BURNING" },
  { label: "Aching / Dull",        field: "char_aching" },
  { label: "Tearing / Ripping",    field: "char_tearing",  also: "Q_CP_TEARING" },
];

// Pain scale 0-10
const SEVERITY_SCALE = [1,2,3,4,5,6,7,8,9,10];

// ── Differentials with their diagnostic criteria ───────────────────────────────
const CP_DIFFERENTIALS = [
  {
    id: "stemi_acs",
    name: "STEMI / ACS",
    icd: "I21",
    cannotMiss: true,
    criteria: [
      { label: "Exertional onset",           field: "Q_CP_EXERTIONAL" },
      { label: "Radiation (arm/jaw/neck/back)",field: "Q_CP_RADIATES" },
      { label: "Diaphoresis",                field: "Q_CP_DIAPHORESIS" },
      { label: "Pressure character",         field: "char_pressure" },
      { label: "Cardiac history",            field: "cardiac_history" },
    ],
  },
  {
    id: "pe",
    name: "Pulmonary Embolism",
    icd: "I26",
    cannotMiss: true,
    criteria: [
      { label: "Pleuritic pain",             field: "Q_CP_PLEURITIC" },
      { label: "Shortness of breath",        field: "Q_CP_SOB" },
      { label: "Leg pain / calf swelling",   field: "Q_CP_CALF_SWELL" },
      { label: "Immobility / recent travel", field: "Q_CP_IMMOBILITY" },
    ],
  },
  {
    id: "dissection",
    name: "Aortic Dissection",
    icd: "I71",
    cannotMiss: true,
    criteria: [
      { label: "Tearing / ripping quality",  field: "char_tearing" },
      { label: "Radiation to back",          field: "Q_CP_RADIATES" },
      { label: "Worst at onset",             field: "worst_at_onset" },
      { label: "Neurological symptoms",      field: "Q_CP_NEURO" },
    ],
  },
  {
    id: "pericarditis",
    name: "Pericarditis",
    icd: "I30",
    cannotMiss: false,
    criteria: [
      { label: "Worse lying flat",           field: "Q_CP_WORSE_FLAT" },
      { label: "Recent viral illness",       field: "Q_CP_RECENT_VIRAL" },
      { label: "Fever",                      field: "Q_CP_FEVER" },
      { label: "Pleuritic / sharp pain",     field: "Q_CP_PLEURITIC" },
    ],
  },
  {
    id: "gerd",
    name: "GERD / Esophageal",
    icd: "K21",
    cannotMiss: false,
    criteria: [
      { label: "Burning character",          field: "char_burning" },
      { label: "Antacid relief",             field: "Q_CP_ANTACID_RELIEF" },
      { label: "No radiation",               field: "Q_CP_RADIATES",  invert: true },
      { label: "Not exertional",             field: "Q_CP_EXERTIONAL", invert: true },
    ],
  },
  {
    id: "msk",
    name: "MSK / Costochondritis",
    icd: "M94.0",
    cannotMiss: false,
    criteria: [
      { label: "Reproducible on palpation",  field: "Q_CP_REPRODUCIBLE" },
      { label: "No radiation",               field: "Q_CP_RADIATES",  invert: true },
      { label: "No SOB",                     field: "Q_CP_SOB",       invert: true },
      { label: "Sharp / localized",          field: "char_sharp" },
    ],
  },
  {
    id: "anxiety",
    name: "Anxiety / Panic",
    icd: "F41.0",
    cannotMiss: false,
    criteria: [
      { label: "Stress / anxiety trigger",   field: "Q_CP_STRESS_TRIGGER" },
      { label: "Tingling / paresthesias",    field: "Q_CP_TINGLING" },
      { label: "Palpitations",               field: "Q_CP_PALPITATIONS" },
      { label: "Not exertional",             field: "Q_CP_EXERTIONAL", invert: true },
    ],
  },
];

// ── Workup cascade ─────────────────────────────────────────────────────────────
const CP_WORKUP = [
  {
    id: "ekg",
    label: "EKG / 12-Lead",
    icon: <Activity className="h-4 w-4" />,
    always: true,
    indication: "Standard for all chest pain",
    check: () => true,
  },
  {
    id: "cxr",
    label: "Chest X-Ray",
    icon: <Wind className="h-4 w-4" />,
    always: true,
    indication: "Standard for all chest pain",
    check: () => true,
  },
  {
    id: "troponin",
    label: "Troponin",
    icon: <Heart className="h-4 w-4" />,
    always: false,
    indication: "ACS pattern, cardiac Hx, or age >40",
    check: (inp: Inputs) =>
      inp.Q_CP_EXERTIONAL === "yes" || inp.Q_CP_RADIATES === "yes" ||
      inp.Q_CP_DIAPHORESIS === "yes" || inp.cardiac_history === "yes" ||
      (inp.age && Number(inp.age) >= 40),
  },
  {
    id: "nebulizer",
    label: "Nebulizer Tx",
    icon: <Droplets className="h-4 w-4" />,
    always: false,
    indication: "COPD or asthma in history",
    check: (inp: Inputs) => inp.copd === "yes" || inp.asthma === "yes",
  },
];

// ── Disposition logic ──────────────────────────────────────────────────────────
function computeDisposition(inp: Inputs): { level: string; color: string; reason: string } {
  // Hard red flags → ER
  if (
    (inp.Q_CP_EXERTIONAL === "yes" && (inp.Q_CP_RADIATES === "yes" || inp.Q_CP_DIAPHORESIS === "yes")) ||
    inp.Q_CP_SYNCOPE === "yes" ||
    (inp.Q_CP_TEARING === "yes" || inp.char_tearing === "yes") ||
    inp.Q_CP_HTN_SYMPTOMS === "yes"
  ) return { level: "ER / ED — Immediately", color: "bg-red-600 text-white", reason: "Critical red flag triggered" };

  if (
    (inp.Q_CP_PLEURITIC === "yes" && inp.Q_CP_SOB === "yes" && (inp.Q_CP_CALF_SWELL === "yes" || inp.Q_CP_IMMOBILITY === "yes"))
  ) return { level: "ER / ED — PE protocol", color: "bg-red-600 text-white", reason: "PE risk pattern" };

  if (inp.Q_CP_SOB === "yes" && inp.cardiac_history === "yes")
    return { level: "ER / ED — Urgent", color: "bg-orange-600 text-white", reason: "SOB + cardiac history" };

  if (inp.Q_CP_WORSE_FLAT === "yes" && inp.Q_CP_RECENT_VIRAL === "yes")
    return { level: "Urgent Care", color: "bg-amber-500 text-white", reason: "Pericarditis pattern" };

  if (inp.Q_CP_FEVER === "yes" && inp.Q_CP_COUGH === "yes")
    return { level: "Urgent Care", color: "bg-amber-500 text-white", reason: "Infectious etiology" };

  if (inp.Q_CP_BURNING === "yes" && inp.Q_CP_ANTACID_RELIEF === "yes")
    return { level: "PCP Follow-up", color: "bg-blue-600 text-white", reason: "GERD pattern" };

  if (inp.Q_CP_REPRODUCIBLE === "yes" && inp.Q_CP_SOB !== "yes" && inp.Q_CP_RADIATES !== "yes")
    return { level: "Self-Care / PCP", color: "bg-green-600 text-white", reason: "MSK / reproducible pain" };

  if (inp.Q_CP_STRESS_TRIGGER === "yes" && inp.Q_CP_TINGLING === "yes")
    return { level: "PCP / Behavioral Health", color: "bg-blue-600 text-white", reason: "Anxiety / panic pattern" };

  return { level: "PCP Follow-up", color: "bg-blue-500 text-white", reason: "Low-risk features" };
}

// ── Small shared components ────────────────────────────────────────────────────

/** Three-state yes / no / unknown toggle */
function YNToggle({ label, field, inputs, setInputs, compact = false }: {
  label: string; field: string;
  inputs: Inputs;
  setInputs: (fn: (p: Inputs) => Inputs) => void;
  compact?: boolean;
}) {
  const val: YNVal = inputs[field];
  const cycle = () =>
    setInputs(prev => ({
      ...prev,
      [field]: prev[field] === undefined ? "yes" : prev[field] === "yes" ? "no" : undefined,
    }));
  const cls =
    val === "yes" ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900 dark:text-green-200"
    : val === "no"  ? "bg-red-50 border-red-400 text-red-700 dark:bg-red-950 dark:text-red-300"
    : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400";
  return (
    <button
      data-testid={`yn-${field}`}
      onClick={cycle}
      className={`text-left rounded border transition-all ${compact ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5"} ${cls} w-full`}
    >
      <span className="font-mono mr-1.5">{val === "yes" ? "✓" : val === "no" ? "✗" : "?"}</span>
      {label}
    </button>
  );
}

/** Vital sign numeric input with normal range highlight */
function VitalInput({ label, field, unit, min, max, placeholder, inputs, setInputs }: {
  label: string; field: string; unit: string; min: number; max: number; placeholder: string;
  inputs: Inputs; setInputs: (fn: (p: Inputs) => Inputs) => void;
}) {
  const val = inputs[field] ?? "";
  const num = Number(val);
  const warn = val !== "" && (num < min || num > max);
  return (
    <div className="flex flex-col gap-0.5">
      <label className={`text-xs ${warn ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>{label}</label>
      <div className="flex items-center gap-1">
        <Input
          data-testid={`vital-${field}`}
          type="number" value={val} placeholder={placeholder}
          className={`h-8 text-sm w-20 ${warn ? "border-orange-400 text-orange-700" : ""}`}
          onChange={e => setInputs(prev => ({ ...prev, [field]: e.target.value === "" ? undefined : Number(e.target.value) }))}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
        {warn && <span className="text-xs text-orange-500">⚠</span>}
      </div>
    </div>
  );
}

/** Section header used throughout the intake */
function SectionHeader({ icon, label, step }: { icon: React.ReactNode; label: string; step: number }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">{step}</div>
      <div className="text-muted-foreground">{icon}</div>
      <h3 className="text-sm font-semibold uppercase tracking-wide">{label}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Criteria icon in differential card ────────────────────────────────────────
function CritIcon({ val, invert }: { val: YNVal; invert?: boolean }) {
  const met = invert ? val === "no" : val === "yes";
  const unknown = val === undefined;
  if (unknown) return <Minus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;
  if (met) return <CircleCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  return <CircleX className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />;
}

// ── Differential card ─────────────────────────────────────────────────────────
function DifferentialCard({ dx, inputs }: { dx: typeof CP_DIFFERENTIALS[0]; inputs: Inputs }) {
  const scored = dx.criteria.map(c => {
    const raw: YNVal = inputs[c.field];
    const met = c.invert ? raw === "no" : raw === "yes";
    const unknown = raw === undefined;
    return { ...c, met, unknown };
  });
  const metCount = scored.filter(c => c.met).length;
  const knownCount = scored.filter(c => !c.unknown).length;
  const pct = knownCount === 0 ? 0 : Math.round((metCount / scored.length) * 100);

  const urgency =
    dx.cannotMiss && pct >= 50 ? "border-red-400 bg-red-50/60 dark:bg-red-950/40"
    : dx.cannotMiss && pct > 0  ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/30"
    : pct >= 75 ? "border-blue-400 bg-blue-50/40 dark:bg-blue-950/30"
    : "border-border bg-card";

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${urgency}`}>
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="font-semibold text-sm leading-tight flex items-center gap-1.5">
            {dx.cannotMiss && <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />}
            {dx.name}
          </div>
          <div className="text-xs text-muted-foreground font-mono">{dx.icd}</div>
        </div>
        <div className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
          pct >= 75 ? "bg-red-600 text-white"
          : pct >= 50 ? "bg-orange-500 text-white"
          : pct >= 25 ? "bg-amber-400 text-black"
          : "bg-muted text-muted-foreground"
        }`}>{pct}%</div>
      </div>
      <div className="space-y-0.5">
        {scored.map(c => (
          <div key={c.field} className="flex items-center gap-1.5 text-xs">
            <CritIcon val={inputs[c.field]} invert={c.invert} />
            <span className={c.met ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </div>
        ))}
      </div>
      {metCount > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
          <div className={`h-1.5 rounded-full transition-all ${pct >= 50 ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Inline Rule Editor (preserved from original) ──────────────────────────────
function RuleEditor({ rule, onClose, onSaved }: { rule: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    safety_level: rule.safety_level ?? "LOW",
    priority: rule.priority ?? 5,
    logic_description: rule.logic_description ?? "",
    notes: rule.notes ?? "",
    active: rule.active !== false,
  });
  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/master-rules/${encodeURIComponent(rule.rule_id)}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { toast({ title: "Rule saved" }); onSaved(); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-sm">{rule.rule_name}</div>
          <div className="font-mono text-muted-foreground">{rule.rule_id}</div>
        </div>
        <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-muted-foreground block mb-1">Safety</label>
          <Select value={form.safety_level} onValueChange={v => setForm(f => ({ ...f, safety_level: v }))}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["CRITICAL","HIGH","MODERATE","LOW"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">Priority</label>
          <Input type="number" min={1} max={10} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} className="h-7 text-xs" />
        </div>
      </div>
      <div>
        <label className="text-muted-foreground block mb-1">Clinical Rationale</label>
        <Textarea value={form.logic_description} onChange={e => setForm(f => ({ ...f, logic_description: e.target.value }))} rows={3} className="text-xs font-mono resize-none" />
      </div>
      <div>
        <label className="text-muted-foreground block mb-1">Notes</label>
        <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-xs resize-none" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
          className={`text-xs px-2 py-1 rounded border ${form.active ? "bg-green-100 border-green-500 text-green-700" : "bg-red-50 border-red-300 text-red-700"}`}>
          {form.active ? "✓ Active" : "✗ Disabled"}
        </button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="h-7 text-xs">
          {save.isPending ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}Save
        </Button>
      </div>
      <div className="border-t pt-2 text-muted-foreground space-y-1">
        <div><span className="font-medium text-foreground">Type:</span> {rule.rule_type}</div>
        {rule.disposition_impact && <div><span className="font-medium text-foreground">Disposition:</span> {rule.disposition_impact}</div>}
        {rule.complaint_id && <div><span className="font-medium text-foreground">Complaint:</span> {rule.complaint_id}</div>}
      </div>
    </div>
  );
}

// ── Pipeline step row (preserved) ─────────────────────────────────────────────
const STEP_COLORS: Record<number, string> = {
  1: "border-l-slate-400", 2: "border-l-blue-500", 3: "border-l-amber-500",
  4: "border-l-cyan-500",  5: "border-l-teal-500", 6: "border-l-green-500",
  7: "border-l-red-600",   8: "border-l-purple-500",9: "border-l-indigo-500",
  10:"border-l-violet-500",11:"border-l-emerald-500",13:"border-l-slate-600",
};
const SAFETY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-700 text-white", HIGH: "bg-orange-500 text-white",
  MODERATE: "bg-yellow-500 text-black", LOW: "bg-slate-200 text-slate-700",
};
function safetyBadge(level: string) {
  return <Badge className={`${SAFETY_COLORS[level] ?? SAFETY_COLORS.LOW} text-xs py-0`}>{level}</Badge>;
}

function StepRow({ step, expanded, onToggle, onSelectRule }: { step: any; expanded: boolean; onToggle: () => void; onSelectRule: (r: any) => void }) {
  const fired = step.rulesFired?.length ?? 0;
  return (
    <div className={`border-l-4 ${STEP_COLORS[step.step] ?? "border-l-slate-300"} border rounded-r-md overflow-hidden`} data-testid={`step-row-${step.step}`}>
      <button className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors ${step.redFlagHit ? "bg-red-50/60 dark:bg-red-950/40" : fired ? "bg-muted/20" : ""}`} onClick={onToggle}>
        <span className="text-muted-foreground w-5 text-center text-xs font-bold">{step.step}</span>
        <span className="flex-1 text-xs font-semibold">{step.name}</span>
        {step.escalation && <Badge className="bg-red-600 text-white text-xs py-0 animate-pulse">ESCALATE</Badge>}
        {step.redFlagHit && !step.escalation && <Badge className="bg-red-500 text-white text-xs py-0">⚠ Flag</Badge>}
        {fired > 0
          ? <Badge variant="outline" className="text-xs py-0 text-green-700 border-green-400">{fired} fired</Badge>
          : step.rulesEvaluated > 0 ? <span className="text-xs text-muted-foreground">{step.rulesEvaluated} checked</span> : null}
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/10 space-y-1.5 text-xs">
          <div className="text-muted-foreground">{step.summary}</div>
          {step.rulesFired?.map((r: any) => (
            <button key={r.rule_id} data-testid={`fired-rule-${r.rule_id}`} onClick={() => onSelectRule(r)}
              className="w-full text-left border rounded p-2 bg-background hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-400 transition-colors group">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium group-hover:text-blue-700">{r.rule_name}</span>
                {safetyBadge(r.safety_level)}
              </div>
              <div className="text-muted-foreground font-mono">{r.rule_id}</div>
              {r.disposition_impact && <div className="text-indigo-600 font-semibold mt-0.5">→ {r.disposition_impact}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── COMPLAINTS list ────────────────────────────────────────────────────────────
const COMPLAINTS = [
  { id: "chest_pain",               label: "Chest Pain",            system: "Cardiology"  },
  { id: "cardio_palpitations",      label: "Palpitations",          system: "Cardiology"  },
  { id: "cardio_leg_swelling",      label: "Leg Swelling",          system: "Cardiology"  },
  { id: "sore_throat",              label: "Sore Throat",           system: "ENT"         },
  { id: "earache",                  label: "Ear Pain",              system: "ENT"         },
  { id: "ent_sinus_pressure",       label: "Sinus Pressure",        system: "ENT"         },
  { id: "cough",                    label: "Cough",                 system: "Pulmonology" },
  { id: "pulm_shortness_of_breath", label: "Shortness of Breath",   system: "Pulmonology" },
  { id: "abdominal_pain",           label: "Abdominal Pain",        system: "GI"          },
  { id: "dizziness",                label: "Dizziness",             system: "Neurology"   },
  { id: "neuro_headache",           label: "Headache",              system: "Neurology"   },
  { id: "derm_rash",                label: "Rash",                  system: "Dermatology" },
  { id: "gu_uti_symptoms",          label: "UTI Symptoms",          system: "GU"          },
  { id: "msk_back_pain",            label: "Back Pain",             system: "MSK"         },
  { id: "id_fever",                 label: "Fever",                 system: "Infectious"  },
];

const IS_CHEST_PAIN = (id: string) =>
  id === "chest_pain" || id === "cardio_chest_pain";

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function EncounterSimulatorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [complaint, setComplaint]       = useState("chest_pain");
  const [patientName, setPatientName]   = useState("Mr. Jones");
  const [inputs, setInputs]             = useState<Inputs>({});
  const [result, setResult]             = useState<any | null>(null);
  const [expanded, setExpanded]         = useState<Set<number>>(new Set([1, 2, 7]));
  const [selectedRule, setSelectedRule] = useState<any | null>(null);
  const [runCount, setRunCount]         = useState(0);
  const [showTrace, setShowTrace]       = useState(false);

  const isChestPain = IS_CHEST_PAIN(complaint);

  // Live computed values (no API call needed)
  const redFlags = useMemo(() => ({
    acs:        inputs.Q_CP_EXERTIONAL === "yes" && (inputs.Q_CP_RADIATES === "yes" || inputs.Q_CP_DIAPHORESIS === "yes"),
    pe:         inputs.Q_CP_PLEURITIC === "yes" && inputs.Q_CP_SOB === "yes" && (inputs.Q_CP_CALF_SWELL === "yes" || inputs.Q_CP_IMMOBILITY === "yes"),
    dissection: (inputs.Q_CP_TEARING === "yes" || inputs.char_tearing === "yes") && (inputs.Q_CP_NEURO === "yes" || inputs.Q_CP_RADIATES === "yes"),
    syncope:    inputs.Q_CP_SYNCOPE === "yes",
    htn_em:     inputs.Q_CP_HTN_SYMPTOMS === "yes",
  }), [inputs]);

  const anyHardFlag = Object.values(redFlags).some(Boolean);
  const disposition = useMemo(() => computeDisposition(inputs), [inputs]);

  const dryRun = useMutation({
    mutationFn: async () => {
      const clean: Inputs = {};
      for (const [k, v] of Object.entries(inputs))
        if (v !== undefined && v !== null && v !== "") clean[k] = v;
      // Sync derived fields
      if (inputs.char_tearing === "yes") clean.Q_CP_TEARING = "yes";
      if (inputs.char_burning === "yes") clean.Q_CP_BURNING = "yes";
      const res = await fetch("/api/master-rules/dry-run", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ complaint_id: complaint, inputs: clean }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      setRunCount(c => c + 1);
      setShowTrace(true);
      const fired = new Set<number>([1, 2]);
      for (const s of data.steps ?? []) if (s.rulesFired?.length || s.redFlagHit) fired.add(s.step);
      setExpanded(fired);
      if (data.hardStop) toast({ title: "⚠ Hard Stop — Escalate Now", description: data.hardStopReason, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Pipeline failed", description: e.message, variant: "destructive" }),
  });

  function handleReset() {
    setInputs({}); setResult(null); setSelectedRule(null);
    setRunCount(0); setShowTrace(false);
    setExpanded(new Set([1, 2, 7]));
  }

  const toggleExpand = useCallback((step: number) => {
    setExpanded(prev => { const n = new Set(prev); n.has(step) ? n.delete(step) : n.add(step); return n; });
  }, []);

  function toggleChar(ch: typeof CP_CHARACTERS[0]) {
    setInputs(prev => {
      const on = prev[ch.field] === "yes";
      const next: Inputs = { ...prev, [ch.field]: on ? undefined : "yes" };
      if (ch.also) next[ch.also] = on ? undefined : "yes";
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <Stethoscope className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div>
            <h1 className="text-base font-bold leading-tight" data-testid="heading-encounter-simulator">
              Clinical Encounter
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Complete intake → differentials update live → run pipeline for full trace
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Select value={complaint} onValueChange={v => { setComplaint(v); setInputs({}); setResult(null); setShowTrace(false); }}>
              <SelectTrigger data-testid="select-complaint" className="h-8 text-xs w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINTS.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{c.system}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              data-testid="input-patient-name"
              value={patientName}
              onChange={e => setPatientName(e.target.value)}
              placeholder="Patient name"
              className="h-8 text-xs w-28"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {runCount > 0 && <span className="text-xs text-muted-foreground">Run #{runCount}</span>}
          <Button data-testid="button-reset-encounter" variant="outline" size="sm" onClick={handleReset} className="h-8 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />Reset
          </Button>
          <Button
            data-testid="button-run-encounter"
            size="sm" onClick={() => dryRun.mutate()} disabled={dryRun.isPending}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            {dryRun.isPending
              ? <><Loader2 className="animate-spin h-3 w-3 mr-1" />Running…</>
              : <><Play className="h-3 w-3 mr-1" />{result ? "Re-run Pipeline" : "Run 13-Step Pipeline"}</>
            }
          </Button>
        </div>
      </div>

      {/* ── Greeting banner ─────────────────────────────────────────────── */}
      <div className="px-5 py-2 bg-blue-50/60 dark:bg-blue-950/30 border-b text-sm text-blue-800 dark:text-blue-300 font-medium">
        "Hi {patientName}, I'm Dr. Chen. What brought you in today?"
        {isChestPain && <span className="ml-2 font-normal text-blue-700 dark:text-blue-400">— Chest pain? Walk me through it…</span>}
      </div>

      {/* ── Two-column main layout ──────────────────────────────────────── */}
      <div className="flex flex-1 divide-x overflow-hidden min-h-0">

        {/* ── LEFT: Encounter Intake ──────────────────────────────────── */}
        <div className="w-[57%] shrink-0 overflow-y-auto p-5 space-y-1">

          {/* VITALS */}
          <SectionHeader icon={<Activity className="h-4 w-4" />} label="Vitals" step={1} />
          <div className="grid grid-cols-5 gap-3">
            <VitalInput label="O₂ Sat" field="O2_sat" unit="%" min={95} max={100} placeholder="98" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Heart Rate" field="heart_rate" unit="bpm" min={60} max={100} placeholder="78" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Systolic BP" field="systolic_bp" unit="mmHg" min={90} max={140} placeholder="120" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Temp" field="temp_f" unit="°F" min={97} max={99.5} placeholder="98.6" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Resp Rate" field="resp_rate" unit="/min" min={12} max={20} placeholder="16" inputs={inputs} setInputs={setInputs} />
          </div>

          {isChestPain ? (<>

            {/* HPI */}
            <SectionHeader icon={<MessageSquare className="h-4 w-4" />} label="History of Present Illness" step={2} />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Onset timing</label>
                <div className="flex gap-1">
                  {["Sudden (seconds)","Rapid (minutes)","Gradual (hours+)"].map(o => (
                    <button key={o} data-testid={`onset-${o.split(" ")[0].toLowerCase()}`}
                      onClick={() => setInputs(p => ({ ...p, onset_timing: p.onset_timing === o ? undefined : o }))}
                      className={`text-xs px-2 py-1 rounded border ${inputs.onset_timing === o ? "bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900 dark:text-blue-200" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                    >{o.split(" ")[0]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Severity 1–10</label>
                <div className="flex gap-0.5">
                  {SEVERITY_SCALE.map(n => (
                    <button key={n} data-testid={`severity-${n}`}
                      onClick={() => setInputs(p => ({ ...p, severity: p.severity === n ? undefined : n }))}
                      className={`text-xs w-6 h-6 rounded border font-mono ${inputs.severity === n ? n >= 7 ? "bg-red-600 border-red-700 text-white" : n >= 4 ? "bg-orange-500 border-orange-600 text-white" : "bg-blue-100 border-blue-500 text-blue-800" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                    >{n}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Character — select all that apply</label>
              <div className="flex flex-wrap gap-1.5">
                {CP_CHARACTERS.map(ch => (
                  <button key={ch.field} data-testid={`char-${ch.field}`}
                    onClick={() => toggleChar(ch)}
                    className={`text-sm px-3 py-1.5 rounded border transition-all ${inputs[ch.field] === "yes" ? "bg-amber-100 border-amber-500 text-amber-900 dark:bg-amber-900 dark:text-amber-100" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                  >{inputs[ch.field] === "yes" ? "✓ " : ""}{ch.label}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              {CP_HPI_QUESTIONS.map(q => (
                <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
              ))}
            </div>

            {/* ROS */}
            <SectionHeader icon={<Activity className="h-4 w-4" />} label="Review of Systems — Associated Symptoms" step={3} />
            <div className="grid grid-cols-2 gap-2">
              {CP_ROS_QUESTIONS.map(q => (
                <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
              ))}
            </div>

            {/* PMH */}
            <SectionHeader icon={<FileText className="h-4 w-4" />} label="Past Medical History" step={4} />
            <div className="grid grid-cols-2 gap-2">
              {CP_PMH_QUESTIONS.map(q => (
                <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
              ))}
            </div>

            {/* Family Hx */}
            <SectionHeader icon={<Users className="h-4 w-4" />} label="Family History" step={5} />
            <div className="grid grid-cols-2 gap-2">
              {CP_FHX_QUESTIONS.map(q => (
                <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
              ))}
            </div>

            {/* Social */}
            <SectionHeader icon={<User className="h-4 w-4" />} label="Social History" step={6} />
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Sex</label>
                <div className="flex gap-1">
                  {["Male","Female","Other"].map(s => (
                    <button key={s} data-testid={`sex-${s.toLowerCase()}`}
                      onClick={() => setInputs(p => ({ ...p, sex: p.sex === s.toLowerCase() ? undefined : s.toLowerCase() }))}
                      className={`text-xs px-2 py-1 rounded border ${inputs.sex === s.toLowerCase() ? "bg-blue-100 border-blue-500 text-blue-800" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              <VitalInput label="Age" field="age" unit="yr" min={0} max={120} placeholder="45" inputs={inputs} setInputs={setInputs} />
              <YNToggle label="Smoker (current or former)" field="smoker" inputs={inputs} setInputs={setInputs} compact />
              {(inputs.sex === "female" || inputs.sex === undefined) && (
                <YNToggle label="Pregnant" field="pregnancy_confirmed" inputs={inputs} setInputs={setInputs} compact />
              )}
              <YNToggle label="Age >65 / Elderly" field="elderly" inputs={inputs} setInputs={setInputs} compact />
            </div>

            {/* Meds & Allergies */}
            <SectionHeader icon={<Pill className="h-4 w-4" />} label="Medications & Allergies" step={7} />
            <div className="grid grid-cols-2 gap-2">
              {CP_MEDS_TOGGLES.map(q => (
                <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
              ))}
            </div>

          </>) : (
            /* Generic fallback for non-chest-pain complaints */
            <>
              <SectionHeader icon={<BookOpen className="h-4 w-4" />} label="Patient Modifiers" step={2} />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { field: "pregnancy_confirmed", label: "Pregnant" },
                  { field: "diabetes",            label: "Diabetic" },
                  { field: "elderly",             label: "Age > 65" },
                  { field: "immunocompromised",   label: "Immunocompromised" },
                  { field: "anticoagulated",      label: "Anticoagulated" },
                  { field: "smoker",              label: "Smoker" },
                  { field: "hypertension",        label: "Hypertension" },
                  { field: "cardiac_history",     label: "Cardiac history" },
                  { field: "fever",               label: "Fever" },
                  { field: "diaphoresis",         label: "Diaphoresis" },
                ].map(q => <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />)}
              </div>
            </>
          )}

          {/* Run button at bottom of intake */}
          <div className="pt-4">
            <Button
              data-testid="button-run-encounter-bottom"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => dryRun.mutate()} disabled={dryRun.isPending}
            >
              {dryRun.isPending
                ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Executing 13-step clinical pipeline…</>
                : <><Zap className="h-4 w-4 mr-2" />{result ? "Re-run 13-Step Pipeline" : "Execute 13-Step Pipeline"}</>}
            </Button>
          </div>
        </div>

        {/* ── RIGHT: Live Clinical Assessment ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/10 space-y-4 min-w-0">

          {/* Critical Alerts */}
          {anyHardFlag && (
            <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/60 p-3 space-y-1 animate-pulse">
              <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />CRITICAL RED FLAGS
              </div>
              {redFlags.acs        && <div className="text-sm text-red-700 dark:text-red-300">⚠ ACS pattern — exertional + radiation/diaphoresis</div>}
              {redFlags.pe         && <div className="text-sm text-red-700 dark:text-red-300">⚠ PE triad — pleuritic + SOB + DVT/immobility</div>}
              {redFlags.dissection && <div className="text-sm text-red-700 dark:text-red-300">⚠ Aortic dissection — tearing + radiation/neuro</div>}
              {redFlags.syncope    && <div className="text-sm text-red-700 dark:text-red-300">⚠ Syncope with chest pain</div>}
              {redFlags.htn_em     && <div className="text-sm text-red-700 dark:text-red-300">⚠ Hypertensive emergency pattern</div>}
            </div>
          )}

          {/* Workup Cascade */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FlaskConical className="h-3.5 w-3.5" />Workup Indicated
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(isChestPain ? CP_WORKUP : []).map(w => {
                const active = w.check(inputs);
                return (
                  <div key={w.id} className={`rounded-lg border p-2.5 flex items-start gap-2 ${active ? "border-blue-400 bg-blue-50/60 dark:bg-blue-950/40" : "border-border opacity-40"}`}>
                    <div className={active ? "text-blue-600" : "text-muted-foreground"}>{w.icon}</div>
                    <div>
                      <div className={`text-sm font-semibold ${active ? "" : "text-muted-foreground"}`}>{w.label}</div>
                      <div className="text-xs text-muted-foreground">{w.indication}</div>
                    </div>
                    {w.always && <Badge className="ml-auto bg-blue-600 text-white text-xs shrink-0">Always</Badge>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Differential Assessment */}
          {isChestPain && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5" />Differential Assessment
                <span className="font-normal">(criteria update as you answer)</span>
              </div>
              <div className="space-y-2">
                {CP_DIFFERENTIALS.map(dx => (
                  <DifferentialCard key={dx.id} dx={dx} inputs={inputs} />
                ))}
              </div>
            </div>
          )}

          {/* Disposition Estimate */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <ArrowRight className="h-3.5 w-3.5" />Disposition Estimate
            </div>
            <div className={`rounded-lg px-4 py-3 ${disposition.color} space-y-0.5`}>
              <div className="font-bold text-base">{disposition.level}</div>
              <div className="text-xs opacity-90">{disposition.reason}</div>
            </div>
            {result && (
              <div className={`rounded-lg mt-2 px-4 py-3 ${result.hardStop ? "bg-red-600 text-white" : "bg-green-700 text-white"}`}>
                <div className="font-bold text-sm">Pipeline result: {result.finalDisposition}</div>
                <div className="text-xs opacity-90">{result.totalRulesFired} rules fired · {result.steps?.length ?? 13} steps</div>
              </div>
            )}
          </div>

          {/* Rule Editor Panel */}
          {selectedRule && (
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Pencil className="h-3 w-3" />Rule Editor
              </div>
              <RuleEditor rule={selectedRule} onClose={() => setSelectedRule(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/master-rules"] }); }} />
              <div className="border-t mt-3 pt-3">
                <Button size="sm" variant="outline" className="w-full h-7 text-xs"
                  onClick={() => { setSelectedRule(null); dryRun.mutate(); }} disabled={dryRun.isPending}>
                  <Play className="h-3 w-3 mr-1" />Save & Re-run
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Full-width: 13-Step Pipeline Trace ──────────────────────────── */}
      {(result || dryRun.isPending) && (
        <div className="border-t bg-background">
          <button
            className="flex items-center gap-2 px-5 py-2.5 w-full text-left hover:bg-muted/30 transition-colors"
            onClick={() => setShowTrace(t => !t)}
          >
            <ListTree className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold">13-Step Pipeline Trace</span>
            {result && <Badge variant="outline" className="text-xs">{result.totalRulesFired} rules fired</Badge>}
            {showTrace ? <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />}
          </button>

          {showTrace && (
            <div className="px-5 pb-5 space-y-2 max-h-[50vh] overflow-y-auto">
              {dryRun.isPending && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <Loader2 className="animate-spin h-6 w-6 text-blue-500" />
                  <span className="text-sm font-semibold">Executing 13-step clinical pipeline…</span>
                </div>
              )}
              {result && (
                <>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 pb-1">
                    <RefreshCw className="h-3 w-3" />
                    Click any fired rule to open the editor · {result.totalRulesFired} fired · complaint: <code className="font-mono">{complaint}</code>
                  </div>
                  {(result.steps ?? []).map((step: any) => (
                    <StepRow key={step.step} step={step}
                      expanded={expanded.has(step.step)}
                      onToggle={() => toggleExpand(step.step)}
                      onSelectRule={rule => { setSelectedRule(rule); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
