import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle, XCircle, Clock, AlertTriangle, FileCode2,
  ExternalLink, ChevronDown, ChevronUp, Bot, ShieldAlert, Wrench, BookOpen,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type HandoffSummary = {
  id: number;
  articleId: number;
  articleTitle: string;
  articleUrl: string;
  pipelineStatus: string;
  humanApprovedBy: string | null;
  humanApprovedAt: string | null;
  createdAt: string;
};

type CodeFile = { path: string; content: string; explanation: string };

type HandoffDetail = HandoffSummary & {
  articleSummary: string | null;
  openaiCodeProposal: {
    files: CodeFile[];
    summary: string;
    concerns: string[];
  } | null;
  claudeCodeReview: {
    overallVerdict: "approve" | "revise" | "reject";
    concerns: string[];
    suggestions: string[];
    safetyFlags: string[];
    hipaaRisks: string[];
    fdaRisks: string[];
  } | null;
  openaiRefinedCode: {
    files: CodeFile[];
    changesSummary: string;
    resolvedConcerns: string[];
    remainingRisks: string[];
  } | null;
  agentNotes: string | null;
};

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    running:           { color: "bg-blue-100 text-blue-700",   icon: <Clock className="w-3 h-3" /> },
    awaiting_approval: { color: "bg-yellow-100 text-yellow-700", icon: <AlertTriangle className="w-3 h-3" /> },
    approved:          { color: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3 h-3" /> },
    implementing:      { color: "bg-purple-100 text-purple-700", icon: <Bot className="w-3 h-3" /> },
    implemented:       { color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3 h-3" /> },
    rejected:          { color: "bg-red-100 text-red-700",     icon: <XCircle className="w-3 h-3" /> },
    failed:            { color: "bg-gray-100 text-gray-600",   icon: <XCircle className="w-3 h-3" /> },
  };
  const { color, icon } = map[status] ?? { color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {icon}{status.replace("_", " ")}
    </span>
  );
}

// ── Code file viewer ───────────────────────────────────────────────────────

function CodeFileCard({ file }: { file: CodeFile }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`toggle-file-${file.path.replace(/\//g, "-")}`}
      >
        <span className="flex items-center gap-2 font-mono text-xs text-gray-700">
          <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
          {file.path}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="p-3 space-y-2">
          <p className="text-xs text-gray-600 italic">{file.explanation}</p>
          <pre className="text-xs bg-gray-900 text-green-300 p-3 rounded overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {file.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Review verdict badge ───────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: "approve" | "revise" | "reject" }) {
  const map = {
    approve: "bg-green-100 text-green-700",
    revise:  "bg-yellow-100 text-yellow-700",
    reject:  "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${map[verdict]}`}>
      {verdict}
    </span>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

function HandoffDetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");

  const { data: handoff, isLoading } = useQuery<HandoffDetail>({
    queryKey: ["/api/agent-handoffs", id],
    queryFn: () => fetch(`/api/agent-handoffs/${id}`).then(r => r.json()),
  });

  const approveMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/agent-handoffs/${id}/approve`, { approvedBy: "admin" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-handoffs"] }); },
  });

  const rejectMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/agent-handoffs/${id}/reject`, { reason: rejectReason || "Rejected" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-handoffs"] }); onClose(); },
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading full context…</div>;
  if (!handoff)  return <div className="p-8 text-center text-red-500">Not found</div>;

  const approved = handoff.pipelineStatus === "approved" || handoff.pipelineStatus === "implemented";
  const rejected = handoff.pipelineStatus === "rejected";
  const awaiting = handoff.pipelineStatus === "awaiting_approval";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={handoff.pipelineStatus} />
            {handoff.claudeCodeReview && <VerdictBadge verdict={handoff.claudeCodeReview.overallVerdict} />}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{handoff.articleTitle}</h2>
          <a href={handoff.articleUrl} target="_blank" rel="noreferrer"
             className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            View source article <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>

      {approved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Bot className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Approved — ready for agent implementation</p>
            <p className="text-xs text-green-700 mt-0.5">
              This package has been approved by {handoff.humanApprovedBy}.
              Tell the agent: "implement agent handoff #{handoff.id}" to have me execute the code changes.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="article">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="article" data-testid="tab-article">
            <BookOpen className="w-3.5 h-3.5 mr-1" />Article
          </TabsTrigger>
          <TabsTrigger value="proposal" data-testid="tab-proposal">
            <FileCode2 className="w-3.5 h-3.5 mr-1" />Code v1
          </TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review">
            <ShieldAlert className="w-3.5 h-3.5 mr-1" />Review
          </TabsTrigger>
          <TabsTrigger value="refined" data-testid="tab-refined">
            <Wrench className="w-3.5 h-3.5 mr-1" />Code v2
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Article */}
        <TabsContent value="article" className="space-y-3 pt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Article Summary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {handoff.articleSummary ?? "No summary available."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: OpenAI Code Proposal (v1) */}
        <TabsContent value="proposal" className="space-y-3 pt-3">
          {!handoff.openaiCodeProposal ? (
            <p className="text-gray-500 text-sm">No proposal generated yet.</p>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">GPT-4o Architect Summary</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{handoff.openaiCodeProposal.summary}</p>
                  {handoff.openaiCodeProposal.concerns.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Author's own concerns:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiCodeProposal.concerns.map((c, i) => (
                          <li key={i} className="text-xs text-amber-800">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="space-y-2">
                {handoff.openaiCodeProposal.files.map((f, i) => (
                  <CodeFileCard key={i} file={f} />
                ))}
                {handoff.openaiCodeProposal.files.length === 0 && (
                  <p className="text-gray-500 text-sm">No code files in proposal.</p>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 3: Safety Review ("Claude Review") */}
        <TabsContent value="review" className="space-y-3 pt-3">
          {!handoff.claudeCodeReview ? (
            <p className="text-gray-500 text-sm">Review not yet complete.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold">AI Safety Review</span>
                <VerdictBadge verdict={handoff.claudeCodeReview.overallVerdict} />
                <span className="text-xs text-gray-400 ml-auto">(adversarial safety reviewer pass)</span>
              </div>

              {[
                { label: "Concerns",    items: handoff.claudeCodeReview.concerns,    color: "text-amber-800 bg-amber-50 border-amber-200" },
                { label: "Suggestions", items: handoff.claudeCodeReview.suggestions,  color: "text-blue-800 bg-blue-50 border-blue-200" },
                { label: "Safety Flags", items: handoff.claudeCodeReview.safetyFlags, color: "text-red-800 bg-red-50 border-red-200" },
                { label: "HIPAA Risks", items: handoff.claudeCodeReview.hipaaRisks,   color: "text-orange-800 bg-orange-50 border-orange-200" },
                { label: "FDA Risks",   items: handoff.claudeCodeReview.fdaRisks,     color: "text-purple-800 bg-purple-50 border-purple-200" },
              ].map(({ label, items, color }) =>
                items.length > 0 ? (
                  <div key={label} className={`rounded-lg border p-3 ${color}`}>
                    <p className="text-xs font-semibold mb-1">{label}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {items.map((item, i) => <li key={i} className="text-xs">{item}</li>)}
                    </ul>
                  </div>
                ) : null
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 4: Refined Code (v2) */}
        <TabsContent value="refined" className="space-y-3 pt-3">
          {!handoff.openaiRefinedCode ? (
            <p className="text-gray-500 text-sm">Refinement not yet complete.</p>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">What Changed (v1 → v2)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{handoff.openaiRefinedCode.changesSummary}</p>
                  {handoff.openaiRefinedCode.resolvedConcerns.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-1">Resolved concerns:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiRefinedCode.resolvedConcerns.map((c, i) => (
                          <li key={i} className="text-xs text-green-800">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {handoff.openaiRefinedCode.remainingRisks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-1">Remaining risks (physician review required):</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiRefinedCode.remainingRisks.map((r, i) => (
                          <li key={i} className="text-xs text-red-800">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="space-y-2">
                {handoff.openaiRefinedCode.files.map((f, i) => (
                  <CodeFileCard key={i} file={f} />
                ))}
                {handoff.openaiRefinedCode.files.length === 0 && (
                  <p className="text-gray-500 text-sm italic">Reviewer recommended not implementing this change.</p>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Approval / Rejection actions */}
      {awaiting && (
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Your decision</p>
          <p className="text-xs text-gray-500">
            Review all four tabs above. If satisfied, approve to send this package to the agent for implementation.
            The agent will see: the original article, both code versions, and the full safety review.
          </p>
          <div className="flex gap-3">
            <Button
              data-testid={`approve-handoff-${id}`}
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {approveMut.isPending ? "Approving…" : "Approve for Agent Implementation"}
            </Button>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Textarea
                placeholder="Rejection reason (optional)"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="h-16 text-sm"
                data-testid="input-reject-reason"
              />
            </div>
            <Button
              variant="outline"
              data-testid={`reject-handoff-${id}`}
              onClick={() => rejectMut.mutate()}
              disabled={rejectMut.isPending}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {rejectMut.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </div>
      )}

      {handoff.agentNotes && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-purple-700 mb-1">Agent implementation notes:</p>
          <p className="text-xs text-purple-800 whitespace-pre-line">{handoff.agentNotes}</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AgentHandoffPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: handoffs = [], isLoading } = useQuery<HandoffSummary[]>({
    queryKey: ["/api/agent-handoffs"],
  });

  const pending   = handoffs.filter(h => h.pipelineStatus === "awaiting_approval");
  const approved  = handoffs.filter(h => h.pipelineStatus === "approved");
  const rest      = handoffs.filter(h => !["awaiting_approval", "approved"].includes(h.pipelineStatus));

  function renderList(items: HandoffSummary[], emptyMsg: string) {
    if (items.length === 0) return <p className="text-sm text-gray-400 py-3 text-center">{emptyMsg}</p>;
    return items.map(h => (
      <button
        key={h.id}
        data-testid={`handoff-row-${h.id}`}
        onClick={() => setSelectedId(h.id)}
        className="w-full text-left border rounded-lg p-3 hover:bg-gray-50 transition space-y-1"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-800 line-clamp-1 flex-1">{h.articleTitle}</span>
          <StatusBadge status={h.pipelineStatus} />
        </div>
        <p className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleString()}</p>
      </button>
    ));
  }

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="w-80 border-r bg-white flex-shrink-0 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-600" />
            Agent Handoff Queue
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Automated pipeline results awaiting your approval
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {isLoading && <p className="text-sm text-gray-400 text-center py-6">Loading…</p>}

          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Awaiting Approval ({pending.length})
              </p>
              <div className="space-y-2">{renderList(pending, "")}</div>
            </div>
          )}

          {approved.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Approved for Agent ({approved.length})
              </p>
              <div className="space-y-2">{renderList(approved, "")}</div>
            </div>
          )}

          {rest.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">History</p>
              <div className="space-y-2">{renderList(rest, "")}</div>
            </div>
          )}

          {!isLoading && handoffs.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No handoffs yet.</p>
              <p className="text-xs mt-1">Run a scan from the Research Inbox to start the pipeline.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedId !== null ? (
          <HandoffDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Bot className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a handoff to review</p>
            <p className="text-xs mt-1 max-w-xs text-center">
              Each entry contains the original article, GPT-4o code proposal, AI safety review, and refined code ready for your approval.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
