import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, AlertTriangle, Clock, FileCheck } from "lucide-react";

type Digest = {
  date: string;
  totalCases: number;
  casesAwaitingReview: number;
  casesInReview: number;
  casesSignedOff: number;
  casesExported: number;
  discrepancyCount: number;
  blockedExports: number;
  avgQueueAgeMinutes: number | null;
  complaintBreakdown: { complaintId: string; count: number }[];
};

export default function OpsDailyDigest() {
  const { authFetch } = useAuth();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/opsDailyDigest");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setDigest(json);
      } catch (err: any) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-12" data-testid="status-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-destructive" data-testid="text-error">{error}</div>
      </div>
    );
  }

  if (!digest) return null;

  return (
    <div className="p-6 space-y-4" data-testid="page-ops-daily-digest">
      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Ops Daily Digest</h2>
        <Badge variant="outline" className="text-xs">{digest.date}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="stat-total-cases">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{digest.totalCases}</div>
            <div className="text-xs text-muted-foreground">Cases Today</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-awaiting-review">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{digest.casesAwaitingReview}</div>
            <div className="text-xs text-muted-foreground">Awaiting Review</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-discrepancies">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold flex items-center justify-center gap-1">
              {digest.discrepancyCount > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              {digest.discrepancyCount}
            </div>
            <div className="text-xs text-muted-foreground">Discrepancies</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-blocked-exports">
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{digest.blockedExports}</div>
            <div className="text-xs text-muted-foreground">Blocked Exports</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>In Review</span>
              <span className="font-medium">{digest.casesInReview}</span>
            </div>
            <div className="flex justify-between">
              <span>Signed Off</span>
              <span className="font-medium">{digest.casesSignedOff}</span>
            </div>
            <div className="flex justify-between">
              <span>Exported</span>
              <span className="font-medium">{digest.casesExported}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Queue Age</span>
              <span className="font-medium">
                {digest.avgQueueAgeMinutes !== null ? `${digest.avgQueueAgeMinutes} min` : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Complaint Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {digest.complaintBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No complaints recorded</p>
            ) : (
              <div className="space-y-1">
                {digest.complaintBreakdown.slice(0, 10).map((c) => (
                  <div key={c.complaintId} className="flex justify-between text-sm" data-testid={`complaint-${c.complaintId}`}>
                    <span className="text-xs font-mono">{c.complaintId}</span>
                    <Badge variant="secondary" className="text-xs">{c.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
