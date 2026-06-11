import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, ChevronRight, AlertTriangle, Activity, Pill, FlaskConical,
  HelpCircle, FileText, Stethoscope, ShieldAlert, TriangleAlert, Info,
  Loader2, GitBranch, X, ChevronDown, ChevronUp, Heart
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ComplaintSummary {
  complaint_id: string;
  dx_count: number;
  disp_count: number;
  red_flag_count: number;
  med_count: number;
  workup_count: number;
  question_count: number;
  critical_dx: number;
  high_dx: number;
  cannot_miss_count: number;
  linked_disp_count: number;
  dispositions: string[] | null;
}

interface Differential {
  rule_id: string;
  rule_name: string;
  diagnosis_id: string;
  icd10: string | null;
  safety_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  confidence_weight: string;
  cannot_miss: string | null;
  base_probability: string | null;
  diagnostic_criteria: string | null;
  key_questions: string[] | null;
  disposition: string | null;
  trigger_condition: string | null;
  disp_safety: string | null;
}

interface ComplaintLevel {
  rule_id: string;
  rule_name: string;
  disposition_impact: string | null;
  safety_level: string;
  outputs: Record<string, any> | null;
  priority: number;
}

interface StageCounts {
  dx_count: string;
  disp_count: string;
  red_flag_count: string;
  med_count: string;
  workup_count: string;
  question_count: string;
  plan_count: string;
}

interface ComplaintDetail {
  ok: boolean;
  complaintId: string;
  differentials: Differential[];
  dispositions: ComplaintLevel[];
  stageCounts: StageCounts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtComplaint(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

type DispTier = "er_now" | "er" | "uc" | "pc" | "home" | "unknown";
interface DispInfo { tier: DispTier; label: string }

function classifyDisposition(raw: string | null | undefined): DispInfo {
  if (!raw || raw === "" || raw === "none") return { tier: "home", label: "Home / Obs" };
  const u = raw.toUpperCase();
  if (/ER_NOW|ED_NOW|ER\s*\/\s*ICU|\bICU\b/.test(u)) return { tier: "er_now", label: "ER Now / ICU" };
  if (/UC\s*(OR|→|\/)\s*ER|ER_SEND|\bER\b|EMERGENCY/.test(u)) return { tier: "er", label: "ER" };
  if (/URGENT_CARE|URGENT\s*CARE|\bUC\b/.test(u)) return { tier: "uc", label: "Urgent Care" };
  if (/PRIMARY\s*CARE|OUTPATIENT|\bPC\b/.test(u)) return { tier: "pc", label: "Outpatient" };
  if (/HOME_CARE|HOME\s*CARE|ROUTINE/.test(u)) return { tier: "home", label: "Home Care" };
  return { tier: "unknown", label: raw.length > 22 ? raw.slice(0, 22) + "…" : raw };
}

const TIER_COLORS: Record<DispTier, string> = {
  er_now:  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300",
  er:      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300",
  uc:      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300",
  pc:      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300",
  home:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300",
};

const SAFETY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  HIGH:     "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  MODERATE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  LOW:      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function topDispTier(dispositions: string[] | null): DispTier {
  if (!dispositions || dispositions.length === 0) return "unknown";
  const tiers: DispTier[] = dispositions.map(d => classifyDisposition(d).tier);
  const order: DispTier[] = ["er_now", "er", "uc", "pc", "home", "unknown"];
  for (const t of order) if (tiers.includes(t)) return t;
  return "unknown";
}

// ── Stat bar (mini horizontal bar) ────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Stage chip ─────────────────────────────────────────────────────────────────
function StageChip({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${color}`}>
      {icon}
      <span className="font-bold">{value}</span>
      <span className="opacity-75">{label}</span>
    </div>
  );
}

// ── Differential row ──────────────────────────────────────────────────────────
function DxRow({ dx, index }: { dx: Differential; index: number }) {
  const [open, setOpen] = useState(false);
  const disp = classifyDisposition(dx.disposition);
  const cannotMiss = dx.cannot_miss === "true";
  const prob = dx.base_probability ? parseFloat(dx.base_probability) : null;
  const conf = parseFloat(dx.confidence_weight ?? "0");

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors
          ${index % 2 === 0 ? "bg-white dark:bg-gray-950" : "bg-gray-50/60 dark:bg-gray-900/40"}
          hover:bg-blue-50/60 dark:hover:bg-blue-950/30`}
        onClick={() => setOpen(o => !o)}
        data-testid={`dx-row-${dx.rule_id}`}
      >
        {/* expand icon */}
        <td className="w-6 pl-2 py-2.5">
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </td>

        {/* differential name */}
        <td className="py-2.5 pr-3 max-w-[220px]">
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 leading-tight break-words">
              {dx.diagnosis_id}
            </span>
            {cannotMiss && (
              <span title="Cannot miss" className="text-red-500">
                <AlertTriangle className="h-3 w-3 inline" />
              </span>
            )}
          </div>
          {dx.icd10 && (
            <span className="text-[10px] text-gray-400 font-mono">{dx.icd10}</span>
          )}
        </td>

        {/* safety */}
        <td className="py-2.5 pr-3">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${SAFETY_COLORS[dx.safety_level] ?? "bg-gray-100 text-gray-600"}`}>
            {dx.safety_level}
          </span>
        </td>

        {/* cannot miss */}
        <td className="py-2.5 pr-3 text-center">
          {cannotMiss
            ? <span className="text-red-500 text-[11px] font-bold">⚠ YES</span>
            : <span className="text-gray-300 text-[11px]">—</span>}
        </td>

        {/* base probability */}
        <td className="py-2.5 pr-3 text-right">
          <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
            {prob !== null ? `${Math.round(prob * 100)}%` : conf > 0 ? `${Math.round(conf * 100)}%` : "—"}
          </span>
        </td>

        {/* disposition */}
        <td className="py-2.5 pr-3">
          {dx.disposition
            ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${TIER_COLORS[disp.tier]}`}>
                {disp.label}
              </span>
            )
            : <span className="text-[10px] text-gray-300">—</span>
          }
        </td>
      </tr>

      {open && (
        <tr className="border-b border-gray-100 dark:border-gray-800 bg-blue-50/40 dark:bg-blue-950/20">
          <td />
          <td colSpan={5} className="py-3 pr-4">
            <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
              {dx.trigger_condition && (
                <div>
                  <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Trigger: </span>
                  <code className="font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded text-[10px]">
                    {dx.trigger_condition}
                  </code>
                </div>
              )}
              {dx.diagnostic_criteria && (
                <div>
                  <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wide block mb-0.5">Criteria</span>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{dx.diagnostic_criteria}</p>
                </div>
              )}
              {dx.key_questions && dx.key_questions.length > 0 && (
                <div>
                  <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wide block mb-1">Key Questions</span>
                  <ul className="list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
                    {dx.key_questions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}
              {!dx.diagnostic_criteria && !dx.trigger_condition && (!dx.key_questions || dx.key_questions.length === 0) && (
                <span className="text-gray-400 italic">No additional detail available.</span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Overview panel (no complaint selected) ────────────────────────────────────
function OverviewPanel() {
  const globalStats = {
    complaints: 1025,
    differentials: 2579,
    cannotMiss: 465,
    dispositionRules: 658,
    linked: 241,
    critical: 482,
    high: 492,
    moderate: 1362,
    low: 243,
    er: 238,
    uc: 161,
    pc: 51,
    home: 45,
  };
  const totalSafety = globalStats.critical + globalStats.high + globalStats.moderate + globalStats.low;
  const totalDisp = globalStats.er + globalStats.uc + globalStats.pc + globalStats.home;

  const dispBars = [
    { label: "ER / ICU",     value: globalStats.er,   color: "bg-red-500",    tier: "er_now" as DispTier },
    { label: "Urgent Care",  value: globalStats.uc,   color: "bg-orange-400", tier: "uc"    as DispTier },
    { label: "Outpatient",   value: globalStats.pc,   color: "bg-blue-400",   tier: "pc"    as DispTier },
    { label: "Home / Obs",   value: globalStats.home, color: "bg-green-400",  tier: "home"  as DispTier },
  ];

  const safetyBars = [
    { label: "CRITICAL", value: globalStats.critical, color: "bg-red-500" },
    { label: "HIGH",     value: globalStats.high,     color: "bg-orange-400" },
    { label: "MODERATE", value: globalStats.moderate, color: "bg-yellow-400" },
    { label: "LOW",      value: globalStats.low,      color: "bg-green-400" },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center p-10 gap-8 text-center">
      <div>
        <GitBranch className="h-12 w-12 text-indigo-400 mx-auto mb-3" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Differential Disposition Atlas</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-md">
          Select any of the <strong>{globalStats.complaints.toLocaleString()}</strong> chief complaints to see every
          differential and its recommended care level — all driven by the master rule engine.
        </p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
        {[
          { label: "Chief Complaints", value: globalStats.complaints.toLocaleString(), color: "text-indigo-600" },
          { label: "Differentials",    value: globalStats.differentials.toLocaleString(), color: "text-blue-600" },
          { label: "Cannot-Miss Dx",  value: globalStats.cannotMiss.toLocaleString(), color: "text-red-600" },
          { label: "Linked Dispositions", value: `${globalStats.linked}`, color: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Disposition breakdown */}
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Disposition Distribution</h3>
        <div className="space-y-2.5">
          {dispBars.map(b => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 dark:text-gray-400 w-24 text-right shrink-0">{b.label}</span>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.round((b.value / totalDisp) * 100)}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-8 tabular-nums">{b.value}</span>
              <span className="text-[10px] text-gray-400 w-8 tabular-nums">{Math.round((b.value / totalDisp) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Safety breakdown */}
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Differential Safety Distribution</h3>
        <div className="space-y-2.5">
          {safetyBars.map(b => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 dark:text-gray-400 w-24 text-right shrink-0">{b.label}</span>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.round((b.value / totalSafety) * 100)}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-8 tabular-nums">{b.value}</span>
              <span className="text-[10px] text-gray-400 w-8 tabular-nums">{Math.round((b.value / totalSafety) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DifferentialDispositionPage() {
  const [selected, setSelected]   = useState<string | null>(null);
  const [search,   setSearch]     = useState("");
  const [dispFilter, setDispFilter] = useState<DispTier | "all">("all");
  const [expandedDx, setExpandedDx] = useState<string | null>(null);

  // ── Summary query ────────────────────────────────────────────────────────
  const { data: summaryData, isLoading: summaryLoading } = useQuery<{
    ok: boolean; complaints: ComplaintSummary[]; total: number;
  }>({ queryKey: ["/api/complaint-test-lab/diff-disposition/summary"] });

  // ── Detail query ─────────────────────────────────────────────────────────
  const { data: detailData, isLoading: detailLoading } = useQuery<ComplaintDetail>({
    queryKey: ["/api/complaint-test-lab/diff-disposition", selected],
    enabled: !!selected,
  });

  const complaints = summaryData?.complaints ?? [];

  // Filtered & searched list
  const filtered = useMemo(() => {
    let list = complaints;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.complaint_id.toLowerCase().includes(q));
    }
    if (dispFilter !== "all") {
      list = list.filter(c => topDispTier(c.dispositions) === dispFilter);
    }
    return list;
  }, [complaints, search, dispFilter]);

  const maxDx = Math.max(...complaints.map(c => Number(c.dx_count)), 1);

  const stages = detailData ? [
    { label: "Differentials",  value: Number(detailData.stageCounts.dx_count),       icon: <Stethoscope className="h-3.5 w-3.5" />,   color: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700" },
    { label: "Dispositions",   value: Number(detailData.stageCounts.disp_count),      icon: <GitBranch className="h-3.5 w-3.5" />,     color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700" },
    { label: "Red Flags",      value: Number(detailData.stageCounts.red_flag_count),  icon: <ShieldAlert className="h-3.5 w-3.5" />,   color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700" },
    { label: "Medications",    value: Number(detailData.stageCounts.med_count),       icon: <Pill className="h-3.5 w-3.5" />,          color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700" },
    { label: "Workups",        value: Number(detailData.stageCounts.workup_count),    icon: <FlaskConical className="h-3.5 w-3.5" />,  color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700" },
    { label: "Questions",      value: Number(detailData.stageCounts.question_count),  icon: <HelpCircle className="h-3.5 w-3.5" />,   color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700" },
    { label: "Plans",          value: Number(detailData.stageCounts.plan_count),      icon: <FileText className="h-3.5 w-3.5" />,     color: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600" },
  ] : [];

  const FILTER_BUTTONS: { label: string; value: DispTier | "all"; dot: string }[] = [
    { label: "All",      value: "all",    dot: "bg-gray-400" },
    { label: "ER/ICU",   value: "er_now", dot: "bg-red-500" },
    { label: "ER",       value: "er",     dot: "bg-orange-500" },
    { label: "UC",       value: "uc",     dot: "bg-yellow-500" },
    { label: "PC/Out",   value: "pc",     dot: "bg-blue-500" },
    { label: "Home",     value: "home",   dot: "bg-green-500" },
  ];

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ── LEFT PANEL: complaint list ──────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* header */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Chief Complaints</span>
            {summaryLoading
              ? <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin ml-auto" />
              : <span className="ml-auto text-xs text-gray-400">{filtered.length}/{complaints.length}</span>
            }
          </div>

          {/* search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search complaints…"
              className="pl-8 h-8 text-xs"
              data-testid="input-complaint-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-gray-400" />
              </button>
            )}
          </div>

          {/* disposition filter pills */}
          <div className="flex flex-wrap gap-1 mt-2">
            {FILTER_BUTTONS.map(f => (
              <button
                key={f.value}
                onClick={() => setDispFilter(f.value)}
                data-testid={`filter-disp-${f.value}`}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors
                  ${dispFilter === f.value
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {summaryLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-gray-400 text-center">No complaints match.</div>
          ) : (
            filtered.map(c => {
              const tier = topDispTier(c.dispositions);
              const isActive = selected === c.complaint_id;
              return (
                <button
                  key={c.complaint_id}
                  onClick={() => setSelected(c.complaint_id)}
                  data-testid={`complaint-item-${c.complaint_id}`}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 dark:border-gray-800 transition-colors
                    ${isActive
                      ? "bg-indigo-50 dark:bg-indigo-950/50 border-l-2 border-l-indigo-500"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className={`text-xs font-medium leading-tight ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-gray-200"}`}>
                      {fmtComplaint(c.complaint_id)}
                    </span>
                    {tier !== "unknown" && (
                      <span className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded border ${TIER_COLORS[tier]}`}>
                        {tier === "er_now" ? "ER!" : tier === "er" ? "ER" : tier === "uc" ? "UC" : tier === "pc" ? "PC" : "Home"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <MiniBar value={Number(c.dx_count)} max={maxDx} color="bg-indigo-400" />
                    <span className="text-[10px] text-gray-400 shrink-0">{c.dx_count} dx</span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {Number(c.critical_dx) > 0 && (
                      <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full font-semibold">
                        {c.critical_dx} CRIT
                      </span>
                    )}
                    {Number(c.cannot_miss_count) > 0 && (
                      <span className="text-[9px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                        ⚠ {c.cannot_miss_count} miss
                      </span>
                    )}
                    {Number(c.red_flag_count) > 0 && (
                      <span className="text-[9px] bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                        🚩 {c.red_flag_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <OverviewPanel />
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          </div>
        ) : !detailData?.ok ? (
          <div className="p-8 text-red-500 text-sm">Failed to load complaint detail.</div>
        ) : (
          <div className="p-5 space-y-5">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                  {fmtComplaint(detailData.complaintId)}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chief complaint · {detailData.differentials.length} differentials ·{" "}
                  {detailData.differentials.filter(d => d.cannot_miss === "true").length} cannot-miss
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)} className="text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>

            {/* ── Pipeline stage chips ────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              {stages.map(s => (
                <StageChip key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
              ))}
            </div>

            {/* ── Complaint-level disposition rules ──────────────────────── */}
            {detailData.dispositions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Complaint-Level Disposition Rules ({detailData.dispositions.length})
                </h3>
                <div className="space-y-2">
                  {detailData.dispositions.map(d => {
                    const dInfo = classifyDisposition(d.disposition_impact);
                    const when = (d.outputs as any)?.when as string | undefined;
                    return (
                      <div key={d.rule_id} className="flex items-start gap-3 text-xs">
                        <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${TIER_COLORS[dInfo.tier]}`}>
                          {dInfo.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{d.rule_name}</span>
                          {when && (
                            <code className="ml-2 text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1 rounded">
                              {when}
                            </code>
                          )}
                        </div>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold ${SAFETY_COLORS[d.safety_level] ?? "bg-gray-100 text-gray-600"}`}>
                          {d.safety_level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Differentials table ────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Differentials with Disposition ({detailData.differentials.length})
                </h3>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> = Cannot Miss</span>
                  <span>Click row to expand</span>
                </div>
              </div>

              {detailData.differentials.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No differentials found for this complaint.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" data-testid="differentials-table">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                        <th className="w-6 pl-2 py-2" />
                        <th className="py-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Differential</th>
                        <th className="py-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Safety</th>
                        <th className="py-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center">Can't Miss</th>
                        <th className="py-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Prob</th>
                        <th className="py-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Disposition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.differentials.map((dx, i) => (
                        <DxRow key={`${dx.rule_id}-${i}`} dx={dx} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Legend ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
              <span className="font-semibold text-gray-400 uppercase tracking-wider mr-1">Legend:</span>
              {[
                { label: "ER Now / ICU",  color: TIER_COLORS.er_now },
                { label: "ER",            color: TIER_COLORS.er     },
                { label: "Urgent Care",   color: TIER_COLORS.uc     },
                { label: "Outpatient",    color: TIER_COLORS.pc     },
                { label: "Home / Obs",    color: TIER_COLORS.home   },
              ].map(l => (
                <span key={l.label} className={`px-2 py-0.5 rounded border font-medium ${l.color}`}>{l.label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
