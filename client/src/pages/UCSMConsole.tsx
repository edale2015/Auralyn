import { useState, useEffect, useRef, useCallback } from "react";
import CaseSimilarityCard from "@/components/telemedicine/CaseSimilarityCard";
import DiagnosticConfidenceCard from "@/components/telemedicine/DiagnosticConfidenceCard";
import AdaptiveQuestionPanel from "@/components/telemedicine/AdaptiveQuestionPanel";
import { caseSimilarityApi } from "@/lib/caseSimilarityApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity, MessageSquare, Zap, Shield, Brain, Clock, Database,
  ChevronRight, RefreshCw, Plus, Send, Trash2, CheckCircle, AlertTriangle
} from "lucide-react";

const EVENT_TYPE_COLORS: Record<string, string> = {
  SESSION_STARTED:           "bg-blue-100 text-blue-800 border-blue-200",
  PATIENT_MESSAGE:           "bg-gray-100 text-gray-800 border-gray-200",
  SYMPTOMS_RECORDED:         "bg-gray-100 text-gray-800 border-gray-200",
  COMPLAINT_IDENTIFIED:      "bg-indigo-100 text-indigo-800 border-indigo-200",
  DIFFERENTIAL_UPDATED:      "bg-violet-100 text-violet-800 border-violet-200",
  HYBRID_REASONING_COMPLETE: "bg-purple-100 text-purple-800 border-purple-200",
  RED_FLAG_DETECTED:         "bg-red-100 text-red-800 border-red-200",
  ALERTS_UPDATED:            "bg-red-100 text-red-800 border-red-200",
  DISPOSITION_SET:           "bg-green-100 text-green-800 border-green-200",
  UNCERTAINTY_DETECTED:      "bg-yellow-100 text-yellow-800 border-yellow-200",
  NOTE_READY:                "bg-teal-100 text-teal-800 border-teal-200",
  DISCHARGE_READY:           "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCORE_COMPUTED:            "bg-cyan-100 text-cyan-800 border-cyan-200",
  RISK_ASSESSED:             "bg-orange-100 text-orange-800 border-orange-200",
  COPILOT_SUGGESTION:        "bg-sky-100 text-sky-800 border-sky-200",
  OUTCOME_RECORDED:               "bg-lime-100 text-lime-800 border-lime-200",
  REWARD_COMPUTED:                "bg-lime-100 text-lime-800 border-lime-200",
  MEDICATION_PLAN:                "bg-pink-100 text-pink-800 border-pink-200",
  FOLLOWUP_QUESTION_SUGGESTED:    "bg-amber-100 text-amber-800 border-amber-200",
  FOLLOWUP_QUESTION_ANSWERED:     "bg-green-100 text-green-800 border-green-200",
  CARE_PATHWAY_STARTED:           "bg-teal-100 text-teal-800 border-teal-200",
};

const EVENT_ICONS: Record<string, string> = {
  SESSION_STARTED: "🟢", PATIENT_MESSAGE: "💬", SYMPTOMS_RECORDED: "📝",
  COMPLAINT_IDENTIFIED: "🎯", DIFFERENTIAL_UPDATED: "🧬",
  HYBRID_REASONING_COMPLETE: "🧠", RED_FLAG_DETECTED: "🚨", ALERTS_UPDATED: "⚠",
  DISPOSITION_SET: "✅", UNCERTAINTY_DETECTED: "❓", NOTE_READY: "📋",
  DISCHARGE_READY: "🏠", SCORE_COMPUTED: "📊", RISK_ASSESSED: "⚡",
  COPILOT_SUGGESTION: "💡", OUTCOME_RECORDED: "🎓", REWARD_COMPUTED: "🏅",
  MEDICATION_PLAN: "💊", MODIFIER_CAPTURED: "🔧", PATHWAY_EXECUTED: "🛤",
  FOLLOW_UP_QUESTION_ASKED: "❓",
  FOLLOWUP_QUESTION_SUGGESTED: "🗣", FOLLOWUP_QUESTION_ANSWERED: "✔",
  CARE_PATHWAY_STARTED: "🛤",
};

function dispositionBadge(d?: string) {
  if (!d) return "bg-gray-100 text-gray-600 border-gray-200";
  const m: Record<string, string> = {
    er_now: "bg-red-100 text-red-800 border-red-200",
    urgent_care: "bg-orange-100 text-orange-800 border-orange-200",
    routine: "bg-blue-100 text-blue-800 border-blue-200",
    home_care: "bg-green-100 text-green-800 border-green-200",
    need_more_info: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  return m[d] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

function dispositionIcon(d?: string) {
  const m: Record<string, string> = { er_now: "🚨", urgent_care: "⚡", routine: "📋", home_care: "🏠", need_more_info: "❓" };
  return d ? (m[d] ?? "—") : "—";
}

function EventTimeline({ events }: { events: any[] }) {
  if (!events?.length) return <div className="text-xs text-muted-foreground py-4 text-center">No events yet — send a patient message to start the pipeline.</div>;
  return (
    <div className="space-y-1.5">
      {events.map((e: any, i: number) => (
        <div key={i} className="flex gap-2 text-xs group">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full border bg-background flex items-center justify-center text-[10px] shrink-0">
              {EVENT_ICONS[e.type] ?? "•"}
            </div>
            {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" />}
          </div>
          <div className="flex-1 pb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`text-[10px] px-1.5 py-0 border ${EVENT_TYPE_COLORS[e.type] ?? "bg-gray-100 text-gray-700"}`}>
                {e.type.replace(/_/g, " ")}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-mono">
                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
            {e.data && Object.keys(e.data).length > 0 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-1 font-mono max-h-12 overflow-hidden group-hover:max-h-none transition-all">
                {Object.entries(e.data).slice(0, 3).map(([k, v]) => (
                  <span key={k} className="mr-2">{k}: <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}</span></span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StateViewer({ state }: { state: any }) {
  const fields = [
    { label: "Complaint", value: state.complaint?.replace(/_/g," "), icon: "🎯" },
    { label: "Disposition", value: state.disposition, icon: dispositionIcon(state.disposition) },
    { label: "Symptoms", value: state.symptoms?.slice(0, 120), icon: "📝" },
    { label: "Red Flags", value: state.redFlags?.join(", "), icon: "🚨" },
    { label: "Alerts", value: state.alerts?.join(", "), icon: "⚠" },
    { label: "Top Diagnosis", value: state.hybridResult?.topDiagnosis?.replace(/_/g," "), icon: "🧬" },
    { label: "Confidence", value: state.hybridResult?.confidence ? `${Math.round(state.hybridResult.confidence * 100)}%` : undefined, icon: "📊" },
    { label: "Uncertainty", value: state.hybridResult?.uncertaintyScore?.toFixed(2), icon: "❓" },
  ].filter(f => f.value);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => (
          <div key={f.label} className="border rounded-md px-2.5 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{f.icon} {f.label}</div>
            <div className="text-xs font-medium mt-0.5 truncate">
              {f.label === "Disposition"
                ? <Badge className={`text-xs border ${dispositionBadge(state.disposition)}`}>{dispositionIcon(state.disposition)} {state.disposition?.replace(/_/g," ")}</Badge>
                : f.value}
            </div>
          </div>
        ))}
      </div>

      {state.differential?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Differential</div>
          <div className="space-y-1">
            {state.differential.slice(0, 5).map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right text-muted-foreground">{i + 1}.</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(d.confidence * 100)}%` }} />
                </div>
                <span className="truncate max-w-[140px]">{d.diagnosis.replace(/_/g," ")}</span>
                <span className="font-mono text-muted-foreground">{Math.round(d.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.hybridResult?.explanation && (
        <div className="border rounded-md p-2.5 bg-blue-50/50 border-blue-200">
          <div className="text-[10px] text-blue-700 uppercase tracking-wide mb-1">🧠 LLM Explanation</div>
          <p className="text-xs text-blue-900">{state.hybridResult.explanation}</p>
        </div>
      )}

      {state.pendingQuestion && (
        <div className="border-2 rounded-md p-2.5 bg-amber-50 border-amber-300 animate-pulse-once">
          <div className="text-[10px] text-amber-700 uppercase tracking-wide mb-1 font-semibold">🗣 Follow-Up Question (Guided Interview)</div>
          <p className="text-xs text-amber-900 font-medium">{state.pendingQuestion.text}</p>
          {state.pendingQuestion.choices && (
            <div className="mt-1 flex flex-wrap gap-1">
              {state.pendingQuestion.choices.map((c: string) => (
                <Badge key={c} variant="outline" className="text-[10px] text-amber-700 border-amber-300">{c}</Badge>
              ))}
            </div>
          )}
          <div className="text-[10px] text-amber-600 mt-1">Expected: {state.pendingQuestion.expectedAnswerType} · Feature: {state.pendingQuestion.targetFeature}</div>
        </div>
      )}

      {state.answeredQuestions?.length > 0 && (
        <div className="border rounded-md p-2.5 bg-green-50/50 border-green-200">
          <div className="text-[10px] text-green-700 uppercase tracking-wide mb-1">✔ Interview Transcript ({state.answeredQuestions.length} answered)</div>
          <div className="space-y-1.5">
            {state.answeredQuestions.map((aq: any, i: number) => (
              <div key={i} className="text-xs">
                <span className="text-green-800 font-medium">Q ({aq.questionId}):</span>{" "}
                <span className="text-green-900">{aq.answer}</span>
                {aq.featuresExtracted?.length > 0 && (
                  <div className="text-[10px] text-green-600">→ {aq.featuresExtracted.join(", ")}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!state.pendingQuestion && state.followUpQuestions?.length > 0 && !state.answeredQuestions?.length && (
        <div className="border rounded-md p-2.5 bg-yellow-50 border-yellow-200">
          <div className="text-[10px] text-yellow-700 uppercase tracking-wide mb-1">❓ Pending Questions</div>
          <ul className="space-y-0.5">
            {state.followUpQuestions.map((q: string, i: number) => (
              <li key={i} className="text-xs text-yellow-900">{q}</li>
            ))}
          </ul>
        </div>
      )}

      {state.carePathway && (
        <div className="border rounded-md p-2.5 bg-teal-50/50 border-teal-200">
          <div className="text-[10px] text-teal-700 uppercase tracking-wide mb-1 font-semibold">🛤 Care Pathway — {state.carePathway.title ?? "Active"}</div>
          {state.carePathway.description && <p className="text-xs text-teal-800 mb-1.5">{state.carePathway.description}</p>}
          <div className="space-y-1">
            {(state.carePathway.steps ?? []).slice(0, 5).map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <Badge variant="outline" className="text-[10px] shrink-0 border-teal-300 text-teal-700 capitalize">{step.type}</Badge>
                <span className="text-teal-900">{step.action}</span>
                {step.priority === "urgent" && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 shrink-0">urgent</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.dischargeText && (
        <div className="border rounded-md p-2.5 bg-emerald-50/50 border-emerald-200">
          <div className="text-[10px] text-emerald-700 uppercase tracking-wide mb-1">🏠 Discharge Instructions</div>
          <pre className="text-xs text-emerald-900 whitespace-pre-wrap font-sans">{state.dischargeText.slice(0, 400)}</pre>
        </div>
      )}

      {state.chartNote && (
        <div className="border rounded-md p-2.5 bg-teal-50/50 border-teal-200">
          <div className="text-[10px] text-teal-700 uppercase tracking-wide mb-1">📋 Chart Note</div>
          <pre className="text-xs text-teal-900 whitespace-pre-wrap font-sans">{(typeof state.chartNote === "string" ? state.chartNote : JSON.stringify(state.chartNote, null, 2)).slice(0, 500)}</pre>
        </div>
      )}
    </div>
  );
}

function ConversationPanel({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [answerText, setAnswerText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: state, isLoading } = useQuery({
    queryKey: ["/api/ucsm", caseId],
    queryFn: () => fetch(`/api/ucsm/${caseId}`).then(r => r.json()),
    enabled: !!caseId,
    refetchInterval: 3000,
  });

  const sendMut = useMutation({
    mutationFn: (msg: string) => apiRequest("POST", "/api/ucsm/message", { caseId, message: msg }).then(r => r.json()),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["/api/ucsm", caseId] });
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const answerMut = useMutation({
    mutationFn: (ans: string) => apiRequest("POST", `/api/ucsm/${caseId}/answer`, { answer: ans }).then(r => r.json()),
    onSuccess: (data) => {
      setAnswerText("");
      qc.invalidateQueries({ queryKey: ["/api/ucsm", caseId] });
      if (data.featuresExtracted?.length) {
        toast({ title: `Answer processed — features: ${data.featuresExtracted.join(", ")}` });
      }
    },
    onError: () => toast({ title: "Failed to submit answer", variant: "destructive" }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.intakeMessages?.length]);

  const messages: any[] = state?.intakeMessages ?? [];
  const pendingQuestion = state?.pendingQuestion;

  return (
    <div className="flex flex-col gap-2">
      {pendingQuestion && (
        <div className="border-2 border-amber-300 rounded-md p-3 bg-amber-50">
          <div className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide mb-1.5">
            🗣 Guided Interview — System is asking:
          </div>
          <p className="text-sm font-medium text-amber-900 mb-2">{pendingQuestion.text}</p>
          {pendingQuestion.choices && (
            <div className="flex flex-wrap gap-1 mb-2">
              {pendingQuestion.choices.map((c: string) => (
                <button
                  key={c}
                  className="text-xs px-2 py-1 border border-amber-300 rounded bg-white hover:bg-amber-100 text-amber-800"
                  onClick={() => setAnswerText(c)}
                  data-testid={`choice-${c.toLowerCase().replace(/\s/g,"-")}`}
                >{c}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              className="text-xs h-8 flex-1 border-amber-300 bg-white"
              placeholder={`Answer (${pendingQuestion.expectedAnswerType})…`}
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && answerText.trim()) answerMut.mutate(answerText.trim()); }}
              disabled={answerMut.isPending}
              data-testid="input-followup-answer"
            />
            <Button
              size="sm"
              className="h-8 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { if (answerText.trim()) answerMut.mutate(answerText.trim()); }}
              disabled={answerMut.isPending || !answerText.trim()}
              data-testid="button-submit-answer"
            >
              {answerMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col h-[420px]">
        <div className="flex-1 overflow-y-auto space-y-2 p-3 border rounded-t-md bg-muted/20">
          {messages.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">
              Send a message to start the clinical pipeline. The AI will process it through all 4 reasoning layers.
            </div>
          )}
          {messages.map((m: any, i: number) => (
            <div key={i} className={`flex ${m.role === "patient" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${m.role === "patient" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 p-2 border border-t-0 rounded-b-md bg-background">
          <Input
            className="text-xs h-8 flex-1"
            placeholder='e.g. "I have chest pain radiating to my left arm with sweating"'
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) sendMut.mutate(message.trim()); }}}
            disabled={sendMut.isPending}
            data-testid="input-patient-message"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={() => { if (message.trim()) sendMut.mutate(message.trim()); }}
            disabled={sendMut.isPending || !message.trim()}
            data-testid="button-send-message"
          >
            {sendMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground text-center py-1">Loading state...</div>}
      {state && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state.disposition && (
            <Badge className={`border text-xs ${dispositionBadge(state.disposition)}`}>
              {dispositionIcon(state.disposition)} {state.disposition?.replace(/_/g," ")}
            </Badge>
          )}
          {state.complaint && <Badge variant="outline" className="text-xs">🎯 {state.complaint.replace(/_/g," ")}</Badge>}
          {state.hybridResult?.topDiagnosis && <Badge variant="outline" className="text-xs">🧬 {state.hybridResult.topDiagnosis.replace(/_/g," ")}</Badge>}
          {state.hybridResult?.triggered_flags?.length > 0 && <Badge variant="destructive" className="text-xs">🚨 Red flags</Badge>}
          {state.followUpQuestions?.length > 0 && <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200">❓ Question pending</Badge>}
          <span className="text-[10px] text-muted-foreground self-center ml-auto">{state.events?.length ?? 0} events</span>
        </div>
      )}
    </div>
  );
}

export default function UCSMConsole() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeCaseId, setActiveCaseId] = useState("DEMO_CASE_001");
  const [newCaseId, setNewCaseId] = useState("");
  const [startComplaint, setStartComplaint] = useState("chest_pain");
  const [patientAge, setPatientAge] = useState("52");
  const [patientSex, setPatientSex] = useState("male");
  const [manualEventType, setManualEventType] = useState("SYMPTOMS_RECORDED");
  const [manualEventData, setManualEventData] = useState('{"symptoms":"fever and cough for 3 days"}');
  const [similarityResult, setSimilarityResult] = useState<any>(null);
  const [similarityLoading, setSimilarityLoading] = useState(false);
  const [adaptiveResult, setAdaptiveResult] = useState<any>(null);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);
  const [adaptiveAbsent, setAdaptiveAbsent] = useState<string[]>([]);

  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ["/api/ucsm/sessions"],
    queryFn: () => fetch("/api/ucsm/sessions").then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: state } = useQuery({
    queryKey: ["/api/ucsm", activeCaseId],
    queryFn: () => fetch(`/api/ucsm/${activeCaseId}`).then(r => r.json()),
    enabled: !!activeCaseId,
    refetchInterval: 3000,
  });

  const { data: events } = useQuery({
    queryKey: ["/api/ucsm", activeCaseId, "events"],
    queryFn: () => fetch(`/api/ucsm/${activeCaseId}/events`).then(r => r.json()),
    enabled: !!activeCaseId,
    refetchInterval: 3000,
  });

  const startMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/ucsm/start", body).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Session started" });
      refetchSessions();
      qc.invalidateQueries({ queryKey: ["/api/ucsm", activeCaseId] });
    },
  });

  const clearMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ucsm/${id}`, {}).then(r => r.json()),
    onSuccess: () => { toast({ title: "Session cleared" }); refetchSessions(); },
  });

  const eventMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/ucsm/${activeCaseId}/event`, body).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/ucsm", activeCaseId] }); },
    onError: () => toast({ title: "Failed to emit event", variant: "destructive" }),
  });

  const COMPLAINTS = ["chest_pain","sore_throat","cough","abdominal_pain","fever","uti","ear_pain","rash","sinus_pressure","headache","dizziness","back_pain","anxiety"];
  const EVENT_TYPES = ["SESSION_STARTED","PATIENT_MESSAGE","SYMPTOMS_RECORDED","COMPLAINT_IDENTIFIED","DIFFERENTIAL_UPDATED","RED_FLAG_DETECTED","DISPOSITION_SET","DISCHARGE_READY","NOTE_READY","OUTCOME_RECORDED"];

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Unified Clinical State Model (UCSM)
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Single shared clinical state driven by typed events — every module reads and writes the same case object.
        </p>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs flex items-center gap-1"><Database className="h-3 w-3" />Active Sessions</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 space-y-1">
              {(sessions ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground px-1">No sessions — start one below.</div>
              )}
              {(sessions ?? []).map((s: any) => (
                <div
                  key={s.caseId}
                  className={`text-xs rounded px-2 py-1.5 cursor-pointer transition-colors flex items-center justify-between ${s.caseId === activeCaseId ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                  onClick={() => setActiveCaseId(s.caseId)}
                  data-testid={`session-${s.caseId}`}
                >
                  <div>
                    <div className="font-medium truncate max-w-[120px]">{s.caseId}</div>
                    {s.complaint && <div className="text-[10px] text-muted-foreground">{s.complaint.replace(/_/g," ")}</div>}
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs flex items-center gap-1"><Plus className="h-3 w-3" />New Session</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Case ID</Label>
                <Input className="h-7 text-xs" value={newCaseId} onChange={e => setNewCaseId(e.target.value)} placeholder="CASE_001" data-testid="input-new-caseid" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Complaint</Label>
                <Select value={startComplaint} onValueChange={setStartComplaint}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-start-complaint"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-1">
                  <Label className="text-[10px]">Age</Label>
                  <Input className="h-7 text-xs" value={patientAge} onChange={e => setPatientAge(e.target.value)} data-testid="input-patient-age" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Sex</Label>
                  <Select value={patientSex} onValueChange={setPatientSex}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-patient-sex"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="male">M</SelectItem><SelectItem value="female">F</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  const id = newCaseId.trim() || `CASE_${Date.now()}`;
                  setActiveCaseId(id);
                  startMut.mutate({ caseId: id, complaint: startComplaint, patient: { age: parseInt(patientAge) || undefined, sex: patientSex } });
                  setNewCaseId("");
                }}
                disabled={startMut.isPending}
                data-testid="button-start-session"
              >
                <Plus className="h-3 w-3 mr-1" />Start Session
              </Button>
            </CardContent>
          </Card>

          {activeCaseId && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs border-red-200 text-red-600"
              onClick={() => clearMut.mutate(activeCaseId)}
              data-testid="button-clear-session"
            >
              <Trash2 className="h-3 w-3 mr-1" />Clear {activeCaseId}
            </Button>
          )}
        </div>

        <div className="space-y-3 min-w-0">
          {!activeCaseId ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Select or create a session to begin.</CardContent></Card>
          ) : (
            <Tabs defaultValue="conversation">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-sm font-semibold text-muted-foreground">{activeCaseId}</div>
                {state?.disposition && (
                  <Badge className={`border text-xs ${dispositionBadge(state.disposition)}`}>
                    {dispositionIcon(state.disposition)} {state.disposition?.replace(/_/g," ")}
                  </Badge>
                )}
              </div>
              <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg">
                <TabsTrigger value="conversation" className="text-xs" data-testid="tab-ucsm-conversation"><MessageSquare className="h-3 w-3 mr-1" />Conversation</TabsTrigger>
                <TabsTrigger value="state" className="text-xs" data-testid="tab-ucsm-state"><Brain className="h-3 w-3 mr-1" />Clinical State</TabsTrigger>
                <TabsTrigger value="events" className="text-xs" data-testid="tab-ucsm-events"><Clock className="h-3 w-3 mr-1" />Event Log ({events?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="interview" className="text-xs" data-testid="tab-ucsm-interview">
                  🗣 Interview {state?.pendingQuestion ? <Badge className="ml-1 text-[9px] bg-amber-500 text-white px-1 py-0">Q</Badge> : null}
                </TabsTrigger>
                <TabsTrigger value="pathway" className="text-xs" data-testid="tab-ucsm-pathway">🛤 Pathway</TabsTrigger>
                <TabsTrigger value="emit" className="text-xs" data-testid="tab-ucsm-emit"><Zap className="h-3 w-3 mr-1" />Emit Event</TabsTrigger>
                <TabsTrigger value="similarity" className="text-xs" data-testid="tab-ucsm-similarity">🔗 Similar Cases</TabsTrigger>
                <TabsTrigger value="adaptive" className="text-xs" data-testid="tab-ucsm-adaptive">🎯 Adaptive Q</TabsTrigger>
                <TabsTrigger value="confidence" className="text-xs" data-testid="tab-ucsm-confidence">📊 Confidence</TabsTrigger>
              </TabsList>

              <TabsContent value="conversation" className="mt-3">
                <ConversationPanel caseId={activeCaseId} />
              </TabsContent>

              <TabsContent value="state" className="mt-3">
                {state ? (
                  <StateViewer state={state} />
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">No state yet.</div>
                )}
              </TabsContent>

              <TabsContent value="events" className="mt-3">
                <Card>
                  <CardContent className="p-3">
                    <EventTimeline events={events ?? []} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="interview" className="mt-3">
                <Card>
                  <CardContent className="p-3 space-y-3">
                    {!state?.pendingQuestion && !state?.answeredQuestions?.length && (
                      <div className="text-xs text-muted-foreground text-center py-6">
                        No guided interview active. Send a message with a specific complaint (e.g. "I have chest pain") to start the interview.
                      </div>
                    )}
                    {state?.pendingQuestion && (
                      <div className="border-2 border-amber-300 rounded-md p-3 bg-amber-50">
                        <div className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide mb-1.5">🗣 Current Question</div>
                        <p className="text-sm font-medium text-amber-900 mb-2">{state.pendingQuestion.text}</p>
                        <div className="text-[10px] text-amber-600">Type: {state.pendingQuestion.expectedAnswerType} · Feature: {state.pendingQuestion.targetFeature}</div>
                        {state.pendingQuestion.choices && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {state.pendingQuestion.choices.map((c: string) => (
                              <Badge key={c} variant="outline" className="text-xs text-amber-700 border-amber-300">{c}</Badge>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-amber-700 mt-2">→ Answer in the Conversation tab or type below and click Submit.</p>
                      </div>
                    )}
                    {state?.answeredQuestions?.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold mb-2 text-green-700">✔ Interview Transcript</div>
                        <div className="space-y-2">
                          {state.answeredQuestions.map((aq: any, i: number) => (
                            <div key={i} className="border rounded-md p-2 bg-green-50/50 border-green-200">
                              <div className="text-[10px] text-green-700 font-semibold mb-0.5">Q{i+1}: {aq.questionId?.replace(/_/g," ")}</div>
                              <div className="text-xs text-green-900">{aq.answer}</div>
                              {aq.featuresExtracted?.length > 0 && (
                                <div className="text-[10px] text-green-600 mt-0.5">
                                  Features extracted: {aq.featuresExtracted.join(", ")}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {state?.structuredFacts && Object.keys(state.structuredFacts).length > 0 && (
                      <div>
                        <div className="text-xs font-semibold mb-1.5">Structured Clinical Features</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(state.structuredFacts).map((k: string) => (
                            <Badge key={k} className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">{k.replace(/_/g," ")}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {state?.interviewComplete && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">Interview complete — all diagnostic features collected. Running final hybrid reasoning.</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pathway" className="mt-3">
                <Card>
                  <CardContent className="p-3 space-y-3">
                    {!state?.carePathway && !state?.pathway && (
                      <div className="text-xs text-muted-foreground text-center py-6">
                        No care pathway active. A pathway is automatically triggered when a disposition is set.
                      </div>
                    )}
                    {(state?.carePathway ?? state?.pathway) && (() => {
                      const pw = state.carePathway ?? state.pathway;
                      return (
                        <div className="space-y-3">
                          <div className="border rounded-md p-3 bg-teal-50/50 border-teal-200">
                            <div className="text-sm font-semibold text-teal-900">{pw.title ?? pw.pathway?.title}</div>
                            <div className="text-xs text-teal-700 mt-0.5">{pw.description ?? pw.pathway?.description}</div>
                            {pw.expectedDuration && <div className="text-[10px] text-teal-600 mt-1">Duration: {pw.expectedDuration}</div>}
                          </div>
                          <div className="space-y-1.5">
                            {(pw.steps ?? pw.pathway?.steps ?? []).map((step: any, i: number) => (
                              <div key={i} className={`border rounded-md px-3 py-2 flex items-start gap-2 ${step.priority === "urgent" ? "border-red-200 bg-red-50/50" : step.priority === "stat" ? "border-red-300 bg-red-100/50" : "border-border bg-background"}`}>
                                <Badge variant="outline" className={`text-[10px] shrink-0 capitalize ${step.priority === "urgent" || step.priority === "stat" ? "border-red-300 text-red-700" : "text-teal-700 border-teal-300"}`}>{step.type}</Badge>
                                <div className="flex-1">
                                  <div className="text-xs font-medium">{step.action}</div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{step.rationale}</div>
                                  <div className="text-[10px] text-blue-600 mt-0.5">⏱ {step.timing}</div>
                                </div>
                                {(step.priority === "urgent" || step.priority === "stat") && (
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 shrink-0">{step.priority}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                          {(pw.escalationCriteria ?? pw.pathway?.escalationCriteria)?.length > 0 && (
                            <div className="border rounded-md p-2.5 bg-red-50/50 border-red-200">
                              <div className="text-[10px] text-red-700 font-semibold mb-1">⚠ Escalation Criteria</div>
                              <ul className="space-y-0.5">
                                {(pw.escalationCriteria ?? pw.pathway?.escalationCriteria).map((c: string, i: number) => (
                                  <li key={i} className="text-xs text-red-900">{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="emit" className="mt-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Manually Emit Clinical Event</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Event Type</Label>
                      <Select value={manualEventType} onValueChange={setManualEventType}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-event-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Event Data (JSON)</Label>
                      <Textarea
                        className="text-xs h-20 font-mono resize-none"
                        value={manualEventData}
                        onChange={e => setManualEventData(e.target.value)}
                        data-testid="textarea-event-data"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        try {
                          const data = JSON.parse(manualEventData);
                          eventMut.mutate({ type: manualEventType, data });
                          toast({ title: `Event ${manualEventType} emitted` });
                        } catch {
                          toast({ title: "Invalid JSON in event data", variant: "destructive" });
                        }
                      }}
                      disabled={eventMut.isPending}
                      data-testid="button-emit-event"
                    >
                      <Zap className="h-3 w-3 mr-1" />Emit Event
                    </Button>

                    <div className="mt-3 p-3 bg-muted/30 rounded-md">
                      <div className="text-xs font-semibold mb-2">Quick Events</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { type: "OUTCOME_RECORDED", data: { actualDisposition: "urgent_care", followupStatus: "improved" } },
                          { type: "REWARD_COMPUTED", data: { reward: 1 } },
                          { type: "MEDICATION_PLAN", data: { medication: { drug: "Amoxicillin", dose: "500mg", route: "oral", frequency: "TID", duration: "7 days" } } },
                        ].map(q => (
                          <Button
                            key={q.type}
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => eventMut.mutate({ type: q.type, data: q.data })}
                            data-testid={`button-quick-${q.type.toLowerCase()}`}
                          >
                            {EVENT_ICONS[q.type]} {q.type.replace(/_/g," ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="similarity" className="mt-3">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      disabled={similarityLoading}
                      data-testid="button-fetch-similar"
                      onClick={async () => {
                        setSimilarityLoading(true);
                        try {
                          const res = await caseSimilarityApi.getByCaseId(activeCaseId);
                          setSimilarityResult(res.result);
                        } catch { /* ignore */ } finally {
                          setSimilarityLoading(false);
                        }
                      }}
                    >
                      🔗 Find Similar Cases
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      disabled={similarityLoading}
                      data-testid="button-rebuild-index"
                      onClick={async () => {
                        setSimilarityLoading(true);
                        try {
                          await caseSimilarityApi.rebuildIndex();
                          const res = await caseSimilarityApi.getByCaseId(activeCaseId);
                          setSimilarityResult(res.result);
                        } catch { /* ignore */ } finally {
                          setSimilarityLoading(false);
                        }
                      }}
                    >
                      ↻ Rebuild Index
                    </Button>
                  </div>
                  <CaseSimilarityCard
                    result={similarityResult}
                    isLoading={similarityLoading}
                  />
                </div>
              </TabsContent>

              <TabsContent value="adaptive" className="mt-3">
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        🎯 Adaptive Question Selection
                        <Badge variant="outline" className="text-[10px] font-normal">Expected Information Gain</Badge>
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        Ranks the next best question to ask based on which answer would most reduce diagnostic uncertainty. Uses Bayesian entropy reduction.
                      </p>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={adaptiveLoading}
                          data-testid="button-compute-adaptive"
                          onClick={async () => {
                            setAdaptiveLoading(true);
                            try {
                              const res = await fetch("/api/similarity/adaptive-questions/from-state", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ state, absentFeatures: adaptiveAbsent }),
                              });
                              const data = await res.json();
                              if (data.ok) setAdaptiveResult(data.result);
                            } catch { /* ignore */ } finally {
                              setAdaptiveLoading(false);
                            }
                          }}
                        >
                          {adaptiveLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : "🎯"} Compute Best Questions
                        </Button>
                        {adaptiveResult && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-muted-foreground"
                            onClick={() => { setAdaptiveResult(null); setAdaptiveAbsent([]); }}
                          >
                            Clear
                          </Button>
                        )}
                      </div>

                      {!state?.complaint && (
                        <div className="text-xs text-muted-foreground text-center py-4 border rounded-md bg-muted/30">
                          Start a case with a specific complaint first, then compute adaptive questions.
                        </div>
                      )}

                      {adaptiveResult && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="border rounded-md p-2 text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Entropy</div>
                              <div className="text-sm font-bold text-amber-600">{adaptiveResult.currentEntropy?.toFixed(3)}</div>
                              <div className="text-[9px] text-muted-foreground">bits of uncertainty</div>
                            </div>
                            <div className="border rounded-md p-2 text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Top Dx</div>
                              <div className="text-xs font-semibold truncate">{adaptiveResult.topDiagnosis}</div>
                              <div className="text-[9px] text-muted-foreground">{Math.round((adaptiveResult.topProbability ?? 0) * 100)}% probability</div>
                            </div>
                            <div className="border rounded-md p-2 text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Complaint</div>
                              <div className="text-xs font-semibold">{adaptiveResult.complaint?.replace(/_/g, " ")}</div>
                              <div className="text-[9px] text-muted-foreground">{adaptiveResult.questions?.length} q's ranked</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-medium">
                              Bayesian Differential
                            </div>
                            <div className="space-y-1">
                              {(adaptiveResult.differential ?? []).slice(0, 6).map((d: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs" data-testid={`adaptive-diff-${i}`}>
                                  <span className="w-4 text-right text-muted-foreground font-mono">{i + 1}.</span>
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/50"}`}
                                      style={{ width: `${Math.round((d.probability ?? 0) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="truncate max-w-[130px]">{d.diagnosis}</span>
                                  <span className="font-mono text-muted-foreground w-9 text-right">{Math.round((d.probability ?? 0) * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-medium flex items-center gap-1">
                              Ranked Questions by Expected Information Gain
                              <Badge variant="outline" className="text-[9px] ml-1">higher = ask first</Badge>
                            </div>
                            <div className="space-y-2">
                              {(adaptiveResult.questions ?? []).map((q: any, i: number) => (
                                <div key={i} className={`border rounded-md p-2.5 ${i === 0 ? "border-primary/30 bg-primary/5" : "bg-muted/20"}`} data-testid={`adaptive-question-${i}`}>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                        #{i + 1}
                                      </span>
                                      <span className="text-xs font-medium">{q.text}</span>
                                    </div>
                                    <Badge variant="outline" className={`text-[10px] shrink-0 ${i === 0 ? "border-primary/40 text-primary" : ""}`}>
                                      EIG: {q.expectedInfoGain?.toFixed(3)}
                                    </Badge>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground italic mb-1.5">{q.rationale}</div>
                                  <div className="flex items-center gap-3 text-[10px]">
                                    <span className="text-muted-foreground">P(yes): <span className="font-mono font-medium">{Math.round((q.pYes ?? 0) * 100)}%</span></span>
                                    <span className="text-green-700">H(yes): <span className="font-mono">{q.entropyIfYes?.toFixed(2)}</span> bits</span>
                                    <span className="text-orange-700">H(no): <span className="font-mono">{q.entropyIfNo?.toFixed(2)}</span> bits</span>
                                  </div>
                                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/40"}`}
                                      style={{ width: `${Math.min(100, Math.round((q.expectedInfoGain ?? 0) * 100))}%` }}
                                    />
                                  </div>
                                  <div className="flex gap-1.5 mt-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 px-2 text-[10px] text-green-700 hover:bg-green-50"
                                      onClick={async () => {
                                        setAdaptiveAbsent(prev => prev.filter(f => f !== q.feature));
                                        setAdaptiveLoading(true);
                                        try {
                                          const res = await fetch("/api/similarity/adaptive-questions/from-state", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              state: { ...state, symptoms: (state?.symptoms ?? "") + ` ${q.feature.replace(/_/g, " ")} present` },
                                              absentFeatures: adaptiveAbsent.filter(f => f !== q.feature),
                                            }),
                                          });
                                          const data = await res.json();
                                          if (data.ok) setAdaptiveResult(data.result);
                                        } catch { /* ignore */ } finally {
                                          setAdaptiveLoading(false);
                                        }
                                      }}
                                    >✓ Yes</Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 px-2 text-[10px] text-red-700 hover:bg-red-50"
                                      onClick={async () => {
                                        const newAbsent = [...adaptiveAbsent.filter(f => f !== q.feature), q.feature];
                                        setAdaptiveAbsent(newAbsent);
                                        setAdaptiveLoading(true);
                                        try {
                                          const res = await fetch("/api/similarity/adaptive-questions/from-state", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ state, absentFeatures: newAbsent }),
                                          });
                                          const data = await res.json();
                                          if (data.ok) setAdaptiveResult(data.result);
                                        } catch { /* ignore */ } finally {
                                          setAdaptiveLoading(false);
                                        }
                                      }}
                                    >✗ No</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="confidence" className="mt-3">
                <div className="space-y-3">
                  {!activeCaseId ? (
                    <Card><CardContent className="pt-4 text-sm text-muted-foreground">Start a case first.</CardContent></Card>
                  ) : (
                    <>
                      <DiagnosticConfidenceCard caseId={activeCaseId} />
                      <AdaptiveQuestionPanel
                        caseId={activeCaseId}
                        state={state}
                        onAnswered={() => {}}
                      />
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
