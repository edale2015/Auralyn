/**
 * EncounterSimulatorPage.tsx
 *
 * Config-driven clinical encounter page.
 * The 15 complaints in encounterConfigs.ts are fully hand-crafted (live criteria scoring).
 * All other complaints load dynamically from /api/encounter-configs/:id (KB-assembled).
 *
 * To add a new hand-crafted complaint: add a config block in encounterConfigs.ts.
 * All KB complaints are available automatically via the API.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Circle, CircleCheck, CircleX, Minus, Database,
} from "lucide-react";
import {
  ENCOUNTER_CONFIGS,
  ENCOUNTER_COMPLAINTS,
  type DifferentialConfig,
  type Inp as Inputs,
} from "@/data/encounterConfigs";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Icon map for workup items (iconId → JSX) ─────────────────────────────────
const WORKUP_ICONS: Record<string, React.ReactNode> = {
  activity:    <Activity    className="h-4 w-4" />,
  wind:        <Wind        className="h-4 w-4" />,
  heart:       <Heart       className="h-4 w-4" />,
  droplets:    <Droplets    className="h-4 w-4" />,
  flask:       <FlaskConical className="h-4 w-4" />,
  microscope:  <FlaskConical className="h-4 w-4" />,
  stethoscope: <Stethoscope  className="h-4 w-4" />,
  zap:         <Zap          className="h-4 w-4" />,
  shield:      <ShieldAlert  className="h-4 w-4" />,
  pill:        <Pill         className="h-4 w-4" />,
  thermometer: <Thermometer  className="h-4 w-4" />,
};

// ── Adapter: convert API JSON response → runtime EncounterConfig ──────────────
function adaptApiConfig(data: any): any {
  return {
    complaintId: data.complaint_id,
    complaintLabel: data.complaintLabel,
    hpiQuestions: data.hpiQuestions ?? [],
    rosQuestions: data.rosQuestions ?? [],
    pmhQuestions: data.pmhQuestions ?? [],
    fhxQuestions: data.fhxQuestions ?? [],
    medsQuestions: data.medsQuestions ?? [],
    characters: data.characters ?? [],
    onsetOptions: data.onsetOptions ?? [],
    hasSeverityScale: true,
    differentials: (data.differentials ?? []).map((dx: any) => ({
      id: dx.id,
      name: dx.label,
      icd: dx.icdCode ?? "",
      cannotMiss: !!dx.cannotMiss,
      // Criteria are text-only strings from the KB — mark with _text prefix so
      // DifferentialCard renders them as static lines without input checking.
      criteria: (dx.criteria ?? []).map((text: string, i: number) => ({
        field: `_text_${dx.id}_${i}`,
        label: text,
      })),
      keyQuestions: dx.keyQuestions ?? [],
    })),
    workup: (data.workup ?? []).map((w: any) => ({
      id: w.id,
      label: w.label,
      indication: w.indication,
      iconId: w.iconId ?? "flask",
      always: false,
      check: () => true,
    })),
    redFlags: (data.redFlags ?? []).map((rf: any) => ({
      id: rf.id,
      label: rf.label,
      check: () => false,
    })),
    computeDisposition: () => ({
      level: "Complete Full Assessment",
      reason: "Run the 13-step pipeline to get the full disposition recommendation.",
      color: "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
    }),
  };
}

// ── Severity scale ────────────────────────────────────────────────────────────
const SEVERITY_SCALE = [1,2,3,4,5,6,7,8,9,10];

// ── Three-state yes / no / unknown toggle ─────────────────────────────────────
function YNToggle({ label, field, inputs, setInputs, compact = false }: {
  label: string; field: string;
  inputs: Inputs;
  setInputs: (fn: (p: Inputs) => Inputs) => void;
  compact?: boolean;
}) {
  const val = inputs[field] as "yes" | "no" | undefined;
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

// ── Vital sign numeric input ───────────────────────────────────────────────────
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

// ── Section header ────────────────────────────────────────────────────────────
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

// ── Criteria icon ─────────────────────────────────────────────────────────────
function CritIcon({ val, invert }: { val: "yes" | "no" | undefined; invert?: boolean }) {
  const met = invert ? val === "no" : val === "yes";
  const unknown = val === undefined;
  if (unknown) return <Minus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;
  if (met) return <CircleCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  return <CircleX className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />;
}

// ── Differential card ─────────────────────────────────────────────────────────
function DifferentialCard({ dx, inputs }: { dx: any; inputs: Inputs }) {
  // Criteria whose field starts with "_text_" are text-only (dynamic/KB configs).
  // They don't check inputs — they just display static clinical text.
  const isTextOnly = (field: string) => field.startsWith("_text_");

  const scored = dx.criteria.map((c: any) => {
    if (isTextOnly(c.field)) return { ...c, met: false, unknown: true, textOnly: true };
    const raw = inputs[c.field] as "yes" | "no" | undefined;
    const met = c.invert ? raw === "no" : raw === "yes";
    const unknown = raw === undefined;
    return { ...c, met, unknown, textOnly: false };
  });

  // Only count live (non-text-only) criteria for the percentage
  const liveCriteria = scored.filter((c: any) => !c.textOnly);
  const metCount = liveCriteria.filter((c: any) => c.met).length;
  const pct = liveCriteria.length > 0 ? Math.round((metCount / liveCriteria.length) * 100) : 0;
  const allTextOnly = liveCriteria.length === 0;

  const urgency =
    dx.cannotMiss && !allTextOnly && pct >= 50 ? "border-red-400 bg-red-50/60 dark:bg-red-950/40"
    : dx.cannotMiss && !allTextOnly && pct > 0  ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/30"
    : !allTextOnly && pct >= 75 ? "border-blue-400 bg-blue-50/40 dark:bg-blue-950/30"
    : dx.cannotMiss ? "border-orange-200 bg-orange-50/20 dark:bg-orange-950/10"
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
        {!allTextOnly ? (
          <div className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
            pct >= 75 ? "bg-red-600 text-white"
            : pct >= 50 ? "bg-orange-500 text-white"
            : pct >= 25 ? "bg-amber-400 text-black"
            : "bg-muted text-muted-foreground"
          }`}>{pct}%</div>
        ) : (
          dx.cannotMiss && <Badge className="text-xs bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 py-0">Cannot Miss</Badge>
        )}
      </div>
      <div className="space-y-0.5">
        {scored.map((c: any) =>
          c.textOnly ? (
            <div key={c.field} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
              <span>{c.label}</span>
            </div>
          ) : (
            <div key={c.field} className="flex items-center gap-1.5 text-xs">
              <CritIcon val={inputs[c.field] as any} invert={c.invert} />
              <span className={c.met ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
            </div>
          )
        )}
      </div>
      {!allTextOnly && metCount > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
          <div className={`h-1.5 rounded-full transition-all ${pct >= 50 ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Inline Rule Editor ────────────────────────────────────────────────────────
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

// ── Pipeline step row ─────────────────────────────────────────────────────────
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

// ── System ordering for grouped dropdown (30 systems) ────────────────────────
const SYSTEM_ORDER = [
  "Cardiovascular", "Pulmonology", "GI", "ENT", "OB/Gyn", "GU/Urology",
  "Neurology", "MSK/Ortho", "Dermatology", "Endocrine/Metabolic",
  "Allergy/Immunology", "Ophthalmology", "Infectious Disease",
  "Environmental", "Occupational/Industrial", "Toxicology",
  "Psychiatry", "Trauma/Emergency", "Wound/Burns", "Pediatrics",
  "Hematology", "Vascular", "Weight/Nutrition", "General",
  "Other",
];

// Static complaint IDs (hand-crafted with live criteria scoring)
const STATIC_IDS = new Set(ENCOUNTER_COMPLAINTS.map((c: any) => c.id));

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function EncounterSimulatorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Read ?c= query param for deep-link from Complaints Review page
  const initialComplaint = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get("c");
    return p ? decodeURIComponent(p) : "chest_pain";
  }, []);

  const [complaint, setComplaint]         = useState(initialComplaint);
  const [patientName, setPatientName]     = useState("Mr. Jones");
  const [inputs, setInputs]               = useState<Inputs>({});
  const [result, setResult]               = useState<any | null>(null);
  const [expanded, setExpanded]           = useState<Set<number>>(new Set([1, 2, 7]));
  const [selectedRule, setSelectedRule]   = useState<any | null>(null);
  const [runCount, setRunCount]           = useState(0);
  const [showTrace, setShowTrace]         = useState(false);
  const [complaintSearch, setComplaintSearch] = useState("");
  // Auto-enable full mode if the deep-linked complaint isn't in the static 15
  const [fullMode, setFullMode]           = useState(!STATIC_IDS.has(initialComplaint) && initialComplaint !== "chest_pain");

  // ── Fetch complaint list from KB ──────────────────────────────────────────
  const { data: apiComplaintList, isFetching: isComplaintListFetching } = useQuery<any[]>({
    queryKey: ["/api/encounter-configs", fullMode ? "full" : "standard"],
    queryFn: async () => {
      const token = localStorage.getItem("app_auth_token");
      const url = fullMode ? "/api/encounter-configs?full=true" : "/api/encounter-configs";
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Merged complaint list: static 15 first, then all API complaints ───────
  const allComplaints = useMemo(() => {
    const staticList = ENCOUNTER_COMPLAINTS.map((c: any) => ({ ...c, isStatic: true }));
    if (!apiComplaintList) return staticList;
    const extras = apiComplaintList
      .filter(c => !STATIC_IDS.has(c.id))
      .map(c => ({ ...c, isStatic: false }));
    return [...staticList, ...extras];
  }, [apiComplaintList]);

  // ── Filtered + grouped complaint list ─────────────────────────────────────
  const filteredComplaints = useMemo(() => {
    const q = complaintSearch.toLowerCase();
    return q
      ? allComplaints.filter(c =>
          c.label.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.system ?? "").toLowerCase().includes(q)
        )
      : allComplaints;
  }, [allComplaints, complaintSearch]);

  const groupedComplaints = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const c of filteredComplaints) {
      const sys = c.system ?? "Other";
      if (!groups[sys]) groups[sys] = [];
      groups[sys].push(c);
    }
    return SYSTEM_ORDER.filter(s => groups[s]?.length).map(s => ({ system: s, items: groups[s] }));
  }, [filteredComplaints]);

  // ── Dynamic config fetch (for complaints not in the static 15) ────────────
  const isStaticComplaint = STATIC_IDS.has(complaint);
  const { data: dynamicConfigData, isLoading: isDynamicLoading } = useQuery<any>({
    queryKey: ["/api/encounter-configs", complaint],
    queryFn: async () => {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch(`/api/encounter-configs/${encodeURIComponent(complaint)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !isStaticComplaint,
    staleTime: 5 * 60 * 1000,
  });

  // ── Config lookup — static takes priority; API config used for everything else
  const config = useMemo(() => {
    if (isStaticComplaint) return ENCOUNTER_CONFIGS[complaint] ?? ENCOUNTER_CONFIGS["chest_pain"];
    if (dynamicConfigData) return adaptApiConfig(dynamicConfigData);
    // Loading placeholder
    return {
      complaintLabel: complaint.replace(/_/g, " "),
      hpiQuestions: [], rosQuestions: [], pmhQuestions: [], fhxQuestions: [],
      medsQuestions: [], characters: [], onsetOptions: [], hasSeverityScale: true,
      differentials: [], workup: [], redFlags: [],
      computeDisposition: () => ({ level: "Loading…", reason: "", color: "bg-muted text-muted-foreground" }),
    };
  }, [complaint, isStaticComplaint, dynamicConfigData]);

  // ── Live computed values (no API call) ────────────────────────────────────
  const activeRedFlags = useMemo(
    () => config.redFlags.filter(rf => rf.check(inputs)),
    [inputs, config]
  );
  const anyHardFlag = activeRedFlags.length > 0;
  const disposition = useMemo(() => config.computeDisposition(inputs), [inputs, config]);

  // ── 13-step pipeline dry-run ──────────────────────────────────────────────
  const dryRun = useMutation({
    mutationFn: async () => {
      const clean: Inputs = {};
      for (const [k, v] of Object.entries(inputs))
        if (v !== undefined && v !== null && v !== "") clean[k] = v;
      // Sync char.also fields generically
      for (const ch of config.characters ?? [])
        if (ch.also && inputs[ch.field] === "yes") clean[ch.also] = "yes";
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

  function toggleChar(ch: { field: string; also?: string }) {
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
            <Select value={complaint} onValueChange={v => { setComplaint(v); setInputs({}); setResult(null); setShowTrace(false); setComplaintSearch(""); }}>
              <SelectTrigger data-testid="select-complaint" className="h-8 text-xs w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[420px]">
                {/* Search box inside dropdown */}
                <div className="sticky top-0 bg-popover px-2 py-1.5 border-b z-10">
                  <Input
                    placeholder="Search complaints…"
                    value={complaintSearch}
                    onChange={e => setComplaintSearch(e.target.value)}
                    onKeyDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    className="h-7 text-xs"
                    data-testid="input-complaint-search"
                  />
                  <div className="text-xs text-muted-foreground mt-1 px-0.5 flex items-center gap-1.5">
                    {isComplaintListFetching
                      ? <><Loader2 className="h-3 w-3 animate-spin" />Loading…</>
                      : <>{filteredComplaints.length} complaint{filteredComplaints.length !== 1 ? "s" : ""}
                          {complaintSearch ? ` matching "${complaintSearch}"` : ""}
                          {fullMode && <span className="text-blue-500 font-semibold ml-1">· Full KB</span>}
                        </>
                    }
                  </div>
                </div>
                {groupedComplaints.map(group => (
                  <div key={group.system}>
                    <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 sticky top-[68px]">
                      {group.system}
                      <span className="ml-1 font-normal text-muted-foreground/60">({group.items.length})</span>
                    </div>
                    {group.items.map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs pl-4">
                        <span className="font-medium">{c.label}</span>
                        {c.isStatic && <span className="ml-1.5 text-green-600 text-xs">★</span>}
                        {!c.isStatic && c.dxCount > 0 && (
                          <span className="ml-1.5 text-muted-foreground text-xs">{c.dxCount}dx</span>
                        )}
                        {!c.isStatic && c.dxCount === 0 && c.ruleCount > 0 && (
                          <span className="ml-1.5 text-blue-400 text-xs">{c.ruleCount}r</span>
                        )}
                      </SelectItem>
                    ))}
                  </div>
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
            {/* ── Expand to Full KB button ────────────────────────────── */}
            {!fullMode ? (
              <Button
                data-testid="button-expand-full-kb"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950 shrink-0"
                onClick={() => {
                  setFullMode(true);
                  toast({
                    title: "Loading Full KB…",
                    description: "Fetching all 1,000+ complaints across 30 systems.",
                  });
                }}
              >
                <Database className="h-3.5 w-3.5" />
                Load Full KB
              </Button>
            ) : (
              <div
                data-testid="badge-full-kb-active"
                className="flex items-center gap-1 h-8 px-2.5 rounded border border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-medium shrink-0"
              >
                <Database className="h-3 w-3" />
                {isComplaintListFetching
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Loading…</>
                  : <>{apiComplaintList?.length ?? "…"} complaints · 30 systems</>
                }
              </div>
            )}
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
      <div className="px-5 py-2 bg-blue-50/60 dark:bg-blue-950/30 border-b text-sm text-blue-800 dark:text-blue-300 font-medium flex items-center gap-2">
        <span>"Hi {patientName}, I'm Dr. Chen. What brought you in today?"</span>
        <span className="font-normal text-blue-700 dark:text-blue-400">
          — {config.complaintLabel}? Walk me through it…
        </span>
        {!isStaticComplaint && (
          <span className="ml-auto text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1">
            {isDynamicLoading
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading KB config…</>
              : <><BookOpen className="h-3 w-3" /> KB-assembled config</>}
          </span>
        )}
        {isStaticComplaint && (
          <span className="ml-auto text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Verified hand-crafted config ★
          </span>
        )}
      </div>

      {/* ── Two-column main layout ──────────────────────────────────────── */}
      <div className="flex flex-1 divide-x overflow-hidden min-h-0">

        {/* ── LEFT: Encounter Intake ──────────────────────────────────── */}
        <div className="w-[57%] shrink-0 overflow-y-auto p-5 space-y-1">

          {/* ── 1. VITALS ────────────────────────────────────────────── */}
          <SectionHeader icon={<Activity className="h-4 w-4" />} label="Vitals" step={1} />
          <div className="grid grid-cols-5 gap-3">
            <VitalInput label="O₂ Sat"    field="O2_sat"      unit="%" min={95} max={100} placeholder="98"    inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Heart Rate" field="heart_rate"  unit="bpm" min={60} max={100} placeholder="78"  inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Systolic BP"field="systolic_bp" unit="mmHg" min={90} max={140} placeholder="120" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Temp"       field="temp_f"      unit="°F" min={97} max={99.5} placeholder="98.6" inputs={inputs} setInputs={setInputs} />
            <VitalInput label="Resp Rate"  field="resp_rate"   unit="/min" min={12} max={20} placeholder="16"   inputs={inputs} setInputs={setInputs} />
          </div>

          {/* ── 2. HPI ───────────────────────────────────────────────── */}
          <SectionHeader icon={<MessageSquare className="h-4 w-4" />} label="History of Present Illness" step={2} />

          {/* Onset timing chips */}
          {config.onsetOptions && (
            <div className="mb-2">
              <label className="text-xs text-muted-foreground mb-1 block">Onset timing</label>
              <div className="flex gap-1 flex-wrap">
                {config.onsetOptions.map(o => (
                  <button key={o} data-testid={`onset-${o.split(" ")[0].toLowerCase()}`}
                    onClick={() => setInputs(p => ({ ...p, onset_timing: p.onset_timing === o ? undefined : o }))}
                    className={`text-xs px-2 py-1 rounded border ${inputs.onset_timing === o ? "bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900 dark:text-blue-200" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                  >{o}</button>
                ))}
              </div>
            </div>
          )}

          {/* Severity scale */}
          {config.hasSeverityScale && (
            <div className="mb-2">
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
          )}

          {/* Character picker */}
          {config.characters && config.characters.length > 0 && (
            <div className="mb-2">
              <label className="text-xs text-muted-foreground mb-1 block">Character — select all that apply</label>
              <div className="flex flex-wrap gap-1.5">
                {config.characters.map(ch => (
                  <button key={ch.field} data-testid={`char-${ch.field}`}
                    onClick={() => toggleChar(ch)}
                    className={`text-sm px-3 py-1.5 rounded border transition-all ${inputs[ch.field] === "yes" ? "bg-amber-100 border-amber-500 text-amber-900 dark:bg-amber-900 dark:text-amber-100" : "bg-muted/60 border-border text-muted-foreground hover:border-blue-400"}`}
                  >{inputs[ch.field] === "yes" ? "✓ " : ""}{ch.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* HPI yes/no questions */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            {config.hpiQuestions.map(q => (
              <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
            ))}
          </div>

          {/* ── 3. ROS ───────────────────────────────────────────────── */}
          <SectionHeader icon={<Activity className="h-4 w-4" />} label="Review of Systems — Associated Symptoms" step={3} />
          <div className="grid grid-cols-2 gap-2">
            {config.rosQuestions.map(q => (
              <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
            ))}
          </div>

          {/* ── 4. PMH ───────────────────────────────────────────────── */}
          <SectionHeader icon={<FileText className="h-4 w-4" />} label="Past Medical History" step={4} />
          <div className="grid grid-cols-2 gap-2">
            {config.pmhQuestions.map(q => (
              <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
            ))}
          </div>

          {/* ── 5. Family Hx ─────────────────────────────────────────── */}
          <SectionHeader icon={<Users className="h-4 w-4" />} label="Family History" step={5} />
          <div className="grid grid-cols-2 gap-2">
            {config.fhxQuestions.map(q => (
              <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
            ))}
          </div>

          {/* ── 6. Social ─────────────────────────────────────────────── */}
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

          {/* ── 7. Meds & Allergies ─────────────────────────────────── */}
          <SectionHeader icon={<Pill className="h-4 w-4" />} label="Medications & Allergies" step={7} />
          <div className="grid grid-cols-2 gap-2">
            {config.medsQuestions.map(q => (
              <YNToggle key={q.field} label={q.label} field={q.field} inputs={inputs} setInputs={setInputs} />
            ))}
          </div>

          {/* ── Run button at bottom ──────────────────────────────────── */}
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
              {activeRedFlags.map(rf => (
                <div key={rf.id} className="text-sm text-red-700 dark:text-red-300">⚠ {rf.label}</div>
              ))}
            </div>
          )}

          {/* Workup Cascade */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FlaskConical className="h-3.5 w-3.5" />Workup Indicated
            </div>
            <div className="grid grid-cols-2 gap-2">
              {config.workup.map(w => {
                const active = w.check(inputs);
                return (
                  <div key={w.id} className={`rounded-lg border p-2.5 flex items-start gap-2 ${active ? "border-blue-400 bg-blue-50/60 dark:bg-blue-950/40" : "border-border opacity-40"}`}>
                    <div className={active ? "text-blue-600" : "text-muted-foreground"}>
                      {WORKUP_ICONS[w.iconId] ?? <Activity className="h-4 w-4" />}
                    </div>
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
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" />Differential Assessment
              <span className="font-normal">(criteria update as you answer)</span>
            </div>
            <div className="space-y-2">
              {config.differentials.map(dx => (
                <DifferentialCard key={dx.id} dx={dx} inputs={inputs} />
              ))}
            </div>
          </div>

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
                <div className="font-bold text-sm">Pipeline: {result.finalDisposition}</div>
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
              <RuleEditor
                rule={selectedRule}
                onClose={() => setSelectedRule(null)}
                onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/master-rules"] }); }}
              />
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

      {/* ── Full-width: 13-Step Pipeline Trace ─────────────────────────── */}
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
