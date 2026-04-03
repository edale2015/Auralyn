import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Star, TriangleAlert, ChevronDown, ChevronRight,
  Check, ArrowUp, RefreshCw, Users, Clock,
  Filter, Search, X
} from "lucide-react";
import { AmbientHealthBar } from "@/components/physician/AmbientHealthBar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientCase {
  id: string;
  patientName: string;
  age: number | null;
  complaintKey: string;
  disposition: string;
  confidence: number;
  debateOutcome: string;
  debateRationale: string;
  diagnoses: string[];
  hasPopulationFlags: boolean;
  hasRedFlags: boolean;
  populationFlagLabels: string[];
  redFlagLabels: string[];
  erNowMessage: string | null;
  status: string;
  queuedAt: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  tierSlaMinutes: number;
  tierRationale: string;
  batchEligible: boolean;
  channel: string;
  priorOverrideExists: boolean;
  followUp: boolean;
}

interface QueueResponse {
  cases: PatientCase[];
  total: number;
  tierCounts: Record<string, number>;
  batchEligibleCount: number;
}

type FilterMode = "all" | "redflags" | "followup" | "t1" | "t2" | "t3";

const OVERRIDE_REASONS = [
  "DIFFERENT_DIAGNOSIS",
  "RISK_TOLERANCE_OVERRIDE",
  "PATIENT_PREFERENCE",
  "COMORBIDITY_ADJUSTMENT",
  "MEDICATION_CONSIDERATION",
  "SOCIAL_DETERMINANTS",
  "CLINICAL_INTUITION",
  "ADDITIONAL_FINDINGS",
  "PATIENT_HISTORY",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waitLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function slaBreached(queuedAt: string, slaMinutes: number): boolean {
  const mins = (Date.now() - new Date(queuedAt).getTime()) / 60000;
  return mins > slaMinutes;
}

function dispositionColor(d: string): string {
  if (d === "ER_NOW") return "bg-red-600 text-white";
  if (d === "URGENT_CARE") return "bg-orange-500 text-white";
  if (d === "HOME_CARE") return "bg-emerald-600 text-white";
  if (d === "FOLLOW_UP") return "bg-blue-500 text-white";
  if (d === "MONITOR") return "bg-yellow-500 text-white";
  return "bg-gray-500 text-white";
}

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    whatsapp: "WA", telegram: "TG", web: "Web", chatgpt: "GPT",
    voice: "Voice", sms: "SMS",
  };
  return map[ch] ?? ch.toUpperCase().slice(0, 4);
}

function channelColor(ch: string): string {
  const map: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-800",
    telegram: "bg-blue-100 text-blue-800",
    web: "bg-purple-100 text-purple-800",
    chatgpt: "bg-teal-100 text-teal-800",
    voice: "bg-orange-100 text-orange-800",
    sms: "bg-gray-100 text-gray-800",
  };
  return map[ch] ?? "bg-gray-100 text-gray-700";
}

function rowBg(c: PatientCase): string {
  if (c.hasRedFlags || c.erNowMessage) return "bg-red-50 dark:bg-red-950/25 border-l-4 border-red-500";
  if (c.followUp) return "bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-400";
  if (c.tier === 3) return "bg-orange-50/50 dark:bg-orange-950/10 border-l-4 border-orange-400";
  if (c.tier === 2) return "border-l-4 border-yellow-300";
  return "border-l-4 border-transparent";
}

function truncate(s: string, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatComplaint(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── TierDot ──────────────────────────────────────────────────────────────────

function TierDot({ tier }: { tier: 1 | 2 | 3 }) {
  if (tier === 3) return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
    </span>
  );
  if (tier === 2) return <span className="inline-flex rounded-full h-3 w-3 bg-amber-400" />;
  return <span className="inline-flex rounded-full h-3 w-3 bg-emerald-400" />;
}

// ─── ExpandedDetail ───────────────────────────────────────────────────────────

function ExpandedDetail({
  c, onApprove, onEscalate, onOverride, approving, escalating, overriding,
}: {
  c: PatientCase;
  onApprove: () => void;
  onEscalate: () => void;
  onOverride: (reason: string, text: string, disp: string) => void;
  approving: boolean; escalating: boolean; overriding: boolean;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState(OVERRIDE_REASONS[0]);
  const [freeText, setFreeText] = useState("");
  const [newDisp, setNewDisp] = useState("HOME_CARE");
  const breached = slaBreached(c.queuedAt, c.tierSlaMinutes);

  return (
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {c.debateRationale && (
          <div className="col-span-2 md:col-span-3">
            <span className="font-semibold text-slate-500 uppercase tracking-wide">HPI / Clinical Reasoning</span>
            <p className="mt-0.5 text-slate-700 dark:text-slate-300 leading-relaxed">{c.debateRationale}</p>
          </div>
        )}
        {c.diagnoses.length > 0 && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wide">All Differentials</span>
            <p className="mt-0.5 text-slate-700 dark:text-slate-300">{c.diagnoses.join(" · ")}</p>
          </div>
        )}
        {c.redFlagLabels.length > 0 && (
          <div>
            <span className="font-semibold text-red-500 uppercase tracking-wide">Red Flags</span>
            <p className="mt-0.5 text-red-700 dark:text-red-400">{c.redFlagLabels.join(", ")}</p>
          </div>
        )}
        {c.populationFlagLabels.length > 0 && (
          <div>
            <span className="font-semibold text-orange-500 uppercase tracking-wide">Population Flags</span>
            <p className="mt-0.5 text-orange-700 dark:text-orange-400">{c.populationFlagLabels.join(", ")}</p>
          </div>
        )}
        {c.erNowMessage && (
          <div className="col-span-2 md:col-span-3">
            <span className="font-semibold text-red-600 uppercase tracking-wide">ER Now Alert</span>
            <p className="mt-0.5 text-red-700 font-medium">{c.erNowMessage}</p>
          </div>
        )}
        <div>
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Tier Rationale</span>
          <p className="mt-0.5 text-slate-600 dark:text-slate-400">{c.tierRationale}</p>
        </div>
        <div>
          <span className="font-semibold text-slate-500 uppercase tracking-wide">SLA</span>
          <p className={`mt-0.5 font-medium ${breached ? "text-red-600" : "text-slate-600 dark:text-slate-400"}`}>
            {c.tierSlaMinutes < 60 ? `${c.tierSlaMinutes}min` : `${c.tierSlaMinutes / 60}h`}
            {breached && " — BREACHED"}
          </p>
        </div>
        {c.priorOverrideExists && (
          <div>
            <span className="font-semibold text-purple-500 uppercase tracking-wide">Prior Override</span>
            <p className="mt-0.5 text-purple-600 dark:text-purple-400">Similar case was previously overridden</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
          onClick={onApprove} disabled={approving} data-testid={`expand-approve-${c.id}`}>
          <Check className="h-3 w-3 mr-1" />
          {approving ? "Approving…" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-7 text-xs"
          onClick={onEscalate} disabled={escalating} data-testid={`expand-escalate-${c.id}`}>
          <ArrowUp className="h-3 w-3 mr-1" />
          {escalating ? "Escalating…" : "Escalate"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600"
          onClick={() => setShowOverride(v => !v)} data-testid={`expand-override-toggle-${c.id}`}>
          Override {showOverride ? "▲" : "▼"}
        </Button>
      </div>

      {showOverride && (
        <div className="flex items-end gap-2 flex-wrap pt-1">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-7 text-xs w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">New Disposition</label>
            <Select value={newDisp} onValueChange={setNewDisp}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["HOME_CARE", "FOLLOW_UP", "URGENT_CARE", "ER_NOW", "MONITOR"].map(d => (
                  <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-48">
            <label className="text-xs text-slate-500">Clinical note</label>
            <Input className="h-7 text-xs" placeholder="Optional justification…" value={freeText}
              onChange={e => setFreeText(e.target.value)} />
          </div>
          <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => onOverride(reason, freeText, newDisp)} disabled={overriding}
            data-testid={`expand-override-submit-${c.id}`}>
            {overriding ? "Saving…" : "Submit Override"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── PatientRow ───────────────────────────────────────────────────────────────

function PatientRow({
  c, selected, expanded, onSelect, onExpand, onFlag,
  onApprove, onEscalate, onOverride,
  approving, escalating, overriding, flagging,
}: {
  c: PatientCase;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
  onFlag: () => void;
  onApprove: () => void;
  onEscalate: () => void;
  onOverride: (r: string, t: string, d: string) => void;
  approving: boolean; escalating: boolean; overriding: boolean; flagging: boolean;
}) {
  const breached = slaBreached(c.queuedAt, c.tierSlaMinutes);

  return (
    <>
      <tr
        className={`group h-10 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer ${rowBg(c)}`}
        onClick={onExpand}
        data-testid={`patient-row-${c.id}`}
      >
        {/* Select */}
        <td className="w-9 pl-2 pr-1" onClick={e => { e.stopPropagation(); onSelect(); }}>
          <Checkbox checked={selected} onCheckedChange={onSelect}
            data-testid={`select-${c.id}`} className="h-3.5 w-3.5" />
        </td>

        {/* Expand arrow */}
        <td className="w-6 px-0 text-slate-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>

        {/* Tier */}
        <td className="w-10 px-1 text-center">
          <TierDot tier={c.tier} />
        </td>

        {/* Follow-up star */}
        <td className="w-9 px-0 text-center" onClick={e => { e.stopPropagation(); onFlag(); }}>
          <button disabled={flagging} className="group/star" data-testid={`flag-${c.id}`}
            aria-label={c.followUp ? "Remove follow-up flag" : "Mark for follow-up"}>
            <Star className={`h-3.5 w-3.5 transition-colors ${c.followUp ? "fill-amber-400 text-amber-400" : "text-slate-300 group-hover/star:text-amber-300"}`} />
          </button>
        </td>

        {/* Patient */}
        <td className="min-w-32 max-w-44 px-2 pr-3">
          <div className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
            {c.patientName}
          </div>
          <div className="text-[10px] text-slate-400">{c.age != null ? `${c.age}y` : "—"}</div>
        </td>

        {/* Channel */}
        <td className="w-14 px-1">
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${channelColor(c.channel)}`}>
            {channelLabel(c.channel)}
          </span>
        </td>

        {/* Complaint */}
        <td className="min-w-28 max-w-36 px-2">
          <span className="text-xs text-slate-700 dark:text-slate-200 truncate block leading-tight" title={c.complaintKey}>
            {truncate(formatComplaint(c.complaintKey), 28)}
          </span>
        </td>

        {/* HPI / Debate rationale */}
        <td className="min-w-48 max-w-64 px-2 hidden lg:table-cell">
          <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate block leading-tight" title={c.debateRationale}>
            {truncate(c.debateRationale, 72)}
          </span>
        </td>

        {/* Differential Diagnoses */}
        <td className="min-w-44 max-w-56 px-2 hidden md:table-cell">
          <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate block leading-tight"
            title={c.diagnoses.join(", ")}>
            {c.diagnoses.length > 0 ? truncate(c.diagnoses.slice(0, 3).join(", "), 52) : "—"}
          </span>
        </td>

        {/* 2° Questions / Tier rationale */}
        <td className="min-w-36 max-w-48 px-2 hidden xl:table-cell">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block leading-tight"
            title={c.tierRationale}>
            {truncate(c.tierRationale, 46)}
          </span>
        </td>

        {/* Findings / Flags */}
        <td className="min-w-32 max-w-44 px-2 hidden xl:table-cell">
          <div className="flex flex-wrap gap-0.5">
            {c.hasRedFlags && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded-sm font-medium">
                <TriangleAlert className="h-2.5 w-2.5" /> Red Flag
              </span>
            )}
            {c.hasPopulationFlags && (
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded-sm font-medium">
                Pop Risk
              </span>
            )}
            {c.erNowMessage && (
              <span className="text-[10px] bg-red-600 text-white px-1 py-0.5 rounded-sm font-bold">
                ER NOW
              </span>
            )}
            {!c.hasRedFlags && !c.hasPopulationFlags && !c.erNowMessage && (
              <span className="text-[10px] text-slate-400">—</span>
            )}
          </div>
        </td>

        {/* Disposition */}
        <td className="w-28 px-2">
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${dispositionColor(c.disposition)}`}>
            {c.disposition.replace(/_/g, " ")}
          </span>
        </td>

        {/* Confidence */}
        <td className="w-14 px-1 text-center">
          <span className={`text-xs font-mono font-medium ${c.confidence >= 0.85 ? "text-emerald-600" : c.confidence >= 0.65 ? "text-yellow-600" : "text-red-500"}`}>
            {Math.round(c.confidence * 100)}%
          </span>
        </td>

        {/* Wait */}
        <td className="w-16 px-1 text-center">
          <span className={`text-[11px] font-medium ${breached ? "text-red-500 font-bold" : "text-slate-500"}`}>
            {waitLabel(c.queuedAt)}
            {breached && <span className="block text-[9px] text-red-500 leading-none">SLA!</span>}
          </span>
        </td>

        {/* Inline actions */}
        <td className="w-20 px-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onApprove} disabled={approving}
              className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors"
              title="Approve" data-testid={`row-approve-${c.id}`}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEscalate} disabled={escalating}
              className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
              title="Escalate" data-testid={`row-escalate-${c.id}`}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr data-testid={`expanded-row-${c.id}`}>
          <td colSpan={15} className="p-0">
            <ExpandedDetail c={c} onApprove={onApprove} onEscalate={onEscalate} onOverride={onOverride}
              approving={approving} escalating={escalating} overriding={overriding} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── BatchBar ─────────────────────────────────────────────────────────────────

function BatchBar({ selected, eligible, onBatchApprove, isPending }: {
  selected: string[];
  eligible: number;
  onBatchApprove: (pin: string) => void;
  isPending: boolean;
}) {
  const [pin, setPin] = useState("");
  if (selected.length === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900 text-white border-t border-slate-700 px-6 py-3 flex items-center gap-4">
      <span className="text-sm font-medium">{selected.length} selected · {eligible} batch-eligible</span>
      <div className="flex-1" />
      <Input
        type="password"
        placeholder="PIN / password to sign…"
        className="w-52 h-8 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 text-sm"
        value={pin}
        onChange={e => setPin(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && pin) onBatchApprove(pin); }}
        data-testid="batch-pin-input"
      />
      <Button
        disabled={!pin || isPending || eligible === 0}
        onClick={() => onBatchApprove(pin)}
        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
        data-testid="batch-approve-button"
      >
        {isPending ? "Signing…" : `Batch Sign ${eligible} eligible`}
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PatientGridPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all pending cases
  const { data, isLoading, refetch } = useQuery<QueueResponse>({
    queryKey: ["/api/command-strip/queue", { limit: 500 }],
    queryFn: () => fetch("/api/command-strip/queue?limit=500").then(r => r.json()),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const allCases: PatientCase[] = data?.cases ?? [];

  // Client-side filtering
  const filtered = useMemo(() => {
    let list = allCases;
    if (filter === "redflags") list = list.filter(c => c.hasRedFlags || !!c.erNowMessage);
    else if (filter === "followup") list = list.filter(c => c.followUp);
    else if (filter === "t1") list = list.filter(c => c.tier === 1);
    else if (filter === "t2") list = list.filter(c => c.tier === 2);
    else if (filter === "t3") list = list.filter(c => c.tier === 3);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.patientName.toLowerCase().includes(q) ||
        c.complaintKey.toLowerCase().includes(q) ||
        c.disposition.toLowerCase().includes(q) ||
        c.diagnoses.some(d => d.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allCases, filter, search]);

  const eligibleInSelection = useMemo(
    () => filtered.filter(c => selected.has(c.id) && c.batchEligible).length,
    [filtered, selected]
  );

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/command-strip/queue"] });
  }, [qc]);

  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/command-strip/cases/${id}/approve`, {}),
    onSuccess: (_, id) => {
      toast({ title: "Approved", description: `Case approved.` });
      invalidate();
      if (expanded === id) setExpanded(null);
    },
  });

  const escalateMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/command-strip/cases/${id}/escalate`, {}),
    onSuccess: () => { toast({ title: "Escalated" }); invalidate(); },
  });

  const overrideMut = useMutation({
    mutationFn: ({ id, reason, text, disp }: { id: string; reason: string; text: string; disp: string }) =>
      apiRequest("POST", `/api/command-strip/cases/${id}/override`, {
        reasonCategory: reason, freeText: text, newDisposition: disp,
      }),
    onSuccess: () => { toast({ title: "Override recorded" }); invalidate(); },
  });

  const flagMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/command-strip/cases/${id}/flag`, {}),
    onSuccess: (_, id) => {
      const c = allCases.find(x => x.id === id);
      toast({ title: c?.followUp ? "Follow-up cleared" : "Marked for follow-up" });
      invalidate();
    },
  });

  const batchMut = useMutation({
    mutationFn: ({ caseIds, pin }: { caseIds: string[]; pin: string }) =>
      apiRequest("POST", "/api/command-strip/batch-approve", {
        caseIds,
        passwordOrPin: pin,
        selectionCriteria: "CONSENSUS HOME_CARE confidence>=0.85 no-flags",
      }),
    onSuccess: (res: any) => {
      toast({ title: `Batch signed — ${res.approvedCount ?? 0} cases`, description: `Signature ID: ${res.batchId ?? ""}` });
      setSelected(new Set());
      invalidate();
    },
    onError: () => toast({ title: "Batch sign failed", variant: "destructive" }),
  });

  // ─── Select all / none ───────────────────────────────────────────────────────

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach(c => next.delete(c.id));
      else filtered.forEach(c => next.add(c.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Tab counts ──────────────────────────────────────────────────────────────
  const tc = data?.tierCounts ?? { 1: 0, 2: 0, 3: 0 };
  const redFlagCount = allCases.filter(c => c.hasRedFlags || !!c.erNowMessage).length;
  const followUpCount = allCases.filter(c => c.followUp).length;

  const filterTabs: { key: FilterMode; label: string; count: number; color: string }[] = [
    { key: "all", label: "All", count: allCases.length, color: "text-slate-600" },
    { key: "redflags", label: "Red Flags", count: redFlagCount, color: "text-red-600" },
    { key: "followup", label: "Follow-Up", count: followUpCount, color: "text-amber-600" },
    { key: "t3", label: "T3 Urgent", count: tc[3] ?? 0, color: "text-orange-600" },
    { key: "t2", label: "T2 Eyes-On", count: tc[2] ?? 0, color: "text-yellow-600" },
    { key: "t1", label: "T1 Notify", count: tc[1] ?? 0, color: "text-emerald-600" },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">

      {/* Ambient health bar */}
      <div className="shrink-0 px-4 pt-3">
        <AmbientHealthBar />
      </div>

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-500" />
            <h1 className="text-base font-semibold text-slate-800 dark:text-white">Patient Grid</h1>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {filterTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                data-testid={`filter-${t.key}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${filter === t.key
                    ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                    : `bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 ${t.color}`
                  }`}
              >
                {t.label}
                <span className="bg-white/20 dark:bg-black/20 rounded-full px-1 text-[10px] font-bold">
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patients, complaints…"
              className="pl-7 h-8 text-xs"
              data-testid="search-input"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          {/* Stats & refresh */}
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap" data-testid="patient-count">
            {isLoading ? "Loading…" : `${filtered.length} patients`}
          </span>
          <button
            onClick={() => { setAutoRefresh(v => !v); refetch(); }}
            className={`p-1.5 rounded transition-colors ${autoRefresh ? "text-emerald-500" : "text-slate-400"}`}
            title={autoRefresh ? "Auto-refresh on (30s)" : "Auto-refresh off"}
            data-testid="refresh-toggle"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" data-testid="patient-grid-table">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 900 }}>
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr className="h-9">
              <th className="w-9 pl-2 pr-1">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll}
                  className="h-3.5 w-3.5" data-testid="select-all" />
              </th>
              <th className="w-6" />
              <th className="w-10 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Tier</span>
              </th>
              <th className="w-9" title="Follow-up">
                <Star className="h-3 w-3 text-slate-400 mx-auto" />
              </th>
              <th className="min-w-32 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">Patient</th>
              <th className="w-14 px-1 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">Ch</th>
              <th className="min-w-28 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">Complaint</th>
              <th className="min-w-48 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium hidden lg:table-cell">HPI</th>
              <th className="min-w-44 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium hidden md:table-cell">Differentials</th>
              <th className="min-w-36 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium hidden xl:table-cell">2° / Tier</th>
              <th className="min-w-32 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium hidden xl:table-cell">Findings</th>
              <th className="w-28 px-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">Disposition</th>
              <th className="w-14 text-center text-[10px] text-slate-500 uppercase tracking-wide font-medium">Conf</th>
              <th className="w-16 text-center text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                <Clock className="h-3 w-3 mx-auto" />
              </th>
              <th className="w-20" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {isLoading && (
              <tr>
                <td colSpan={15} className="py-16 text-center text-slate-400 text-sm">
                  Loading patients…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="py-16 text-center">
                  <Filter className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No patients match this filter.</p>
                </td>
              </tr>
            )}
            {filtered.map(c => (
              <PatientRow
                key={c.id}
                c={c}
                selected={selected.has(c.id)}
                expanded={expanded === c.id}
                onSelect={() => toggleOne(c.id)}
                onExpand={() => setExpanded(prev => prev === c.id ? null : c.id)}
                onFlag={() => flagMut.mutate(c.id)}
                onApprove={() => approveMut.mutate(c.id)}
                onEscalate={() => escalateMut.mutate(c.id)}
                onOverride={(r, t, d) => overrideMut.mutate({ id: c.id, reason: r, text: t, disp: d })}
                approving={approveMut.isPending && approveMut.variables === c.id}
                escalating={escalateMut.isPending && escalateMut.variables === c.id}
                overriding={overrideMut.isPending && overrideMut.variables?.id === c.id}
                flagging={flagMut.isPending && flagMut.variables === c.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Batch bar */}
      <BatchBar
        selected={Array.from(selected)}
        eligible={eligibleInSelection}
        onBatchApprove={pin => batchMut.mutate({ caseIds: Array.from(selected), pin })}
        isPending={batchMut.isPending}
      />

      {/* Bottom padding for batch bar */}
      {selected.size > 0 && <div className="shrink-0 h-16" />}
    </div>
  );
}
