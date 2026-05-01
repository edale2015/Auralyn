/**
 * PhysicianPathwayReview.tsx
 * client/src/pages/PhysicianPathwayReview.tsx
 * Route: /pathway-review (physician + admin)
 *
 * THE PHYSICIAN REVIEW DASHBOARD
 *
 * This is where the clinical work happens.
 * Every AI-drafted pathway field goes through this dashboard
 * before it touches the KB. The physician approves, modifies,
 * or rejects each element.
 *
 * THREE PANELS:
 * 1. Coverage Map — which systems are complete, partial, missing
 * 2. Pending Review — AI-drafted pathways awaiting physician approval
 * 3. P1 Gaps — trigger AI drafts for critical missing pathways
 */

import { useState }              from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import {
  CheckCircle2, XCircle, AlertTriangle,
  Loader2, Stethoscope,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemCoverage {
  system:   string;
  total:    number;
  complete: number;
  partial:  number;
  missing:  number;
  critical: number;
}

interface PathwayDraft {
  slug:                    string;
  displayName:             string;
  draftedAt:               string;
  validationScore:         number;
  requiresPhysicianReview: string[];
  status:                  "pending_physician_review" | "approved" | "rejected" | "needs_revision";
  draft: {
    redFlags?:             any[];
    differential?:         any[];
    physicalExam?:         any;
    treatment?:            any;
    patientCommunication?: any;
    dispositionCriteria?:  any;
  };
}

// ─── Coverage bar ─────────────────────────────────────────────────────────────

function CoverageBar({ system, total, complete, partial, missing, critical }: SystemCoverage) {
  const completePct = Math.round((complete / total) * 100);
  const partialPct  = Math.round((partial  / total) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 capitalize">{system.replace(/_/g, " ")}</span>
        <div className="flex items-center gap-2 text-gray-500">
          <span>{complete}/{total}</span>
          {critical > 0 && (
            <span className="text-red-600 font-semibold">{critical} critical missing</span>
          )}
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500" style={{ width: `${completePct}%` }} />
        <div className="h-full bg-yellow-400" style={{ width: `${partialPct}%` }} />
      </div>
    </div>
  );
}

// ─── Pathway review card ──────────────────────────────────────────────────────

function PathwayReviewCard({
  draft,
  onApprove,
  onReject,
  onRevise,
  isProcessing,
}: {
  draft:        PathwayDraft;
  onApprove:    () => void;
  onReject:     () => void;
  onRevise:     () => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor =
    draft.validationScore >= 80 ? "text-green-600" :
    draft.validationScore >= 60 ? "text-yellow-600" : "text-red-600";

  return (
    <Card className="border border-gray-200" data-testid={`card-pathway-draft-${draft.slug}`}>
      <CardContent className="py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-800">{draft.displayName}</p>
              <Badge variant="outline" className="text-[10px]">{draft.slug}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
              <span className={`font-bold ${scoreColor}`} data-testid={`score-${draft.slug}`}>
                Score: {draft.validationScore}/100
              </span>
              <span>{draft.requiresPhysicianReview.length} items need review</span>
              <span>{new Date(draft.draftedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-blue-500 text-xs hover:underline shrink-0"
            data-testid={`btn-expand-${draft.slug}`}
          >
            {expanded ? "Collapse" : "Review"}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">

            {/* Physician review items */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-amber-800 mb-1.5">
                ⚠ Review Required Before Approval
              </p>
              <ul className="space-y-1">
                {draft.requiresPhysicianReview.map((item, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Differential preview */}
            {(draft.draft.differential?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Differential ({draft.draft.differential!.length} diagnoses)
                </p>
                <div className="space-y-1">
                  {draft.draft.differential!.slice(0, 4).map((dx: any, i: number) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                        dx.mustNotMiss ? "bg-red-50 border border-red-200" : "bg-gray-50"
                      }`}
                      data-testid={`dx-item-${draft.slug}-${i}`}
                    >
                      {dx.mustNotMiss && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                      <span className="font-medium">{dx.diagnosis}</span>
                      <span className="text-gray-400 text-[10px]">{dx.icdCode}</span>
                      <span className="text-gray-400 text-[10px] ml-auto">
                        prior: {Math.round((dx.prior ?? 0) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Return precautions preview */}
            {(draft.draft.patientCommunication?.returnPrecautions?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Return Precautions
                </p>
                <ul className="space-y-0.5">
                  {draft.draft.patientCommunication!.returnPrecautions.slice(0, 3).map((p: string, i: number) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <span className="text-red-500 shrink-0">→</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={onApprove}
                disabled={isProcessing || draft.validationScore < 80}
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs flex-1"
                title={draft.validationScore < 80 ? "Score must be ≥80 to approve" : ""}
                data-testid={`btn-approve-${draft.slug}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {draft.validationScore >= 80
                  ? "Approve & Load to KB"
                  : `Score too low (${draft.validationScore})`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRevise}
                disabled={isProcessing}
                className="h-7 text-xs"
                data-testid={`btn-revise-${draft.slug}`}
              >
                Request Revision
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isProcessing}
                className="border-red-200 text-red-600 hover:bg-red-50 h-7 text-xs"
                data-testid={`btn-reject-${draft.slug}`}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
            </div>

            {draft.validationScore < 80 && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                This draft scores {draft.validationScore}/100. Minimum 80 required for KB loading.
                Common issues: missing must-not-miss flags, missing ER criteria, missing return precautions.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function PhysicianPathwayReview() {
  const [activeTab,      setActiveTab]      = useState<"coverage" | "pending" | "draft">("coverage");
  const [processingSlug, setProcessingSlug] = useState<string | null>(null);

  const { data: masterMap } = useQuery({
    queryKey: ["/api/clinical/pathways/master-map"],
    queryFn:  () => apiRequest<{ systems: Record<string, SystemCoverage> }>(
      "GET", "/api/clinical/pathways/master-map"
    ),
  });

  const { data: pendingDrafts, refetch: refetchDrafts } = useQuery({
    queryKey: ["/api/clinical/pathways/pending-review"],
    queryFn:  () => apiRequest<{ drafts: PathwayDraft[] }>(
      "GET", "/api/clinical/pathways/pending-review"
    ),
  });

  const { data: p1Missing } = useQuery({
    queryKey: ["/api/clinical/pathways/priority/P1"],
    queryFn:  () => apiRequest<{ pathways: any[] }>(
      "GET", "/api/clinical/pathways/priority/P1"
    ),
  });

  const completeMutation = useMutation({
    mutationFn: (slug: string) =>
      apiRequest("POST", "/api/clinical/pathways/complete-draft", { slug }),
    onSuccess: () => {
      refetchDrafts();
      queryClient.invalidateQueries({ queryKey: ["/api/clinical/pathways/pending-review"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (slug: string) =>
      apiRequest("POST", `/api/clinical/pathways/${slug}/approve`, {}),
    onSuccess: () => {
      refetchDrafts();
      setProcessingSlug(null);
      queryClient.invalidateQueries({ queryKey: ["/api/clinical/pathways/pending-review"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (slug: string) =>
      apiRequest("POST", `/api/clinical/pathways/${slug}/reject`, {}),
    onSuccess: () => {
      refetchDrafts();
      setProcessingSlug(null);
      queryClient.invalidateQueries({ queryKey: ["/api/clinical/pathways/pending-review"] });
    },
  });

  const systems = Object.values(masterMap?.systems ?? {});
  const pending = pendingDrafts?.drafts ?? [];
  const p1gaps  = (p1Missing?.pathways ?? []).filter((p: any) => p.status !== "✅");

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-blue-600" />
            Complaint Pathway Review
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Physician review and approval required before any pathway loads to KB
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Complete",       value: systems.reduce((s, sys) => s + sys.complete, 0), color: "text-green-600",  testid: "stat-complete" },
            { label: "Partial",        value: systems.reduce((s, sys) => s + sys.partial,  0), color: "text-yellow-600", testid: "stat-partial" },
            { label: "Missing",        value: systems.reduce((s, sys) => s + sys.missing,  0), color: "text-red-600",    testid: "stat-missing" },
            { label: "Pending Review", value: pending.length,                                   color: "text-blue-600",   testid: "stat-pending" },
          ].map(({ label, value, color, testid }) => (
            <div key={label} className="border border-gray-200 rounded-lg p-2.5 text-center bg-white">
              <div className={`text-xl font-bold ${color}`} data-testid={testid}>{value}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="tabs-pathway-review">
          {([
            { id: "coverage", label: "Coverage Map" },
            { id: "pending",  label: `Pending Review (${pending.length})` },
            { id: "draft",    label: `P1 Gaps (${p1gaps.length})` },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-gray-800 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Coverage Map ── */}
        {activeTab === "coverage" && (
          <Card data-testid="panel-coverage-map">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-800">23-System Coverage Map</CardTitle>
              <p className="text-[10px] text-gray-500">
                Green = complete · Yellow = partial (no LR tables) · Gray = missing
              </p>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {systems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading coverage data…</p>
              ) : (
                systems.map(sys => <CoverageBar key={sys.system} {...sys} />)
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Pending Review ── */}
        {activeTab === "pending" && (
          <div className="space-y-2" data-testid="panel-pending-review">
            {pending.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No pathways pending review</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Switch to the P1 Gaps tab to generate drafts for review
                  </p>
                </CardContent>
              </Card>
            ) : (
              pending.map(draft => (
                <PathwayReviewCard
                  key={draft.slug}
                  draft={draft}
                  isProcessing={processingSlug === draft.slug}
                  onApprove={() => {
                    setProcessingSlug(draft.slug);
                    approveMutation.mutate(draft.slug);
                  }}
                  onReject={() => {
                    setProcessingSlug(draft.slug);
                    rejectMutation.mutate(draft.slug);
                  }}
                  onRevise={() => completeMutation.mutate(draft.slug)}
                />
              ))
            )}
          </div>
        )}

        {/* ── P1 Gaps — Generate Drafts ── */}
        {activeTab === "draft" && (
          <div className="space-y-2" data-testid="panel-p1-gaps">
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="py-3">
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>P1 Critical pathways</strong> are life-threatening if missed.
                  Click "Generate Draft" to have the AI draft the missing clinical fields for your review.
                  Nothing loads to the KB until you approve it.
                </p>
              </CardContent>
            </Card>
            {p1gaps.slice(0, 20).map((p: any) => (
              <Card
                key={p.slug}
                className={`border ${p.critical ? "border-red-200" : "border-gray-200"}`}
                data-testid={`card-p1-gap-${p.slug}`}
              >
                <CardContent className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.critical && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {p.slug} · {p.status === "🟡" ? "Partial" : "Missing"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => completeMutation.mutate(p.slug)}
                    disabled={completeMutation.isPending}
                    className="h-7 text-xs shrink-0"
                    data-testid={`btn-generate-draft-${p.slug}`}
                  >
                    {completeMutation.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : "Generate Draft"
                    }
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
