import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { DiscrepancyBadge } from "@/components/DiscrepancyBadge";

export default function Discrepancies() {
  const { data, isLoading, error } = useQuery<{ count: number; items: any[] }>({
    queryKey: ["/api/discrepancies"],
    queryFn: async () => {
      const res = await fetch("/api/discrepancies?limit=100");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-discrepancies">
      <div className="max-w-3xl mx-auto space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Discrepancies
        </h2>

        {isLoading && (
          <div className="flex items-center justify-center py-8" data-testid="text-loading">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive" data-testid="text-error">
            {String(error)}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <Card>
            <CardContent className="pt-4 text-sm text-muted-foreground" data-testid="text-empty">
              No discrepancies found.
            </CardContent>
          </Card>
        )}

        {items.map((item) => (
          <Card key={item.caseId} data-testid={`card-discrepancy-${item.caseId}`}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm" data-testid="text-complaint">
                  {item.complaintLabel || item.complaintId}
                </span>
                <DiscrepancyBadge type={item.discrepancyType} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div>Case: <span className="font-mono">{item.caseId}</span></div>
                <div>Reviewer: {item.reviewerId || "—"}</div>
                <div>
                  Engine disposition:{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {item.engineDisposition || "—"}
                  </Badge>
                </div>
                <div>
                  Final disposition:{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {item.finalDisposition || "—"}
                  </Badge>
                </div>
                <div>Engine top dx: {item.engineTopDx || "—"}</div>
                <div>Reviewer top dx: {item.reviewerTopDx || "—"}</div>
                <div className="col-span-2">
                  Red flags: {(item.triggeredRedFlags || []).join(", ") || "none"}
                </div>
              </div>

              <div className="flex justify-end">
                <Link href={`/review/${item.caseId}`}>
                  <Button variant="ghost" size="sm" data-testid="button-open-case">
                    Open Case
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
