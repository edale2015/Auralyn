import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle, CheckCircle2, Clock, MessageSquareQuote,
  Stethoscope, Pill, FlaskConical, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BriefingCard {
  id: string;
  encounter_id: string;
  generated_at: string;
  one_liner: string;
  urgency_signal: "routine" | "elevated" | "urgent" | "critical";
  preliminary_disposition: string;
  top_differential: Array<{ name: string; icd10: string; score: number; cannotMiss: boolean }>;
  critical_gaps: string[];
  important_gaps: string[];
  story_flags: string[];
  medication_flags: string[];
  suggested_first_words: string | null;
  physician_acknowledged: boolean;
}

interface Props {
  briefing: BriefingCard;
  onAcknowledge?: () => void;
}

// ─── Urgency config ───────────────────────────────────────────────────────────

const URGENCY = {
  routine:  { color: "bg-emerald-500", label: "Routine",  textClass: "text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  elevated: { color: "bg-amber-400",   label: "Elevated", textClass: "text-amber-700 dark:text-amber-400",     icon: Clock },
  urgent:   { color: "bg-orange-500",  label: "Urgent",   textClass: "text-orange-700 dark:text-orange-400",   icon: AlertTriangle },
  critical: { color: "bg-red-600",     label: "Critical", textClass: "text-red-700 dark:text-red-400",         icon: AlertTriangle },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function formatDisposition(d: string): string {
  return d.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PhysicianBriefingCard({ briefing, onAcknowledge }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const urgency      = URGENCY[briefing.urgency_signal] ?? URGENCY.routine;
  const UrgencyIcon  = urgency.icon;
  const differentials = parseArray(briefing.top_differential);
  const critGaps      = parseArray(briefing.critical_gaps);
  const storyFlags    = parseArray(briefing.story_flags);
  const medFlags      = parseArray(briefing.medication_flags);

  const ackMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/dialogue/briefing/${briefing.id}/acknowledge`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dialogue/briefing/encounter", briefing.encounter_id] });
      onAcknowledge?.();
    },
  });

  return (
    <Card
      className="border-l-4 shadow-md"
      style={{ borderLeftColor: urgency.color.replace("bg-", "") }}
      data-testid={`briefing-card-${briefing.id}`}
    >
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${urgency.color} inline-block flex-shrink-0 mt-1`} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold ${urgency.textClass}`}
                  data-testid="badge-urgency"
                >
                  <UrgencyIcon className="w-3 h-3 mr-1" />
                  {urgency.label}
                </Badge>
                <Badge variant="secondary" className="text-xs" data-testid="badge-disposition">
                  {formatDisposition(briefing.preliminary_disposition ?? "")}
                </Badge>
              </div>
              <p className="text-sm font-medium leading-snug" data-testid="text-one-liner">
                {briefing.one_liner}
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            data-testid="button-toggle-expand"
            aria-label={expanded ? "Collapse briefing" : "Expand briefing"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          <Separator />

          {/* Top Differentials */}
          {differentials.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Stethoscope className="w-3.5 h-3.5" />
                Top Differentials
              </div>
              <div className="space-y-1">
                {differentials.map((d: any, i: number) => (
                  <div
                    key={d.id ?? i}
                    className="flex items-center justify-between text-sm"
                    data-testid={`row-differential-${i}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {d.cannotMiss && (
                        <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" title="Cannot-miss diagnosis" />
                      )}
                      {d.name}
                      <span className="text-xs text-muted-foreground ml-1">{d.icd10}</span>
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {Math.round(d.score ?? 0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical Gaps */}
          {critGaps.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5" />
                Critical Gaps
              </div>
              <ul className="space-y-1">
                {critGaps.map((g: string, i: number) => (
                  <li key={i} className="text-sm text-red-700 dark:text-red-400 flex items-start gap-1.5" data-testid={`text-critical-gap-${i}`}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Story Flags */}
          {storyFlags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                <Clock className="w-3.5 h-3.5" />
                Story Flags
              </div>
              <ul className="space-y-1">
                {storyFlags.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5" data-testid={`text-story-flag-${i}`}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Medication Flags */}
          {medFlags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                <Pill className="w-3.5 h-3.5" />
                Medication Flags
              </div>
              <ul className="space-y-1">
                {medFlags.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-purple-700 dark:text-purple-400 flex items-start gap-1.5" data-testid={`text-med-flag-${i}`}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Opening Words */}
          {briefing.suggested_first_words && (
            <div className="rounded-md bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MessageSquareQuote className="w-3.5 h-3.5" />
                Suggested Opening
              </div>
              <p className="text-sm italic text-foreground" data-testid="text-suggested-words">
                "{briefing.suggested_first_words}"
              </p>
            </div>
          )}

          <Separator />

          {/* Acknowledge */}
          {!briefing.physician_acknowledged && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => ackMut.mutate()}
              disabled={ackMut.isPending}
              data-testid="button-acknowledge-briefing"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {ackMut.isPending ? "Marking…" : "Mark as Reviewed"}
            </Button>
          )}
          {briefing.physician_acknowledged && (
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1" data-testid="status-acknowledged">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Reviewed by physician
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
