import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ClipboardList, AlertTriangle, Clock } from "lucide-react";

function confidenceBadge(confidence: string | undefined) {
  if (!confidence) return <Badge variant="outline" data-testid="badge-confidence-unknown">—</Badge>;
  const variant =
    confidence === "HIGH"
      ? "default"
      : confidence === "MODERATE"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant} data-testid={`badge-confidence-${confidence}`}>{confidence}</Badge>;
}

function dispositionBadge(disposition: string | undefined) {
  if (!disposition) return <Badge variant="outline" data-testid="badge-disposition-none">—</Badge>;
  const variant = disposition === "er_send" ? "destructive" : "secondary";
  return <Badge variant={variant} data-testid={`badge-disposition-${disposition}`}>{disposition}</Badge>;
}

export default function ReviewQueue() {
  const [stateFilter, setStateFilter] = useState("NEEDS_REVIEW");

  const { data: items = [], isLoading, error } = useQuery<any[]>({
    queryKey: ["/api/review/queue", stateFilter],
    queryFn: async () => {
      const res = await fetch(`/api/review/queue?state=${stateFilter}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 10000,
  });

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-review-queue">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Physician Review Queue</h1>
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter} data-testid="select-state-filter">
            <SelectTrigger className="w-48" data-testid="select-trigger-state">
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
            <CardTitle className="text-lg">
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
