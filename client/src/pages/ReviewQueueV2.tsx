import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { CaseSnapshotCard, type CaseSnapshot } from "../components/CaseSnapshotCard";
import { Loader2, ListChecks } from "lucide-react";

export default function ReviewQueueV2() {
  const { authFetch } = useAuth();
  const [snapshots, setSnapshots] = useState<CaseSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/reviewQueueSnapshots?limit=100");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load queue");
      setSnapshots(json.snapshots || []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-review-queue-v2">
      <div className="flex items-center gap-3">
        <ListChecks className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Review Queue</h2>
        {snapshots.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {snapshots.length} case{snapshots.length !== 1 ? "s" : ""} pending
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive" data-testid="text-error">{error}</div>
      )}

      {loading && snapshots.length === 0 ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8" data-testid="text-empty">
          No cases currently in the review queue.
        </p>
      ) : (
        <div>
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
