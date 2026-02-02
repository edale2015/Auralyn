import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ChevronLeft, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { VerifyCard, SymptomGrid, UploadPanel, ConsentPanel, ReviewSubmit } from "@/components/intake";
import type { Tri } from "@/components/intake";
import type { ConsentData } from "@/components/intake/ConsentPanel";

type IntakeStep = "verify" | "chief_complaint" | "symptoms" | "uploads" | "consent" | "review" | "success";
type SaveState = "idle" | "saving" | "saved" | "error";

interface UploadedFile {
  fileId: string;
  name: string;
  mimeType: string;
}

function formatTimeLeft(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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

  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState<number | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef({ chiefComplaint, freeText, symptoms });
  dataRef.current = { chiefComplaint, freeText, symptoms };

  useEffect(() => {
    if (!sessionExpiresAtMs) return;

    const tick = () => {
      const left = Math.floor((sessionExpiresAtMs - Date.now()) / 1000);
      setTimeLeftSec(left);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionExpiresAtMs]);

  const saveDraft = useCallback(async () => {
    if (step === "verify" || !token) return;
    
    try {
      setSaveState("saving");
      await apiRequest("POST", `/api/intake/${token}/save_draft`, {
        draft: dataRef.current,
        currentStep: getStepIndex(step),
      });
      setSaveState("saved");
      setLastSavedAt(Date.now());
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.warn("Autosave failed:", e);
      setSaveState("error");
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

  function handleVerified(data: { caseId: string; savedDraft?: Record<string, any> | null; currentStep?: number; sessionExpiresAtMs?: number }) {
    setCaseId(data.caseId);
    if (data.sessionExpiresAtMs) {
      setSessionExpiresAtMs(data.sessionExpiresAtMs);
    }
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

  const isExpired = sessionExpiresAtMs !== null && timeLeftSec <= 0;

  if (step === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="simple-intake-verify">
        <div className="w-full max-w-md">
          <VerifyCard token={token} onVerified={handleVerified} />
        </div>
      </div>
    );
  }

  const SessionStatusBar = () => (
    <>
      {sessionExpiresAtMs && (
        <div className="flex flex-wrap justify-between gap-3 items-center bg-muted/50 border rounded-lg px-3 py-2 mb-4" data-testid="session-status-bar">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className={timeLeftSec <= 60 ? "text-destructive font-medium" : "text-muted-foreground"}>
              {timeLeftSec > 0 ? `Session expires in ${formatTimeLeft(timeLeftSec)}` : "Session expired"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saveState === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {saveState === "saved" && (
              <>
                <Save className="h-3 w-3 text-green-600" />
                <span className="text-green-600">Saved</span>
              </>
            )}
            {saveState === "error" && (
              <span className="text-destructive">Save failed</span>
            )}
            {saveState === "idle" && lastSavedAt && (
              <>
                <Save className="h-3 w-3" />
                <span>Saved {new Date(lastSavedAt).toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </div>
      )}

      {isExpired && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 mb-4" data-testid="session-expired-warning">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">This session has expired</p>
            <p className="text-sm">Reply <strong>LINK</strong> on WhatsApp to get a new secure link.</p>
          </div>
        </div>
      )}
    </>
  );

  const Navigation = ({ canNext = true }: { canNext?: boolean }) => (
    <div className="flex justify-between gap-4 mt-4">
      <Button variant="outline" onClick={prevStep} data-testid="button-prev-step">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <Button onClick={nextStep} disabled={!canNext || isExpired} data-testid="button-next-step">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  if (step === "chief_complaint") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-complaint">
        <div className="max-w-2xl mx-auto space-y-4">
          <SessionStatusBar />
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 1 of 5</h1>
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
                  disabled={isExpired}
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
                  disabled={isExpired}
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
          <SessionStatusBar />
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 2 of 5</h1>
          </div>
          <SymptomGrid value={symptoms} onChange={setSymptoms} disabled={isExpired} />
          <Navigation />
        </div>
      </div>
    );
  }

  if (step === "uploads") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-uploads">
        <div className="max-w-2xl mx-auto space-y-4">
          <SessionStatusBar />
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 3 of 5</h1>
          </div>
          <UploadPanel token={token} attachments={attachments} setAttachments={setAttachments} disabled={isExpired} />
          <Navigation />
        </div>
      </div>
    );
  }

  if (step === "consent") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-consent">
        <div className="max-w-2xl mx-auto space-y-4">
          <SessionStatusBar />
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 4 of 5</h1>
          </div>
          <ConsentPanel value={consent} onChange={setConsent} disabled={isExpired} />
          <Navigation canNext={consent.telehealth && consent.privacy && consent.signatureName.trim().length > 2} />
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="simple-intake-review">
        <div className="max-w-2xl mx-auto space-y-4">
          <SessionStatusBar />
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Step 5 of 5</h1>
          </div>
          <ReviewSubmit
            token={token}
            chiefComplaint={chiefComplaint}
            freeText={freeText}
            symptoms={symptoms}
            attachments={attachments}
            consent={consent}
            onSubmitted={handleSubmitted}
            disabled={isExpired}
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
