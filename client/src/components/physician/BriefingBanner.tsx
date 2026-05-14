import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { PhysicianBriefingCard } from "./PhysicianBriefingCard";
import { Button } from "@/components/ui/button";

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
