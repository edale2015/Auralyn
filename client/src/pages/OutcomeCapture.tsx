import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ClipboardCheck } from "lucide-react";

export default function OutcomeCapture() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [caseId, setCaseId] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!caseId.trim()) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/outcomeCapture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: caseId.trim(), finalDiagnosis, outcomeNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast({ title: "Outcome captured", description: `Recorded for case ${caseId}` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-outcome-capture">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Outcome Capture</h2>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Record Patient Outcome</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} data-testid="input-case-id" />
          <Input placeholder="Final Diagnosis" value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} data-testid="input-diagnosis" />
          <Textarea placeholder="Outcome Notes" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} data-testid="input-notes" />
          <Button onClick={submit} disabled={loading || !caseId.trim()} data-testid="button-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Submit Outcome
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
