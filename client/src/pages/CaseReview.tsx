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
  ClipboardSignature,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DischargeInstructionPanel } from "@/components/DischargeInstructionPanel";
import { CDSSidebarPanel } from "@/components/CDSSidebarPanel";
import { AmbientNotePanel } from "@/components/AmbientNotePanel";
import { EConsultPanel } from "@/components/EConsultPanel";

export default function CaseReview({ params }: { params: { caseId: string } }) {
  const { caseId }     = params;
  const queryClient    = useQueryClient();
  const { toast }      = useToast();
  const [notes, setNotes]               = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [dischargeText, setDischargeText] = useState<string>("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const { data: c, isLoading, error } = useQuery<any>({
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
        finalDx:          c?.triage?.topCluster  ?? null,
        reviewer:         { id: "phys1", name: "Physician" },
        dischargeText:    dischargeText || undefined,
      });
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/review/case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/review/queue"] });
      toast({ title: `Case ${status.toLowerCase()}`, description: `Review status set to ${status}` });
    },
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
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
          toast({ title: "⌨️ Modify / Request Changes", description: "Keyboard shortcut: R" });
          break;
        case "s":
          e.preventDefault();
          reviewMutation.mutate("SIGNED_OFF");
          toast({ title: "⌨️ Signed Off", description: "Keyboard shortcut: S" });
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

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="text-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !c) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
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

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6" data-testid="page-case-review">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <Link href="/review" className="text-primary underline text-sm" data-testid="link-back">
            <ArrowLeft className="inline h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back to Queue</span>
            <span className="sm:hidden">Queue</span>
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
                <Keyboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Shortcuts (?)</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle keyboard shortcuts reference</TooltipContent>
          </Tooltip>
        </div>

        {/* Shortcuts panel */}
        {showShortcuts && (
          <Card className="border-dashed bg-muted/30" data-testid="card-shortcuts">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { key: "A", action: "Approve case" },
                  { key: "R", action: "Request changes" },
                  { key: "S", action: "Sign-off" },
                  { key: "E", action: "Escalate" },
                  { key: "X", action: "Reject" },
                  { key: "N", action: "Focus notes" },
                  { key: "?", action: "Toggle shortcuts" },
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

        {/* Case summary */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-base sm:text-lg break-all" data-testid="text-case-id">
              {c.caseId}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Complaint</span>
                <p data-testid="text-complaint" className="font-medium">
                  {c.complaint?.display ?? c.complaint?.slug ?? "—"}
                </p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">State</span>
                <p><Badge variant="outline" data-testid="badge-state">{c.state}</Badge></p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Disposition</span>
                <p>
                  <Badge
                    variant={c.triage?.disposition === "er_send" ? "destructive" : "secondary"}
                    data-testid="badge-disposition"
                  >
                    {c.triage?.disposition ?? "—"}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Top Cluster</span>
                <p data-testid="text-top-cluster" className="text-sm">{c.triage?.topCluster ?? "—"}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Confidence</span>
                <p>
                  <Badge
                    variant={
                      c.triage?.confidence === "HIGH" ? "default" :
                      c.triage?.confidence === "MODERATE" ? "secondary" : "destructive"
                    }
                    data-testid="badge-confidence"
                  >
                    {c.triage?.confidence ?? "—"}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Tie-Break</span>
                <p data-testid="text-tiebreak" className="text-xs text-muted-foreground">
                  {c.triage?.tieBreak ?? "—"} (margin {c.triage?.margin ?? "—"})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* eConsult panel — shown for pcp and urgent_care dispositions only */}
        {(c.triage?.disposition === "pcp" || c.triage?.disposition === "urgent_care") && (
          <EConsultPanel
            caseId={c.caseId}
            complaint={c.complaint?.slug}
            disposition={c.triage?.disposition}
            topCluster={c.triage?.topCluster}
            differential={c.triage?.differential ?? []}
            confidence={c.triage?.confidence}
            patientMedications={c.answers?.structured?.medications as string[] ?? []}
            allergies={c.answers?.structured?.allergies as string[] ?? []}
          />
        )}

        {/* Answers */}
        <Card>
          <CardHeader><CardTitle className="text-base">Answers</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64" data-testid="text-answers">
              {JSON.stringify(c.answers?.structured ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Scoring */}
        <Card>
          <CardHeader><CardTitle className="text-base">Scoring Explanation</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64" data-testid="text-explanation">
              {JSON.stringify(c.triage?.explanation ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Discharge Instructions */}
        <DischargeInstructionPanel
          caseId={c.caseId}
          patientName={c.answers?.structured?.name as string | undefined ?? "Patient"}
          complaint={c.complaint?.slug}
          disposition={c.triage?.disposition}
          onInstructionsReady={(text) => setDischargeText(text)}
        />

        {/* Ambient note capture */}
        <AmbientNotePanel
          caseId={c.caseId}
          complaint={c.complaint?.slug}
          onTranscript={(text) => setNotes(prev => prev ? prev + "\n" + text : text)}
          onStamp={(soapText) => setNotes(soapText)}
        />

        {/* Review actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span>Physician Review</span>
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
              placeholder="Physician notes… (press N to focus)"
              data-testid="input-notes"
            />

            {/* Action buttons — wrap on mobile */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => reviewMutation.mutate("APPROVED")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-approve"
                  >
                    <CheckCircle className="mr-1 h-4 w-4" /> Approve
                    <kbd className="ml-2 text-xs bg-white/20 px-1 rounded hidden sm:inline">A</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve case (press A)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => reviewMutation.mutate("MODIFIED")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-modify"
                  >
                    <Edit className="mr-1 h-4 w-4" /> Request Changes
                    <kbd className="ml-2 text-xs bg-black/10 px-1 rounded hidden sm:inline">R</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Request changes (press R)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => reviewMutation.mutate("SIGNED_OFF")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-signoff"
                  >
                    <ClipboardSignature className="mr-1 h-4 w-4" /> Sign-off
                    <kbd className="ml-2 text-xs bg-black/5 px-1 rounded hidden sm:inline">S</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign-off case (press S)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => reviewMutation.mutate("ESCALATED")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-escalate"
                  >
                    <AlertTriangle className="mr-1 h-4 w-4" /> Escalate
                    <kbd className="ml-2 text-xs bg-black/5 px-1 rounded hidden sm:inline">E</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Escalate case (press E)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={() => reviewMutation.mutate("REJECTED")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-reject"
                  >
                    <XCircle className="mr-1 h-4 w-4" /> Reject
                    <kbd className="ml-2 text-xs bg-white/20 px-1 rounded hidden sm:inline">X</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reject case (press X)</TooltipContent>
              </Tooltip>

              {reviewMutation.isPending && (
                <Loader2 className="h-5 w-5 animate-spin self-center col-span-2 sm:col-span-1" />
              )}
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-review-status">
              Current review status:{" "}
              <Badge variant="outline">{c.physicianReview?.status ?? "NONE"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── CDS Sidebar ── */}
      <CDSSidebarPanel
        caseId={c.caseId}
        complaint={c.complaint?.slug}
        disposition={c.triage?.disposition}
        patientMedications={c.answers?.structured?.medications as string[] ?? []}
        allergies={c.answers?.structured?.allergies as string[] ?? []}
      />
    </div>
  );
}
