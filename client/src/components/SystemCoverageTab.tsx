/**
 * SystemCoverageTab.tsx
 *
 * Shows every complaint in kb_master_rules grouped by body system.
 * Each system card shows: system name, complaint count, rule coverage bars.
 * Each complaint row shows: rule type breakdown as mini coloured pips.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronUp, Search, AlertTriangle, CheckCircle2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Body system taxonomy ─────────────────────────────────────────────────────

interface SystemDef {
  key:      string;
  label:    string;
  emoji:    string;
  color:    string;        // tailwind border-l colour
  bgColor:  string;        // tailwind header bg
  match:    (id: string) => boolean;
}

const SYSTEMS: SystemDef[] = [
  {
    key: "cardiology", label: "Cardiology", emoji: "❤️",
    color: "border-l-red-500", bgColor: "bg-red-50 dark:bg-red-950",
    match: s => s.startsWith("cardio") || s.startsWith("card_") ||
      ["chest_pain", "palpitations", "syncope"].some(k => s.includes(k)),
  },
  {
    key: "pulmonology", label: "Pulmonology", emoji: "🫁",
    color: "border-l-sky-500", bgColor: "bg-sky-50 dark:bg-sky-950",
    match: s => s.startsWith("pulm_") || s === "cough" ||
      ["persistent_cough","shortness_of_breath","wheez","hemoptysis",
       "chest_tightness","asthma"].some(k => s.includes(k)),
  },
  {
    key: "ent", label: "ENT / Head & Neck", emoji: "👂",
    color: "border-l-amber-500", bgColor: "bg-amber-50 dark:bg-amber-950",
    match: s => s.startsWith("ent_") ||
      ["sore_throat","earache","sinus_pressure","dental","allergic_rhinitis",
       "neck_","epistaxis","hoarseness","nasal_","gum_",
       "vertigo","throat"].some(k => s.includes(k)),
  },
  {
    key: "gastroenterology", label: "Gastroenterology / GI", emoji: "🫀",
    color: "border-l-orange-500", bgColor: "bg-orange-50 dark:bg-orange-950",
    match: s => s.startsWith("gi_") || s.includes("abdominal_pain") ||
      ["constipation","diarrhea","vomit","rectal_bleed","jaundice",
       "pancreatitis","dysphagia","nausea_malaise","bariatric",
       "diffuse_abdominal"].some(k => s.includes(k)),
  },
  {
    key: "neurology", label: "Neurology", emoji: "🧠",
    color: "border-l-purple-500", bgColor: "bg-purple-50 dark:bg-purple-950",
    match: s => s.startsWith("neuro_") || s === "dizziness" ||
      ["headache","confusion","seizure","weakness_neuro","acute_focal",
       "ataxia","nystagmus","numbness","acute_rash"].some(k => s.includes(k)) &&
      !s.startsWith("derm"),
  },
  {
    key: "dermatology", label: "Dermatology", emoji: "🩹",
    color: "border-l-pink-500", bgColor: "bg-pink-50 dark:bg-pink-950",
    match: s => s.startsWith("derm_") || s.includes("skin_") || s === "rash" ||
      ["drug_rash","blisters","acne","scalp_","cellulitis",
       "pigmented_","sun_exposure","acute_rash"].some(k => s.includes(k)),
  },
  {
    key: "genitourinary", label: "Genitourinary (GU)", emoji: "🫘",
    color: "border-l-cyan-500", bgColor: "bg-cyan-50 dark:bg-cyan-950",
    match: s => s.startsWith("gu_") || s === "dysuria" ||
      ["urinary","testicular_pain","flank_pain","erectile",
       "hematuria","prostatitis","uti_"].some(k => s.includes(k)),
  },
  {
    key: "gynecology", label: "Gynecology (GYN)", emoji: "🌸",
    color: "border-l-rose-500", bgColor: "bg-rose-50 dark:bg-rose-950",
    match: s => s.startsWith("gyn_") ||
      ["female_pelvic","vaginal","hot_flash","irregular_menses",
       "postpartum","ovarian","pelvic_pain"].some(k => s.includes(k)) &&
      !s.startsWith("gu"),
  },
  {
    key: "musculoskeletal", label: "Musculoskeletal / Orthopedics", emoji: "🦴",
    color: "border-l-stone-500", bgColor: "bg-stone-50 dark:bg-stone-950",
    match: s => s.startsWith("msk_") || s.startsWith("ortho_") || s === "back_pain" ||
      ["acute_joint","bone_pain","sprain","fracture","laceration",
       "head_injury","foot_ulcer","joint_pain","abdominal_trauma"].some(k => s.includes(k)),
  },
  {
    key: "endocrine", label: "Endocrine / Metabolic", emoji: "⚗️",
    color: "border-l-lime-500", bgColor: "bg-lime-50 dark:bg-lime-950",
    match: s => s.startsWith("endo_") || s.startsWith("obesity_") ||
      ["high_blood_sugar","polyuria","hyperglycemia","hypoglycemia",
       "adrenal","thyroid","puberty","hirsutism","borderline_high",
       "fatigue_weight","weight_gain","weight_loss_","hyperpigmentation",
       "sweating_","cushing","insulin","postprandial","fasting_hypo",
       "recurrent_fasting","post_bariatric_surg","exercise_related",
       "poor_adherence_to_dm","infant_with_lethargy","infant_child"].some(k => s.includes(k)),
  },
  {
    key: "infectious", label: "Infectious Disease", emoji: "🦠",
    color: "border-l-green-600", bgColor: "bg-green-50 dark:bg-green-950",
    match: s => s.startsWith("id_") || s === "fever" ||
      ["fever_","animal_bite","insect_","marine_","wound_infection",
       "flu_like","meningococcemia","genital_infection"].some(k => s.includes(k)),
  },
  {
    key: "toxicology", label: "Toxicology / Environmental", emoji: "☢️",
    color: "border-l-yellow-500", bgColor: "bg-yellow-50 dark:bg-yellow-950",
    match: s => s.startsWith("tox_") || s.startsWith("environmental_") ||
      ["cold_exposure","cold_injury","heat_exposure","heat_illness",
       "altitude_","electrical_","pesticide_","plant_or","agricultural_",
       "air_pollutant","toxin_","possible_overdose","alcohol_withdrawal",
       "child_ingestion","ingestion_of","drowning","cryogenic","airborne_",
       "agitated_sweaty","agitated_tachy","confusion_ataxia"].some(k => s.includes(k)),
  },
  {
    key: "psychiatry", label: "Psychiatry / Behavioral Health", emoji: "🧩",
    color: "border-l-violet-500", bgColor: "bg-violet-50 dark:bg-violet-950",
    match: s => s.startsWith("psych_") || s === "anxiety" || s === "insomnia" ||
      ["severe_agitation","depression","psychosis","suicidal"].some(k => s.includes(k)),
  },
  {
    key: "ophthalmology", label: "Ophthalmology", emoji: "👁️",
    color: "border-l-indigo-500", bgColor: "bg-indigo-50 dark:bg-indigo-950",
    match: s => s.startsWith("ophtho_") ||
      ["red_watery_eye","red_painful_eye","vision_loss","eye_pain",
       "contact_lens"].some(k => s.includes(k)),
  },
  {
    key: "emergency", label: "Emergency / Trauma", emoji: "🚨",
    color: "border-l-red-700", bgColor: "bg-red-100 dark:bg-red-900",
    match: s =>
      ["anaphylaxis","angioedema","found_unresponsive","shock_",
       "severe_illness","found_un","severe_agitation"].some(k => s.includes(k)),
  },
  {
    key: "general", label: "General / Primary Care", emoji: "🏥",
    color: "border-l-slate-400", bgColor: "bg-slate-50 dark:bg-slate-900",
    match: () => true,   // catch-all — last in list
  },
];

function classifyComplaint(id: string): string {
  const s = id.toLowerCase();
  for (const sys of SYSTEMS) {
    if (sys.match(s)) return sys.key;
  }
  return "general";
}

// ─── Coverage quality ─────────────────────────────────────────────────────────

function coverageLevel(c: any): "full" | "partial" | "stub" {
  const total = Number(c.rule_cnt);
  const hasQ   = Number(c.questions)  > 0;
  const hasRF  = Number(c.red_flags)  > 0;
  const hasDx  = Number(c.diagnoses)  > 0;
  const hasDisp = Number(c.dispositions) > 0;
  if (total >= 8 && hasQ && (hasRF || hasDx) && hasDisp) return "full";
  if (total >= 3 && hasQ) return "partial";
  return "stub";
}

function CoverageChip({ level }: { level: "full" | "partial" | "stub" }) {
  if (level === "full")    return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Full coverage" />;
  if (level === "partial") return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" title="Partial coverage" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-red-400" title="Stub only" />;
}

// ─── Mini rule breakdown bar ───────────────────────────────────────────────────

function RuleBar({ c }: { c: any }) {
  const types = [
    { key: "red_flags",   label: "RF",  color: "bg-red-500" },
    { key: "questions",   label: "Q",   color: "bg-cyan-500" },
    { key: "diagnoses",   label: "Dx",  color: "bg-blue-500" },
    { key: "medications", label: "Rx",  color: "bg-green-500" },
    { key: "dispositions",label: "Disp",color: "bg-indigo-500" },
    { key: "workups",     label: "W",   color: "bg-teal-500" },
  ];
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {types.map(t => {
        const n = Number(c[t.key]);
        if (!n) return null;
        return (
          <span key={t.key} title={`${t.label}: ${n}`}
            className={`${t.color} text-white text-[9px] font-bold rounded px-1 leading-tight`}>
            {t.label} {n}
          </span>
        );
      })}
      {Number(c.critical) > 0 && (
        <span title={`${c.critical} CRITICAL`} className="bg-red-700 text-white text-[9px] font-bold rounded px-1 leading-tight">
          ⚠{c.critical}
        </span>
      )}
    </div>
  );
}

// ─── System card ───────────────────────────────────────────────────────────────

function SystemCard({ sys, complaints, search }: {
  sys: SystemDef;
  complaints: any[];
  search: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = search
    ? complaints.filter(c => c.complaint_id.includes(search))
    : complaints;

  if (filtered.length === 0 && search) return null;

  const fullCount    = complaints.filter(c => coverageLevel(c) === "full").length;
  const partialCount = complaints.filter(c => coverageLevel(c) === "partial").length;
  const stubCount    = complaints.filter(c => coverageLevel(c) === "stub").length;
  const totalRules   = complaints.reduce((n, c) => n + Number(c.rule_cnt), 0);
  const pctFull      = Math.round((fullCount / Math.max(complaints.length, 1)) * 100);

  return (
    <div className={`border-l-4 ${sys.color} border border-border rounded-lg overflow-hidden`}
      data-testid={`system-card-${sys.key}`}>
      {/* Header */}
      <button
        className={`w-full text-left px-4 py-3 flex items-center gap-3 ${sys.bgColor} hover:brightness-95 transition-all`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xl">{sys.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm flex items-center gap-2">
            {sys.label}
            <Badge variant="outline" className="text-xs">{complaints.length} complaints</Badge>
            <Badge variant="outline" className="text-xs">{totalRules} rules</Badge>
          </div>
          {/* Coverage bar */}
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
              <div className="bg-green-500 h-full transition-all" style={{ width: `${pctFull}%` }} />
              <div className="bg-yellow-400 h-full transition-all"
                style={{ width: `${Math.round((partialCount / Math.max(complaints.length, 1)) * 100)}%` }} />
              <div className="bg-red-400 h-full transition-all"
                style={{ width: `${Math.round((stubCount / Math.max(complaints.length, 1)) * 100)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {fullCount} full · {partialCount} partial · {stubCount} stub
            </span>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
               : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Complaint list */}
      {(open || search) && (
        <div className="divide-y">
          {filtered.map(c => {
            const level = coverageLevel(c);
            return (
              <div key={c.complaint_id}
                className="flex items-center gap-3 px-4 py-1.5 text-xs hover:bg-muted/30"
                data-testid={`complaint-row-${c.complaint_id}`}>
                <CoverageChip level={level} />
                <span className="font-mono text-muted-foreground w-56 truncate" title={c.complaint_id}>
                  {c.complaint_id}
                </span>
                <span className="text-muted-foreground w-12 text-right">{c.rule_cnt} rules</span>
                <RuleBar c={c} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SystemCoverageTab() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/master-rules/complaints"],
    queryFn: async () => {
      const r = await fetch("/api/master-rules/complaints", {
        credentials: "include", headers: authHeaders(),
      });
      return r.json();
    },
  });

  const complaints: any[] = data?.complaints ?? [];

  // Assign each complaint to one system (first match wins)
  const bySystem: Record<string, any[]> = {};
  for (const sys of SYSTEMS) bySystem[sys.key] = [];

  for (const c of complaints) {
    const s = c.complaint_id.toLowerCase();
    let placed = false;
    for (const sys of SYSTEMS.slice(0, -1)) {   // skip catch-all
      if (sys.match(s)) { bySystem[sys.key].push(c); placed = true; break; }
    }
    if (!placed) bySystem["general"].push(c);
  }

  const totalComplaints = complaints.length;
  const fullCount    = complaints.filter(c => coverageLevel(c) === "full").length;
  const partialCount = complaints.filter(c => coverageLevel(c) === "partial").length;
  const stubCount    = complaints.filter(c => coverageLevel(c) === "stub").length;
  const totalRules   = complaints.reduce((n, c) => n + Number(c.rule_cnt), 0);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <Loader2 className="animate-spin h-5 w-5" />Loading complaint coverage…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Systems", val: SYSTEMS.length - 1, color: "text-blue-600" },
          { label: "Total Complaints", val: totalComplaints, color: "text-slate-700" },
          { label: "Full Coverage", val: fullCount, color: "text-green-600" },
          { label: "Partial", val: partialCount, color: "text-yellow-600" },
          { label: "Stubs", val: stubCount, color: "text-red-500" },
        ].map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border rounded px-3 py-2 bg-muted/30">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" />Full — ≥8 rules, questions + red flag/Dx + disposition</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />Partial — ≥3 rules with questions</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Stub — needs expansion</span>
        <span className="ml-auto font-medium text-foreground">{totalRules.toLocaleString()} total rules</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-complaint-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search complaint IDs…"
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* System cards */}
      <div className="space-y-3">
        {SYSTEMS.map(sys => {
          const sc = bySystem[sys.key] ?? [];
          if (sc.length === 0 && !search) return null;
          return (
            <SystemCard
              key={sys.key}
              sys={sys}
              complaints={sc}
              search={search}
            />
          );
        })}
      </div>

      {/* Missing systems notice */}
      <div className="border border-dashed rounded-lg p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground">Gaps requiring expansion</div>
        {SYSTEMS.slice(0, -1).map(sys => {
          const sc = bySystem[sys.key] ?? [];
          const stubs = sc.filter(c => coverageLevel(c) === "stub").length;
          if (stubs === 0) return null;
          return (
            <div key={sys.key} className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              <span>{sys.emoji} {sys.label}: {stubs} stub complaint{stubs > 1 ? "s" : ""} need rules</span>
            </div>
          );
        })}
        {SYSTEMS.slice(0, -1).every(sys => (bySystem[sys.key] ?? []).filter(c => coverageLevel(c) === "stub").length === 0) && (
          <div className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" />No stubs — all complaints have at least partial coverage.</div>
        )}
      </div>
    </div>
  );
}
