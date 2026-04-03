import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TierBadge } from "./TierBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, ArrowUp, Edit2, Clock } from "lucide-react";
import { useState } from "react";

export interface CommandCase {
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
}

const DISPOSITION_COLORS: Record<string, string> = {
  HOME_CARE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  URGENT_CARE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  PHYSICIAN_REVIEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  ER_NOW: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WA",
  telegram: "TG",
  web: "WEB",
  chatgpt: "GPT",
  voice: "VOICE",
  sms: "SMS",
};

const OVERRIDE_CATEGORIES = [
  "diagnosis_incorrect", "diagnosis_incomplete", "disposition_too_aggressive",
  "disposition_insufficient", "medication_inappropriate", "documentation_error",
  "patient_preference", "clinical_context_not_captured", "other",
];

interface Props {
  case_: CommandCase;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onActionComplete: () => void;
}

export function CommandCard({ case_: c, index, isSelected, onSelect, onActionComplete }: Props) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState("disposition_too_aggressive");
  const [overrideText, setOverrideText] = useState("");

  const mutationOpts = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-strip/queue"] });
      onActionComplete();
    },
  };

  const approveMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/command-strip/cases/${c.id}/approve`, {}),
    ...mutationOpts,
  });
  const escalateMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/command-strip/cases/${c.id}/escalate`, {}),
    ...mutationOpts,
  });
  const overrideMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/command-strip/cases/${c.id}/override`, {
      reasonCategory: overrideCategory,
      freeText: overrideText,
    }),
    ...mutationOpts,
  });

  const minutesWaiting = Math.floor((Date.now() - new Date(c.queuedAt).getTime()) / 60000);
  const slaBreached = minutesWaiting > c.tierSlaMinutes;

  return (
    <div
      data-testid={`command-card-${c.id}`}
      className={`rounded-lg border transition-all ${
        isSelected ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800" : "border-slate-200 dark:border-slate-700"
      } ${c.tier === 3 ? "bg-red-50 dark:bg-red-950/20" : c.tier === 2 ? "bg-amber-50 dark:bg-amber-950/10" : "bg-white dark:bg-slate-900"}`}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            data-testid={`select-case-${c.id}`}
            checked={isSelected}
            onChange={() => onSelect(c.id)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 dark:text-slate-500 w-5 shrink-0">#{index + 1}</span>
              <span data-testid={`case-name-${c.id}`} className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {c.patientName}{c.age ? `, ${c.age}y` : ""}
              </span>
              <TierBadge tier={c.tier} label={c.tierLabel} />
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${DISPOSITION_COLORS[c.disposition] ?? "bg-slate-100 text-slate-600"}`}>
                {c.disposition.replace("_", " ")}
              </span>
              <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1">
                {CHANNEL_LABELS[c.channel] ?? c.channel}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-slate-500 capitalize">{c.complaintKey.replace(/_/g, " ")}</span>
              <span className="text-xs text-slate-400">·</span>
              <span data-testid={`confidence-${c.id}`} className="text-xs text-slate-500">
                {(c.confidence * 100).toFixed(0)}% confidence
              </span>
              {slaBreached && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-0.5">
                  <Clock className="h-3 w-3" /> SLA {minutesWaiting}m/{c.tierSlaMinutes}m
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Diagnoses */}
        {c.diagnoses.length > 0 && (
          <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
            {c.diagnoses.map(d => (
              <Badge key={d} variant="outline" className="text-xs py-0">
                {d.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}

        {/* Flags */}
        {(c.hasRedFlags || c.hasPopulationFlags) && (
          <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
            {c.redFlagLabels.map(f => (
              <span key={f} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-3 w-3" />{f.replace(/_/g, " ")}
              </span>
            ))}
            {c.populationFlagLabels.map(f => (
              <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                {f.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* ER Now message */}
        {c.erNowMessage && (
          <div className="mt-1.5 ml-7 text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20 rounded px-2 py-1">
            {c.erNowMessage}
          </div>
        )}

        {/* Debate rationale */}
        {c.tier === 3 && c.debateRationale && (
          <p className="mt-1.5 ml-7 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
            {c.tierRationale}
          </p>
        )}

        {/* Override form */}
        {overrideOpen && (
          <div className="mt-2 ml-7 p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
            <select
              data-testid={`override-category-${c.id}`}
              value={overrideCategory}
              onChange={e => setOverrideCategory(e.target.value)}
              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
            >
              {OVERRIDE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
              ))}
            </select>
            <input
              data-testid={`override-text-${c.id}`}
              type="text"
              placeholder="Clinical rationale (required for overrides)"
              value={overrideText}
              onChange={e => setOverrideText(e.target.value)}
              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
            />
            <div className="flex gap-2">
              <Button data-testid={`confirm-override-${c.id}`} size="sm" variant="destructive" className="h-6 text-xs"
                onClick={() => overrideMut.mutate()} disabled={!overrideText.trim() || overrideMut.isPending}>
                Confirm Override
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!overrideOpen && (
          <div className="mt-2 ml-7 flex items-center gap-1.5">
            <Button
              data-testid={`approve-${c.id}`}
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
            >
              <CheckCircle className="h-3 w-3" /> Approve [A]
            </Button>
            <Button
              data-testid={`escalate-${c.id}`}
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => escalateMut.mutate()}
              disabled={escalateMut.isPending}
            >
              <ArrowUp className="h-3 w-3" /> Escalate [E]
            </Button>
            <Button
              data-testid={`override-${c.id}`}
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1 text-slate-600"
              onClick={() => setOverrideOpen(true)}
            >
              <Edit2 className="h-3 w-3" /> Override [O]
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
