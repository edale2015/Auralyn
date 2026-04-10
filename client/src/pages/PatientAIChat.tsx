import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Bot, User, AlertTriangle, HeartPulse } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

const EMERGENCY_KEYWORDS = ["chest pain", "can't breathe", "unconscious", "stroke", "911", "severe bleeding"];

function isEmergency(text: string): boolean {
  return EMERGENCY_KEYWORDS.some(k => text.toLowerCase().includes(k));
}

export default function PatientAIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hello! I'm your Auralyn AI triage assistant. Describe your symptoms and I'll help guide you to the right level of care. For life-threatening emergencies, call 911 immediately.",
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", text, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest("POST", "/api/patient/chat", { msg: text });
      const data = await res.json();
      const reply = data.reply ?? "Unable to process your message. Please call your provider.";
      setMessages(prev => [...prev, { role: "assistant", text: reply, ts: new Date().toISOString() }]);
    } catch (e: any) {
      setError("Connection error — please try again or call your provider.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showEmergencyBanner = messages.some(m => m.role === "user" && isEmergency(m.text));

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <HeartPulse className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Auralyn AI Triage Assistant</h1>
            <p className="text-sm text-muted-foreground">Describe your symptoms — get guided care recommendations</p>
          </div>
          <Badge variant="outline" className="ml-auto border-green-500 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1" />
            Live
          </Badge>
        </div>

        {/* Emergency Banner */}
        {showEmergencyBanner && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-950/30" data-testid="status-emergency-banner">
            <CardContent className="flex items-center gap-2 py-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                If this is a life-threatening emergency, <strong>call 911 immediately</strong>. Do not wait for a response.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Chat Window */}
        <Card className="flex-1">
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Conversation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[420px] overflow-y-auto flex flex-col gap-3" data-testid="chat-message-list">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`chat-message-${i}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted rounded-tl-sm"
                  }`}
                >
                  {msg.text}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start" data-testid="status-loading">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-sm text-muted-foreground">Analyzing symptoms…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 text-center" data-testid="status-error">{error}</p>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Describe your symptoms… (e.g. 'I have a fever of 101 and sore throat')"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none"
            data-testid="input-symptoms"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-[60px] w-[60px] shrink-0"
            data-testid="button-send"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          This is a clinical support tool, not a diagnostic service. Always follow up with a licensed provider.
        </p>
      </div>
    </div>
  );
}
