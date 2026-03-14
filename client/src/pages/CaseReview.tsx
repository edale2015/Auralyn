import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CheckCircle,
  Edit,
  AlertTriangle,
  XCircle,
  Loader2,
  Keyboard,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function CaseReview({ params }: { params: { caseId: string } }) {
  const { caseId } = params;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

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
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/review/case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review/queue"] });
      toast({ title: `Case ${status.toLowerCase()}`, description: `Review status set to ${status}` });
    },
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input") return;
      if (reviewMutation.isPending || !c) return;

      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault();
          reviewMutation.mutate("APPROVED");
          toast({ title: "⌨️ Approved", description: "Keyboard shortcut: A" });
          break;
        case "r":
          e.preventDefault();
          reviewMutation.mutate("MODIFIED");
          toast({ title: "⌨️ Modify", description: "Keyboard shortcut: R" });
          break;
        case "e":
          e.preventDefault();
          reviewMutation.mutate("ESCALATED");
          toast({ title: "⌨️ Escalated", description: "Keyboard shortcut: E" });
          break;
        case "x":
          e.preventDefault();
          reviewMutation.mutate("REJECTED");
          toast({ title: "⌨️ Rejected", description: "Keyboard shortcut: X" });
          break;
        case "n":
          e.preventDefault();
          notesRef.current?.focus();
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [c, reviewMutation.isPending]);

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
        <div className="flex items-center justify-between">
          <Link href="/review" className="text-primary underline text-sm" data-testid="link-back">
            <ArrowLeft className="inline h-4 w-4 mr-1" />
            Back to Queue
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShortcuts((v) => !v)}
                data-testid="button-shortcuts"
                className="text-muted-foreground text-xs gap-1"
              >
                <Keyboard className="w-3.5 h-3.5" /> Shortcuts (?)
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle keyboard shortcuts reference</TooltipContent>
          </Tooltip>
        </div>

        {showShortcuts && (
          <Card className="border-dashed bg-muted/30" data-testid="card-shortcuts">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {[
                  { key: "A", action: "Approve case" },
                  { key: "R", action: "Modify/request changes" },
                  { key: "E", action: "Escalate" },
                  { key: "X", action: "Reject" },
                  { key: "N", action: "Focus notes input" },
                  { key: "?", action: "Toggle this panel" },
                ].map(({ key, action }) => (
                  <div key={key} className="flex items-center gap-2">
                    <kbd className="bg-background border rounded px-1.5 py-0.5 font-mono text-xs font-bold">{key}</kbd>
                    <span className="text-muted-foreground">{action}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-lg" data-testid="text-case-id">{c.caseId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Complaint</span>
                <p data-testid="text-complaint" className="font-medium">{c.complaint?.display ?? c.complaint?.slug ?? "—"}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">State</span>
                <p><Badge variant="outline" data-testid="badge-state">{c.state}</Badge></p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Disposition</span>
                <p><Badge variant={c.triage?.disposition === "er_send" ? "destructive" : "secondary"} data-testid="badge-disposition">{c.triage?.disposition ?? "—"}</Badge></p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Top Cluster</span>
                <p data-testid="text-top-cluster" className="text-sm">{c.triage?.topCluster ?? "—"}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Confidence</span>
                <p>
                  <Badge
                    variant={c.triage?.confidence === "HIGH" ? "default" : c.triage?.confidence === "MODERATE" ? "secondary" : "destructive"}
                    data-testid="badge-confidence"
                  >
                    {c.triage?.confidence ?? "—"}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Tie-Break</span>
                <p data-testid="text-tiebreak" className="text-xs text-muted-foreground">{c.triage?.tieBreak ?? "—"} (margin {c.triage?.margin ?? "—"})</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Answers</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64" data-testid="text-answers">
              {JSON.stringify(c.answers?.structured ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Scoring Explanation</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64" data-testid="text-explanation">
              {JSON.stringify(c.triage?.explanation ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Physician Review
              <span className="text-xs font-normal text-muted-foreground">Use keyboard shortcuts (?) for faster review</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewMutation.error && (
              <div className="text-destructive text-sm" data-testid="text-review-error">
                {String(reviewMutation.error)}
              </div>
            )}

            <Textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Physician notes... (press N to focus)"
              data-testid="input-notes"
            />

            <div className="flex gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => reviewMutation.mutate("APPROVED")} disabled={reviewMutation.isPending} data-testid="button-approve">
                    <CheckCircle className="mr-1 h-4 w-4" /> Approve
                    <kbd className="ml-2 text-xs bg-white/20 px-1 rounded">A</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve case (press A)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" onClick={() => reviewMutation.mutate("MODIFIED")} disabled={reviewMutation.isPending} data-testid="button-modify">
                    <Edit className="mr-1 h-4 w-4" /> Modify
                    <kbd className="ml-2 text-xs bg-black/10 px-1 rounded">R</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Modify/request changes (press R)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => reviewMutation.mutate("ESCALATED")} disabled={reviewMutation.isPending} data-testid="button-escalate">
                    <AlertTriangle className="mr-1 h-4 w-4" /> Escalate
                    <kbd className="ml-2 text-xs bg-black/5 px-1 rounded">E</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Escalate case (press E)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" onClick={() => reviewMutation.mutate("REJECTED")} disabled={reviewMutation.isPending} data-testid="button-reject">
                    <XCircle className="mr-1 h-4 w-4" /> Reject
                    <kbd className="ml-2 text-xs bg-white/20 px-1 rounded">X</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reject case (press X)</TooltipContent>
              </Tooltip>

              {reviewMutation.isPending && <Loader2 className="h-5 w-5 animate-spin self-center" />}
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
