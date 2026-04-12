/**
 * Copilot Panel — physician approval interface for AI-generated intervention bundles
 * Shows pending co-pilot cards with approve/reject buttons and reasoning
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest }   from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }        from "@/components/ui/badge";
import { Button }       from "@/components/ui/button";
import { ScrollArea }   from "@/components/ui/scroll-area";
import { useToast }     from "@/hooks/use-toast";
import { Brain, CheckCircle, XCircle, Zap, AlertTriangle } from "lucide-react";

export interface CopilotPanelProps {
  physicianId?: string;
  maxCards?:    number;
}

function confidenceBadge(conf: number) {
  const pct = Math.round(conf * 100);
  const cls = pct >= 95 ? "bg-emerald-600 text-white" : pct >= 85 ? "bg-blue-600 text-white" : "bg-yellow-500 text-black";
  return <Badge className={`text-xs px-1.5 ${cls}`}>{pct}% confidence</Badge>;
}

export default function CopilotPanel({ physicianId = "attending-md", maxCards = 20 }: CopilotPanelProps) {
  const { toast } = useToast();
  const qc        = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey:        ["/api/medical-os/copilot/cards/pending"],
    refetchInterval: 5000,
  });

  const approveMut = useMutation({
    mutationFn: (cardId: string) => apiRequest("POST", `/api/medical-os/copilot/cards/${cardId}/approve`, { physicianId }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["/api/medical-os/copilot/cards/pending"] }); toast({ title: "Intervention approved" }); },
    onError:    () => toast({ title: "Approve failed", variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: (cardId: string) => apiRequest("POST", `/api/medical-os/copilot/cards/${cardId}/reject`, { physicianId, reason: "Rejected via dashboard" }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["/api/medical-os/copilot/cards/pending"] }); toast({ title: "Intervention rejected" }); },
    onError:    () => toast({ title: "Reject failed", variant: "destructive" }),
  });

  const cards = (data?.cards ?? []).slice(0, maxCards);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" /> Physician Co-Pilot
          {cards.length > 0 && (
            <Badge className="ml-auto bg-yellow-500 text-black text-xs">{cards.length} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-96 px-3 py-2">
          {isLoading && <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>}
          {!isLoading && cards.length === 0 && (
            <div className="text-xs text-muted-foreground py-6 text-center">No pending interventions — run triage to generate co-pilot cards</div>
          )}
          {cards.map((c: any) => (
            <div key={c.id} data-testid={`copilot-card-${c.id}`} className="border rounded-lg p-3 mb-2 text-xs space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">Pt {c.patientId}</span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="font-mono font-bold text-primary">{c.recommendation.replace(/_/g, " ")}</span>
                </div>
                {confidenceBadge(c.confidence)}
              </div>

              {/* Actions list */}
              <div className="space-y-0.5">
                {c.actions?.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.urgency === "immediate" ? "bg-red-500" : a.urgency === "urgent" ? "bg-orange-500" : "bg-slate-400"}`} />
                    <span className="font-mono">{a.action}</span>
                    <span className="text-muted-foreground">— {a.description}</span>
                  </div>
                ))}
              </div>

              {/* Reasoning */}
              <div className="text-muted-foreground border-t pt-1.5 space-y-0.5">
                {c.reasoning?.slice(0, 2).map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0 text-yellow-600" />{r}</div>
                ))}
              </div>

              {/* Approve / Reject */}
              {c.requiresApproval && c.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveMut.mutate(c.id)} disabled={approveMut.isPending} data-testid={`approve-card-${c.id}`}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-red-300 text-red-700" onClick={() => rejectMut.mutate(c.id)} disabled={rejectMut.isPending} data-testid={`reject-card-${c.id}`}>
                    <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                  </Button>
                </div>
              )}

              {c.status === "auto-executed" && (
                <div className="flex items-center gap-1 text-emerald-700 text-xs"><Zap className="h-3 w-3" />Auto-executed (confidence ≥ 95%)</div>
              )}
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
