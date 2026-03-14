import { useEffect, useRef, useState } from "react";
import { CaseSnapshotCard, type CaseSnapshot } from "../components/CaseSnapshotCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ListChecks, Wifi, WifiOff, RefreshCw } from "lucide-react";

type QueueState = "NEEDS_REVIEW" | "PENDING" | "APPROVED" | "ESCALATED";

export default function ReviewQueueV2() {
  const [snapshots, setSnapshots] = useState<CaseSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError]         = useState("");
  const [stateFilter, setStateFilter] = useState<QueueState>("NEEDS_REVIEW");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function connect(filter: QueueState) {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setError("");
    setConnected(false);

    const es = new EventSource(`/api/sse/review-queue?state=${filter}`);
    esRef.current = es;

    es.addEventListener("connected", () => setConnected(true));

    es.addEventListener("queue-update", (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setSnapshots(data.cases ?? []);
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

    es.onerror = () => {
      setConnected(false);
    };
  }

  useEffect(() => {
    connect(stateFilter);
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [stateFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="page-review-queue-v2">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ListChecks className="h-5 w-5 shrink-0" />
          <h2 className="text-xl font-semibold truncate">Review Queue</h2>
          {snapshots.length > 0 && (
            <Badge variant="secondary" data-testid="badge-count">
              {snapshots.length} pending
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Live indicator */}
          <span
            className={`flex items-center gap-1 text-xs ${connected ? "text-green-600" : "text-muted-foreground"}`}
            data-testid="badge-live"
          >
            {connected
              ? <><Wifi className="w-3.5 h-3.5" /> Live</>
              : <><WifiOff className="w-3.5 h-3.5" /> Reconnecting…</>}
          </span>

          {/* State filter */}
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

          {/* Manual refresh */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => connect(stateFilter)}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

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
          {snapshots.map((snapshot) => (
            <CaseSnapshotCard
              key={snapshot.caseId}
              snapshot={snapshot}
              showOpenLink
            />
          ))}
        </div>
      )}
    </div>
  );
}
