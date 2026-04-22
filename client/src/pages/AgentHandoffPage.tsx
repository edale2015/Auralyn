import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle, XCircle, Clock, AlertTriangle, FileCode2,
  ExternalLink, ChevronDown, ChevronUp, Bot, ShieldAlert, Wrench,
  BookOpen, GitBranch, Gauge, HelpCircle, Zap, RefreshCw,
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

type SliceReview = {
  architectureNotes: string[];
  couplingRisks: string[];
  interfaceRisks: string[];
  specificRecommendations: string[];
  openQuestions: string[];
  blastRadius: string[];
  confidenceScore: number;
  verdict: "proceed" | "caution" | "hold";
};

type SliceAnalysis = {
  issues:          string[];
  hipaaRisks:      string[];
  fdaRisks:        string[];
  safetyFlags:     string[];
  recommendations: string[];
  verdict:         "approve" | "needs_improvement" | "critical_issues";
};

type PerSliceResult = {
  path:           string;
  claudeAnalysis: SliceAnalysis;
  gptExplanation: string;
};

type HandoffDetail = HandoffSummary & {
  articleSummary: string | null;
  openaiCodeProposal: {
    files:    CodeFile[];
    summary:  string;
    concerns: string[];
    slices?:  PerSliceResult[];
  } | null;
  claudeCodeReview: {
    overallVerdict: "approve" | "revise" | "reject";
    concerns: string[];
    suggestions: string[];
    safetyFlags: string[];
    hipaaRisks: string[];
    fdaRisks: string[];
  } | null;
  claudeSliceReview: SliceReview | null;
  openaiRefinedCode: {
    files: CodeFile[];
    changesSummary: string;
    resolvedConcerns: string[];
    remainingRisks: string[];
    additionalRecommendations?: string[];
    stepDSkipped?: string[];
  } | null;
  agentNotes: string | null;
};

// ── Safe string coercion — AI sometimes returns objects instead of strings ──

function safeStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    // e.g. {fix: "...", line: 42} or {text: "..."}
    const o = val as Record<string, unknown>;
    if (typeof o.fix === "string")  return o.fix;
    if (typeof o.text === "string") return o.text;
    if (typeof o.issue === "string") return o.issue;
    if (typeof o.recommendation === "string") return o.recommendation;
    return JSON.stringify(val);
  }
  return String(val);
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    running:           { color: "bg-blue-100 text-blue-700",     icon: <Clock className="w-3 h-3" /> },
    awaiting_approval: { color: "bg-yellow-100 text-yellow-700", icon: <AlertTriangle className="w-3 h-3" /> },
    approved:          { color: "bg-green-100 text-green-700",   icon: <CheckCircle className="w-3 h-3" /> },
    implementing:      { color: "bg-purple-100 text-purple-700", icon: <Bot className="w-3 h-3" /> },
    implemented:       { color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3 h-3" /> },
    rejected:          { color: "bg-red-100 text-red-700",       icon: <XCircle className="w-3 h-3" /> },
    failed:            { color: "bg-gray-100 text-gray-600",     icon: <XCircle className="w-3 h-3" /> },
  };
  const { color, icon } = map[status] ?? { color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {icon}{status.replace(/_/g, " ")}
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

// ── Review verdict badge ────────────────────────────────────────────────────

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

function SliceVerdictBadge({ verdict }: { verdict: "proceed" | "caution" | "hold" }) {
  const map = {
    proceed: "bg-green-100 text-green-700",
    caution: "bg-yellow-100 text-yellow-700",
    hold:    "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${map[verdict]}`}>
      {verdict}
    </span>
  );
}

// ── Confidence meter ────────────────────────────────────────────────────────

function ConfidenceMeter({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  const label = score >= 75 ? "High confidence" : score >= 50 ? "Caution" : "Low — hold for review";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 flex items-center gap-1"><Gauge className="w-3 h-3" /> Architecture confidence</span>
        <span className="font-semibold text-gray-800">{score}/100 — {label}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
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

  const { toast } = useToast();

  const approveMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/agent-handoffs/${id}/approve`, { approvedBy: "admin" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-handoffs"] }); },
  });

  const rejectMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/agent-handoffs/${id}/reject`, { reason: rejectReason || "Rejected" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent-handoffs"] }); onClose(); },
  });

  const retryMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/research/handoffs/${id}/retry`)
        .then(r => r.json())
        .then(d => { if (!d.ok) throw new Error(d.error ?? "Retry failed"); return d; }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/agent-handoffs"] });
      toast({ title: "Retry started", description: d.message });
      onClose();
    },
    onError: (e: any) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading full context…</div>;
  if (!handoff)  return <div className="p-8 text-center text-red-500">Not found</div>;

  const approved = handoff.pipelineStatus === "approved" || handoff.pipelineStatus === "implemented";
  const rejected = handoff.pipelineStatus === "rejected";
  const awaiting = handoff.pipelineStatus === "awaiting_approval";

  const hasSliceReview = !!handoff.claudeSliceReview;
  const confidenceScore = handoff.claudeSliceReview?.confidenceScore ?? null;
  const isLowConfidence = confidenceScore !== null && confidenceScore < 60;
  const isCodeReview = handoff.articleUrl === "#app-code-review";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={handoff.pipelineStatus} />
            {handoff.claudeCodeReview && <VerdictBadge verdict={handoff.claudeCodeReview.overallVerdict} />}
            {handoff.claudeSliceReview && <SliceVerdictBadge verdict={handoff.claudeSliceReview.verdict} />}
            {isLowConfidence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle className="w-3 h-3" /> Low confidence — mandatory human review
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-0.5">
            {isCodeReview ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                <FileCode2 className="w-2.5 h-2.5" /> Standalone Code Review
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
                <BookOpen className="w-2.5 h-2.5" /> Article Pipeline
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{handoff.articleTitle}</h2>
          {!isCodeReview && (
            <a href={handoff.articleUrl} target="_blank" rel="noreferrer"
               className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View source article <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>

      {approved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Bot className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Approved — ready for agent implementation</p>
            <p className="text-xs text-green-700 mt-0.5">
              Approved by {handoff.humanApprovedBy}.
              Tell the agent: "implement agent handoff #{handoff.id}" to execute these code changes.
            </p>
          </div>
        </div>
      )}

      {rejected && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-800">This handoff was rejected. {handoff.agentNotes}</p>
        </div>
      )}

      {handoff.pipelineStatus === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm font-semibold text-red-800">Pipeline failed</p>
          </div>
          {handoff.agentNotes && (
            <p className="text-xs text-red-700 bg-red-100 rounded p-2 font-mono whitespace-pre-wrap">
              {handoff.agentNotes}
            </p>
          )}
          <p className="text-xs text-red-600">
            This usually means an OpenAI or Anthropic API call timed out or returned an error.
            Retrying deletes this entry and starts a fresh pipeline run.
          </p>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => retryMut.mutate()}
            disabled={retryMut.isPending}
            data-testid={`retry-handoff-${id}`}
          >
            {retryMut.isPending
              ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Retrying…</>
              : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry Pipeline</>}
          </Button>
        </div>
      )}

      {/* Confidence summary bar (always visible if slice review ran) */}
      {handoff.claudeSliceReview && (
        <div className="border rounded-lg p-3 bg-gray-50">
          <ConfidenceMeter score={handoff.claudeSliceReview.confidenceScore} />
        </div>
      )}

      <Tabs defaultValue={isCodeReview ? "slices" : "article"}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value={isCodeReview ? "slices" : "article"} data-testid="tab-first" className="text-xs">
            {isCodeReview
              ? <><Zap className="w-3.5 h-3.5 mr-1" />Per-Slice</>
              : <><BookOpen className="w-3.5 h-3.5 mr-1" />Article</>}
          </TabsTrigger>
          <TabsTrigger value="proposal" data-testid="tab-proposal" className="text-xs">
            <FileCode2 className="w-3.5 h-3.5 mr-1" />{isCodeReview ? "Summary" : "Code v1"}
          </TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety" className="text-xs">
            <ShieldAlert className="w-3.5 h-3.5 mr-1" />Safety
          </TabsTrigger>
          <TabsTrigger value="arch" data-testid="tab-arch" className="text-xs">
            <GitBranch className="w-3.5 h-3.5 mr-1" />
            Arch
            {hasSliceReview && handoff.claudeSliceReview!.verdict !== "proceed" && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="refined" data-testid="tab-refined" className="text-xs">
            <Wrench className="w-3.5 h-3.5 mr-1" />Code v2
          </TabsTrigger>
        </TabsList>

        {/* Tab 1A: Per-Slice Analysis (code review only) */}
        <TabsContent value="slices" className="space-y-3 pt-3">
          {!handoff.openaiCodeProposal?.slices || handoff.openaiCodeProposal.slices.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {handoff.openaiCodeProposal
                ? "No per-slice data — this handoff was created before the per-slice pipeline."
                : "Per-slice analysis still in progress…"}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">How Step A works (per-file pipeline):</p>
                <p>Each file is sent to <strong>Claude</strong> first — Claude identifies every HIPAA, FDA SaMD, clinical safety, and code quality issue. Then Claude's findings + the original file go to <strong>GPT-4o</strong>, which writes the improved code.</p>
                <p className="font-semibold mt-1">{handoff.openaiCodeProposal.slices.length} slices reviewed:</p>
              </div>
              {handoff.openaiCodeProposal.slices.map((slice, si) => {
                const verdictColor = slice.claudeAnalysis.verdict === "approve"
                  ? "border-green-200 bg-green-50"
                  : slice.claudeAnalysis.verdict === "critical_issues"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50";
                const verdictLabel = slice.claudeAnalysis.verdict === "approve"
                  ? "✓ Approved as-is"
                  : slice.claudeAnalysis.verdict === "critical_issues"
                  ? "⚠ Critical issues"
                  : "↻ Needs improvement";
                const verdictText = slice.claudeAnalysis.verdict === "approve"
                  ? "text-green-700"
                  : slice.claudeAnalysis.verdict === "critical_issues"
                  ? "text-red-700"
                  : "text-amber-700";
                const totalIssues = slice.claudeAnalysis.issues.length +
                  slice.claudeAnalysis.hipaaRisks.length +
                  slice.claudeAnalysis.fdaRisks.length +
                  slice.claudeAnalysis.safetyFlags.length;
                return (
                  <div key={si} className={`rounded-lg border p-4 space-y-3 ${verdictColor}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono font-semibold text-gray-700">Slice {si + 1}/{handoff.openaiCodeProposal!.slices!.length}</p>
                        <p className="font-medium text-sm text-gray-900 font-mono">{slice.path}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${verdictText} border ${verdictColor}`}>
                        {verdictLabel}
                      </span>
                    </div>

                    {/* Claude findings */}
                    {totalIssues > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> Claude findings ({totalIssues} issue{totalIssues !== 1 ? "s" : ""}):
                        </p>
                        {[
                          { items: slice.claudeAnalysis.safetyFlags, label: "Safety", color: "text-red-700" },
                          { items: slice.claudeAnalysis.hipaaRisks,  label: "HIPAA",  color: "text-orange-700" },
                          { items: slice.claudeAnalysis.fdaRisks,    label: "FDA",    color: "text-purple-700" },
                          { items: slice.claudeAnalysis.issues,      label: "Code",   color: "text-gray-700" },
                        ].filter(g => g.items.length > 0).map(g => (
                          <div key={g.label}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide ${g.color} mb-0.5`}>{g.label}</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {g.items.map((item, ii) => (
                                <li key={ii} className={`text-xs ${g.color}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Claude recommendations */}
                    {slice.claudeAnalysis.recommendations.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Claude recommendations sent to GPT-4o:
                        </p>
                        <ol className="list-decimal pl-4 space-y-0.5">
                          {slice.claudeAnalysis.recommendations.map((r, ri) => (
                            <li key={ri} className="text-xs text-blue-800">{r}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* GPT-4o result */}
                    <div className="border-t border-gray-200 pt-2">
                      <p className="text-xs font-semibold text-indigo-700 mb-0.5 flex items-center gap-1">
                        <FileCode2 className="w-3 h-3" /> GPT-4o coded:
                      </p>
                      <p className="text-xs text-indigo-800">{slice.gptExplanation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 1B: Article (article pipeline only) */}
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

        {/* Tab 2: GPT-4o Code Proposal (v1) */}
        <TabsContent value="proposal" className="space-y-3 pt-3">
          {!handoff.openaiCodeProposal ? (
            <p className="text-gray-500 text-sm">No proposal generated yet.</p>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">GPT-4o Architect — First Pass</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{handoff.openaiCodeProposal.summary}</p>
                  {handoff.openaiCodeProposal.concerns.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Author's own concerns:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiCodeProposal.concerns.map((c, i) => (
                          <li key={i} className="text-xs text-amber-800">{safeStr(c)}</li>
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

        {/* Tab 3: Claude Safety Review */}
        <TabsContent value="safety" className="space-y-3 pt-3">
          {!handoff.claudeCodeReview ? (
            <p className="text-gray-500 text-sm">Safety review not yet complete.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold">Claude Safety Review</span>
                <VerdictBadge verdict={handoff.claudeCodeReview.overallVerdict} />
                <span className="text-xs text-gray-400 ml-auto">adversarial HIPAA / FDA / clinical pass</span>
              </div>

              {[
                { label: "Concerns",     items: handoff.claudeCodeReview.concerns,    color: "text-amber-800 bg-amber-50 border-amber-200" },
                { label: "Suggestions",  items: handoff.claudeCodeReview.suggestions,  color: "text-blue-800 bg-blue-50 border-blue-200" },
                { label: "Safety Flags", items: handoff.claudeCodeReview.safetyFlags,  color: "text-red-800 bg-red-50 border-red-200" },
                { label: "HIPAA Risks",  items: handoff.claudeCodeReview.hipaaRisks,   color: "text-orange-800 bg-orange-50 border-orange-200" },
                { label: "FDA Risks",    items: handoff.claudeCodeReview.fdaRisks,     color: "text-purple-800 bg-purple-50 border-purple-200" },
              ].map(({ label, items, color }) =>
                items.length > 0 ? (
                  <div key={label} className={`rounded-lg border p-3 ${color}`}>
                    <p className="text-xs font-semibold mb-1">{label}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {items.map((item, i) => <li key={i} className="text-xs">{safeStr(item)}</li>)}
                    </ul>
                  </div>
                ) : null
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 4: Claude Slice / Architecture Review (NEW) */}
        <TabsContent value="arch" className="space-y-3 pt-3">
          {!handoff.claudeSliceReview ? (
            <div className="text-center py-6 text-gray-400">
              <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Architecture review not yet run.</p>
              <p className="text-xs mt-1">This pass only runs on handoffs created after the pipeline upgrade.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <GitBranch className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold">Claude Architecture & Coupling Review</span>
                <SliceVerdictBadge verdict={handoff.claudeSliceReview.verdict} />
                <span className="text-xs text-gray-400 ml-auto">import-aware slice analysis pass</span>
              </div>

              <ConfidenceMeter score={handoff.claudeSliceReview.confidenceScore} />

              {[
                {
                  label: "Architecture Notes",
                  items: handoff.claudeSliceReview.architectureNotes,
                  icon: <GitBranch className="w-3 h-3" />,
                  color: "text-indigo-800 bg-indigo-50 border-indigo-200",
                },
                {
                  label: "Coupling Risks",
                  items: handoff.claudeSliceReview.couplingRisks,
                  icon: <Zap className="w-3 h-3" />,
                  color: "text-orange-800 bg-orange-50 border-orange-200",
                },
                {
                  label: "Interface / Contract Risks",
                  items: handoff.claudeSliceReview.interfaceRisks,
                  icon: <AlertTriangle className="w-3 h-3" />,
                  color: "text-red-800 bg-red-50 border-red-200",
                },
                {
                  label: "Specific Recommendations",
                  items: handoff.claudeSliceReview.specificRecommendations,
                  icon: <Wrench className="w-3 h-3" />,
                  color: "text-blue-800 bg-blue-50 border-blue-200",
                },
                {
                  label: "Blast Radius — Other Files Likely Needing Updates",
                  items: handoff.claudeSliceReview.blastRadius,
                  icon: <FileCode2 className="w-3 h-3" />,
                  color: "text-amber-800 bg-amber-50 border-amber-200",
                },
              ].map(({ label, items, icon, color }) =>
                items.length > 0 ? (
                  <div key={label} className={`rounded-lg border p-3 ${color}`}>
                    <p className="text-xs font-semibold mb-1 flex items-center gap-1">{icon}{label}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {items.map((item, i) => <li key={i} className="text-xs">{safeStr(item)}</li>)}
                    </ul>
                  </div>
                ) : null
              )}

              {/* Open questions — must be answered before approval */}
              {handoff.claudeSliceReview.openQuestions.length > 0 && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
                  <p className="text-xs font-semibold text-yellow-800 mb-2 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    Open Questions — Claude cannot answer these from code context alone
                  </p>
                  <p className="text-xs text-yellow-700 mb-2">
                    These must be manually verified by you or your engineering team before approving.
                  </p>
                  <ul className="space-y-1">
                    {handoff.claudeSliceReview.openQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-yellow-900">
                        <span className="font-mono bg-yellow-200 px-1 rounded shrink-0">Q{i + 1}</span>
                        {safeStr(q)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 5: Refined Code (v2) */}
        <TabsContent value="refined" className="space-y-3 pt-3">
          {!handoff.openaiRefinedCode ? (
            <p className="text-gray-500 text-sm">Refinement not yet complete.</p>
          ) : (
            <>
              {/* Pipeline flow explanation */}
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">How this code was produced:</p>
                <p><span className="font-mono font-bold">Step A</span> — GPT-4o was sent the current source files and produced initial improvement proposals.</p>
                <p><span className="font-mono font-bold">Steps B &amp; B2</span> — Claude reviewed those proposals for HIPAA, FDA SaMD, clinical safety, architecture coupling, and blast radius. Each concern is listed in the Claude Review tabs.</p>
                <p><span className="font-mono font-bold">Step C</span> — GPT-4o received the original code <strong>plus</strong> both Claude reviews, then wrote the final implementation you see below — addressing every concern Claude raised.</p>
                {(handoff.openaiRefinedCode.additionalRecommendations?.length ?? 0) > 0 && (
                  <p><span className="font-mono font-bold">Step D</span> — GPT-4o also identified {handoff.openaiRefinedCode.additionalRecommendations!.length} additional improvement(s) of its own, which were <strong>automatically implemented</strong> and merged into the files below.</p>
                )}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Final Code — Step C{(handoff.openaiRefinedCode.additionalRecommendations?.length ?? 0) > 0 ? " + Step D" : ""} ({handoff.openaiRefinedCode.files.length} file{handoff.openaiRefinedCode.files.length !== 1 ? "s" : ""})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{handoff.openaiRefinedCode.changesSummary}</p>
                  {handoff.openaiRefinedCode.resolvedConcerns.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-1">Claude concerns resolved in Step C:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiRefinedCode.resolvedConcerns.map((c, i) => (
                          <li key={i} className="text-xs text-green-800">{safeStr(c)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(handoff.openaiRefinedCode.additionalRecommendations?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-purple-700 mb-1">Step D — GPT-4o self-improvements (auto-implemented):</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiRefinedCode.additionalRecommendations!.map((r, i) => (
                          <li key={i} className="text-xs text-purple-800">{safeStr(r)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {handoff.openaiRefinedCode.remainingRisks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-1">Non-code decisions — physician/FDA review required before deployment:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {handoff.openaiRefinedCode.remainingRisks.map((r, i) => (
                          <li key={i} className="text-xs text-red-800">{safeStr(r)}</li>
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
                  <p className="text-gray-500 text-sm italic">Claude recommended not implementing this change.</p>
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

          {/* What will change — shown before approve button */}
          {handoff.openaiRefinedCode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> What will be implemented if you approve
              </p>
              <p className="text-sm text-amber-900 whitespace-pre-line leading-snug">
                {handoff.openaiRefinedCode.changesSummary}
              </p>
              {handoff.openaiRefinedCode.files.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">
                    Files to be written ({handoff.openaiRefinedCode.files.length}):
                  </p>
                  <div className="space-y-0.5">
                    {handoff.openaiRefinedCode.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs font-mono text-amber-800 bg-amber-100 rounded px-2 py-0.5">
                        <FileCode2 className="w-3 h-3 shrink-0" />{f.path}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {handoff.openaiRefinedCode.resolvedConcerns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Issues resolved by this change:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {handoff.openaiRefinedCode.resolvedConcerns.map((c, i) => (
                      <li key={i} className="text-xs text-green-800">{safeStr(c)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {handoff.openaiRefinedCode.remainingRisks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-1">Physician / FDA decisions needed before deployment:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {handoff.openaiRefinedCode.remainingRisks.map((r, i) => (
                      <li key={i} className="text-xs text-red-800">{safeStr(r)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {isLowConfidence && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800">
              <strong>Low confidence score ({confidenceScore}/100).</strong> Review the Architecture tab carefully — especially the open questions — before approving.
            </div>
          )}
          <p className="text-xs text-gray-500">
            The Code v2 tab shows the full refined code. The Architecture tab shows coupling blast-radius and open questions Claude flagged.
            Approve to send this package to the agent for implementation.
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

      {handoff.agentNotes && !rejected && (
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
  const [location] = useLocation();

  // Auto-select handoff from ?id= query param (e.g. deep-linked from Ops Cockpit)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      const parsed = parseInt(idParam, 10);
      if (!isNaN(parsed)) setSelectedId(parsed);
    }
  }, [location]);

  const { data: handoffs = [], isLoading } = useQuery<HandoffSummary[]>({
    queryKey: ["/api/agent-handoffs"],
  });

  const pending   = handoffs.filter(h => h.pipelineStatus === "awaiting_approval");
  const approved  = handoffs.filter(h => h.pipelineStatus === "approved");
  const rest      = handoffs.filter(h => !["awaiting_approval", "approved"].includes(h.pipelineStatus));

  function renderList(items: HandoffSummary[], emptyMsg: string) {
    if (items.length === 0) return <p className="text-sm text-gray-400 py-3 text-center">{emptyMsg}</p>;
    return items.map(h => {
      const isCodeReview = h.articleTitle?.startsWith("App Code Review");
      return (
        <button
          key={h.id}
          data-testid={`handoff-row-${h.id}`}
          onClick={() => setSelectedId(h.id)}
          className={`w-full text-left border rounded-lg p-3 hover:bg-gray-50 transition space-y-1 ${selectedId === h.id ? "ring-2 ring-indigo-300 border-indigo-300" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-800 line-clamp-1 flex-1">{h.articleTitle}</span>
            <StatusBadge status={h.pipelineStatus} />
          </div>
          <div className="flex items-center gap-2">
            {isCodeReview ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                <FileCode2 className="w-2.5 h-2.5" /> Code Review
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">
                <BookOpen className="w-2.5 h-2.5" /> Article Pipeline
              </span>
            )}
            <span className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
          </div>
        </button>
      );
    });
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
            5-stage AI pipeline → your approval → implementation
          </p>
          <div className="mt-2 text-xs text-gray-400 space-y-0.5">
            <div className="flex items-center gap-1.5"><FileCode2 className="w-3 h-3 text-blue-400" /> GPT-4o Architect (v1)</div>
            <div className="flex items-center gap-1.5"><ShieldAlert className="w-3 h-3 text-red-400" /> Claude Safety Review</div>
            <div className="flex items-center gap-1.5"><GitBranch className="w-3 h-3 text-indigo-400" /> Claude Arch Review</div>
            <div className="flex items-center gap-1.5"><Wrench className="w-3 h-3 text-green-400" /> GPT-4o Refiner (v2)</div>
          </div>
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
              Each entry contains 5 passes: original article, GPT-4o code v1, Claude safety review, Claude architecture review (with confidence score and open questions), and GPT-4o refined code v2.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
