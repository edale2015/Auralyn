/**
 * client/src/pages/SlicePipelineAdmin.tsx
 * Slice Pipeline Admin — full slice-native research pipeline UI.
 *
 * Left panel: slice list + create new slice
 * Right panel: per-slice workflow
 *   1. Paste Claude findings
 *   2. Run OpenAI review
 *   3. Build proposals
 *   4. Validate / Approve / Export each proposal
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ReviewSlice = {
  id:               number;
  sliceId:          string;
  title:            string;
  prompt:           string;
  files:            string[];
  claudeReviewCount?: number;
  openaiReviewCount?: number;
  proposalCount?:   number;
  createdAt?:       string;
};

type ClaudeSliceReview = {
  id:             number;
  reviewSliceId:  number;
  claudeFindings: string;
  status:         string;
};

type OpenaiSliceReview = {
  id:             number;
  summaryForUser: string;
  overallVerdict: string;
  reviewJson:     any;
  status:         string;
};

type SliceProposal = {
  id:               number;
  title:            string;
  rationale:        string;
  affectedFiles:    string[];
  validationPlan:   string[];
  validationStatus: string;
  approved:         boolean;
  approvedBy?:      string | null;
  githubBranch?:    string | null;
  githubPrUrl?:     string | null;
  replitStatus:     string;
};

const VERDICT_COLORS: Record<string, string> = {
  adopt:     "text-emerald-400",
  test_only: "text-amber-400",
  ignore:    "text-red-400",
};

const STATUS_DOT: Record<string, string> = {
  passed:   "bg-emerald-500",
  failed:   "bg-red-500",
  rejected: "bg-red-700",
  pending:  "bg-neutral-500",
};

export default function SlicePipelineAdmin() {
  const qc = useQueryClient();

  /* ── Slice list ─────────────────────────────────────────────────────── */
  const { data: sliceData, refetch: refetchSlices } = useQuery<{
    ok: boolean;
    slices: ReviewSlice[];
  }>({ queryKey: ["/api/claude-slices/"] });

  const slices = sliceData?.slices ?? [];

  /* ── Selected slice ─────────────────────────────────────────────────── */
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);

  const { data: sliceDetail, refetch: refetchDetail } = useQuery<{
    ok: boolean;
    slice:         ReviewSlice;
    claudeReviews: ClaudeSliceReview[];
    openaiReviews: OpenaiSliceReview[];
    proposals:     SliceProposal[];
  }>({
    queryKey: [`/api/claude-slices/${selectedSliceId}`],
    enabled: !!selectedSliceId,
  });

  const activeSlice    = sliceDetail?.slice;
  const claudeReviews  = sliceDetail?.claudeReviews ?? [];
  const openaiReviews  = sliceDetail?.openaiReviews ?? [];
  const proposals      = sliceDetail?.proposals ?? [];

  /* ── Create new slice form ──────────────────────────────────────────── */
  const [newSlice, setNewSlice] = useState({ sliceId: "", title: "", prompt: "", files: "" });
  const [creating, setCreating] = useState(false);

  async function createSlice() {
    if (!newSlice.sliceId || !newSlice.title || !newSlice.prompt) return;
    setCreating(true);
    try {
      const res = await fetch("/api/claude-slices/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sliceId:    newSlice.sliceId,
          title:      newSlice.title,
          prompt:     newSlice.prompt,
          files:      newSlice.files.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewSlice({ sliceId: "", title: "", prompt: "", files: "" });
        refetchSlices();
        setSelectedSliceId(data.slice.sliceId);
      } else {
        setMsg({ text: data.error ?? "Failed to create slice", ok: false });
      }
    } finally {
      setCreating(false);
    }
  }

  /* ── Per-slice actions ──────────────────────────────────────────────── */
  const [claudeFindings, setClaudeFindings] = useState("");
  const [approvedBy,     setApprovedBy]     = useState("");
  const [loading,        setLoading]        = useState<string | null>(null);
  const [msg,            setMsg]            = useState<{ text: string; ok: boolean } | null>(null);

  const busy = (key: string) => loading === key;

  async function submitClaudeFindings() {
    if (!selectedSliceId || !claudeFindings.trim()) return;
    setLoading("claude");
    setMsg(null);
    try {
      const res  = await fetch("/api/claude-slices/submit-findings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sliceId: selectedSliceId, claudeFindings }),
      });
      const data = await res.json();
      setMsg({ text: data.ok ? "Claude findings saved" : (data.error ?? "Failed"), ok: data.ok });
      if (data.ok) { setClaudeFindings(""); refetchDetail(); }
    } finally { setLoading(null); }
  }

  async function runOpenAIReview() {
    if (!selectedSliceId) return;
    setLoading("openai");
    setMsg(null);
    try {
      const res  = await fetch(`/api/slice-pipeline/openai-review/${selectedSliceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setMsg({ text: data.ok ? "OpenAI review complete" : (data.error ?? "Failed"), ok: data.ok });
      if (data.ok) refetchDetail();
    } finally { setLoading(null); }
  }

  async function buildProposals() {
    if (!selectedSliceId) return;
    setLoading("proposals");
    setMsg(null);
    try {
      const res  = await fetch(`/api/slice-pipeline/build-proposals/${selectedSliceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setMsg({
        text: data.ok ? `Created ${data.proposals?.length ?? 0} proposal(s)` : (data.error ?? "Failed"),
        ok:   data.ok,
      });
      if (data.ok) refetchDetail();
    } finally { setLoading(null); }
  }

  async function validateProposal(id: number) {
    setLoading(`validate-${id}`);
    setMsg(null);
    try {
      const res  = await fetch(`/api/slice-pipeline/validate-proposal/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setMsg({
        text: data.ok ? `Proposal ${id} validation: ${data.result?.status}` : (data.error ?? "Failed"),
        ok:   data.ok,
      });
      if (data.ok) refetchDetail();
    } finally { setLoading(null); }
  }

  async function approveProposal(id: number) {
    if (!approvedBy.trim()) {
      setMsg({ text: "Fill in 'Approved By' before approving", ok: false });
      return;
    }
    setLoading(`approve-${id}`);
    setMsg(null);
    try {
      const res  = await fetch(`/api/slice-pipeline/approve-proposal/${id}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ approvedBy }),
      });
      const data = await res.json();
      setMsg({ text: data.ok ? `Proposal ${id} approved` : (data.error ?? "Failed"), ok: data.ok });
      if (data.ok) refetchDetail();
    } finally { setLoading(null); }
  }

  async function exportProposal(id: number) {
    setLoading(`export-${id}`);
    setMsg(null);
    try {
      const res  = await fetch(`/api/slice-pipeline/export-proposal/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setMsg({
        text: data.ok
          ? `Exported — PR: ${data.export?.prUrl ?? "created"}`
          : (data.error ?? "Export failed"),
        ok: data.ok,
      });
      if (data.ok) refetchDetail();
    } finally { setLoading(null); }
  }

  const latestOaiReview = openaiReviews[openaiReviews.length - 1] ?? null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex">

      {/* ── Left panel: slice list ──────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800">
          <h1 className="text-lg font-bold" data-testid="page-title">Slice Pipeline</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Review and implement by slice</p>
        </div>

        {/* Slice list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {slices.length === 0 && (
            <p className="text-xs text-neutral-600 p-2">No slices yet — create one below.</p>
          )}
          {slices.map(s => (
            <button
              key={s.sliceId}
              data-testid={`slice-item-${s.sliceId}`}
              onClick={() => { setSelectedSliceId(s.sliceId); setMsg(null); }}
              className={`w-full text-left rounded-xl p-3 transition-colors ${
                selectedSliceId === s.sliceId
                  ? "bg-blue-900/40 border border-blue-600"
                  : "hover:bg-neutral-800 border border-transparent"
              }`}
            >
              <div className="font-medium text-sm truncate">{s.title}</div>
              <div className="text-xs text-neutral-500 mt-0.5 font-mono">{s.sliceId}</div>
              <div className="flex gap-3 mt-1.5 text-xs text-neutral-500">
                <span>Claude: {s.claudeReviewCount ?? 0}</span>
                <span>OAI: {s.openaiReviewCount ?? 0}</span>
                <span>Props: {s.proposalCount ?? 0}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Create new slice */}
        <div className="p-3 border-t border-neutral-800 space-y-2">
          <p className="text-xs font-semibold text-neutral-400">New Slice</p>
          <input
            data-testid="input-slice-id"
            placeholder="slice-id (e.g. auth-001)"
            value={newSlice.sliceId}
            onChange={e => setNewSlice(p => ({ ...p, sliceId: e.target.value }))}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs"
          />
          <input
            data-testid="input-slice-title"
            placeholder="Title"
            value={newSlice.title}
            onChange={e => setNewSlice(p => ({ ...p, title: e.target.value }))}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs"
          />
          <textarea
            data-testid="input-slice-prompt"
            placeholder="Slice prompt / scope"
            value={newSlice.prompt}
            rows={2}
            onChange={e => setNewSlice(p => ({ ...p, prompt: e.target.value }))}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs resize-none"
          />
          <input
            data-testid="input-slice-files"
            placeholder="files (comma-separated)"
            value={newSlice.files}
            onChange={e => setNewSlice(p => ({ ...p, files: e.target.value }))}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs"
          />
          <button
            data-testid="button-create-slice"
            onClick={createSlice}
            disabled={creating || !newSlice.sliceId || !newSlice.title}
            className="w-full rounded-xl bg-blue-600 py-1.5 text-xs hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Slice"}
          </button>
        </div>
      </div>

      {/* ── Right panel: slice workflow ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {!selectedSliceId && (
          <div className="flex items-center justify-center h-48 text-neutral-600">
            Select or create a slice to begin
          </div>
        )}

        {selectedSliceId && activeSlice && (
          <>
            {/* Slice header */}
            <div className="border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-bold">{activeSlice.title}</h2>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">{activeSlice.sliceId}</p>
              {activeSlice.files.length > 0 && (
                <div className="text-xs text-neutral-400 mt-2">
                  Files: {activeSlice.files.join(", ")}
                </div>
              )}
            </div>

            {/* Step 1: Submit Claude findings */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">1 — Paste Claude Findings</h3>
                <span className="text-xs text-neutral-500">{claudeReviews.length} stored</span>
              </div>
              {claudeReviews.length > 0 && (
                <div className="rounded-xl bg-neutral-950 border border-neutral-700 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-neutral-400 mb-1">Latest findings:</p>
                  <pre className="text-xs text-neutral-300 whitespace-pre-wrap">
                    {claudeReviews[claudeReviews.length - 1].claudeFindings.slice(0, 600)}
                    {claudeReviews[claudeReviews.length - 1].claudeFindings.length > 600 ? "…" : ""}
                  </pre>
                </div>
              )}
              <textarea
                data-testid="input-claude-findings"
                placeholder="Paste Claude's findings for this slice…"
                value={claudeFindings}
                rows={5}
                onChange={e => setClaudeFindings(e.target.value)}
                className="w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm resize-none"
              />
              <button
                data-testid="button-submit-findings"
                onClick={submitClaudeFindings}
                disabled={!claudeFindings.trim() || busy("claude")}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
              >
                {busy("claude") ? "Saving…" : "Submit Findings"}
              </button>
            </div>

            {/* Step 2: OpenAI review */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">2 — OpenAI Review</h3>
                {latestOaiReview && (
                  <span className={`text-xs font-medium ${VERDICT_COLORS[latestOaiReview.overallVerdict] ?? "text-neutral-400"}`}>
                    {latestOaiReview.overallVerdict}
                  </span>
                )}
              </div>
              {latestOaiReview && (
                <div className="rounded-xl bg-neutral-950 border border-neutral-700 p-3">
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {latestOaiReview.summaryForUser.slice(0, 400)}
                    {latestOaiReview.summaryForUser.length > 400 ? "…" : ""}
                  </p>
                </div>
              )}
              <button
                data-testid="button-run-openai-review"
                onClick={runOpenAIReview}
                disabled={claudeReviews.length === 0 || busy("openai")}
                className="rounded-xl bg-violet-600 px-5 py-2 text-sm hover:bg-violet-500 disabled:opacity-50"
              >
                {busy("openai") ? "Reviewing…" : "Run OpenAI Review"}
              </button>
            </div>

            {/* Step 3: Build proposals */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">3 — Build Proposals</h3>
                <span className="text-xs text-neutral-500">{proposals.length} proposal(s)</span>
              </div>
              <button
                data-testid="button-build-proposals"
                onClick={buildProposals}
                disabled={openaiReviews.length === 0 || busy("proposals")}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy("proposals") ? "Building…" : "Build Proposals"}
              </button>
            </div>

            {/* Step 4: Proposals — validate / approve / export */}
            {proposals.length > 0 && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-semibold">4 — Validate → Approve → Export</h3>
                  <div>
                    <label className="text-xs text-neutral-400 mr-2">Approved By:</label>
                    <input
                      data-testid="input-approved-by"
                      value={approvedBy}
                      onChange={e => setApprovedBy(e.target.value)}
                      placeholder="Dr. Name / admin"
                      className="rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-1 text-xs w-44"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {proposals.map(p => (
                    <div
                      key={p.id}
                      data-testid={`proposal-row-${p.id}`}
                      className="rounded-xl bg-neutral-950 border border-neutral-800 p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                STATUS_DOT[p.validationStatus] ?? "bg-neutral-500"
                              }`}
                            />
                            <span className="font-medium text-sm">{p.title}</span>
                          </div>
                          <div className="text-sm text-neutral-300 mt-1 ml-4">{p.rationale}</div>

                          <div className="mt-3 text-xs text-neutral-400 ml-4 flex gap-3 flex-wrap">
                            <span>
                              Validation:{" "}
                              <span className={
                                p.validationStatus === "passed" ? "text-emerald-400" :
                                p.validationStatus === "failed" ? "text-red-400" : "text-neutral-400"
                              }>
                                {p.validationStatus}
                              </span>
                            </span>
                            <span>
                              Approved:{" "}
                              <span className={p.approved ? "text-emerald-400" : "text-neutral-400"}>
                                {p.approved ? `Yes (${p.approvedBy ?? ""})` : "No"}
                              </span>
                            </span>
                            {p.replitStatus !== "pending" && (
                              <span className="text-blue-400">{p.replitStatus}</span>
                            )}
                          </div>

                          {p.affectedFiles.length > 0 && (
                            <div className="mt-3 ml-4">
                              <div className="text-xs font-medium text-neutral-400 mb-1">Affected Files</div>
                              <ul className="list-disc pl-4 space-y-0.5">
                                {p.affectedFiles.map(f => (
                                  <li key={f} className="text-xs text-neutral-300">{f}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {p.validationPlan.length > 0 && (
                            <div className="mt-3 ml-4">
                              <div className="text-xs font-medium text-neutral-400 mb-1">Validation Plan</div>
                              <ul className="list-disc pl-4 space-y-0.5">
                                {p.validationPlan.map((v, idx) => (
                                  <li key={idx} className="text-xs text-neutral-300">{v}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {p.githubPrUrl && (
                            <div className="mt-3 ml-4 text-sm">
                              <span className="text-neutral-400">GitHub PR: </span>
                              <a
                                href={p.githubPrUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline"
                                data-testid={`link-pr-${p.id}`}
                              >
                                {p.githubPrUrl}
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 min-w-[220px]">
                          <button
                            data-testid={`button-validate-${p.id}`}
                            onClick={() => validateProposal(p.id)}
                            disabled={busy(`validate-${p.id}`)}
                            className="rounded-xl bg-amber-600 px-4 py-2 text-xs hover:bg-amber-500 disabled:opacity-50"
                          >
                            {busy(`validate-${p.id}`) ? "Validating..." : "5. Validate"}
                          </button>
                          <button
                            data-testid={`button-approve-${p.id}`}
                            onClick={() => approveProposal(p.id)}
                            disabled={p.approved || p.validationStatus !== "passed" || busy(`approve-${p.id}`)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {busy(`approve-${p.id}`) ? "Approving..." : "6. Human Approve"}
                          </button>
                          <button
                            data-testid={`button-export-${p.id}`}
                            onClick={() => exportProposal(p.id)}
                            disabled={!p.approved || busy(`export-${p.id}`)}
                            className="rounded-xl bg-violet-600 px-4 py-2 text-xs hover:bg-violet-500 disabled:opacity-50"
                          >
                            {busy(`export-${p.id}`) ? "Exporting..." : "7. Export to GitHub + Replit"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Status message */}
        {msg && (
          <div
            data-testid="status-message"
            className={`rounded-xl border p-3 text-sm ${
              msg.ok
                ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                : "border-red-700 bg-red-950/30 text-red-300"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
