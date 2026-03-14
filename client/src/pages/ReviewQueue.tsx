import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList, AlertTriangle, Clock, Radio, WifiOff } from "lucide-react";

function confidenceBadge(confidence: string | undefined) {
  if (!confidence) return <Badge variant="outline" data-testid="badge-confidence-unknown">—</Badge>;
  const variant =
    confidence === "HIGH" ? "default" : confidence === "MODERATE" ? "secondary" : "destructive";
  return <Badge variant={variant} data-testid={`badge-confidence-${confidence}`}>{confidence}</Badge>;
}

function dispositionBadge(disposition: string | undefined) {
  if (!disposition) return <Badge variant="outline" data-testid="badge-disposition-none">—</Badge>;
  const variant = disposition === "er_send" ? "destructive" : "secondary";
  return <Badge variant={variant} data-testid={`badge-disposition-${disposition}`}>{disposition}</Badge>;
}

export default function ReviewQueue() {
  const [stateFilter, setStateFilter] = useState("NEEDS_REVIEW");
  const [sseConnected, setSseConnected] = useState(false);
  const [sseError, setSseError] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const qc = useQueryClient();

  const { data: items = [], isLoading, error, refetch } = useQuery<any[]>({
    queryKey: ["/api/review/queue", stateFilter],
    queryFn: async () => {
      const res = await fetch(`/api/review/queue?state=${stateFilter}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: sseConnected ? false : 15000,
  });

  useEffect(() => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const url = `/api/sse/review-queue?state=${stateFilter}`;

    function connect() {
      if (esRef.current) esRef.current.close();

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
        setSseError(false);
      };

      es.addEventListener("queue-update", () => {
        qc.invalidateQueries({ queryKey: ["/api/review/queue", stateFilter] });
      });

      es.addEventListener("connected", () => {
        setSseConnected(true);
        setSseError(false);
        refetch();
      });

      es.onerror = () => {
        setSseConnected(false);
        setSseError(true);
        es.close();
        setTimeout(connect, 10000);
      };
    }

    connect();
    return () => {
      esRef.current?.close();
      setSseConnected(false);
    };
  }, [stateFilter]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-testid="page-review-queue">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary shrink-0" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Physician Review Queue</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                {sseConnected ? (
                  <>
                    <Radio className="w-3 h-3 text-green-500 animate-pulse" />
                    <span>Live updates</span>
                  </>
                ) : sseError ? (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-500" />
                    <span>Polling fallback (15s)</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3" />
                    <span>Connecting...</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter} data-testid="select-state-filter">
            <SelectTrigger className="w-44" data-testid="select-trigger-state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
              <SelectItem value="TRIAGED">Triaged</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-destructive" data-testid="text-error">
                <AlertTriangle className="h-4 w-4" />
                {String(error)}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">
              {stateFilter === "NEEDS_REVIEW" ? "Pending Review" : "Triaged"} ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground" data-testid="text-loading">
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Loading cases...
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-empty">
                No cases in this queue.
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Case</TableHead>
                        <TableHead>Complaint</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((c: any) => (
                        <TableRow key={c.caseId} data-testid={`row-case-${c.caseId}`}>
                          <TableCell>
                            <Link
                              href={`/review/${c.caseId}`}
                              className="text-primary underline font-mono text-sm"
                              data-testid={`link-case-${c.caseId}`}
                            >
                              {c.caseId}
                            </Link>
                          </TableCell>
                          <TableCell data-testid={`text-complaint-${c.caseId}`}>
                            {c.complaint?.display ?? c.complaint?.slug ?? "—"}
                          </TableCell>
                          <TableCell>{dispositionBadge(c.triage?.disposition)}</TableCell>
                          <TableCell>{confidenceBadge(c.triage?.confidence)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm" data-testid={`text-updated-${c.caseId}`}>
                            {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="md:hidden space-y-3">
                  {items.map((c: any) => (
                    <Link key={c.caseId} href={`/review/${c.caseId}`} data-testid={`link-case-mobile-${c.caseId}`}>
                      <Card className="cursor-pointer hover:border-primary transition-colors">
                        <CardContent className="pt-3 pb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm text-primary underline" data-testid={`text-case-id-mobile-${c.caseId}`}>
                              {c.caseId}
                            </span>
                            {confidenceBadge(c.triage?.confidence)}
                          </div>
                          <div className="text-sm font-medium" data-testid={`text-complaint-mobile-${c.caseId}`}>
                            {c.complaint?.display ?? c.complaint?.slug ?? "—"}
                          </div>
                          <div className="flex items-center gap-2">
                            {dispositionBadge(c.triage?.disposition)}
                            <span className="text-xs text-muted-foreground">
                              {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
