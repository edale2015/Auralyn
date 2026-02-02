import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ConsentData } from "./ConsentPanel";
import type { Tri } from "./SymptomGrid";

interface ReviewSubmitProps {
  token: string;
  chiefComplaint: string;
  freeText: string;
  symptoms: Record<string, Tri>;
  attachments: { fileId: string; name: string }[];
  consent: ConsentData;
  onSubmitted: (caseId: string) => void;
  disabled?: boolean;
}

export default function ReviewSubmit({
  token,
  chiefComplaint,
  freeText,
  symptoms,
  attachments,
  consent,
  onSubmitted,
  disabled,
}: ReviewSubmitProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isValid =
    chiefComplaint.trim().length > 0 &&
    consent.telehealth &&
    consent.privacy &&
    consent.signatureName.trim().length > 2;

  const redFlags = Object.entries(symptoms)
    .filter(([key, val]) => val === "yes" && ["chest_pain", "shortness_of_breath", "confusion"].includes(key))
    .map(([key]) => key.replace(/_/g, " "));

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/intake/${token}/submit`, {
        chiefComplaint,
        freeText,
        symptoms,
        attachments: attachments.map((a) => a.fileId),
        consent: {
          telehealth: consent.telehealth,
          privacy: consent.privacy,
          signatureName: consent.signatureName,
          signedAt: new Date().toISOString(),
        },
      });
      const data = await res.json();
      if (data.ok) {
        onSubmitted(data.caseId);
      } else {
        setErr(data.error || "Submission failed");
      }
    } catch (e: any) {
      setErr(e?.message || "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-review-title">Review & Submit</CardTitle>
        <CardDescription>Please review your information before submitting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Chief complaint:</span>{" "}
            <span data-testid="text-review-complaint">{chiefComplaint || "(not provided)"}</span>
          </div>
          <div>
            <span className="font-medium">Additional notes:</span>{" "}
            <span data-testid="text-review-notes">{freeText || "(none)"}</span>
          </div>
          <div>
            <span className="font-medium">Attachments:</span>{" "}
            <span data-testid="text-review-attachments">{attachments.length} file(s)</span>
          </div>
          <div>
            <span className="font-medium">Signature:</span>{" "}
            <span data-testid="text-review-signature">{consent.signatureName || "(not signed)"}</span>
          </div>
        </div>

        {redFlags.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-yellow-800 dark:text-yellow-200">Important symptoms noted:</div>
              <div className="text-yellow-700 dark:text-yellow-300" data-testid="text-review-redflags">
                {redFlags.join(", ")}
              </div>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-destructive" data-testid="text-submit-error">{err}</div>}

        <Button
          onClick={submit}
          disabled={busy || !isValid || disabled}
          className="w-full"
          data-testid="button-submit-intake"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" /> Submit Intake
            </>
          )}
        </Button>

        {!isValid && (
          <p className="text-xs text-muted-foreground text-center">
            Please complete all required fields and sign to continue.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
