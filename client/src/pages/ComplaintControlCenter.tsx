import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, LayoutDashboard, AlertTriangle, CheckCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";

type Summary = {
  complaintId: string;
  totalCases: number;
  activeCases: number;
  completedCases: number;
  redFlagRate: number;
  dispositionBreakdown: Record<string, number>;
  latestAccuracy?: number;
  underTriageCount?: number;
  underTriageRate?: number;
  overTriageCount?: number;
  mismatchCount?: number;
  totalSyntheticRuns?: number;
  goldReviewCount?: number;
};

export default function ComplaintControlCenter() {
  const { authFetch } = useAuth();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/complaintControlCenter");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSummaries(json.summaries || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  const totalGoldReviews = summaries.reduce((s, c) => s + (c.goldReviewCount || 0), 0);
  const totalSynthRuns = summaries.reduce((s, c) => s + (c.totalSyntheticRuns || 0), 0);
  const complaintsWithAccuracy = summaries.filter(s => s.latestAccuracy !== undefined);

  return (
    <div className="p-6 space-y-4" data-testid="page-complaint-control-center">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Complaint Control Center</h2>
      </div>

      {!loading && summaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card data-testid="stat-total-complaints">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summaries.length}</div>
              <div className="text-xs text-muted-foreground">Complaints</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-total-gold-reviews">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{totalGoldReviews}</div>
              <div className="text-xs text-muted-foreground">Gold Reviews</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-total-synth-runs">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{totalSynthRuns}</div>
              <div className="text-xs text-muted-foreground">Synthetic Runs</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-avg-accuracy">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {complaintsWithAccuracy.length > 0
                  ? `${Math.round((complaintsWithAccuracy.reduce((s, c) => s + (c.latestAccuracy || 0), 0) / complaintsWithAccuracy.length) * 100)}%`
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Avg Accuracy</div>
            </CardContent>
          </Card>
        </div>
      )}

      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-empty">No complaint data. Run synthetic tests to populate.</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Complaints Overview</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Complaint</TableHead>
                  <TableHead>Cases</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Red Flag %</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Under-Triage</TableHead>
                  <TableHead>Over-Triage</TableHead>
                  <TableHead>Mismatches</TableHead>
                  <TableHead>Gold Reviews</TableHead>
                  <TableHead>Synth Runs</TableHead>
                  <TableHead>Dispositions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.complaintId} data-testid={`cc-row-${s.complaintId}`}>
                    <TableCell className="text-xs font-mono font-medium">{s.complaintId}</TableCell>
                    <TableCell className="text-xs">{s.totalCases}</TableCell>
                    <TableCell className="text-xs">{s.activeCases}</TableCell>
                    <TableCell className="text-xs">{Math.round(s.redFlagRate * 100)}%</TableCell>
                    <TableCell className="text-xs">
                      {s.latestAccuracy !== undefined ? (
                        <Badge variant={s.latestAccuracy >= 0.8 ? "default" : s.latestAccuracy >= 0.6 ? "secondary" : "destructive"} className="text-xs" data-testid={`accuracy-${s.complaintId}`}>
                          {Math.round(s.latestAccuracy * 100)}%
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.underTriageCount !== undefined ? (
                        <span className={s.underTriageCount > 0 ? "text-destructive font-medium" : ""} data-testid={`under-triage-${s.complaintId}`}>
                          {s.underTriageCount}
                          {s.underTriageRate !== undefined && s.underTriageRate > 0 && (
                            <span className="text-muted-foreground ml-1">({Math.round(s.underTriageRate * 100)}%)</span>
                          )}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.overTriageCount !== undefined ? (
                        <span data-testid={`over-triage-${s.complaintId}`}>
                          {s.overTriageCount}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.mismatchCount !== undefined ? (
                        <span data-testid={`mismatch-${s.complaintId}`}>{s.mismatchCount}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-xs" data-testid={`gold-${s.complaintId}`}>
                        {s.goldReviewCount || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{s.totalSyntheticRuns || 0}</TableCell>
                    <TableCell className="text-xs">
                      {Object.entries(s.dispositionBreakdown).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="mr-1 text-xs">{k}: {v}</Badge>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
