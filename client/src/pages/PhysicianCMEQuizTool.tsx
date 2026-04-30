/**
 * PhysicianCMEQuizTool.tsx
 *
 * PHYSICIAN CME QUIZ TOOL
 *
 * Active recall practice grounded in Auralyn's clinical knowledge base.
 * Adaptive difficulty: correct → harder. Wrong → explain + follow-up.
 * Goal: 10 consecutive correct answers per topic.
 *
 * Route: /cme-quiz (physician role required)
 */

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest }  from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button }  from "@/components/ui/button";
import { Badge }   from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, RotateCcw, GraduationCap,
  Send, Loader2, ChevronRight,
} from "lucide-react";

// ─── Quiz topics ───────────────────────────────────────────────────────────────

const QUIZ_TOPICS = [
  {
    id:     "red_flags",
    label:  "Red Flag Recognition",
    icon:   "🚨",
    desc:   "Test your recognition of clinical red flags across all complaint types",
    prompt: "Quiz me on clinical red flag recognition for urgent care. Start easy with obvious red flags, get harder as I answer correctly. If I get something wrong, explain why clinically and ask a follow-up. Focus on: chest pain, shortness of breath, headache, abdominal pain, pediatric presentations. Keep going until I answer 10 in a row correctly.",
  },
  {
    id:     "centor",
    label:  "Centor / HEART / Wells",
    icon:   "📊",
    desc:   "Clinical decision rules: scoring systems and when to apply them",
    prompt: "Quiz me on clinical decision rules used in urgent care: Centor/McIsaac criteria for sore throat, HEART score for chest pain, Wells criteria for DVT and PE, Ottawa rules for ankle and foot injuries. Mix up the scoring systems. If I get a score wrong, show me the correct criteria and ask about a similar case.",
  },
  {
    id:     "drug_interactions",
    label:  "Drug Safety & Interactions",
    icon:   "💊",
    desc:   "Common urgent care drug-drug interactions and contraindications",
    prompt: "Quiz me on drug-drug interactions and contraindications relevant to urgent care prescribing. Focus on: antibiotics (macrolides, fluoroquinolones), NSAIDs in patients on anticoagulants, QT prolongation risks, allergy cross-reactivity (penicillin/cephalosporins), ACE inhibitor cough vs contraindications. Start easy, get harder. If I'm wrong, explain the mechanism clinically.",
  },
  {
    id:     "disposition",
    label:  "Disposition Decisions",
    icon:   "🏥",
    desc:   "ER vs urgent care vs PCP vs home — reasoning through disposition",
    prompt: "Present me with clinical scenarios and quiz me on the correct disposition: Emergency Department, Urgent Care, PCP follow-up, or Home Self-Care. Include cases with trick features that would change the disposition. If I'm wrong, explain what clinical feature I missed that changes the disposition. Make the cases progressively harder.",
  },
  {
    id:     "pediatric",
    label:  "Pediatric Urgent Care",
    icon:   "👶",
    desc:   "Pediatric-specific presentations, dosing, and red flags",
    prompt: "Quiz me on pediatric urgent care: age-appropriate vital sign ranges, pediatric red flags (fever in infants, respiratory distress signs), weight-based dosing principles, pediatric vs adult presentation differences for common complaints. If I'm wrong, explain the pediatric physiology that makes the answer different from adults.",
  },
  {
    id:     "feynman",
    label:  "Feynman Explainer",
    icon:   "🧠",
    desc:   "Explain a clinical concept and get feedback on your understanding",
    prompt: "I'm going to explain a clinical concept as if you're a smart non-medical person. Interrupt me the moment I use unexplained jargon or skip over something without justifying it. When I finish, tell me: what I got right, what I got wrong or oversimplified, and what gaps remain in my explanation. Start by asking me which concept I want to explain.",
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role:    "user" | "assistant";
  content: string;
}

interface QuizStats {
  correct:   number;
  incorrect: number;
  streak:    number;
  maxStreak: number;
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${message.role}`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        isUser
          ? "bg-clinical text-white"
          : "bg-surface-subtle text-content-primary border border-border"
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// ─── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ stats }: { stats: QuizStats }) {
  return (
    <div className="flex items-center gap-4 text-xs text-content-muted" data-testid="score-bar">
      <span className="flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5 text-routine" />
        <span data-testid="score-correct">{stats.correct} correct</span>
      </span>
      <span className="flex items-center gap-1">
        <XCircle className="h-3.5 w-3.5 text-critical" />
        <span data-testid="score-incorrect">{stats.incorrect} incorrect</span>
      </span>
      {stats.streak > 0 && (
        <Badge className="text-[10px] rounded-full bg-routine-light text-routine-text border-routine-border" data-testid="badge-streak">
          🔥 {stats.streak} streak
        </Badge>
      )}
      {stats.maxStreak >= 10 && (
        <Badge className="text-[10px] rounded-full bg-knowledge-light text-knowledge-text border-knowledge-border" data-testid="badge-mastery">
          <GraduationCap className="h-2.5 w-2.5 mr-1" />
          10-streak achieved!
        </Badge>
      )}
    </div>
  );
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const CLINICAL_QUIZ_SYSTEM_PROMPT = `You are a clinical knowledge quiz coach for an urgent care physician.
You are testing their knowledge using active recall (not passive review).

Rules:
- Start with easier cases, get progressively harder as they answer correctly
- When they get something RIGHT: acknowledge briefly, then immediately ask a harder follow-up
- When they get something WRONG: explain the clinical reasoning (why the correct answer matters clinically, what the consequence of the wrong answer would be), then ask a related follow-up
- Keep responses concise — you're a quiz coach, not a lecturer
- Never give the answer before they attempt it
- After 10 consecutive correct answers, celebrate and offer to continue with harder questions or switch topics
- Ground all clinical content in current evidence-based guidelines (ACEP, AAP, AHA, CDC, USPSTF)
- When discussing drug interactions, always mention the clinical consequence (not just that it exists)
- For disposition questions, always ask the physician to explain their reasoning — not just state the answer

You have access to clinical knowledge covering:
- Red flag recognition across all urgent care complaint types
- Clinical decision rules: Centor/McIsaac, HEART score, Wells criteria, Ottawa rules, PERC
- Common urgent care drugs: antibiotics, NSAIDs, anticoagulants, bronchodilators, antihypertensives
- Pediatric urgent care: vital sign ranges, pediatric red flags, weight-based dosing principles
- Disposition frameworks: ED vs urgent care vs PCP vs home

Never say "Great question!" or any hollow affirmation. Just ask the next question.`;

// ─── Main component ────────────────────────────────────────────────────────────

export default function PhysicianCMEQuizTool() {
  const [selectedTopic, setSelectedTopic] = useState<typeof QUIZ_TOPICS[0] | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [stats,         setStats]         = useState<QuizStats>({ correct: 0, incorrect: 0, streak: 0, maxStreak: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (payload: { messages: Message[]; systemPrompt: string }) =>
      apiRequest<{ response: string }>("POST", "/api/cme/chat", payload),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      const responseText = data.response.toLowerCase();
      if (responseText.includes("correct") || responseText.includes("well done") || responseText.includes("exactly right")) {
        setStats(prev => {
          const newStreak = prev.streak + 1;
          return { ...prev, correct: prev.correct + 1, streak: newStreak, maxStreak: Math.max(prev.maxStreak, newStreak) };
        });
      } else if (responseText.includes("incorrect") || responseText.includes("not quite") || responseText.includes("actually")) {
        setStats(prev => ({ ...prev, incorrect: prev.incorrect + 1, streak: 0 }));
      }
    },
  });

  const startTopic = (topic: typeof QUIZ_TOPICS[0]) => {
    setSelectedTopic(topic);
    setMessages([]);
    setStats({ correct: 0, incorrect: 0, streak: 0, maxStreak: 0 });
    const firstMessage: Message = { role: "user", content: topic.prompt };
    setMessages([firstMessage]);
    chatMutation.mutate({ messages: [firstMessage], systemPrompt: CLINICAL_QUIZ_SYSTEM_PROMPT });
  };

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending || !selectedTopic) return;
    const userMessage: Message = { role: "user", content: trimmed };
    const updatedMessages      = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    chatMutation.mutate({ messages: updatedMessages, systemPrompt: CLINICAL_QUIZ_SYSTEM_PROMPT });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Topic selection ───────────────────────────────────────────────────────────
  if (!selectedTopic) {
    return (
      <div className="min-h-screen bg-surface-muted p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div>
            <h1 className="text-page-title font-semibold text-content-primary flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-clinical" />
              Clinical Knowledge Quiz
            </h1>
            <p className="text-body-sm text-content-muted mt-0.5">
              Active recall practice grounded in Auralyn's clinical knowledge base
            </p>
          </div>

          <div className="grid gap-3">
            {QUIZ_TOPICS.map(topic => (
              <button
                key={topic.id}
                onClick={() => startTopic(topic)}
                className="flex items-start gap-4 p-4 rounded-lg border border-border bg-surface hover:border-clinical-border hover:bg-clinical-light transition-all text-left"
                data-testid={`quiz-topic-${topic.id}`}
              >
                <span className="text-2xl shrink-0">{topic.icon}</span>
                <div className="flex-1">
                  <p className="text-card-title text-content-primary">{topic.label}</p>
                  <p className="text-body-sm text-content-secondary mt-0.5">{topic.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-content-disabled shrink-0 mt-1" />
              </button>
            ))}
          </div>

          <Card className="border-clinical-border bg-clinical-light">
            <CardContent className="py-3">
              <p className="text-body-sm text-clinical-text">
                <strong>Evidence base:</strong> All quiz questions are grounded in ACEP, AAP, AHA, CDC,
                and Auralyn's own KB rules — the same clinical logic applied to your patient cases.
                Questions adapt to your performance: correct answers trigger harder questions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Quiz session ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{selectedTopic.icon}</span>
            <div>
              <h2 className="text-card-title text-content-primary">{selectedTopic.label}</h2>
              <ScoreBar stats={stats} />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedTopic(null)}
            className="h-7 text-xs"
            data-testid="button-change-topic"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Change topic
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-surface-subtle border border-border rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-content-muted" />
                <span className="text-body-sm text-content-muted">Thinking clinically…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
            className="flex-1 text-body-sm border border-border rounded-lg px-3 py-2 resize-none outline-none focus:border-clinical min-h-[44px] max-h-[120px]"
            rows={1}
            data-testid="quiz-input"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || chatMutation.isPending}
            className="bg-clinical hover:bg-clinical-text text-white h-[44px] px-3"
            data-testid="quiz-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-content-muted mt-2 max-w-2xl mx-auto">For clinical decision support only.</p>
      </div>
    </div>
  );
}
