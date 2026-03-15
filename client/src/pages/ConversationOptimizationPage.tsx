import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, MessageSquare, AlertCircle, CheckCircle, TrendingUp,
  BookOpen, Mic, Volume2, Zap, ClipboardList, RefreshCw, Shield
} from "lucide-react";
import { COMPLAINTS } from "@shared/complaints";

const SAMPLE_MESSAGES = [
  { role: "patient" as const, text: "Hi, I've had a bad cough for 2 weeks and I'm really scared it might be cancer." },
  { role: "ai" as const, text: "Don't worry, it's probably nothing serious. Coughs are very common. Are you taking any medication?" },
  { role: "patient" as const, text: "No medications. I'm really frightened though, I've been having chest pain too." },
  { role: "ai" as const, text: "Chest pain with cough can have many causes. You're likely fine. Let me ask about your symptoms." },
];

const TONE_OPTIONS = [
  { value: "empathy", label: "Empathy & Warmth" },
  { value: "clarity", label: "Plain Language" },
  { value: "de_escalation", label: "De-escalation" },
  { value: "engagement", label: "Better Engagement" },
];

const GOAL_OPTIONS = [
  { value: "clarity", label: "Clarity — Plain language, short sentences" },
  { value: "empathy", label: "Empathy — Warmer, more supportive tone" },
  { value: "completeness", label: "Completeness — Ensure all key questions asked" },
  { value: "de_escalation", label: "De-escalation — Calm anxious/angry patients" },
  { value: "engagement", label: "Engagement — More natural, conversational style" },
];

function ScoreBar({ label, value, color = "bg-primary" }: { label: string; value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export default function ConversationOptimizationPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("audit");

  // Audit state
  const [auditMessages, setAuditMessages] = useState(
    JSON.stringify(SAMPLE_MESSAGES, null, 2)
  );

  // Tone / prompt improvement state
  const [promptText, setPromptText] = useState(
    "Don't worry, it's probably nothing serious. Coughs are very common. Are you taking any medication?"
  );
  const [promptGoal, setPromptGoal] = useState("empathy");
  const [promptComplaint, setPromptComplaint] = useState("cough");

  // De-escalation state
  const [patientStatement, setPatientStatement] = useState(
    "I'm really scared and nobody is listening to me. This is terrible and I feel like I'm dying."
  );

  // Next best question state
  const [nbqComplaint, setNbqComplaint] = useState("cough");
  const [askedQuestions, setAskedQuestions] = useState<string[]>([]);

  // Replay state
  const [replayTone, setReplayTone] = useState("empathy");
  const [replayMessages, setReplayMessages] = useState(JSON.stringify(SAMPLE_MESSAGES, null, 2));

  const fullReviewMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/full-review", body);
      return res.json();
    },
    onError: () => toast({ title: "Audit failed", variant: "destructive" }),
  });

  const toneAuditMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/tone", body);
      return res.json();
    },
  });

  const promptImproveMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/improve-prompt", body);
      return res.json();
    },
    onError: () => toast({ title: "Improvement failed", variant: "destructive" }),
  });

  const deEscalateMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/de-escalate", body);
      return res.json();
    },
  });

  const nextQuestionMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/next-question", body);
      return res.json();
    },
  });

  const replayMutation = useMutation<any, Error, any>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/conversation-opt/replay", body);
      return res.json();
    },
  });

  function runFullAudit() {
    try {
      const messages = JSON.parse(auditMessages);
      fullReviewMutation.mutate({ messages, complaint: "cough", askedQuestions: [] });
    } catch {
      toast({ title: "Invalid JSON", description: "Check the messages format", variant: "destructive" });
    }
  }

  const auditData = fullReviewMutation.data;
  const gradeColor: Record<string, string> = {
    A: "text-green-600", B: "text-blue-600", C: "text-yellow-600", D: "text-orange-600", F: "text-red-600",
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-testid="page-conversation-optimization">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Conversation Optimization Layer</h1>
            <p className="text-sm text-muted-foreground">Audit, improve, and coach AI-patient interactions in real-time</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="audit" data-testid="tab-audit">
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Audit Interaction
            </TabsTrigger>
            <TabsTrigger value="improve-prompt" data-testid="tab-improve-prompt">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Improve Prompting
            </TabsTrigger>
            <TabsTrigger value="de-escalation" data-testid="tab-de-escalation">
              <Shield className="h-3.5 w-3.5 mr-1.5" />De-escalation
            </TabsTrigger>
            <TabsTrigger value="next-question" data-testid="tab-next-question">
              <Zap className="h-3.5 w-3.5 mr-1.5" />Next Best Question
            </TabsTrigger>
            <TabsTrigger value="replay" data-testid="tab-replay">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Replay with Better Tone
            </TabsTrigger>
          </TabsList>

          {/* ── Audit Tab ────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Conversation Input</CardTitle>
                  <CardDescription>Paste patient–AI messages as JSON to audit</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={auditMessages}
                    onChange={(e) => setAuditMessages(e.target.value)}
                    rows={12}
                    className="font-mono text-xs"
                    data-testid="input-audit-messages"
                  />
                  <Button
                    className="w-full"
                    onClick={runFullAudit}
                    disabled={fullReviewMutation.isPending}
                    data-testid="button-run-audit"
                  >
                    {fullReviewMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Auditing…</>
                    ) : (
                      <><ClipboardList className="h-4 w-4 mr-1.5" />Run Full Audit</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {auditData ? (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Overall Score</CardTitle>
                          <span className={`text-4xl font-black ${gradeColor[auditData.summary?.grade ?? "C"]}`} data-testid="text-audit-grade">
                            {auditData.summary?.grade}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2.5">
                        {auditData.audit && (
                          <>
                            <ScoreBar label="Empathy" value={auditData.audit.empathyScore} />
                            <ScoreBar label="Completeness" value={auditData.audit.completenessScore} />
                            <ScoreBar label="Clarity" value={auditData.audit.clarityScore} />
                            <ScoreBar label="Safety" value={auditData.audit.safetyScore} />
                            <ScoreBar label="De-escalation" value={auditData.audit.deEscalationScore} />
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {auditData.audit?.flags?.length > 0 && (
                      <Card className="border-destructive/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-1.5 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            Flags ({auditData.audit.flags.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {auditData.audit.flags.map((f: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-sm" data-testid={`audit-flag-${i}`}>
                              <Badge variant={f.severity === "critical" ? "destructive" : "secondary"} className="text-xs shrink-0">
                                {f.severity}
                              </Badge>
                              <span className="text-xs">{f.message}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {auditData.audit?.improvements?.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-1.5">
                            <TrendingUp className="h-4 w-4 text-primary" />Improvements
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5">
                          {auditData.audit.improvements.map((imp: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs" data-testid={`improvement-${i}`}>
                              <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                              <span>{imp}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {auditData.tone && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-1.5">
                            <Volume2 className="h-4 w-4 text-primary" />Tone Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex gap-2 flex-wrap">
                            <Badge className="capitalize" data-testid="badge-detected-tone">{auditData.tone.tone}</Badge>
                            <Badge variant="outline">Readability grade {auditData.tone.readabilityGrade}</Badge>
                          </div>
                          {auditData.tone.jargonTerms?.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Jargon: {auditData.tone.jargonTerms.join(", ")}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm">Run an audit to see results here</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Improve Prompt Tab ───────────────────────────────────────── */}
          <TabsContent value="improve-prompt" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Prompt Improvement (GPT-4o)</CardTitle>
                  <CardDescription>Paste an AI message and select a goal — GPT-4o rewrites it</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Original AI Message</Label>
                    <Textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={5}
                      data-testid="input-prompt-text"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Improvement Goal</Label>
                      <Select value={promptGoal} onValueChange={setPromptGoal} data-testid="select-prompt-goal">
                        <SelectTrigger data-testid="select-trigger-goal"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GOAL_OPTIONS.map((g) => (
                            <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Complaint Context</Label>
                      <Select value={promptComplaint} onValueChange={setPromptComplaint} data-testid="select-prompt-complaint">
                        <SelectTrigger data-testid="select-trigger-prompt-complaint"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COMPLAINTS.slice(0, 30).map((c) => (
                            <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => promptImproveMutation.mutate({
                        originalPrompt: promptText, context: `Clinical complaint: ${promptComplaint}`,
                        goal: promptGoal, complaint: promptComplaint,
                      })}
                      disabled={promptImproveMutation.isPending}
                      data-testid="button-improve-prompt"
                    >
                      {promptImproveMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Improving…</>
                      ) : (
                        <><TrendingUp className="h-4 w-4 mr-1.5" />Improve Prompt</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => toneAuditMutation.mutate({ text: promptText })}
                      disabled={toneAuditMutation.isPending}
                      data-testid="button-analyze-tone"
                    >
                      <Volume2 className="h-4 w-4 mr-1.5" />Tone
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {promptImproveMutation.data && (
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5 text-primary">
                        <CheckCircle className="h-4 w-4" />Improved Version
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm leading-relaxed rounded bg-muted/40 p-3" data-testid="text-improved-prompt">
                        {promptImproveMutation.data.improved}
                      </p>
                      <p className="text-xs text-muted-foreground">{promptImproveMutation.data.reasoning}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{promptImproveMutation.data.toneShift}</Badge>
                        <Badge variant="outline">{promptImproveMutation.data.readabilityImprovement}</Badge>
                      </div>
                      {promptImproveMutation.data.changesSummary?.length > 0 && (
                        <ul className="text-xs space-y-1">
                          {promptImproveMutation.data.changesSummary.map((c: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                )}

                {toneAuditMutation.data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4 text-primary" />Tone Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="capitalize">{toneAuditMutation.data.tone}</Badge>
                        <Badge variant="outline">Score: {(toneAuditMutation.data.toneScore * 100).toFixed(0)}%</Badge>
                        <Badge variant="outline">Avg {toneAuditMutation.data.avgWordsPerSentence} words/sentence</Badge>
                      </div>
                      {toneAuditMutation.data.jargonTerms?.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Jargon detected: {toneAuditMutation.data.jargonTerms.join(", ")}
                        </p>
                      )}
                      {toneAuditMutation.data.recommendations?.map((r: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />{r}
                        </p>
                      ))}
                      {toneAuditMutation.data.rewriteSuggestion && (
                        <div className="rounded bg-muted/40 p-2 mt-2">
                          <p className="text-xs font-medium mb-1">Plain-language rewrite:</p>
                          <p className="text-xs">{toneAuditMutation.data.rewriteSuggestion}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── De-escalation Tab ───────────────────────────────────────── */}
          <TabsContent value="de-escalation" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">De-escalation Protocol Engine</CardTitle>
                  <CardDescription>Detects patient emotional state and generates the appropriate response protocol</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Patient Statement</Label>
                    <Textarea
                      value={patientStatement}
                      onChange={(e) => setPatientStatement(e.target.value)}
                      rows={5}
                      data-testid="input-patient-statement"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => deEscalateMutation.mutate({
                      patientStatement, complaint: nbqComplaint,
                    })}
                    disabled={deEscalateMutation.isPending}
                    data-testid="button-run-de-escalation"
                  >
                    {deEscalateMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Analyzing…</>
                    ) : (
                      <><Shield className="h-4 w-4 mr-1.5" />Apply De-escalation Protocol</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {deEscalateMutation.data && (
                <div className="space-y-3">
                  <Card className={deEscalateMutation.data.escalationLevel >= 2 ? "border-orange-400" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{deEscalateMutation.data.protocol?.name}</CardTitle>
                        <Badge variant={deEscalateMutation.data.escalationLevel >= 2 ? "destructive" : "secondary"} data-testid="badge-escalation-level">
                          Level {deEscalateMutation.data.escalationLevel}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded bg-muted/40 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Response:</p>
                        <p className="text-sm leading-relaxed" data-testid="text-suggested-response">
                          {deEscalateMutation.data.suggestedResponse}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1.5">Protocol Steps:</p>
                        <ol className="space-y-1">
                          {deEscalateMutation.data.protocol?.steps?.map((step: string, i: number) => (
                            <li key={i} className="text-xs flex items-start gap-1.5">
                              <span className="font-medium text-primary shrink-0">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1.5 text-destructive">Avoid These Phrases:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {deEscalateMutation.data.avoidPhrases?.map((phrase: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs line-through text-muted-foreground">
                              "{phrase}"
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Next Best Question Tab ───────────────────────────────────── */}
          <TabsContent value="next-question" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Next Best Question Engine</CardTitle>
                  <CardDescription>Priority-ordered queue of questions to ask next based on complaint and what's already been covered</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Complaint</Label>
                    <Select value={nbqComplaint} onValueChange={setNbqComplaint} data-testid="select-nbq-complaint">
                      <SelectTrigger data-testid="select-trigger-nbq"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMPLAINTS.slice(0, 40).map((c) => (
                          <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      Already Asked
                      <Button variant="ghost" size="sm" onClick={() => setAskedQuestions([])} className="h-5 text-xs">Clear</Button>
                    </Label>
                    <div className="flex flex-wrap gap-1 min-h-8 rounded border p-2">
                      {askedQuestions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None yet</span>
                      ) : (
                        askedQuestions.map((q, i) => (
                          <Badge key={i} variant="secondary" className="text-xs max-w-[200px] truncate">{q}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => nextQuestionMutation.mutate({
                      complaint: nbqComplaint, askedQuestions, conversationTurn: askedQuestions.length + 1,
                    })}
                    disabled={nextQuestionMutation.isPending}
                    data-testid="button-get-next-question"
                  >
                    {nextQuestionMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-1.5" />Generate Next Best Question</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {nextQuestionMutation.data && (
                <div className="space-y-3">
                  <Card className="border-primary/40">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Next Best Question</CardTitle>
                        <Badge variant={
                          nextQuestionMutation.data.next?.priority === "critical" ? "destructive" :
                          nextQuestionMutation.data.next?.priority === "high" ? "default" : "secondary"
                        } className="capitalize" data-testid="badge-question-priority">
                          {nextQuestionMutation.data.next?.priority}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm font-medium leading-relaxed rounded bg-primary/5 border border-primary/20 p-3" data-testid="text-next-question">
                        {nextQuestionMutation.data.next?.question}
                      </p>
                      <p className="text-xs text-muted-foreground italic">{nextQuestionMutation.data.next?.rationale}</p>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setAskedQuestions((prev) => [...prev, nextQuestionMutation.data.next?.question])}
                        data-testid="button-mark-asked"
                      >
                        Mark as Asked
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Question Queue (Next 5)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {nextQuestionMutation.data.queue?.map((q: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs" data-testid={`queue-question-${i}`}>
                          <Badge variant="outline" className="shrink-0 text-xs capitalize">{q.priority}</Badge>
                          <span className="text-muted-foreground">{q.question}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Replay Tab ──────────────────────────────────────────────── */}
          <TabsContent value="replay" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Replay with Better Tone (GPT-4o)</CardTitle>
                  <CardDescription>Re-writes every AI message in the conversation with a selected tone improvement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Conversation Messages (JSON)</Label>
                    <Textarea
                      value={replayMessages}
                      onChange={(e) => setReplayMessages(e.target.value)}
                      rows={8}
                      className="font-mono text-xs"
                      data-testid="input-replay-messages"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Tone</Label>
                    <Select value={replayTone} onValueChange={setReplayTone} data-testid="select-replay-tone">
                      <SelectTrigger data-testid="select-trigger-replay-tone"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      try {
                        const messages = JSON.parse(replayMessages);
                        replayMutation.mutate({ messages, targetTone: replayTone });
                      } catch {
                        toast({ title: "Invalid JSON", variant: "destructive" });
                      }
                    }}
                    disabled={replayMutation.isPending}
                    data-testid="button-run-replay"
                  >
                    {replayMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Replaying…</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-1.5" />Replay with Better Tone</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {replayMutation.data && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Mic className="h-4 w-4 text-primary" />Replayed Messages
                    </CardTitle>
                    <CardDescription className="capitalize">Tone: {replayTone.replace("_", " ")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {replayMutation.data.replayedMessages?.map((msg: any, i: number) => (
                      <div key={i} className="space-y-1.5" data-testid={`replay-message-${i}`}>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">AI Message {i + 1}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-muted/40 p-2">
                            <p className="font-medium text-muted-foreground mb-1">Original</p>
                            <p className="line-through opacity-60">{msg.original}</p>
                          </div>
                          <div className="rounded bg-primary/5 border border-primary/20 p-2">
                            <p className="font-medium text-primary mb-1">Improved</p>
                            <p>{msg.improved}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
