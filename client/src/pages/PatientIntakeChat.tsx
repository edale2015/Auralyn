import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, CheckCircle } from "lucide-react";
import { ChatMessageList } from "@/components/ChatMessageList";
import { AnswerInput } from "@/components/AnswerInput";
import { apiRequest } from "@/lib/queryClient";

type SessionState = {
  caseId: string;
  sessionId: string;
  complaintId: string;
  complaintLabel?: string;
  messages: Array<{
    id: string;
    role: "assistant" | "user" | "system";
    text: string;
    createdAt: string;
    token?: string;
  }>;
  currentQuestionToken?: string;
  currentQuestionText?: string;
  completed: boolean;
};

export default function PatientIntakeChat() {
  const [complaintId, setComplaintId] = useState("");
  const [complaintLabel, setComplaintLabel] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    if (!complaintId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/chatIntake/start", {
        complaintId: complaintId.trim(),
        complaintLabel: complaintLabel.trim() || complaintId.trim()
      });
      const data = await res.json();
      setSession(data);
    } catch (e: any) {
      setError(e?.message || "Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(answerText: string) {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", `/api/chatIntake/session/${session.sessionId}/answer`, {
        answerText
      });
      const data = await res.json();
      setSession(data);
    } catch (e: any) {
      setError(e?.message || "Failed to submit answer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-patient-intake-chat">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Patient Intake Chat
        </h2>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-error">
            {error}
          </div>
        )}

        {!session && (
          <Card data-testid="card-start-session">
            <CardHeader>
              <CardTitle className="text-base">Start New Intake</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Complaint ID</label>
                <Input
                  value={complaintId}
                  onChange={(e) => setComplaintId(e.target.value)}
                  placeholder="e.g. sore_throat"
                  data-testid="input-complaint-id"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Complaint Label</label>
                <Input
                  value={complaintLabel}
                  onChange={(e) => setComplaintLabel(e.target.value)}
                  placeholder="e.g. Sore throat"
                  data-testid="input-complaint-label"
                />
              </div>

              <Button
                onClick={startSession}
                disabled={loading || !complaintId.trim()}
                data-testid="button-start-intake"
              >
                {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Start Intake
              </Button>
            </CardContent>
          </Card>
        )}

        {session && (
          <>
            <Card>
              <CardContent className="pt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="font-medium">Case:</span>{" "}
                  <span className="font-mono text-xs" data-testid="text-case-id">{session.caseId}</span>
                </div>
                <div>
                  <span className="font-medium">Complaint:</span>{" "}
                  <span data-testid="text-complaint">{session.complaintLabel || session.complaintId}</span>
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <Badge variant={session.completed ? "default" : "secondary"} data-testid="badge-status">
                    {session.completed ? "Complete" : "In progress"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <ChatMessageList messages={session.messages} />

                {!session.completed ? (
                  <AnswerInput disabled={loading} onSubmit={submitAnswer} />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-600 p-3 rounded-md bg-green-50 dark:bg-green-950" data-testid="text-intake-complete">
                    <CheckCircle className="h-4 w-4" />
                    Intake complete. This case is ready for clinician review.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
