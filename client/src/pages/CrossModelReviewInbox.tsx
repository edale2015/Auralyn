import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type CrossModelReview = {
  id: number;
  articleId?: number | null;
  claudeRecommendations: string;
  articleSummary?: string | null;
  openaiSummary?: string | null;
  openaiReview?: {
    overallVerdict: "adopt" | "test_only" | "ignore";
    recommendedUpgrades: Array<{
      title: string;
      rationale: string;
      affectedFiles: string[];
      codeRecommendations: string[];
      safetyConcerns: string[];
      validationPlan: string[];
      verdict: "adopt" | "test_only" | "ignore";
    }>;
  } | null;
  status: string;
  createdAt?: string;
};

type ProposedUpgrade = {
  id: number;
  title: string;
  rationale: string;
  affectedFiles: string[];
  validationStatus: string;
  approved: boolean;
  approvedBy?: string | null;
};

const VERDICT_COLORS: Record<string, string> = {
  adopt:     "text-emerald-400",
  test_only: "text-amber-400",
  ignore:    "text-red-400",
};

export default function CrossModelReviewInbox() {
  const qc = useQueryClient();

  const [reviewId,   setReviewId]   = useState("");
  const [loadedId,   setLoadedId]   = useState<number | null>(null);
  const [review,     setReview]     = useState<CrossModelReview | null>(null);
  const [proposals,  setProposals]  = useState<ProposedUpgrade[]>([]);
  const [approvedBy, setApprovedBy] = useState("");
  const [message,    setMessage]    = useState<{ text: string; ok: boolean } | null>(null);
  const [loading,    setLoading]    = useState<string | null>(null);

  /* ── All reviews list ──────────────────────────────────────────────── */
  const { data: reviewsList } = useQuery<{ ok: boolean; reviews: CrossModelReview[] }>({
    queryKey: ["/api/cross-model/reviews"],
  });

  async function loadReview(id?: number) {
    const targetId = id ?? Number(reviewId);
    if (!targetId) return;
    setMessage(null);
    setLoading("load");
    try {
      const res  = await fetch(`/api/cross-model/review/${targetId}`);
      const data = await res.json();
      if (!data.ok) {
        setMessage({ text: data.error ?? "Failed to load review", ok: false });
        return;
      }
      setReview(data.review);
      setLoadedId(data.review.id);
      setProposals([]);
    } finally {
      setLoading(null);
    }
  }

  async function convertToProposals() {
    if (!review) return;
    setMessage(null);
    setLoading("convert");
    try {
      const res  = await fetch(`/api/cross-model/convert/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ text: data.error ?? "Failed to convert", ok: false });
        return;
      }
      setProposals(data.proposals);
      setMessage({ text: `Created ${data.proposals.length} proposal(s)`, ok: true });
    } finally {
      setLoading(null);
    }
  }

  async function validateProposal(id: number) {
    setMessage(null);
    setLoading(`validate-${id}`);
    try {
      const res  = await fetch(`/api/research/validate/${id}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ text: data.error ?? "Validation failed", ok: false });
        return;
      }
      setMessage({ text: `Proposal ${id} validation: ${data.result?.status ?? "done"}`, ok: true });
      setProposals(prev => prev.map(p => p.id === id
        ? { ...p, validationStatus: data.result?.status ?? p.validationStatus }
        : p));
    } finally {
      setLoading(null);
    }
  }

  async function approveProposal(id: number) {
    if (!approvedBy.trim()) {
      setMessage({ text: "Set 'Approved By' before approving", ok: false });
      return;
    }
    setMessage(null);
    setLoading(`approve-${id}`);
    try {
      const res  = await fetch(`/api/research/approve/${id}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ approvedBy }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ text: data.error ?? "Approval failed", ok: false });
        return;
      }
      setMessage({ text: `Proposal ${id} approved`, ok: true });
      setProposals(prev => prev.map(p => p.id === id ? { ...p, approved: true } : p));
    } finally {
      setLoading(null);
    }
  }

  async function exportToGitHubAndReplit(id: number) {
    setMessage(null);
    setLoading(`export-${id}`);
    try {
      const res  = await fetch(`/api/cross-model/export-replit/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ text: data.error ?? "Export failed", ok: false });
        return;
      }
      setMessage({
        text: `Exported — Branch: ${data.export.branchName} | PR: ${data.export.prUrl}`,
        ok: true,
      });
    } finally {
      setLoading(null);
    }
  }

  const isLoading = (key: string) => loading === key;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Cross-Model Review Inbox</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            Claude findings → OpenAI review → proposals → validation → approval → GitHub / Replit handoff
          </p>
        </div>

        {/* Load review */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
          <h2 className="font-semibold text-neutral-200">Load a Review</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Review ID</label>
              <input
                data-testid="input-review-id"
                value={reviewId}
                onChange={e => setReviewId(e.target.value)}
                placeholder="e.g. 1"
                className="rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 w-32 text-sm"
              />
            </div>
            <button
              data-testid="button-load-review"
              onClick={() => loadReview()}
              disabled={isLoading("load")}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
            >
              {isLoading("load") ? "Loading…" : "Load Review"}
            </button>
            <button
              data-testid="button-convert-proposals"
              onClick={convertToProposals}
              disabled={!review || isLoading("convert")}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isLoading("convert") ? "Converting…" : "→ Proposals"}
            </button>
          </div>

          {/* Quick-pick from list */}
          {reviewsList?.reviews && reviewsList.reviews.length > 0 && (
            <div className="border-t border-neutral-800 pt-3">
              <p className="text-xs text-neutral-500 mb-2">Or pick from recent reviews:</p>
              <div className="flex flex-wrap gap-2">
                {reviewsList.reviews.slice(0, 8).map(r => (
                  <button
                    key={r.id}
                    data-testid={`button-pick-review-${r.id}`}
                    onClick={() => loadReview(r.id)}
                    className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                      loadedId === r.id
                        ? "border-blue-500 bg-blue-900/40 text-blue-300"
                        : "border-neutral-700 bg-neutral-800 hover:border-neutral-500"
                    }`}
                  >
                    #{r.id} — {r.status}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Review detail */}
        {review && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-lg font-semibold mb-3">Claude Findings</h2>
              <pre className="whitespace-pre-wrap text-sm text-neutral-300 leading-relaxed max-h-80 overflow-y-auto">
                {review.claudeRecommendations}
              </pre>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
              <h2 className="text-lg font-semibold">OpenAI Clinical Review</h2>

              {review.openaiSummary ? (
                <p className="text-sm text-neutral-300 leading-relaxed">{review.openaiSummary}</p>
              ) : (
                <p className="text-sm text-neutral-500 italic">No OpenAI summary yet</p>
              )}

              {review.openaiReview && (
                <div>
                  <div className="text-xs text-neutral-400 mb-3">
                    Overall verdict:{" "}
                    <span className={`font-semibold ${VERDICT_COLORS[review.openaiReview.overallVerdict]}`}>
                      {review.openaiReview.overallVerdict}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {review.openaiReview.recommendedUpgrades.map((u, i) => (
                      <div
                        key={i}
                        className="rounded-xl bg-neutral-950 border border-neutral-800 p-3"
                        data-testid={`upgrade-card-${i}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm">{u.title}</div>
                          <span className={`text-xs font-medium shrink-0 ${VERDICT_COLORS[u.verdict]}`}>
                            {u.verdict}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">{u.rationale}</div>
                        {u.affectedFiles.length > 0 && (
                          <div className="text-xs text-neutral-500 mt-1">
                            Files: {u.affectedFiles.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Proposals */}
        {proposals.length > 0 && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <h2 className="text-lg font-semibold">Proposed Upgrades ({proposals.length})</h2>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Approved By</label>
                <input
                  data-testid="input-approved-by"
                  value={approvedBy}
                  onChange={e => setApprovedBy(e.target.value)}
                  placeholder="Dr. Name / admin ID"
                  className="rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 w-56 text-sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              {proposals.map(p => (
                <div
                  key={p.id}
                  data-testid={`proposal-card-${p.id}`}
                  className="rounded-xl bg-neutral-950 border border-neutral-800 p-4"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-sm text-neutral-300 mt-1">{p.rationale}</div>
                      {p.affectedFiles.length > 0 && (
                        <div className="text-xs text-neutral-500 mt-2">
                          Files: {p.affectedFiles.join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 mt-1">
                        Validation:{" "}
                        <span className={
                          p.validationStatus === "passed"
                            ? "text-emerald-400"
                            : p.validationStatus === "failed"
                            ? "text-red-400"
                            : "text-neutral-400"
                        }>
                          {p.validationStatus}
                        </span>
                        {" · "}
                        Approved:{" "}
                        <span className={p.approved ? "text-emerald-400" : "text-neutral-400"}>
                          {p.approved ? `Yes (${p.approvedBy ?? ""})` : "No"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 min-w-[10rem]">
                      <button
                        data-testid={`button-validate-${p.id}`}
                        onClick={() => validateProposal(p.id)}
                        disabled={isLoading(`validate-${p.id}`)}
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm hover:bg-amber-500 disabled:opacity-50"
                      >
                        {isLoading(`validate-${p.id}`) ? "Validating…" : "Auto-Validate"}
                      </button>
                      <button
                        data-testid={`button-approve-${p.id}`}
                        onClick={() => approveProposal(p.id)}
                        disabled={p.approved || isLoading(`approve-${p.id}`)}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {isLoading(`approve-${p.id}`) ? "Approving…" : "Human Approve"}
                      </button>
                      <button
                        data-testid={`button-export-${p.id}`}
                        onClick={() => exportToGitHubAndReplit(p.id)}
                        disabled={!p.approved || isLoading(`export-${p.id}`)}
                        className="rounded-xl bg-violet-600 px-4 py-2 text-sm hover:bg-violet-500 disabled:opacity-50"
                      >
                        {isLoading(`export-${p.id}`) ? "Exporting…" : "Export → GitHub"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div
            data-testid="status-message"
            className={`rounded-xl border p-4 text-sm ${
              message.ok
                ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                : "border-red-700 bg-red-950/30 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
