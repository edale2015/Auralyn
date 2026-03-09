import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, ArrowDown, ArrowUp, ArrowLeftRight, ArrowLeft } from "lucide-react";

type MismatchEntry = {
  caseId: string;
  complaintId: string;
  disposition?: string;
  expectedDisposition?: string;
  confidence?: string;
  topDiagnosis?: string;
  redFlags?: string[];
  diagnosisScores?: Record<string, number>;
  durationMs: number;
  mismatchType: "under_triage" | "over_triage" | "label_mismatch";
  severityGap: number;
};

type MismatchResponse = {
  total: number;
  underTriage: number;
  overTriage: number;
  labelMismatch: number;
  mismatches: MismatchEntry[];
};

function summarizeAnswers(entry: MismatchEntry): string {
  const parts: string[] = [];
  if (entry.topDiagnosis) parts.push(`Dx: ${entry.topDiagnosis}`);
  if (entry.confidence) parts.push(`Conf: ${entry.confidence}`);
  if (entry.redFlags && entry.redFlags.length > 0) parts.push(`RF: ${entry.redFlags.length}`);
  return parts.join(" | ") || "—";
}

export default function MismatchDashboard() {
  const [, params] = useRoute("/mismatch-dashboard/:runId");
  const runId = params?.runId || "";
  const { authFetch } = useAuth();
  const [filter, setFilter] = useState<string>("all");

  const queryUrl = filter === "all"
    ? `/api/syntheticTesting/runs/${runId}/mismatches`
    : `/api/syntheticTesting/runs/${runId}/mismatches?type=${filter}`;

  const { data, isLoading, error } = useQuery<MismatchResponse>({
    queryKey: ["/api/syntheticTesting/runs", runId, "mismatches", filter],
    queryFn: async () => {
      const res = await authFetch(queryUrl);
      if (!res.ok) throw new Error("Failed to load mismatches");
      return res.json();
    },
    enabled: !!runId,
  });

  const mismatchTypeIcon = (type: string) => {
    switch (type) {
      case "under_triage": return <ArrowDown className="w-4 h-4 text-red-500" />;
      case "over_triage": return <ArrowUp className="w-4 h-4 text-amber-500" />;
      default: return <ArrowLeftRight className="w-4 h-4 text-blue-500" />;
    }
  };

  const mismatchTypeBadge = (type: string) => {
    switch (type) {
      case "under_triage": return <Badge variant="destructive" data-testid={`badge-type-${type}`}>Under-triage</Badge>;
      case "over_triage": return <Badge variant="secondary" data-testid={`badge-type-${type}`}>Over-triage</Badge>;
      default: return <Badge variant="outline" data-testid={`badge-type-${type}`}>Label Mismatch</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-4" data-testid="page-mismatch-dashboard">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/synthetic-testing">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <AlertTriangle className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Mismatch Dashboard</h2>
        <Badge variant="outline" data-testid="badge-run-id">{runId}</Badge>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card data-testid="status-error">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">Failed to load mismatches. The run may not exist.</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card data-testid="card-total">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Mismatches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-count">{data.total}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-under-triage">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Under-triage</CardTitle>
                <ArrowDown className="w-4 h-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-under-count">{data.underTriage}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-over-triage">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Over-triage</CardTitle>
                <ArrowUp className="w-4 h-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-over-count">{data.overTriage}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-label-mismatch">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Label Mismatch</CardTitle>
                <ArrowLeftRight className="w-4 h-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-label-count">{data.labelMismatch}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Select value={filter} onValueChange={setFilter} data-testid="select-filter">
              <SelectTrigger className="w-[180px]" data-testid="select-filter-trigger">
                <SelectValue placeholder="All mismatches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-all">All mismatches</SelectItem>
                <SelectItem value="under_triage" data-testid="option-under">Under-triage</SelectItem>
                <SelectItem value="over_triage" data-testid="option-over">Over-triage</SelectItem>
                <SelectItem value="label_mismatch" data-testid="option-label">Label Mismatch</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground" data-testid="text-showing">
              Showing {data.mismatches.length} of {data.total}
            </span>
          </div>

          {data.mismatches.length === 0 ? (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground" data-testid="text-no-mismatches">
                  {data.total === 0 ? "No mismatches found for this run." : "No mismatches match the current filter."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table data-testid="table-mismatches">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Case ID</TableHead>
                      <TableHead>Engine Disposition</TableHead>
                      <TableHead>Expected Disposition</TableHead>
                      <TableHead>Gap</TableHead>
                      <TableHead>Top Diagnosis</TableHead>
                      <TableHead>Red Flags</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.mismatches.map((m) => (
                      <TableRow key={m.caseId} data-testid={`row-mismatch-${m.caseId}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {mismatchTypeIcon(m.mismatchType)}
                            {mismatchTypeBadge(m.mismatchType)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono" data-testid={`text-caseid-${m.caseId}`}>{m.caseId.slice(0, 16)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-engine-${m.caseId}`}>{m.disposition || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-expected-${m.caseId}`}>{m.expectedDisposition || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium" data-testid={`text-gap-${m.caseId}`}>
                            {m.severityGap > 0 ? `+${m.severityGap}` : m.severityGap}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-dx-${m.caseId}`}>{m.topDiagnosis || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.redFlags && m.redFlags.length > 0 ? m.redFlags.map((rf, i) => (
                              <Badge key={i} variant="destructive" className="text-xs" data-testid={`badge-rf-${m.caseId}-${i}`}>{rf}</Badge>
                            )) : <span className="text-xs text-muted-foreground">None</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-conf-${m.caseId}`}>{m.confidence || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{summarizeAnswers(m)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
