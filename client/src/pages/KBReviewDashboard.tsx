import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, ClipboardList, History, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReviewItem {
  id: number;
  entityType: string;
  entityKey: string;
  version: number;
  proposedBy: string;
  status: string;
  rationale: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface AuditEntry {
  id: number;
  entityType: string | null;
  entityKey: string | null;
  version: number | null;
  action: string | null;
  actorId: string | null;
  createdAt: string;
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-600 text-white">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-600 text-white">Rejected</Badge>;
  return <Badge className="bg-yellow-600 text-white">Pending</Badge>;
}

function actionBadge(action: string | null) {
  const color: Record<string, string> = {
    APPROVE:       "bg-green-700",
    REJECT:        "bg-red-700",
    SUBMIT_REVIEW: "bg-blue-700",
    CREATE:        "bg-purple-700",
    UPDATE:        "bg-orange-700",
    ROLLBACK:      "bg-gray-700",
  };
  const cls = action ? (color[action] ?? "bg-slate-600") : "bg-slate-600";
  return <Badge className={`${cls} text-white text-xs`}>{action ?? "—"}</Badge>;
}

export default function KBReviewDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<ReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const queueQuery = useQuery<{ ok: boolean; items: ReviewItem[] }>({
    queryKey: ["/api/kb-governance/queue"],
  });

  const auditQuery = useQuery<{ ok: boolean; entries: AuditEntry[] }>({
    queryKey: ["/api/kb-governance/audit"],
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/kb-governance/approve/${id}`, {}),
    onSuccess: () => {
      toast({ title: "KB change approved", description: "Entity is now active in the clinical system." });
      qc.invalidateQueries({ queryKey: ["/api/kb-governance/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/kb-governance/audit"] });
    },
    onError: (err: any) => toast({ title: "Approve failed", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/kb-governance/reject/${id}`, { reason }),
    onSuccess: () => {
      toast({ title: "KB change rejected", description: "Proposal has been rejected and logged." });
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["/api/kb-governance/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/kb-governance/audit"] });
    },
    onError: (err: any) => toast({ title: "Reject failed", description: err.message, variant: "destructive" }),
  });

  const pendingItems = queueQuery.data?.items ?? [];
  const auditEntries = auditQuery.data?.entries ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-blue-400" />
              KB Review Dashboard
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Govern clinical knowledge base changes — Draft → Review → Approve pipeline
            </p>
          </div>
          <div className="flex gap-3">
            <div
              className="bg-yellow-900/40 border border-yellow-700 rounded-lg px-4 py-2 text-center"
              data-testid="stat-pending"
            >
              <div className="text-2xl font-bold text-yellow-400">{pendingItems.length}</div>
              <div className="text-xs text-yellow-300">Pending</div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="queue">
          <TabsList className="bg-gray-900 border border-gray-700">
            <TabsTrigger value="queue" data-testid="tab-review-queue">
              <Clock className="w-4 h-4 mr-1" /> Review Queue
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit-trail">
              <History className="w-4 h-4 mr-1" /> Audit Trail
            </TabsTrigger>
          </TabsList>

          {/* ── Review Queue ── */}
          <TabsContent value="queue">
            {queueQuery.isLoading && (
              <div className="text-gray-400 py-8 text-center">Loading review queue…</div>
            )}
            {!queueQuery.isLoading && pendingItems.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-600 opacity-50" />
                <p>No pending KB changes — queue is clear.</p>
              </div>
            )}
            <div className="space-y-3 mt-2">
              {pendingItems.map((item) => (
                <Card
                  key={item.id}
                  className="bg-gray-900 border border-gray-700"
                  data-testid={`review-item-${item.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono text-blue-300 text-sm font-semibold"
                            data-testid={`entity-key-${item.id}`}
                          >
                            {item.entityKey}
                          </span>
                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                            {item.entityType}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                            v{item.version}
                          </Badge>
                          {statusBadge(item.status)}
                        </div>
                        {item.rationale && (
                          <p className="text-gray-300 text-sm">{item.rationale}</p>
                        )}
                        <p className="text-gray-500 text-xs">
                          Proposed by <span className="text-gray-400">{item.proposedBy}</span>{" "}
                          · {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-700 hover:bg-green-600 text-white"
                          data-testid={`btn-approve-${item.id}`}
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(item.id)}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          data-testid={`btn-reject-${item.id}`}
                          onClick={() => { setRejectTarget(item); setRejectReason(""); }}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Audit Trail ── */}
          <TabsContent value="audit">
            {auditQuery.isLoading && (
              <div className="text-gray-400 py-8 text-center">Loading audit trail…</div>
            )}
            {!auditQuery.isLoading && auditEntries.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No audit entries yet.</p>
              </div>
            )}
            <div className="space-y-2 mt-2">
              {[...auditEntries].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
                  data-testid={`audit-entry-${entry.id}`}
                >
                  {actionBadge(entry.action)}
                  <span className="font-mono text-blue-300 text-sm">{entry.entityKey ?? "—"}</span>
                  <span className="text-gray-500 text-xs">{entry.entityType ?? "—"}</span>
                  {entry.version != null && (
                    <span className="text-gray-600 text-xs">v{entry.version}</span>
                  )}
                  <span className="ml-auto text-gray-500 text-xs">
                    {entry.actorId ?? "system"} · {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setRejectReason(""); }}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" /> Reject KB Change
            </DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Rejecting <span className="text-white font-mono">{rejectTarget.entityKey}</span>{" "}
                (v{rejectTarget.version}). This action is logged in the audit trail.
              </p>
              <Textarea
                data-testid="input-reject-reason"
                placeholder="Reason for rejection (required)…"
                className="bg-gray-800 border-gray-600 text-white"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setRejectTarget(null); setRejectReason(""); }}
              data-testid="btn-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="btn-confirm-reject"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason });
              }}
            >
              <XCircle className="w-4 h-4 mr-1" /> Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
