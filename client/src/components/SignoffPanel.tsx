import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const DISPOSITIONS = [
  { value: "er_send", label: "ER Send" },
  { value: "urgent_care", label: "Urgent Care" },
  { value: "routine_urgent", label: "Routine Urgent" },
  { value: "routine", label: "Routine" },
  { value: "pcp", label: "PCP Follow-up" },
  { value: "self_care", label: "Self Care" },
];

export function SignoffPanel({ caseData, onComplete }: { caseData: any; onComplete?: () => void }) {
  const [disposition, setDisposition] = useState(
    caseData.engineResult?.recommendedDisposition ?? "routine"
  );
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/signoff", {
        caseId: caseData.caseId,
        reviewerId: "physician_demo",
        status: disposition === caseData.engineResult?.recommendedDisposition
          ? "APPROVED"
          : "APPROVED_WITH_EDITS",
        finalDisposition: disposition,
        rationale,
      });
      setSubmitted(true);
      onComplete?.();
    } catch (e) {
      console.error("Signoff failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card data-testid="panel-signoff">
      <CardHeader>
        <CardTitle className="text-base">Signoff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitted ? (
          <div className="flex items-center gap-2 text-sm text-green-600" data-testid="text-signoff-success">
            <CheckCircle className="h-4 w-4" />
            Signoff saved
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">Disposition</label>
              <Select value={disposition} onValueChange={setDisposition}>
                <SelectTrigger data-testid="select-disposition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Rationale (optional)</label>
              <Textarea
                value={rationale}
                onChange={e => setRationale(e.target.value)}
                rows={3}
                placeholder="Clinical rationale for signoff..."
                data-testid="input-rationale"
              />
            </div>

            <Button onClick={submit} disabled={submitting} data-testid="button-signoff">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
              Approve / Signoff
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
