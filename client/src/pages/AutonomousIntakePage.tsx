import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, Send, User, RefreshCw, Stethoscope } from "lucide-react";

type TriageLevel = "low" | "moderate" | "high" | "critical";
type MsgRole = "patient" | "system";

interface Message {
  role: MsgRole;
  content: string;
  timestamp: string;
}

interface IntakeResult {
  reply: string;
  triageLevel: TriageLevel;
  redFlags: { flag: string; level: string }[];
  complaint?: string;
  complete: boolean;
}

const TRIAGE_CONFIG: Record<TriageLevel, { label: string; color: string; bg: string; border: string }> = {
  low:      { label: "Low Priority",      color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  moderate: { label: "Moderate Priority", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  high:     { label: "High Priority",     color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  critical: { label: "CRITICAL — 911",    color: "text-red-700",    bg: "bg-red-50",    border: "border-red-300" },
};

function generateCaseId() {
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function AutonomousIntakePage() {
  const [caseId, setCaseId] = useState(generateCaseId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [triage, setTriage] = useState<TriageLevel>("low");
  const [complaint, setComplaint] = useState<string | null>(null);
  const [redFlags, setRedFlags] = useState<{ flag: string; level: string }[]>([]);
  const [complete, setComplete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/autonomous-intake/start", { caseId }),
    onSuccess: (data: any) => {
      setStarted(true);
      setMessages([{ role: "system", content: data.reply, timestamp: new Date().toISOString() }]);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/autonomous-intake/message", { caseId, message }),
    onSuccess: (data: IntakeResult) => {
      setMessages(prev => [...prev, { role: "system", content: data.reply, timestamp: new Date().toISOString() }]);
      setTriage(data.triageLevel);
      if (data.complaint) setComplaint(data.complaint);
      if (data.redFlags?.length) setRedFlags(prev => [...prev, ...data.redFlags.filter(f => !prev.find(p => p.flag === f.flag))]);
      if (data.complete) setComplete(true);
    },
  });

  function handleSend() {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "patient", content: text, timestamp: new Date().toISOString() }]);
    sendMutation.mutate(text);
  }

  function handleReset() {
    const id = generateCaseId();
    setCaseId(id);
    setMessages([]);
    setStarted(false);
    setTriage("low");
    setComplaint(null);
    setRedFlags([]);
    setComplete(false);
    setInput("");
  }

  const triageCfg = TRIAGE_CONFIG[triage];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-blue-600" />
            Autonomous Intake System
          </h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered multi-turn patient symptom intake with triage prioritization</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-intake">
          <RefreshCw className="h-4 w-4 mr-2" />
          New Session
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border-2 ${triageCfg.border} ${triageCfg.bg}`}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Triage Level</p>
            <p className={`text-lg font-bold ${triageCfg.color}`} data-testid="text-triage-level">{triageCfg.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Detected Complaint</p>
            <p className="text-lg font-bold capitalize" data-testid="text-complaint">
              {complaint ? complaint.replace(/_/g, " ") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Case ID</p>
            <p className="text-xs font-mono text-muted-foreground truncate" data-testid="text-case-id">{caseId}</p>
          </CardContent>
        </Card>
      </div>

      {redFlags.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 flex gap-2" data-testid="banner-red-flags">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 mb-1">Red Flags Detected</p>
            {redFlags.map((f, i) => (
              <p key={i} className="text-xs text-red-700">
                <Badge variant="destructive" className="mr-1 text-xs">{f.level.toUpperCase()}</Badge>
                {f.flag}
              </p>
            ))}
          </div>
        </div>
      )}

      <Card className="flex flex-col" style={{ height: "420px" }}>
        <CardHeader className="py-3 px-4 border-b flex-shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Clinical Intake Chat
            {complete && <Badge className="ml-2 bg-green-600">Session Complete</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {!started && !startMutation.isPending && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Bot className="h-12 w-12 text-blue-400 mx-auto" />
                <p className="text-muted-foreground text-sm">Start a session to begin AI-guided symptom intake</p>
                <Button onClick={() => startMutation.mutate()} data-testid="button-start-intake">
                  Begin Patient Intake
                </Button>
              </div>
            </div>
          )}
          {startMutation.isPending && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">Starting session…</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "patient" ? "justify-end" : "justify-start"}`}>
              {msg.role === "system" && (
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
              )}
              <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2 text-sm ${
                msg.role === "patient"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-900 rounded-bl-sm"
              }`} data-testid={`message-${msg.role}-${i}`}>
                {msg.content}
              </div>
              {msg.role === "patient" && (
                <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
              )}
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground">
                Analyzing…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
        {started && !complete && (
          <div className="p-3 border-t flex gap-2 flex-shrink-0">
            <Input
              data-testid="input-intake-message"
              placeholder="Describe your symptoms…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              disabled={sendMutation.isPending}
            />
            <Button onClick={handleSend} disabled={sendMutation.isPending || !input.trim()} data-testid="button-send-message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
        {complete && (
          <div className="p-3 border-t flex-shrink-0">
            <p className="text-xs text-center text-muted-foreground">Intake complete — a physician will review this case</p>
          </div>
        )}
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">HOW IT WORKS</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-center">
            {[
              { step: "1", label: "Patient describes symptoms", icon: "💬" },
              { step: "2", label: "Complaint detected & red flags checked", icon: "🔍" },
              { step: "3", label: "Dynamic follow-up questions asked", icon: "❓" },
              { step: "4", label: "Triage level assigned & physician notified", icon: "🏥" },
            ].map(s => (
              <div key={s.step} className="border rounded-lg p-2 bg-muted/30">
                <div className="text-2xl mb-1">{s.icon}</div>
                <p className="text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
