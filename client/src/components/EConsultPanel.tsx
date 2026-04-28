/**
 * EConsultPanel.tsx
 *
 * Renders below the Case Summary card when disposition is "pcp" or "urgent_care".
 * Calls POST /api/review/case/:caseId/econsult to generate a structured eConsult
 * draft with auto-selected specialty via routeToSpecialtyCouncil().
 *
 * Persistence: appendAuditEvent("ECONSULT_ORDER_PLACED") — no Postgres FK needed.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  RefreshCw,
  Send,
  CheckCircle2,
  Stethoscope,
} from "lucide-react";

// ─── Specialty options (matches SpecialtyCouncil type in specialtyRouter.ts) ──

const SPECIALTIES: { value: string; label: string }[] = [
  { value: "cardiology",         label: "Cardiology" },
  { value: "pulmonary",          label: "Pulmonary" },
  { value: "infectious_disease", label: "Infectious Disease" },
  { value: "ent",                label: "ENT" },
  { value: "neurology",          label: "Neurology" },
  { value: "gastroenterology",   label: "Gastroenterology" },
  { value: "general",            label: "General Surgery / Other" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface EConsultPanelProps {
  caseId: string | number;
  complaint?: string;
  disposition?: string;
  topCluster?: string;
  differential?: Array<{ diagnosis: string; confidence: number; rank: number }>;
  confidence?: number;
  patientMedications?: string[];
  allergies?: string[];
}

interface EConsultApiResponse {
  ok: boolean;
  specialty: string;
  specialtyConfidence: number;
  draftText: string;
  error?: string;
}

interface SubmitApiResponse {
  ok: boolean;
  auditEventId: string;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EConsultPanel({
  caseId,
  complaint,
  disposition,
  topCluster,
  differential = [],
  confidence,
  patientMedications = [],
  allergies = [],
}: EConsultPanelProps) {
  const [isExpanded,  setIsExpanded]  = useState(false);
  const [draftText,   setDraftText]   = useState("");
  const [specialty,   setSpecialty]   = useState("");
  const [isGenerated, setIsGenerated] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCopied,    setIsCopied]    = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Draft generation ────────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<EConsultApiResponse>(
        "POST",
        `/api/review/case/${caseId}/econsult`,
        {
          caseId: String(caseId),
          complaint,
          disposition,
          topCluster,
          differential,
          confidence,
          patientMedications,
          allergies,
        }
      );
      return res;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setDraftText(data.draftText);
        setSpecialty(data.specialty);
        setIsGenerated(true);
        setIsSubmitted(false);
        setSubmitError(null);
      }
    },
  });

  const handleExpand = () => {
    setIsExpanded(true);
    if (!isGenerated && !generateMutation.isPending) {
      generateMutation.mutate();
    }
  };

  const handleCollapse = () => setIsExpanded(false);

  // ── Submit / audit ──────────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<SubmitApiResponse>(
        "POST",
        `/api/review/case/${caseId}/econsult/submit`,
        {
          caseId:    String(caseId),
          specialty,
          charCount: draftText.length,
        }
      );
      return res;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setIsSubmitted(true);
        setSubmitError(null);
      }
    },
    onError: (err: Error) => {
      setSubmitError(err.message ?? "Submit failed");
    },
  });

  // ── Copy to clipboard ───────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      const el = document.createElement("textarea");
      el.value = draftText;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Card className="border border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Stethoscope className="h-4 w-4 text-indigo-600 shrink-0" />
            <CardTitle className="text-sm font-semibold text-indigo-900">
              eConsult / Specialist Referral
            </CardTitle>

            <Badge
              variant="outline"
              className="text-[10px] text-indigo-600 border-indigo-300"
            >
              {disposition === "pcp" ? "PCP Referral" : "Urgent Care Referral"}
            </Badge>

            {isSubmitted && (
              <Badge className="text-[10px] bg-green-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Submitted
              </Badge>
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={isExpanded ? handleCollapse : handleExpand}
            className="h-7 w-7 p-0 text-indigo-600 hover:bg-indigo-100"
            data-testid="btn-econsult-toggle"
            aria-label={isExpanded ? "Collapse eConsult panel" : "Open eConsult panel"}
          >
            {isExpanded
              ? <ChevronUp   className="h-4 w-4" />
              : <ChevronDown className="h-4 w-4" />
            }
          </Button>
        </div>

        {!isExpanded && (
          <p className="text-xs text-indigo-500 mt-1">
            {isGenerated
              ? `Draft ready — ${specialty.replace(/_/g, " ")} referral`
              : "Click to generate AI-drafted specialist referral"
            }
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4 space-y-3">

          {/* Loading skeleton */}
          {generateMutation.isPending && (
            <div className="space-y-2 animate-pulse py-2">
              {[0.9, 0.7, 1, 0.6, 0.8, 0.5].map((w, i) => (
                <div
                  key={i}
                  className="h-3 bg-indigo-100 rounded"
                  style={{ width: `${w * 100}%` }}
                />
              ))}
            </div>
          )}

          {/* Generation error */}
          {generateMutation.isError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Failed to generate draft.{" "}
                <button
                  onClick={() => generateMutation.mutate()}
                  className="underline font-medium"
                >
                  Retry
                </button>
              </span>
            </div>
          )}

          {/* Generated draft */}
          {isGenerated && !generateMutation.isPending && (
            <>
              {/* Specialty selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">
                  Referring to
                </label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger
                    className="h-8 text-xs bg-white border-indigo-200"
                    data-testid="select-specialty"
                  >
                    <SelectValue placeholder="Select specialty…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Draft text editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">
                    Referral draft
                  </label>
                  <button
                    onClick={() => generateMutation.mutate()}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                    disabled={generateMutation.isPending}
                    data-testid="btn-econsult-regenerate"
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    Regenerate
                  </button>
                </div>
                <Textarea
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    setIsSubmitted(false);
                  }}
                  rows={10}
                  className="font-mono text-xs bg-white border-indigo-200 focus:border-indigo-400 resize-y"
                  data-testid="textarea-econsult-draft"
                  placeholder="eConsult draft will appear here…"
                />
              </div>

              {/* Submit error */}
              {submitError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {submitError}
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={
                    !draftText.trim() ||
                    !specialty ||
                    submitMutation.isPending ||
                    isSubmitted
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1"
                  data-testid="btn-econsult-submit"
                >
                  {submitMutation.isPending ? (
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                  ) : isSubmitted ? (
                    <CheckCircle2 className="h-3 w-3 mr-2" />
                  ) : (
                    <Send className="h-3 w-3 mr-2" />
                  )}
                  {isSubmitted ? "Submitted ✓" : "Submit Referral"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!draftText.trim()}
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  data-testid="btn-econsult-copy"
                  title="Copy draft to clipboard"
                >
                  {isCopied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {isSubmitted && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  ✓ Referral logged to audit chain. Copy the draft above to send
                  via your preferred specialist communication channel.
                </p>
              )}
            </>
          )}

        </CardContent>
      )}
    </Card>
  );
}
