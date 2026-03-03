import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CheckCircle,
  Edit,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function CaseReview({ params }: { params: { caseId: string } }) {
  const { caseId } = params;
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const {
    data: c,
    isLoading,
    error,
  } = useQuery<any>({
    queryKey: ["/api/review/case", caseId],
    queryFn: async () => {
      const res = await fetch(`/api/review/case/${caseId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!caseId,
  });

  const reviewMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("POST", `/api/review/case/${caseId}`, {
        status,
        notes,
        finalDisposition: c?.triage?.disposition ?? null,
        finalDx: c?.triage?.topCluster ?? null,
        reviewer: { id: "phys1", name: "Physician" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/review/case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review/queue"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="text-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !c) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/review" className="text-primary underline" data-testid="link-back">
            <ArrowLeft className="inline h-4 w-4 mr-1" />
            Back to Queue
          </Link>
          <Card className="mt-4 border-destructive">
            <CardContent className="pt-4 text-destructive" data-testid="text-error">
              {error ? String(error) : "Case not found"}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-case-review">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/review" className="text-primary underline text-sm" data-testid="link-back">
          <ArrowLeft className="inline h-4 w-4 mr-1" />
          Back to Queue
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-lg" data-testid="text-case-id">{c.caseId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Complaint:</span>{" "}
              <span data-testid="text-complaint">{c.complaint?.display ?? c.complaint?.slug}</span>
            </div>
            <div>
              <span className="font-medium">State:</span>{" "}
              <Badge variant="outline" data-testid="badge-state">{c.state}</Badge>
            </div>
            <div>
              <span className="font-medium">Disposition:</span>{" "}
              <Badge
                variant={c.triage?.disposition === "er_send" ? "destructive" : "secondary"}
                data-testid="badge-disposition"
              >
                {c.triage?.disposition ?? "—"}
              </Badge>
            </div>
            <div>
              <span className="font-medium">Top Cluster:</span>{" "}
              <span data-testid="text-top-cluster">{c.triage?.topCluster ?? "—"}</span>
            </div>
            <div>
              <span className="font-medium">Confidence:</span>{" "}
              <Badge
                variant={
                  c.triage?.confidence === "HIGH"
                    ? "default"
                    : c.triage?.confidence === "MODERATE"
                      ? "secondary"
                      : "destructive"
                }
                data-testid="badge-confidence"
              >
                {c.triage?.confidence ?? "—"}
              </Badge>
            </div>
            <div>
              <span className="font-medium">Tie-Break:</span>{" "}
              <span data-testid="text-tiebreak">
                {c.triage?.tieBreak ?? "—"} (margin {c.triage?.margin ?? "—"})
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Answers</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64"
              data-testid="text-answers"
            >
              {JSON.stringify(c.answers?.structured ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring Explanation</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64"
              data-testid="text-explanation"
            >
              {JSON.stringify(c.triage?.explanation ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Physician Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewMutation.error && (
              <div className="text-destructive text-sm" data-testid="text-review-error">
                {String(reviewMutation.error)}
              </div>
            )}

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Physician notes..."
              data-testid="input-notes"
            />

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => reviewMutation.mutate("APPROVED")}
                disabled={reviewMutation.isPending}
                data-testid="button-approve"
              >
                <CheckCircle className="mr-1 h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => reviewMutation.mutate("MODIFIED")}
                disabled={reviewMutation.isPending}
                data-testid="button-modify"
              >
                <Edit className="mr-1 h-4 w-4" />
                Modify
              </Button>
              <Button
                variant="outline"
                onClick={() => reviewMutation.mutate("ESCALATED")}
                disabled={reviewMutation.isPending}
                data-testid="button-escalate"
              >
                <AlertTriangle className="mr-1 h-4 w-4" />
                Escalate
              </Button>
              <Button
                variant="destructive"
                onClick={() => reviewMutation.mutate("REJECTED")}
                disabled={reviewMutation.isPending}
                data-testid="button-reject"
              >
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-review-status">
              Current review status:{" "}
              <Badge variant="outline">{c.physicianReview?.status ?? "NONE"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
