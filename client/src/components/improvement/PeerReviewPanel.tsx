import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, ChevronDown, ChevronUp, Edit3, Loader2,
  ThumbsDown, ThumbsUp, UserCheck, XCircle,
} from "lucide-react";

type Recommendation = {
  id: number; complaint: string; recommendation: string; rationale: string;
  rule_type: string; confidence: number; status: string; document_title: string; source: string; created_at: string;
};

const ruleTypeColors: Record<string, string> = {
  add_question:  "border-blue-500/30 text-blue-400 bg-blue-500/10",
  add_red_flag:  "border-red-500/30 text-red-400 bg-red-500/10",
  add_treatment: "border-green-500/30 text-green-400 bg-green-500/10",
  safety_check:  "border-orange-500/30 text-orange-400 bg-orange-500/10",
  screening:     "border-purple-500/30 text-purple-400 bg-purple-500/10",
  general:       "border-muted-foreground/30 text-muted-foreground",
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" },
  approved: { label: "Approved", color: "border-green-500/30 text-green-400 bg-green-500/10" },
  rejected: { label: "Rejected", color: "border-red-500/30 text-red-400 bg-red-500/10" },
  modified: { label: "Modified", color: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
};

function RecCard({ rec, onDecision }: { rec: Recommendation; onDecision: (id: number, decision: string, notes: string, modified?: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes,    setNotes]    = useState("");
  const [modified, setModified] = useState(rec.recommendation);
  const [isEditing, setIsEditing] = useState(false);

  const statusCfg   = statusConfig[rec.status] ?? statusConfig.pending;
  const ruleTypeCfg = ruleTypeColors[rec.rule_type] ?? ruleTypeColors.general;
  const isPending   = rec.status === "pending";

  return (
    <Card className={cn("border overflow-hidden", rec.status === "approved" ? "border-green-500/20 bg-green-500/5" : rec.status === "rejected" ? "border-red-500/20 bg-red-500/5" : "border-border/60")}>
      <button
        className="w-full flex items-start gap-2.5 p-3 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`rec-${rec.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold leading-snug line-clamp-2">{rec.recommendation}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", ruleTypeCfg)}>{rec.rule_type?.replace(/_/g, " ")}</Badge>
            <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", statusCfg.color)}>{statusCfg.label}</Badge>
            {rec.complaint && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{rec.complaint}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">{Math.round((rec.confidence ?? 0.75) * 100)}% conf</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={13} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={13} className="text-muted-foreground flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t bg-muted/10">
          {rec.rationale && (
            <p className="text-[11px] text-muted-foreground pt-2 leading-relaxed">{rec.rationale}</p>
          )}
          {rec.document_title && (
            <div className="text-[10px] text-muted-foreground">Source: <span className="text-foreground">{rec.document_title}</span> ({rec.source})</div>
          )}

          {isPending && (
            <>
              {isEditing && (
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">Modified Text</div>
                  <Textarea
                    value={modified}
                    onChange={e => setModified(e.target.value)}
                    className="text-xs min-h-[60px] resize-none"
                    data-testid={`input-modified-${rec.id}`}
                  />
                </div>
              )}
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Review notes (optional)…"
                className="text-xs min-h-[50px] resize-none"
                data-testid={`input-notes-${rec.id}`}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10 flex-1"
                  onClick={() => onDecision(rec.id, "approve", notes)}
                  data-testid={`button-approve-${rec.id}`}
                >
                  <ThumbsUp size={11} /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 flex-1"
                  onClick={() => { setIsEditing(e => !e); }}
                  data-testid={`button-modify-${rec.id}`}
                >
                  <Edit3 size={11} /> {isEditing ? "Done" : "Modify"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10 flex-1"
                  onClick={() => onDecision(rec.id, "reject", notes)}
                  data-testid={`button-reject-${rec.id}`}
                >
                  <ThumbsDown size={11} /> Reject
                </Button>
                {isEditing && (
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1 ml-auto"
                    onClick={() => onDecision(rec.id, "modify", notes, modified)}
                    data-testid={`button-submit-modify-${rec.id}`}
                  >
                    <CheckCircle2 size={11} /> Submit Modified
                  </Button>
                )}
              </div>
            </>
          )}

          {!isPending && (
            <div className={cn("flex items-center gap-1.5 text-xs", statusCfg.color.split(" ")[1])}>
              {rec.status === "approved" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {statusCfg.label} — queued to KB knowledge changes
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PeerReviewPanel() {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const { toast } = useToast();
  const qc = useQueryClient();

  const recsQ = useQuery<{ ok: boolean; recommendations: Recommendation[] }>({
    queryKey: ["/api/improvement/recommendations", filter],
    queryFn: () =>
      fetch(`/api/improvement/recommendations${filter === "pending" ? "?status=pending" : ""}`)
        .then(r => r.json()),
    refetchInterval: 10_000,
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, decision, notes, modified }: { id: number; decision: string; notes: string; modified?: string }) =>
      apiRequest("POST", `/api/improvement/recommendations/${id}/review`, { decision, notes, modifiedText: modified }).then(r => r.json()),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["/api/improvement/recommendations"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/peer-reviews"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/stats"] });
      toast({ title: `Decision: ${v.decision}`, description: v.decision === "approve" ? "Queued to KB for deployment" : "Recorded" });
    },
    onError: (e: any) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const recs = recsQ.data?.recommendations ?? [];
  const pendingCount = recs.filter(r => r.status === "pending").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <UserCheck size={13} className="text-yellow-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Physician Peer Review</span>
        {pendingCount > 0 && (
          <Badge variant="outline" className="ml-auto text-[10px] h-4 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex border-b bg-muted/10">
        {(["pending", "all"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`filter-review-${f}`}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-semibold capitalize border-b-2 transition-colors",
              filter === f ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "pending" ? `Pending (${pendingCount})` : "All Reviews"}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {recsQ.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : recs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <CheckCircle2 size={28} className="text-green-400" />
            <div className="text-xs font-medium text-green-400">All clear</div>
            <div className="text-[11px]">No {filter === "pending" ? "pending " : ""}recommendations</div>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {recs.map(r => (
              <RecCard
                key={r.id}
                rec={r}
                onDecision={(id, decision, notes, modified) =>
                  reviewMut.mutate({ id, decision, notes, modified })
                }
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
