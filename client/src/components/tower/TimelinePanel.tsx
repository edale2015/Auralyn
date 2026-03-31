import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, CheckCircle2, Zap, Brain, HelpCircle, Activity, TreePine, Search, RefreshCw } from "lucide-react";

const STAGE_ICON: Record<string, any> = {
  input:          <Activity className="h-3 w-3 text-blue-500" />,
  disposition:    <Zap className="h-3 w-3 text-yellow-500" />,
  questions:      <HelpCircle className="h-3 w-3 text-purple-500" />,
  smart_intake:   <Brain className="h-3 w-3 text-indigo-500" />,
  counterfactuals:<RefreshCw className="h-3 w-3 text-orange-500" />,
  workup:         <CheckCircle2 className="h-3 w-3 text-green-500" />,
  tree:           <TreePine className="h-3 w-3 text-emerald-500" />,
  heatmap:        <Activity className="h-3 w-3 text-teal-500" />,
  complete:       <CheckCircle2 className="h-3 w-3 text-green-600" />,
};

const STAGE_BADGE: Record<string, string> = {
  input:          "bg-blue-100 text-blue-800",
  disposition:    "bg-yellow-100 text-yellow-800",
  questions:      "bg-purple-100 text-purple-800",
  smart_intake:   "bg-indigo-100 text-indigo-800",
  counterfactuals:"bg-orange-100 text-orange-800",
  workup:         "bg-green-100 text-green-800",
  tree:           "bg-emerald-100 text-emerald-800",
  heatmap:        "bg-teal-100 text-teal-800",
  complete:       "bg-gray-100 text-gray-700",
};

interface CaseEvent {
  id: string; case_id: string; complaint_id: string;
  stage: string; label: string; data: any;
  duration_ms: number; ts: string;
}

export default function TimelinePanel({ caseId: propCaseId }: { caseId?: string }) {
  const [inputId, setInputId] = useState(propCaseId ?? "");
  const [queryCaseId, setQueryCaseId] = useState(propCaseId ?? "");

  const eventsQuery = useQuery<{ ok: boolean; caseId: string; events: CaseEvent[]; count: number }>({
    queryKey: ["/api/control/timeline", queryCaseId],
    queryFn: async () => {
      if (!queryCaseId) return { ok: true, caseId: "", events: [], count: 0 };
      const r = await fetch(`/api/control/timeline/${queryCaseId}`);
      return r.json();
    },
    enabled: !!queryCaseId,
  });

  const events = eventsQuery.data?.events ?? [];
  const totalMs = events.length ? Math.max(...events.map(e => e.duration_ms)) : 0;

  function seek() { setQueryCaseId(inputId.trim()); }

  return (
    <div className="space-y-3" data-testid="timeline-panel">
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Case Timeline</p>
        {events.length > 0 && (
          <Badge variant="secondary" className="text-xs py-0">{totalMs}ms</Badge>
        )}
      </div>

      {/* Auto-hint when a caseId is passed in */}
      {!queryCaseId && propCaseId && (
        <p className="text-xs text-muted-foreground">Case ID auto-populated from last analysis.</p>
      )}

      {/* Manual case ID entry */}
      <div className="flex gap-1.5">
        <Input
          value={inputId}
          onChange={e => setInputId(e.target.value)}
          onKeyDown={e => e.key === "Enter" && seek()}
          placeholder="Paste case ID (from analysis header)…"
          className="h-7 text-xs font-mono"
          data-testid="input-case-id"
        />
        <Button
          size="sm" variant="outline" className="h-7 px-2"
          onClick={seek} disabled={!inputId.trim()}
          data-testid="button-seek-timeline"
        >
          <Search className="h-3 w-3" />
        </Button>
      </div>

      {eventsQuery.isLoading && (
        <div className="space-y-1.5">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
        </div>
      )}

      {!eventsQuery.isLoading && queryCaseId && events.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No events found for this case ID.</p>
      )}

      {events.length > 0 && (
        <div className="space-y-0.5 relative" data-testid="timeline-events">
          {/* Vertical guide line */}
          <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />

          {events.map((ev, i) => {
            const prevMs = i > 0 ? events[i - 1].duration_ms : 0;
            const stepMs = ev.duration_ms - prevMs;

            return (
              <div key={ev.id} className="flex items-start gap-2 pl-0" data-testid={`event-${ev.stage}`}>
                {/* Icon dot */}
                <div className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">
                  {STAGE_ICON[ev.stage] ?? <Activity className="h-3 w-3 text-muted-foreground" />}
                </div>

                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-xs py-0 ${STAGE_BADGE[ev.stage] ?? "bg-gray-100 text-gray-700"}`}>
                      {ev.stage}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">+{stepMs}ms</span>
                    {ev.stage === "complete" && (
                      <span className="text-xs font-mono text-green-600">@ {ev.duration_ms}ms total</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5">{ev.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!queryCaseId && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Clock className="h-8 w-8 opacity-30" />
          <p className="text-sm text-center">Enter a case ID to replay its timeline</p>
          <p className="text-xs opacity-60">Case IDs appear in the analysis header after each run</p>
        </div>
      )}
    </div>
  );
}
