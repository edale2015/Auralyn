import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { VerifyCard, SymptomGrid, UploadPanel, ConsentPanel, ReviewSubmit } from "@/components/intake";
import type { Tri } from "@/components/intake";
import type { ConsentData } from "@/components/intake/ConsentPanel";

type IntakeStep = "verify" | "chief_complaint" | "symptoms" | "uploads" | "consent" | "review" | "success";

interface UploadedFile {
  fileId: string;
  name: string;
  mimeType: string;
}

export default function SimpleIntake() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<IntakeStep>("verify");
  const [caseId, setCaseId] = useState("");
  
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [freeText, setFreeText] = useState("");
  const [symptoms, setSymptoms] = useState<Record<string, Tri>>({});
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [consent, setConsent] = useState<ConsentData>({
    telehealth: false,
    privacy: false,
    signatureName: "",
  });

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef({ chiefComplaint, freeText, symptoms });
  dataRef.current = { chiefComplaint, freeText, symptoms };

  const saveDraft = useCallback(async () => {
    if (step === "verify" || !token) return;
    setSaving(true);
    try {
      await apiRequest("POST", `/api/intake/${token}/save_draft`, {
        draft: dataRef.current,
        currentStep: getStepIndex(step),
      });
      setLastSaved(new Date());
    } catch (e) {
      console.warn("Autosave failed:", e);
    } finally {
      setSaving(false);
    }
  }, [token, step]);

  useEffect(() => {
    if (step === "verify" || step === "success") return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 15000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chiefComplaint, freeText, symptoms, step, saveDraft]);

  function getStepIndex(s: IntakeStep): number {
    const steps: IntakeStep[] = ["verify", "chief_complaint", "symptoms", "uploads", "consent", "review", "success"];
    return steps.indexOf(s);
  }

  function handleVerified(data: { caseId: string; savedDraft?: Record<string, any> | null; currentStep?: number }) {
    setCaseId(data.caseId);
    if (data.savedDraft) {
      if (data.savedDraft.chiefComplaint) setChiefComplaint(data.savedDraft.chiefComplaint);
      if (data.savedDraft.freeText) setFreeText(data.savedDraft.freeText);
      if (data.savedDraft.symptoms) setSymptoms(data.savedDraft.symptoms);
      toast({ title: "Draft restored", description: "Your previous answers have been loaded." });
    }
    setStep("chief_complaint");
  }

  function handleSubmitted(submittedCaseId: string) {
    setCaseId(submittedCaseId);
    setStep("success");
  }

  function nextStep() {
    const steps: IntakeStep[] = ["verify", "chief_complaint", "symptoms", "uploads", "consent", "review", "success"];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1]);
    }
  }

  function prevStep() {
    const steps: IntakeStep[] = ["verify", "chief_complaint", "symptoms", "uploads", "consent", "review", "success"];
    const idx = steps.indexOf(step);
    if (idx > 1) {
      setStep(steps[idx - 1]);
    }
  }

  if (step === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="simple-intake-verify">
        <div className="w-full max-w-md">
          <VerifyCard token={token} onVerified={handleVerified} />
        </div>
      </div>
    );
  }

  const SaveIndicator = () => (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {saving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving...</span>
        </>
      ) : lastSaved ? (
        <>
          <Save className="h-3 w-3" />
          <span>Saved {lastSaved.toLocaleTimeString()}</span>
        </>
      ) : null}
    </div>
  );

  const Navigation = ({ canNext = true }: { canNext?: boolean }) => (
    <div className="flex justify-between gap-4 mt-4">
      <Button variant="outline" onClick={prevStep} data-testid="button-prev-step">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <Button onClick={nextStep} disabled={!canNext} data-testid="button-next-step">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  if (step === "chief_complaint") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-complaint">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 1 of 5</h1>
            <SaveIndicator />
          </div>
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-complaint-title">What brings you in today?</CardTitle>
              <CardDescription>Briefly describe your main concern.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="complaint">Chief Complaint</Label>
                <Input
                  id="complaint"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="e.g., Sore throat and fever for 3 days"
                  data-testid="input-chief-complaint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freetext">Additional Details (optional)</Label>
                <Textarea
                  id="freetext"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Any other information you'd like to share..."
                  data-testid="input-free-text"
                />
              </div>
            </CardContent>
          </Card>
          <Navigation canNext={chiefComplaint.trim().length > 0} />
        </div>
      </div>
    );
  }

  if (step === "symptoms") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-symptoms">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 2 of 5</h1>
            <SaveIndicator />
          </div>
          <SymptomGrid value={symptoms} onChange={setSymptoms} />
          <Navigation />
        </div>
      </div>
    );
  }

  if (step === "uploads") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-uploads">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 3 of 5</h1>
            <SaveIndicator />
          </div>
          <UploadPanel token={token} attachments={attachments} setAttachments={setAttachments} />
          <Navigation />
        </div>
      </div>
    );
  }

  if (step === "consent") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-consent">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 4 of 5</h1>
            <SaveIndicator />
          </div>
          <ConsentPanel value={consent} onChange={setConsent} />
          <Navigation canNext={consent.telehealth && consent.privacy && consent.signatureName.trim().length > 2} />
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-review">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 5 of 5</h1>
            <SaveIndicator />
          </div>
          <ReviewSubmit
            token={token}
            chiefComplaint={chiefComplaint}
            freeText={freeText}
            symptoms={symptoms}
            attachments={attachments}
            consent={consent}
            onSubmitted={handleSubmitted}
          />
          <Button variant="outline" onClick={prevStep} className="w-full" data-testid="button-back-review">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Edit
          </Button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="simple-intake-success">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-green-600" data-testid="text-success-title">
              Intake Submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-success-message">
              Your intake has been submitted. A provider will review your case shortly.
            </p>
            <p className="text-sm text-muted-foreground">Case ID: {caseId}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation(`/intake/${token}/status`)}
              data-testid="button-check-status"
            >
              Check Status
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
