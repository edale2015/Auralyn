import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, UserPlus, MessageSquare, AlertTriangle, XCircle, Loader2 } from "lucide-react";

type Props = {
  caseId: string;
  onActionComplete?: () => void;
};

export function CaseOpsActions({ caseId, onActionComplete }: Props) {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showAssignInput, setShowAssignInput] = useState(false);
  const [reviewerId, setReviewerId] = useState("");

  async function executeAction(action: string, body: Record<string, string> = {}) {
    setLoading(true);
    try {
      const res = await authFetch(`/api/caseOpsActions/${caseId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Action failed");
      toast({ title: "Action completed", description: json.message });
      onActionComplete?.();
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message ?? "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid={`case-ops-actions-${caseId}`}>
      {showAssignInput ? (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Reviewer ID"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="h-8 w-36 text-sm"
            data-testid="input-reviewer-id"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!reviewerId || loading}
            onClick={() => {
              executeAction("assign_reviewer", { reviewerId });
              setShowAssignInput(false);
              setReviewerId("");
            }}
            data-testid="button-assign-confirm"
          >
            Assign
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAssignInput(false)}
            data-testid="button-assign-cancel"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading} data-testid="button-ops-menu">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              <span className="ml-1 text-xs">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setShowAssignInput(true)}
              data-testid="action-assign-reviewer"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Reviewer
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => executeAction("request_more_info", { reason: "Additional information needed" })}
              data-testid="action-request-info"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Request More Info
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => executeAction("escalate", { reason: "Escalated for urgent review" })}
              className="text-amber-600"
              data-testid="action-escalate"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Escalate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => executeAction("close")}
              className="text-destructive"
              data-testid="action-close"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Close Case
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
