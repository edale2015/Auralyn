/**
 * EncounterSimulatorPage.tsx
 *
 * Live patient encounter walkthrough with real-time 13-step pipeline execution.
 * Physician can select complaint → enter vitals/symptoms → see pipeline fire rule-by-rule.
 * Any fired rule can be clicked to open an inline editor.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Stethoscope, Play, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, Pencil, Save, X, Zap, Heart,
  Activity, Thermometer, Wind, Droplets, User, RefreshCw,
  ShieldAlert, ArrowRight, FlaskConical, Pill, ClipboardList,
  ListTree, BookOpen, RotateCcw,
} from "lucide-react";

// ─── Auth header helper ────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const COMPLAINTS = [
  { id: "chest_pain",                label: "Chest Pain",                  system: "Cardiology"   },
  { id: "cardio_chest_pain",         label: "Chest Pain (Cardiac)",         system: "Cardiology"   },
  { id: "cardio_palpitations",       label: "Palpitations",                 system: "Cardiology"   },
  { id: "cardio_leg_swelling",       label: "Leg Swelling",                 system: "Cardiology"   },
  { id: "sore_throat",               label: "Sore Throat",                  system: "ENT"          },
  { id: "ent_sore_throat",           label: "Sore Throat (ENT)",            system: "ENT"          },
  { id: "earache",                   label: "Ear Pain",                     system: "ENT"          },
  { id: "ent_ear_pain",              label: "Ear Pain (ENT)",               system: "ENT"          },
  { id: "ent_sinus_pressure",        label: "Sinus Pressure",               system: "ENT"          },
  { id: "cough",                     label: "Cough",                        system: "Pulmonology"  },
  { id: "pulm_cough",                label: "Cough (Pulm)",                 system: "Pulmonology"  },
  { id: "persistent_cough",          label: "Persistent Cough",             system: "Pulmonology"  },
  { id: "pulm_shortness_of_breath",  label: "Shortness of Breath",          system: "Pulmonology"  },
  { id: "abdominal_pain",            label: "Abdominal Pain",               system: "GI"           },
  { id: "gi_abdominal_pain",         label: "Abdominal Pain (GI)",          system: "GI"           },
  { id: "dizziness",                 label: "Dizziness",                    system: "Neurology"    },
  { id: "neuro_headache",            label: "Headache",                     system: "Neurology"    },
  { id: "derm_rash",                 label: "Rash",                         system: "Dermatology"  },
  { id: "derm_allergic_reaction",    label: "Allergic Reaction",            system: "Dermatology"  },
  { id: "gu_uti_symptoms",           label: "UTI Symptoms",                 system: "GU"           },
  { id: "gu_flank_pain",             label: "Flank Pain",                   system: "GU"           },
  { id: "gyn_pelvic_pain",           label: "Pelvic Pain",                  system: "GYN"          },
  { id: "msk_back_pain",             label: "Back Pain",                    system: "MSK"          },
  { id: "endo_hyperglycemia",        label: "Hyperglycemia",                system: "Endocrine"    },
  { id: "id_fever",                  label: "Fever",                        system: "Infectious"   },
  { id: "tox_overdose_intoxication", label: "Overdose / Intoxication",      system: "Toxicology"   },
  { id: "obesity_weight_gain",       label: "Weight Gain / Obesity",        system: "Primary Care" },
];

const STEP_COLORS: Record<number, string> = {
  1: "border-l-slate-400",   2: "border-l-amber-500",
  3: "border-l-cyan-500",    4: "border-l-sky-500",
  5: "border-l-red-500",     6: "border-l-purple-500",
  7: "border-l-blue-500",    8: "border-l-indigo-500",
  9: "border-l-teal-500",   10: "border-l-green-500",
  11: "border-l-green-400", 12: "border-l-emerald-500",
  13: "border-l-slate-600",
};

const SAFETY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-700 text-white",
  HIGH:     "bg-orange-500 text-white",
  MODERATE: "bg-yellow-500 text-black",
  LOW:      "bg-slate-200 text-slate-700",
};

const STEP_ICONS: Record<number, React.ReactNode> = {
  1:  <ClipboardList className="h-3.5 w-3.5" />,
  2:  <User className="h-3.5 w-3.5" />,
  3:  <BookOpen className="h-3.5 w-3.5" />,
  4:  <BookOpen className="h-3.5 w-3.5" />,
  5:  <ShieldAlert className="h-3.5 w-3.5 text-red-500" />,
  6:  <Activity className="h-3.5 w-3.5" />,
  7:  <Stethoscope className="h-3.5 w-3.5" />,
  8:  <ArrowRight className="h-3.5 w-3.5" />,
  9:  <FlaskConical className="h-3.5 w-3.5" />,
  10: <Pill className="h-3.5 w-3.5" />,
  11: <Pill className="h-3.5 w-3.5" />,
  12: <ClipboardList className="h-3.5 w-3.5" />,
  13: <ListTree className="h-3.5 w-3.5" />,
};

function safetyBadge(level: string) {
  return <Badge className={`${SAFETY_COLORS[level] ?? SAFETY_COLORS.LOW} text-xs py-0`}>{level}</Badge>;
}

// ─── Vitals entry ──────────────────────────────────────────────────────────────
function VitalInput({
  label, icon, field, unit, min, max, placeholder, inputs, setInputs,
}: {
  label: string; icon: React.ReactNode; field: string;
  unit: string; min: number; max: number; placeholder: string;
  inputs: Record<string, any>; setInputs: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
}) {
  const val = inputs[field] ?? "";
  const num = Number(val);
  const isSet = val !== "" && val !== null;
  const isWarn = isSet && (num < min || num > max);

  return (
    <div className="flex items-center gap-2">
      <div className={`text-muted-foreground ${isWarn ? "text-orange-500" : ""}`}>{icon}</div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="flex items-center gap-1">
          <Input
            data-testid={`vital-${field}`}
            type="number"
            value={val}
            placeholder={placeholder}
            className={`h-7 text-xs w-20 ${isWarn ? "border-orange-400 text-orange-700" : ""}`}
            onChange={e => setInputs(prev => ({
              ...prev,
              [field]: e.target.value === "" ? undefined : Number(e.target.value),
            }))}
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
          {isWarn && <span className="text-xs text-orange-500 font-medium">⚠ abnormal</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Symptom toggle ────────────────────────────────────────────────────────────
function SymptomToggle({
  label, field, inputs, setInputs,
}: {
  label: string; field: string;
  inputs: Record<string, any>;
  setInputs: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
}) {
  const val = inputs[field];
  return (
    <button
      data-testid={`symptom-${field}`}
      onClick={() => setInputs(prev => {
        const cur = prev[field];
        if (cur === "yes") return { ...prev, [field]: "no" };
        if (cur === "no")  return { ...prev, [field]: undefined };
        return { ...prev, [field]: "yes" };
      })}
      className={`
        text-xs px-2 py-1 rounded border transition-all text-left
        ${val === "yes"
          ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900 dark:text-green-200"
          : val === "no"
          ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-muted border-border text-muted-foreground hover:border-blue-400"
        }
      `}
    >
      {val === "yes" ? "✓ " : val === "no" ? "✗ " : "? "}{label}
    </button>
  );
}

// ─── Inline Rule Editor ────────────────────────────────────────────────────────
function RuleEditor({ rule, onClose, onSaved }: {
  rule: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    safety_level:      rule.safety_level ?? "LOW",
    priority:          rule.priority ?? 5,
    logic_description: rule.logic_description ?? "",
    notes:             rule.notes ?? "",
    active:            rule.active !== false,
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/master-rules/${encodeURIComponent(rule.rule_id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule updated", description: `${rule.rule_id} saved. Re-run the encounter to see updated results.` });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-sm">{rule.rule_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{rule.rule_id}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Safety Level</label>
          <Select value={form.safety_level} onValueChange={v => setForm(f => ({ ...f, safety_level: v }))}>
            <SelectTrigger className="h-7 text-xs" data-testid="editor-safety-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["CRITICAL","HIGH","MODERATE","LOW"].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Priority</label>
          <Input
            data-testid="editor-priority"
            type="number" min={1} max={10}
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Logic / Clinical Rationale</label>
        <Textarea
          data-testid="editor-logic-description"
          value={form.logic_description}
          onChange={e => setForm(f => ({ ...f, logic_description: e.target.value }))}
          rows={3}
          className="text-xs font-mono resize-none"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notes</label>
        <Textarea
          data-testid="editor-notes"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="text-xs resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          data-testid="editor-active-toggle"
          onClick={() => setForm(f => ({ ...f, active: !f.active }))}
          className={`text-xs px-2 py-1 rounded border ${form.active ? "bg-green-100 border-green-500 text-green-700" : "bg-red-50 border-red-300 text-red-700"}`}
        >
          {form.active ? "✓ Active" : "✗ Disabled"}
        </button>
        <div className="flex-1" />
        <Button
          data-testid="button-save-rule"
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="h-7 text-xs"
        >
          {save.isPending ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save Rule
        </Button>
      </div>

      <div className="border-t pt-2 text-xs text-muted-foreground space-y-1">
        <div><span className="font-medium">Type:</span> {rule.rule_type}</div>
        <div><span className="font-medium">Logic type:</span> {rule.logic_type}</div>
        {rule.disposition_impact && <div><span className="font-medium">Disposition:</span> {rule.disposition_impact}</div>}
        {rule.complaint_id && <div><span className="font-medium">Complaint:</span> {rule.complaint_id}</div>}
        {(rule.input_fields?.length > 0 || typeof rule.input_fields === "string") && (
          <div><span className="font-medium">Triggers on:</span> {Array.isArray(rule.input_fields) ? rule.input_fields.join(", ") : rule.input_fields}</div>
        )}
      </div>
    </div>
  );
}

// ─── Step row in pipeline trace ────────────────────────────────────────────────
function StepRow({ step, expanded, onToggle, onSelectRule }: {
  step: any;
  expanded: boolean;
  onToggle: () => void;
  onSelectRule: (rule: any) => void;
}) {
  const firedCount = step.rulesFired?.length ?? 0;
  const hasRules   = firedCount > 0;
  const isRedFlag  = step.redFlagHit;
  const isEscalation = step.escalation;

  return (
    <div
      className={`border-l-4 ${STEP_COLORS[step.step] ?? "border-l-slate-300"} border rounded-r-md overflow-hidden`}
      data-testid={`step-row-${step.step}`}
    >
      <button
        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors ${isRedFlag ? "bg-red-50/60 dark:bg-red-950/40" : hasRules ? "bg-muted/20" : ""}`}
        onClick={onToggle}
      >
        <span className="text-muted-foreground w-5 text-center text-xs font-bold">{step.step}</span>
        <span className="flex-1 flex items-center gap-1.5 text-xs font-semibold">
          {STEP_ICONS[step.step]}
          {step.name}
        </span>
        {isEscalation && <Badge className="bg-red-600 text-white text-xs py-0 animate-pulse">ESCALATE</Badge>}
        {isRedFlag && !isEscalation && <Badge className="bg-red-500 text-white text-xs py-0">⚠ Flag</Badge>}
        {hasRules
          ? <Badge variant="outline" className="text-xs py-0 text-green-700 border-green-400">{firedCount} fired</Badge>
          : step.rulesEvaluated > 0
            ? <span className="text-xs text-muted-foreground">{step.rulesEvaluated} checked</span>
            : null
        }
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/10 space-y-1.5 text-xs">
          <div className="text-muted-foreground">{step.summary}</div>
          {step.rulesFired?.map((r: any) => (
            <button
              key={r.rule_id}
              data-testid={`fired-rule-${r.rule_id}`}
              onClick={() => onSelectRule(r)}
              className="w-full text-left border rounded p-2 bg-background hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-400 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium group-hover:text-blue-700 dark:group-hover:text-blue-300">{r.rule_name}</span>
                <div className="flex items-center gap-1">
                  {safetyBadge(r.safety_level)}
                  <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center gap-0.5">
                    <Pencil className="h-2.5 w-2.5" />edit
                  </span>
                </div>
              </div>
              <div className="text-muted-foreground font-mono text-xs">{r.rule_id}</div>
              {r.disposition_impact && (
                <div className="text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">→ {r.disposition_impact}</div>
              )}
              {r.logic_description && (
                <div className="text-muted-foreground mt-0.5 line-clamp-1">{r.logic_description}</div>
              )}
            </button>
          ))}
          {Object.keys(step.outputs ?? {}).filter(k => !["complaint_id"].includes(k)).length > 0 && (
            <div className="font-mono bg-muted/60 rounded px-2 py-1 text-xs text-muted-foreground overflow-x-auto">
              {JSON.stringify(step.outputs)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function EncounterSimulatorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Encounter form state
  const [complaint, setComplaint]       = useState("chest_pain");
  const [customComplaint, setCustom]    = useState("");
  const [inputs, setInputs]             = useState<Record<string, any>>({});
  const [result, setResult]             = useState<any | null>(null);
  const [expanded, setExpanded]         = useState<Set<number>>(new Set([1, 2, 5, 7, 8]));
  const [selectedRule, setSelectedRule] = useState<any | null>(null);
  const [encounterPhase, setPhase]      = useState<"setup" | "running" | "done">("setup");
  const [runCount, setRunCount]         = useState(0);

  const effectiveComplaint = customComplaint.trim() || complaint;

  // Load question rules for the complaint (to build symptom checklist)
  const questionsQuery = useQuery<any>({
    queryKey: ["/api/master-rules/questions", effectiveComplaint],
    queryFn: async () => {
      const r = await fetch(
        `/api/master-rules?rule_type=question&complaint_id=${encodeURIComponent(effectiveComplaint)}&limit=30`,
        { credentials: "include", headers: authHeaders() }
      );
      return r.json();
    },
    enabled: !!effectiveComplaint,
  });

  // Load pipeline structure
  const pipelineQuery = useQuery<any>({
    queryKey: ["/api/master-rules/pipeline", effectiveComplaint],
    queryFn: async () => {
      const r = await fetch(
        `/api/master-rules/pipeline/${encodeURIComponent(effectiveComplaint)}`,
        { credentials: "include", headers: authHeaders() }
      );
      return r.json();
    },
    enabled: !!effectiveComplaint,
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(inputs)) {
        if (v !== undefined && v !== null && v !== "") clean[k] = v;
      }
      const res = await fetch("/api/master-rules/dry-run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ complaint_id: effectiveComplaint, inputs: clean }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      setPhase("done");
      setRunCount(c => c + 1);
      // Auto-expand fired steps
      const firedSteps = new Set<number>([1, 2]);
      for (const step of data.steps ?? []) {
        if (step.rulesFired?.length > 0 || step.redFlagHit) firedSteps.add(step.step);
      }
      setExpanded(firedSteps);
      if (data.hardStop) {
        toast({
          title: "⚠ Hard Stop — Escalate Immediately",
          description: data.hardStopReason ?? "Critical clinical rule triggered",
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => {
      toast({ title: "Pipeline execution failed", description: e.message, variant: "destructive" });
      setPhase("setup");
    },
  });

  function handleRun() {
    setPhase("running");
    setSelectedRule(null);
    dryRun.mutate();
  }

  function handleReset() {
    setInputs({});
    setResult(null);
    setSelectedRule(null);
    setPhase("setup");
    setExpanded(new Set([1, 2, 5, 7, 8]));
  }

  const toggleExpand = useCallback((step: number) => {
    setExpanded(prev => { const n = new Set(prev); n.has(step) ? n.delete(step) : n.add(step); return n; });
  }, []);

  function openRuleEditor(rule: any) {
    setSelectedRule(rule);
    // Scroll right panel into view on mobile
    document.getElementById("rule-editor-panel")?.scrollIntoView({ behavior: "smooth" });
  }

  const questions: any[] = questionsQuery.data?.rules ?? [];
  const pipeline:  any[] = pipelineQuery.data?.pipeline ?? [];
  const totalRules = pipelineQuery.data?.totalRules ?? 0;

  // Parse question name from logic_description (strip "Q: " prefix)
  function qLabel(q: any): string {
    const raw = q.logic_description ?? q.rule_name ?? q.rule_id;
    return raw.replace(/^Q:\s*/i, "").replace(/\?$/, "").trim();
  }
  // field key from question rule: pick first input_field or use rule_id
  function qField(q: any): string {
    const fields = Array.isArray(q.input_fields)
      ? q.input_fields
      : String(q.input_fields ?? "").replace(/[{}]/g, "").split(",").map((f: string) => f.trim()).filter(Boolean);
    return fields[0] ?? q.rule_id;
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <Stethoscope className="h-5 w-5 text-blue-600" />
        <div>
          <h1 className="text-base font-bold leading-tight" data-testid="heading-encounter-simulator">
            Live Encounter Simulator
          </h1>
          <p className="text-xs text-muted-foreground">
            Select complaint → enter patient data → run the 13-step clinical pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {runCount > 0 && (
            <span className="text-xs text-muted-foreground">Run #{runCount}</span>
          )}
          <Button
            data-testid="button-reset-encounter"
            variant="outline" size="sm"
            onClick={handleReset}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />New Encounter
          </Button>
          <Button
            data-testid="button-run-encounter"
            size="sm"
            onClick={handleRun}
            disabled={dryRun.isPending || !effectiveComplaint}
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            {dryRun.isPending
              ? <><Loader2 className="animate-spin h-3 w-3 mr-1" />Running…</>
              : <><Play className="h-3 w-3 mr-1" />{result ? "Re-run Pipeline" : "Run Pipeline"}</>
            }
          </Button>
        </div>
      </div>

      {/* ── Three-column layout ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden divide-x">

        {/* ── LEFT: Patient Encounter Form ─────────────────────────────── */}
        <div className="w-72 shrink-0 overflow-y-auto p-4 space-y-4 bg-muted/20">

          {/* Complaint selector */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />Chief Complaint
            </div>
            <Select value={complaint} onValueChange={v => { setComplaint(v); setCustom(""); }}>
              <SelectTrigger data-testid="select-complaint" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINTS.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="ml-2 text-muted-foreground">{c.system}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-1.5">
              <Input
                data-testid="input-custom-complaint"
                value={customComplaint}
                onChange={e => setCustom(e.target.value)}
                placeholder="or type complaint_id…"
                className="h-7 text-xs font-mono"
              />
            </div>
            {totalRules > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                <span className="text-blue-600 font-semibold">{totalRules}</span> rules loaded · {pipeline.length} steps
              </div>
            )}
          </div>

          {/* Vitals */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />Vitals
            </div>
            <div className="space-y-2.5">
              <VitalInput label="O₂ Saturation" icon={<Droplets className="h-3.5 w-3.5" />}
                field="O2_sat" unit="%" min={95} max={100} placeholder="98"
                inputs={inputs} setInputs={setInputs}
              />
              <VitalInput label="Heart Rate" icon={<Heart className="h-3.5 w-3.5" />}
                field="heart_rate" unit="bpm" min={60} max={100} placeholder="78"
                inputs={inputs} setInputs={setInputs}
              />
              <VitalInput label="Systolic BP" icon={<Activity className="h-3.5 w-3.5" />}
                field="systolic_bp" unit="mmHg" min={90} max={140} placeholder="120"
                inputs={inputs} setInputs={setInputs}
              />
              <VitalInput label="Temperature" icon={<Thermometer className="h-3.5 w-3.5" />}
                field="temp_f" unit="°F" min={97} max={99.5} placeholder="98.6"
                inputs={inputs} setInputs={setInputs}
              />
              <VitalInput label="Resp Rate" icon={<Wind className="h-3.5 w-3.5" />}
                field="resp_rate" unit="/min" min={12} max={20} placeholder="16"
                inputs={inputs} setInputs={setInputs}
              />
            </div>
          </div>

          {/* Modifiers */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <User className="h-3.5 w-3.5" />Patient Modifiers
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Pregnant",           field: "pregnancy_confirmed" },
                { label: "Diabetic",           field: "diabetes" },
                { label: "Age > 65",           field: "elderly" },
                { label: "Immunocompromised",  field: "immunocompromised" },
                { label: "Anticoagulated",     field: "anticoagulated" },
                { label: "Smoker",             field: "smoker" },
                { label: "Hypertensive",       field: "hypertension" },
                { label: "Cardiac history",    field: "cardiac_history" },
                { label: "Fever",              field: "fever" },
                { label: "Diaphoresis",        field: "diaphoresis" },
              ].map(m => (
                <SymptomToggle key={m.field} label={m.label} field={m.field}
                  inputs={inputs} setInputs={setInputs}
                />
              ))}
            </div>
          </div>

          {/* Dynamic symptom questions from KB */}
          {questions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />Clinical Questions
                <Badge variant="outline" className="text-xs ml-1">{questions.length}</Badge>
              </div>
              {questionsQuery.isLoading
                ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="animate-spin h-3 w-3" />Loading…</div>
                : (
                  <div className="flex flex-wrap gap-1.5">
                    {questions.map(q => (
                      <SymptomToggle
                        key={q.rule_id}
                        label={qLabel(q)}
                        field={qField(q)}
                        inputs={inputs}
                        setInputs={setInputs}
                      />
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {/* Current inputs summary */}
          {Object.entries(inputs).filter(([, v]) => v !== undefined && v !== null).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Active Inputs
              </div>
              <div className="font-mono text-xs bg-muted/60 rounded p-2 space-y-0.5 max-h-40 overflow-y-auto">
                {Object.entries(inputs)
                  .filter(([, v]) => v !== undefined && v !== null)
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <span className="text-blue-600">{k}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className={v === "yes" || v === true ? "text-green-600 font-medium" : v === "no" ? "text-red-500" : "text-foreground"}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Run button (bottom of form) */}
          <Button
            data-testid="button-run-encounter-bottom"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleRun}
            disabled={dryRun.isPending || !effectiveComplaint}
          >
            {dryRun.isPending
              ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Running 13 steps…</>
              : <><Zap className="h-4 w-4 mr-2" />{result ? "Re-run Pipeline" : "Execute Pipeline"}</>
            }
          </Button>
        </div>

        {/* ── CENTER: Pipeline Trace ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-w-0">

          {/* Disposition banner */}
          {result && (
            <Card className={result.hardStop
              ? "border-red-500 bg-red-50 dark:bg-red-950"
              : "border-green-500 bg-green-50 dark:bg-green-950"
            }>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-3">
                  {result.hardStop
                    ? <AlertTriangle className="h-7 w-7 text-red-500 shrink-0" />
                    : <CheckCircle2 className="h-7 w-7 text-green-600 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base leading-tight">
                      {result.hardStop
                        ? `HARD STOP — ${result.hardStopReason ?? "Escalate Now"}`
                        : `Encounter Complete — ${result.finalDisposition}`
                      }
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {result.totalRulesFired} rules fired across {result.steps?.length ?? 13} steps ·
                      complaint: <code className="font-mono">{result.complaint_id ?? effectiveComplaint}</code>
                    </div>
                  </div>
                  <Badge className={`text-sm px-3 py-1 shrink-0 ${result.hardStop ? "bg-red-600 text-white" : "bg-green-700 text-white"}`}>
                    {result.finalDisposition}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!result && !dryRun.isPending && (
            <div className="flex flex-col items-center justify-center h-80 gap-4 text-center text-muted-foreground">
              <Zap className="h-14 w-14 opacity-15" />
              <div>
                <div className="font-semibold text-base">Ready to run an encounter</div>
                <div className="text-sm mt-1">
                  Select a complaint, enter vitals and symptoms on the left,<br />
                  then click <span className="font-semibold text-blue-600">Execute Pipeline</span>.
                </div>
              </div>
              {/* Quick-start pipeline structure */}
              {pipeline.length > 0 && (
                <div className="w-full max-w-sm text-left mt-2">
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    Pipeline for <code className="font-mono">{effectiveComplaint}</code>
                  </div>
                  <div className="space-y-1">
                    {[{ step: 1, stepName: "Complaint Identification", ruleType: "—", count: 1 }, ...pipeline].map(s => (
                      <div key={s.step} className={`border-l-4 ${STEP_COLORS[s.step] ?? "border-l-slate-300"} pl-2 py-1 rounded-r flex items-center justify-between text-xs`}>
                        <span className="font-medium">{s.step}. {s.stepName}</span>
                        <Badge variant="outline" className="text-xs">{s.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {dryRun.isPending && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
              <div className="text-sm font-semibold">Executing 13-step clinical pipeline…</div>
              <div className="text-xs text-muted-foreground">Evaluating {totalRules} rules for <code>{effectiveComplaint}</code></div>
            </div>
          )}

          {/* Step-by-step trace */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                Click any fired rule to open the editor panel · {result.totalRulesFired} fired · {result.steps?.length} steps traced
              </div>
              {(result.steps ?? []).map((step: any) => (
                <StepRow
                  key={step.step}
                  step={step}
                  expanded={expanded.has(step.step)}
                  onToggle={() => toggleExpand(step.step)}
                  onSelectRule={openRuleEditor}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Rule Editor Panel ──────────────────────────────── */}
        <div
          id="rule-editor-panel"
          className="w-72 shrink-0 overflow-y-auto p-4 bg-muted/10"
        >
          {selectedRule ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Pencil className="h-3.5 w-3.5" />Rule Editor
              </div>
              <RuleEditor
                rule={selectedRule}
                onClose={() => setSelectedRule(null)}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["/api/master-rules"] });
                }}
              />
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground font-medium mb-1">After editing:</div>
                <Button
                  data-testid="button-rerun-after-edit"
                  size="sm" variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={() => { setSelectedRule(null); handleRun(); }}
                  disabled={dryRun.isPending}
                >
                  <Play className="h-3 w-3 mr-1" />Save & Re-run Encounter
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3 text-muted-foreground">
              <Pencil className="h-10 w-10 opacity-15" />
              <div className="text-sm">
                Click any <span className="font-semibold text-blue-600">fired rule</span> in the pipeline trace to edit it here.
              </div>
              <div className="text-xs">
                You can change safety levels, clinical rationale, priority, and active status.
                Re-run the encounter to see your changes take effect.
              </div>

              {/* Pipeline quick-reference */}
              {result && (
                <div className="w-full text-left mt-2 space-y-1">
                  <div className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">Summary</div>
                  {(result.steps ?? [])
                    .filter((s: any) => s.rulesFired?.length > 0)
                    .map((s: any) => (
                      <div key={s.step} className="text-xs flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${s.redFlagHit ? "bg-red-500" : "bg-green-500"}`} />
                        <span className="text-muted-foreground">{s.name}:</span>
                        <span className="font-medium">{s.rulesFired.length} rules</span>
                      </div>
                    ))
                  }
                  {result.criticalFlagsHit?.length > 0 && (
                    <div className="mt-2 text-xs text-red-600 font-medium">
                      ⚠ Critical flags: {result.criticalFlagsHit.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
