import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TriState = "yes" | "no" | "not_sure" | null;

interface FlowQuestion {
  id: string;
  text: string;
  type: "yes_no" | "yesno" | "number" | "choice" | "text" | "multi_select";
  choices?: string[];
  min?: number;
  max?: number;
  required?: boolean;
  helpText?: string;
}

const isYesNoType = (type: string) => type === "yes_no" || type === "yesno";

type IntakeStep = "code" | "form" | "submitting" | "success" | "error";

export default function PatientIntake() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const { toast } = useToast();

  const [step, setStep] = useState<IntakeStep>("code");
  const [code, setCode] = useState("");
  const [flowId, setFlowId] = useState("");
  const [questions, setQuestions] = useState<FlowQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [redFlag, setRedFlag] = useState(false);

  const verifyCode = async () => {
    if (!code.trim()) {
      toast({ title: "Please enter your 6-digit code", variant: "destructive" });
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await apiRequest("POST", `/api/intake/${token}/verify`, { code: code.trim() });
      const data = await res.json();
      if (data.ok) {
        setFlowId(data.flowId);
        await loadQuestions(data.flowId);
        setStep("form");
      } else {
        setErrorMsg(data.error || "Invalid code");
        toast({ title: data.error || "Invalid code", variant: "destructive" });
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Verification failed");
      toast({ title: "Verification failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (fId: string) => {
    try {
      const res = await fetch(`/api/flows/${fId}/questions`);
      const data = await res.json();
      if (data.ok && data.questions) {
        setQuestions(data.questions);
        const initial: Record<string, any> = {};
        data.questions.forEach((q: FlowQuestion) => {
          if (isYesNoType(q.type)) initial[q.id] = null;
          else if (q.type === "number") initial[q.id] = "";
          else if (q.type === "choice" || q.type === "multi_select") initial[q.id] = null;
          else initial[q.id] = "";
        });
        setAnswers(initial);
      }
    } catch {
      toast({ title: "Failed to load questions", variant: "destructive" });
    }
  };

  const handleTriState = (qId: string, value: TriState) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleNumber = (qId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleChoice = (qId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleText = (qId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const submitIntake = async () => {
    const unansweredRequired = questions.filter(
      (q) => q.required !== false && (answers[q.id] === null || answers[q.id] === "")
    );
    if (unansweredRequired.length > 0) {
      toast({ title: `Please answer all required questions (${unansweredRequired.length} remaining)`, variant: "destructive" });
      return;
    }

    setStep("submitting");
    try {
      const normalized: Record<string, any> = {};
      questions.forEach((q) => {
        const val = answers[q.id];
        if (isYesNoType(q.type)) {
          normalized[q.id] = val === "yes" ? true : val === "no" ? false : null;
        } else if (q.type === "number") {
          normalized[q.id] = val !== "" ? parseInt(val, 10) : null;
        } else {
          normalized[q.id] = val;
        }
      });

      const res = await apiRequest("POST", `/api/intake/${token}/submit`, {
        code: code.trim(),
        answers: normalized,
      });
      const data = await res.json();
      if (data.ok) {
        setRedFlag(!!data.redFlag);
        setStep("success");
      } else {
        setErrorMsg(data.error || "Submission failed");
        setStep("error");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Submission failed");
      setStep("error");
    }
  };

  if (step === "code") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="intake-code-page">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle data-testid="text-intake-title">Enter Your Code</CardTitle>
            <CardDescription>Enter the 6-digit code sent to your phone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-code-error">
                <AlertTriangle className="h-4 w-4" />
                {errorMsg}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="code">6-Digit Code</Label>
              <Input
                id="code"
                data-testid="input-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
              />
            </div>
            <Button
              data-testid="button-verify-code"
              className="w-full"
              onClick={verifyCode}
              disabled={loading || code.length !== 6}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "form") {
    return (
      <div className="min-h-screen bg-background p-4" data-testid="intake-form-page">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-form-title">Symptom Questionnaire</CardTitle>
              <CardDescription>Please answer the following questions about your symptoms.</CardDescription>
            </CardHeader>
          </Card>

          {questions.map((q, idx) => (
            <Card key={q.id} data-testid={`card-question-${q.id}`}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-muted-foreground">{idx + 1}.</span>
                  <span className="text-sm font-medium" data-testid={`text-question-${q.id}`}>{q.text}</span>
                </div>
                {q.helpText && <p className="text-xs text-muted-foreground ml-5">{q.helpText}</p>}

                {isYesNoType(q.type) && (
                  <div className="flex gap-2 ml-5">
                    <Button
                      data-testid={`button-${q.id}-yes`}
                      variant={answers[q.id] === "yes" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTriState(q.id, "yes")}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-1" /> Yes
                    </Button>
                    <Button
                      data-testid={`button-${q.id}-no`}
                      variant={answers[q.id] === "no" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTriState(q.id, "no")}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-1" /> No
                    </Button>
                    <Button
                      data-testid={`button-${q.id}-not-sure`}
                      variant={answers[q.id] === "not_sure" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleTriState(q.id, "not_sure")}
                      className="flex-1"
                    >
                      Not Sure
                    </Button>
                  </div>
                )}

                {q.type === "number" && (
                  <div className="ml-5">
                    <Input
                      data-testid={`input-${q.id}`}
                      type="number"
                      inputMode="numeric"
                      min={q.min}
                      max={q.max}
                      placeholder={q.min !== undefined && q.max !== undefined ? `${q.min} - ${q.max}` : "Enter number"}
                      value={answers[q.id] || ""}
                      onChange={(e) => handleNumber(q.id, e.target.value)}
                      className="max-w-32"
                    />
                  </div>
                )}

                {q.type === "choice" && q.choices && (
                  <div className="flex flex-wrap gap-2 ml-5">
                    {q.choices.map((choice) => (
                      <Button
                        key={choice}
                        data-testid={`button-${q.id}-${choice.toLowerCase().replace(/\s+/g, "-")}`}
                        variant={answers[q.id] === choice ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleChoice(q.id, choice)}
                      >
                        {choice}
                      </Button>
                    ))}
                  </div>
                )}

                {q.type === "text" && (
                  <div className="ml-5">
                    <Input
                      data-testid={`input-${q.id}`}
                      type="text"
                      placeholder="Type your answer..."
                      value={answers[q.id] || ""}
                      onChange={(e) => handleText(q.id, e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="sticky bottom-4">
            <CardContent className="pt-4">
              <Button
                data-testid="button-submit-intake"
                className="w-full"
                size="lg"
                onClick={submitIntake}
              >
                Submit
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="intake-submitting-page">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Submitting your answers...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="intake-success-page">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center" data-testid="text-success-title">
              {redFlag ? (
                <span className="text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> Important
                </span>
              ) : (
                <span className="text-primary flex items-center justify-center gap-2">
                  <Check className="h-6 w-6" /> Thank You
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {redFlag ? (
              <p data-testid="text-red-flag-warning">
                Your symptoms may need urgent attention. Please consider going to an urgent care or emergency room, especially if you have trouble breathing, chest pain, confusion, or can't keep fluids down.
              </p>
            ) : (
              <p data-testid="text-success-message">
                Your answers have been sent to a physician for review. You'll receive a message on WhatsApp once they've reviewed your case.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="intake-error-page">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive" data-testid="text-error-title">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-error-message">{errorMsg}</p>
            <Button
              data-testid="button-try-again"
              variant="outline"
              onClick={() => {
                setStep("code");
                setErrorMsg("");
              }}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
