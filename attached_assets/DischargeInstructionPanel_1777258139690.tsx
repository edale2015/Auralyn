/**
 * DischargeInstructionPanel.tsx
 * Drop into: client/src/components/DischargeInstructionPanel.tsx
 *
 * Calls POST /api/telemed/assistant/discharge using the triage caseId directly.
 * Confirmed safe: telemed getSession(caseId) auto-creates if session not found,
 * so the same ID used in /api/review/case/:id works here without any backend change.
 *
 * KEY FIX — disposition translation:
 *   CaseDoc stores snake_case enums.  RETURN_PRECAUTIONS map uses Title Case.
 *   Without translation, getReturnPrecautions("sore_throat", "pcp") falls through
 *   to DEFAULT_RETURN_PRECAUTIONS and loses complaint-specific return criteria.
 *
 *   er_send      → "Urgent Care"
 *   urgent_care  → "Urgent Care"
 *   pcp          → "Prescription"
 *   self_care    → "Home Care"
 *
 * Parent usage in CaseReview.tsx:
 *   <DischargeInstructionPanel
 *     caseId={c.id}
 *     patientName={c.patientName ?? c.answers?.structured?.name ?? "Patient"}
 *     complaint={c.complaint?.slug}
 *     disposition={c.triage?.disposition}
 *     onInstructionsReady={(text) => setDischargeText(text)}
 *   />
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, FileText, RefreshCw } from "lucide-react";

// ─── Disposition translation ──────────────────────────────────────────────────
// Must run before calling the discharge endpoint so RETURN_PRECAUTIONS lookup
// resolves to a real key rather than falling through to DEFAULT_RETURN_PRECAUTIONS.

const DISPOSITION_MAP: Record<string, string> = {
  er_send:     "Urgent Care",
  urgent_care: "Urgent Care",
  pcp:         "Prescription",
  self_care:   "Home Care",
};

function translateDisposition(raw?: string): string {
  if (!raw) return "Home Care";
  return DISPOSITION_MAP[raw] ?? "Home Care";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DischargeInstructionPanelProps {
  /** Triage case ID — same value CaseReview uses for /api/review/case/:id */
  caseId: string | number;
  /** Patient name for personalised salutation in generated text */
  patientName?: string;
  /** c.complaint.slug — e.g. "sore_throat". Already matches RETURN_PRECAUTIONS keys. */
  complaint?: string;
  /** c.triage.disposition — snake_case enum, translated before API call */
  disposition?: string;
  /** Fires whenever approved text changes — parent captures for audit + WhatsApp delivery */
  onInstructionsReady?: (text: string) => void;
}

interface DischargeApiResponse {
  ok: boolean;
  discharge: string;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DischargeInstructionPanel({
  caseId,
  patientName = "Patient",
  complaint,
  disposition,
  onInstructionsReady,
}: DischargeInstructionPanelProps) {
  const [instructionText, setInstructionText] = useState<string>("");
  const [isGenerated,     setIsGenerated]     = useState(false);
  const [isApproved,      setIsApproved]      = useState(false);

  const translatedDisposition = translateDisposition(disposition);

  // ── API mutation ────────────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<DischargeApiResponse>(
        "POST",
        "/api/telemed/assistant/discharge",
        {
          caseId:      String(caseId),
          patientName,
          complaint,                       // already correct slug e.g. "sore_throat"
          disposition: translatedDisposition, // now "Home Care" / "Prescription" / "Urgent Care"
        }
      );
      return res;
    },
    onSuccess: (data) => {
      if (data.ok && data.discharge) {
        setInstructionText(data.discharge);
        setIsGenerated(true);
        setIsApproved(false);
        onInstructionsReady?.(data.discharge);
      }
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const updated = e.target.value;
    setInstructionText(updated);
    setIsApproved(false); // any edit resets approval — physician must re-approve
    onInstructionsReady?.(updated);
  };

  const handleApprove = () => {
    setIsApproved(true);
    onInstructionsReady?.(instructionText);
  };

  const handleRegenerate = () => {
    setIsApproved(false);
    generateMutation.mutate();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Card className="border border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm font-semibold text-blue-900">
              Discharge Instructions
            </CardTitle>
            {/* Show translated disposition label so physician can spot-check mapping */}
            {disposition && (
              <Badge
                variant="outline"
                className="text-xs text-gray-500 border-gray-300"
              >
                {translatedDisposition}
              </Badge>
            )}
          </div>

          {/* Status badge — one shown at a time */}
          {!isGenerated && !generateMutation.isPending && (
            <Badge variant="outline" className="text-xs text-gray-400">
              Not generated
            </Badge>
          )}
          {generateMutation.isPending && (
            <Badge
              variant="outline"
              className="text-xs text-blue-600 border-blue-300"
            >
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Generating…
            </Badge>
          )}
          {isGenerated && !isApproved && !generateMutation.isPending && (
            <Badge
              variant="outline"
              className="text-xs text-amber-700 border-amber-300 bg-amber-50"
            >
              Awaiting physician approval
            </Badge>
          )}
          {isApproved && (
            <Badge className="text-xs bg-green-600 text-white">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approved — ready to send
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">

        {/* ── Not yet generated ── */}
        {!isGenerated && !generateMutation.isPending && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-xs text-gray-500 max-w-sm">
              Generate personalised discharge instructions for{" "}
              <span className="font-medium">{patientName}</span>
              {complaint && (
                <> — <span className="italic">{complaint.replace(/_/g, " ")}</span></>
              )}
              . Review and edit before approving.
            </p>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="h-3 w-3 mr-2" />
              Generate Discharge Instructions
            </Button>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {generateMutation.isPending && (
          <div className="space-y-2 py-2 animate-pulse">
            {[0.75, 1, 0.83, 0.66, 0.9, 0.5].map((w, i) => (
              <div
                key={i}
                className="h-3 bg-blue-100 rounded"
                style={{ width: `${w * 100}%` }}
              />
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {generateMutation.isError && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              {(generateMutation.error as Error)?.message ??
                "Failed to generate. Check /api/telemed/assistant/discharge is reachable."}{" "}
              <button
                onClick={handleRegenerate}
                className="underline font-medium hover:text-red-800"
              >
                Retry
              </button>
            </span>
          </div>
        )}

        {/* ── Generated — editable ── */}
        {isGenerated && !generateMutation.isPending && (
          <>
            <p className="text-xs text-gray-500">
              Review and edit below. Any change clears approval — you must
              re-approve before instructions are sent.
            </p>

            <Textarea
              value={instructionText}
              onChange={handleTextChange}
              rows={12}
              className="font-mono text-xs bg-white border-blue-200 focus:border-blue-400 resize-y"
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproved || !instructionText.trim()}
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                <CheckCircle2 className="h-3 w-3 mr-2" />
                {isApproved ? "Approved ✓" : "Approve Instructions"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={generateMutation.isPending}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                title="Regenerate from AI"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {isApproved && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                ✓ Approved. Instructions will be delivered to{" "}
                <span className="font-medium">{patientName}</span> when you
                complete your case action (Approve / Sign-off) below.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
