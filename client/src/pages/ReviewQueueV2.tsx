import { useEffect, useRef, useState } from "react";
import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
import { CaseSnapshotCard, type CaseSnapshot } from "../components/CaseSnapshotCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ListChecks, Wifi, WifiOff, RefreshCw, AlertTriangle, ShieldAlert } from "lucide-react";

type QueueState = "NEEDS_REVIEW" | "PENDING" | "APPROVED" | "ESCALATED";

interface SeverityBuckets {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  unknown: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "destructive",
  high: "destructive",
  moderate: "secondary",
  low: "outline",
  unknown: "outline",
};

function SeverityBucketBar({ buckets }: { buckets: SeverityBuckets }) {
  const total = Object.values(buckets).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="severity-buckets">
      {(["critical", "high", "moderate", "low"] as const).map((sev) => {
        const count = buckets[sev];
        if (!count) return null;
        return (
          <div key={sev} className="flex items-center gap-1" data-testid={`bucket-${sev}`}>
            {sev === "critical" && <AlertTriangle className="w-3 h-3 text-destructive" />}
            {sev === "high" && <ShieldAlert className="w-3 h-3 text-orange-500" />}
            <Badge variant={SEVERITY_COLORS[sev] as any} className="text-xs">
              {sev}: {count}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default function ReviewQueueV2() {
  const [snapshots, setSnapshots] = useState<CaseSnapshot[]>([]);
  const [buckets, setBuckets] = useState<SeverityBuckets | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState<QueueState>("NEEDS_REVIEW");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [asyncOnly, setAsyncOnly] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  function connect(filter: QueueState) {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setError("");
    setConnected(false);

    // Use enhanced /api/sse/queue with severity bucketing
    const es = new EventSource(`/api/sse/queue?state=${filter}`);
    esRef.current = es;

    es.addEventListener("connected", () => setConnected(true));

    es.addEventListener("queue-update", (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setSnapshots(data.cases ?? []);
        if (data.buckets) setBuckets(data.buckets);
        setLastUpdated(new Date());
        setConnected(true);
        setError("");
      } catch {
        setError("Failed to parse queue update");
      }
    });

    es.addEventListener("error", (evt: any) => {
      const msg = evt?.data ? JSON.parse(evt.data)?.message : "Stream error";
      setError(msg ?? "Connection error");
    });

    es.onerror = () => { setConnected(false); };
  }

  useEffect(() => {
    connect(stateFilter);
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [stateFilter]);

  const criticalCount = buckets?.critical ?? 0;
  const urgentCount   = snapshots.filter((s: any) => s._severity === "critical" || s._severity === "high").length;
  const asyncCount    = snapshots.filter((s: any) => s.caseType === "Async Safe").length;

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="page-review-queue-v2">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ListChecks className="h-5 w-5 shrink-0" />
          <h2 className="text-xl font-semibold truncate">Review Queue</h2>
          {snapshots.length > 0 && (
            <Badge variant={criticalCount > 0 ? "destructive" : "secondary"} data-testid="badge-count">
              {snapshots.length} cases
              {criticalCount > 0 && ` · ${criticalCount} critical`}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span
            className={`flex items-center gap-1 text-xs ${connected ? "text-green-600" : "text-muted-foreground"}`}
            data-testid="badge-live"
          >
            {connected
              ? <><Wifi className="w-3.5 h-3.5" /> Live</>
              : <><WifiOff className="w-3.5 h-3.5" /> Reconnecting…</>}
          </span>

          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as QueueState)}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-state-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="ESCALATED">Escalated</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={() => setAsyncOnly(prev => !prev)}
            className={`h-8 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              asyncOnly
                ? "bg-green-600 text-white border-green-600"
                : "bg-background text-muted-foreground border-input hover:bg-accent"
            }`}
            data-testid="button-async-filter"
          >
            {asyncOnly ? "● Async only" : "All cases"}
          </button>

          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => connect(stateFilter)} data-testid="button-refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <DashboardContextPrompt
        context="queue"
        data={{
          urgent: urgentCount,
          async:  asyncCount,
          total:  snapshots.length,
        }}
      />

      {/* ── Severity buckets ── */}
      {buckets && <SeverityBucketBar buckets={buckets} />}

      {lastUpdated && (
        <p className="text-xs text-muted-foreground" data-testid="text-last-updated">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2" data-testid="text-error">
          {error}
        </div>
      )}

      {/* ── Cases ── */}
      {!connected && snapshots.length === 0 ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-empty">
          No cases in the queue for state: <strong>{stateFilter}</strong>
        </p>
      ) : (
        <div className="space-y-2">
          {(asyncOnly ? snapshots.filter((s: any) => s.caseType === "Async Safe") : snapshots).map((snapshot: any) => (
            <div key={snapshot.caseId} className="relative">
              {snapshot._severity === "critical" && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive rounded-l-md" />
              )}
              {snapshot._severity === "high" && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l-md" />
              )}
              <div className={snapshot._severity === "critical" || snapshot._severity === "high" ? "pl-2" : ""}>
                <CaseSnapshotCard
                  key={snapshot.caseId}
                  snapshot={snapshot}
                  showOpenLink
                />
              </div>
              {snapshot._priority && (
                <div className="absolute top-2 right-2">
                  <Badge
                    variant={snapshot._severity === "critical" ? "destructive" : snapshot._severity === "high" ? "secondary" : "outline"}
                    className="text-xs font-mono"
                    data-testid={`badge-priority-${snapshot.caseId}`}
                  >
                    {snapshot._priority}
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
