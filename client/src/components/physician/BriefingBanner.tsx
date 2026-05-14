import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, ChevronDown, ChevronUp, X, MessageSquare, Clock } from "lucide-react";
import { useState } from "react";
import { PhysicianBriefingCard } from "./PhysicianBriefingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  encounterId: string;
  patientName?: string;
}

const URGENCY_BANNER: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  routine:  { bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800", text: "text-emerald-800 dark:text-emerald-300", dot: "bg-emerald-500", label: "Routine" },
  elevated: { bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",         text: "text-amber-800 dark:text-amber-300",    dot: "bg-amber-400",   label: "Elevated" },
  urgent:   { bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",     text: "text-orange-800 dark:text-orange-300",  dot: "bg-orange-500",  label: "Urgent" },
  critical: { bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",                 text: "text-red-800 dark:text-red-400",         dot: "bg-red-600 animate-pulse", label: "Critical" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BriefingBanner({ encounterId, patientName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ ok: boolean; briefing: any }>({
    queryKey: ["/api/dialogue/briefing/encounter", encounterId],
    queryFn: async () => {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch(`/api/dialogue/briefing/encounter/${encounterId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No briefing");
      return res.json();
    },
    retry: false,
    refetchInterval: 30_000,
  });

  if (isLoading || !data?.briefing || dismissed) return null;

  const briefing = data.briefing;
  const urgency  = briefing.urgency_signal ?? "routine";
  const style    = URGENCY_BANNER[urgency] ?? URGENCY_BANNER.routine;
  const isCritical = urgency === "critical" || urgency === "urgent";

  return (
    <div
      className={`rounded-lg border px-4 py-2.5 ${style.bg} transition-all`}
      data-testid={`briefing-banner-${encounterId}`}
    >
      {/* Collapsed Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isCritical
            ? <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${style.text}`} />
            : <Bell className={`w-4 h-4 flex-shrink-0 ${style.text}`} />
          }
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
          <span className={`text-sm font-semibold truncate ${style.text}`} data-testid="text-banner-summary">
            {patientName && <span className="font-normal mr-1">{patientName} —</span>}
            {briefing.one_liner ?? `${style.label} briefing ready`}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 px-2 text-xs ${style.text}`}
            onClick={() => setExpanded(e => !e)}
            data-testid="button-view-brief"
          >
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Hide</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5 mr-1" /> View Brief</>
            )}
          </Button>
          {!isCritical && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
              data-testid="button-dismiss-banner"
              aria-label="Dismiss briefing banner"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Card */}
      {expanded && (
        <div className="mt-3" data-testid="container-briefing-expanded">
          <PhysicianBriefingCard
            briefing={briefing}
            onAcknowledge={() => {
              refetch();
              setExpanded(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── LivingEncounterTimeline ──────────────────────────────────────────────────
// Shows post-visit patient updates and the living encounter feed below the
// main clinical form. Physicians can see how the patient is doing after discharge.

interface TimelineUpdate {
  id: string;
  message: string;
  channel: string;
  severity: string;
  disposition_changed: boolean;
  new_disposition?: string;
  created_at: string;
}

interface TimelineProps {
  encounterId: string;
}

const SEVERITY_STYLE: Record<string, { badge: string; dot: string }> = {
  routine:  { badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0", dot: "bg-emerald-400" },
  elevated: { badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-0",         dot: "bg-amber-400" },
  urgent:   { badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-0",     dot: "bg-orange-500" },
  critical: { badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-0",                 dot: "bg-red-600 animate-pulse" },
};

export function LivingEncounterTimeline({ encounterId }: TimelineProps) {
  const { data, isLoading } = useQuery<{ ok: boolean; updates: TimelineUpdate[]; count: number }>({
    queryKey: ["/api/dialogue/updates/encounter", encounterId],
    queryFn: async () => {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch(`/api/dialogue/updates/encounter/${encounterId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No updates");
      return res.json();
    },
    retry: false,
    refetchInterval: 60_000,
  });

  if (isLoading) return null;
  const updates = data?.updates ?? [];
  if (updates.length === 0) return null;

  return (
    <div className="mt-4 space-y-2" data-testid={`timeline-${encounterId}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <MessageSquare className="w-3.5 h-3.5" />
        Patient Updates ({updates.length})
      </div>

      <div className="space-y-2">
        {updates.map((u) => {
          const s = SEVERITY_STYLE[u.severity] ?? SEVERITY_STYLE.routine;
          return (
            <div
              key={u.id}
              className="rounded-lg border border-border/30 bg-card/60 px-3 py-2 space-y-1"
              data-testid={`timeline-update-${u.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <Badge className={`text-[9px] px-1.5 py-0 h-4 ${s.badge}`}>
                    {u.severity.toUpperCase()}
                  </Badge>
                  {u.disposition_changed && u.new_disposition && (
                    <Badge className="text-[9px] px-1.5 py-0 h-4 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-0">
                      → {u.new_disposition}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(u.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <p className="text-[11px] text-foreground/80 leading-snug">{u.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
