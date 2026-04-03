import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { CommandCard, CommandCase } from "@/components/physician/CommandCard";
import { BatchApproveBar } from "@/components/physician/BatchApproveBar";
import { AmbientHealthBar } from "@/components/physician/AmbientHealthBar";
import { TierBadge } from "@/components/physician/TierBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Activity, Users, RefreshCw, Filter } from "lucide-react";

interface CommandStripPage {
  cases: CommandCase[];
  total: number;
  tierCounts: Record<string, number>;
  batchEligibleCount: number;
}

interface InboxEvent {
  inboxId: string;
  channel: string;
  priority: "critical" | "high" | "normal" | "low";
  text: string;
  eventType: string;
  receivedAt: string;
}

interface InboxPage {
  events: InboxEvent[];
  total: number;
  criticalCount: number;
}

const TIER_LABELS: Record<string, string> = {
  "1": "Notify-only",
  "2": "Eyes-on (30s)",
  "3": "Full review",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  normal: "text-slate-600 dark:text-slate-300",
  low: "text-slate-400",
};

const PRIORITY_BG: Record<string, string> = {
  critical: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
  high: "bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800",
  normal: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
  low: "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700",
};

export default function PhysicianCommandStrip() {
  const [activeTab, setActiveTab] = useState<"queue" | "inbox">("queue");
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);

  const { data: queueData, refetch: refetchQueue, isLoading: queueLoading } = useQuery<CommandStripPage>({
    queryKey: ["/api/command-strip/queue", tierFilter],
    queryFn: () => fetch(`/api/command-strip/queue${tierFilter ? `?tier=${tierFilter}` : ""}`).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: inboxData, refetch: refetchInbox } = useQuery<InboxPage>({
    queryKey: ["/api/command-strip/inbox"],
    refetchInterval: 10_000,
  });

  const cases = queueData?.cases ?? [];
  const batchEligibleIds = cases.filter(c => c.batchEligible).map(c => c.id);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllBatchEligible = useCallback(() => {
    setSelectedIds(new Set(batchEligibleIds));
  }, [batchEligibleIds]);

  // Keyboard navigation: J/K move, A approve, E escalate, space select
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, cases.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        if (cases[focusIndex]) toggleSelect(cases[focusIndex].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cases, focusIndex, toggleSelect]);

  const tierCounts = queueData?.tierCounts ?? {};
  const totalPending = queueData?.total ?? 0;
  const batchEligibleCount = queueData?.batchEligibleCount ?? 0;
  const inboxCritical = inboxData?.criticalCount ?? 0;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Ambient Health Bar */}
      <AmbientHealthBar />

      {/* Top Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">Physician Command Strip</span>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 ml-4">
          <Button
            data-testid="tab-queue"
            variant={activeTab === "queue" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setActiveTab("queue")}
          >
            <Users className="h-3.5 w-3.5" />
            Queue
            {totalPending > 0 && (
              <Badge variant="secondary" className="h-4 min-w-[1rem] text-[10px] px-1">{totalPending}</Badge>
            )}
          </Button>
          <Button
            data-testid="tab-inbox"
            variant={activeTab === "inbox" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setActiveTab("inbox")}
          >
            <Inbox className="h-3.5 w-3.5" />
            Inbox
            {inboxCritical > 0 && (
              <Badge variant="destructive" className="h-4 min-w-[1rem] text-[10px] px-1">{inboxCritical}</Badge>
            )}
          </Button>
        </div>

        {activeTab === "queue" && (
          <div className="flex items-center gap-1.5 ml-4 flex-wrap">
            {/* Tier filter pills */}
            <span className="text-xs text-slate-500 flex items-center gap-1"><Filter className="h-3 w-3" />Tier:</span>
            {([null, 3, 2, 1] as (number | null)[]).map(t => (
              <button
                key={t ?? "all"}
                data-testid={`tier-filter-${t ?? "all"}`}
                onClick={() => setTierFilter(t)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                  tierFilter === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400"
                }`}
              >
                {t === null ? `All (${totalPending})` : `T${t}: ${TIER_LABELS[String(t)]} (${tierCounts[t] ?? 0})`}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeTab === "queue" && batchEligibleCount > 0 && (
            <Button
              data-testid="select-all-batch"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={selectAllBatchEligible}
            >
              Select {batchEligibleCount} Tier-1
            </Button>
          )}
          <Button
            data-testid="refresh-queue"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => activeTab === "queue" ? refetchQueue() : refetchInbox()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="px-4 py-1 text-[10px] text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 shrink-0">
        J/K navigate · Space select · A approve · E escalate · O override
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === "queue" ? (
          <div className="p-3 space-y-2 max-w-3xl mx-auto">
            {queueLoading && (
              <div className="text-center py-8 text-slate-400 text-sm">Loading queue…</div>
            )}
            {!queueLoading && cases.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No pending cases</p>
                <p className="text-xs mt-1">All cases reviewed — well done.</p>
              </div>
            )}
            {cases.map((c, i) => (
              <CommandCard
                key={c.id}
                case_={c}
                index={i}
                isSelected={selectedIds.has(c.id)}
                onSelect={toggleSelect}
                onActionComplete={() => setSelectedIds(prev => { const next = new Set(prev); next.delete(c.id); return next; })}
              />
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-2 max-w-3xl mx-auto">
            {(inboxData?.events ?? []).length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Inbox empty</p>
              </div>
            )}
            {(inboxData?.events ?? []).map(event => (
              <div
                key={event.inboxId}
                data-testid={`inbox-event-${event.inboxId}`}
                className={`rounded-lg border p-3 ${PRIORITY_BG[event.priority]}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`text-xs font-bold uppercase ${PRIORITY_COLORS[event.priority]}`}>
                    {event.priority}
                  </span>
                  <span className="text-xs text-slate-400 uppercase">{event.channel}</span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {new Date(event.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{event.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batch Approve Bar */}
      <BatchApproveBar
        selectedIds={[...selectedIds]}
        batchEligibleIds={batchEligibleIds}
        onClear={() => setSelectedIds(new Set())}
        tenantId={null}
      />
    </div>
  );
}
