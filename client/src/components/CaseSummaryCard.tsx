import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CaseSummaryCard({ caseRecord }: { caseRecord: any }) {
  const disposition = caseRecord.engineResult?.recommendedDisposition;
  const redFlags = caseRecord.engineResult?.triggeredRedFlags ?? [];
  const label = caseRecord.complaintLabel || caseRecord.complaintId || "Unknown";

  return (
    <Card className="mb-3" data-testid={`card-case-${caseRecord.caseId}`}>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm" data-testid="text-complaint-label">{label}</h4>
          <Badge
            variant={disposition === "er_send" ? "destructive" : "secondary"}
            data-testid="badge-disposition"
          >
            {disposition ?? "—"}
          </Badge>
        </div>

        {redFlags.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-destructive" data-testid="text-red-flags">
            <AlertTriangle className="h-3 w-3" />
            {redFlags.join(", ")}
          </div>
        )}

        <div className="flex justify-end">
          <Link href={`/review/${caseRecord.caseId}`}>
            <Button variant="ghost" size="sm" data-testid="button-review-case">
              Review Case
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
