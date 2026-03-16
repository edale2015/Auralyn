import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import ReasoningGraph from '@/components/ReasoningGraph';
import ChatReviewPanel from '@/components/ChatReviewPanel';
import EngineTracePanel from '@/components/EngineTracePanel';
import MermaidDiagram from '@/components/MermaidDiagram';
import {
  Stethoscope, Brain, MessageSquare, Zap, Star, AlertTriangle, RefreshCw,
  ChevronRight, Activity, Shield, Volume2, Cpu,
} from 'lucide-react';
import { COMPLAINTS } from '@shared/complaints';

const ARCHITECTURE_DIAGRAM = `
graph TD
  PI[Patient Input] --> NRM[Normalization Layer]
  NRM --> EV[Evidence Retrieval]
  EV --> RS[Risk Stratification]
  RS --> DD[Differential Dx Engine]
  DD --> TA[Temporal Analysis]
  TA --> CE[Consensus Engine]
  CE --> DISP[Disposition Decision]
  DISP --> PHY[Physician Review Queue]
  PHY --> NOTIFY[Patient Notification]

  style PI fill:#3b82f6,color:#fff,stroke:none
  style DISP fill:#ef4444,color:#fff,stroke:none
  style PHY fill:#f59e0b,color:#fff,stroke:none
  style CE fill:#22c55e,color:#fff,stroke:none
`;

const SAMPLE_CONVERSATION = [
  { role: 'ai' as const,      text: "Hi, I'm here to help. What brings you in today?" },
  { role: 'patient' as const, text: "I've had a really bad headache for 3 days and I'm worried." },
  { role: 'ai' as const,      text: "Nothing to worry about, headaches are very common." },
  { role: 'patient' as const, text: "But it's the worst headache of my life." },
  { role: 'ai' as const,      text: "You should take some paracetamol and rest." },
];

type ToneStrategy = 'calm_reassuring' | 'urgent_directive' | 'empathetic_gathering' | 'de_escalating' | 'focused_clinical' | 'gentle_informing';

export default function ClinicalCockpitPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [auditResult, setAuditResult] = useState<any>(null);
  const [selectedComplaint, setSelectedComplaint] = useState('Headache');
  const [toneResult, setToneResult] = useState<any>(null);

  // Override state
  const [overrideNote, setOverrideNote] = useState('');
  const [overrideQuestion, setOverrideQuestion] = useState('');
  const [overrideTone, setOverrideTone] = useState<ToneStrategy | ''>('');
  const [deEscalateMode, setDeEscalateMode] = useState(false);
  const [urgencyBoost, setUrgencyBoost] = useState(false);
  const [suppressQuestion, setSuppressQuestion] = useState(false);
  const [overrideResult, setOverrideResult] = useState<any>(null);

  // Golden conversation state
  const [goldenComplaint, setGoldenComplaint] = useState('Headache');
  const [goldenDisposition, setGoldenDisposition] = useState('ED referral - thunderclap headache');
  const [goldenResult, setGoldenResult] = useState<any>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const auditMut = useMutation({
    mutationFn: () => apiRequest('POST', '/api/conversation-opt/audit', { messages: SAMPLE_CONVERSATION }).then((r) => r.json()),
    onSuccess: (data) => { setAuditResult(data); toast({ title: 'Audit complete', description: `Grade ${data.grade} · ${Math.round(data.overallScore * 100)}% overall` }); },
    onError: () => toast({ title: 'Audit failed', variant: 'destructive' }),
  });

  const toneMut = useMutation({
    mutationFn: (context: object) => apiRequest('POST', '/api/conversation-opt/tone-strategy', context).then((r) => r.json()),
    onSuccess: (data) => { setToneResult(data); },
    onError: () => toast({ title: 'Tone strategy failed', variant: 'destructive' }),
  });

  const overrideMut = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/conversation-opt/physician-override', {
        note: overrideNote || undefined,
        question: overrideQuestion || undefined,
        tone: overrideTone || undefined,
        deEscalate: deEscalateMode,
        urgencyBoost,
        suppressAIQuestion: suppressQuestion,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setOverrideResult(data);
      toast({ title: 'Override applied', description: data.summary });
    },
    onError: () => toast({ title: 'Override failed', variant: 'destructive' }),
  });

  const goldenMut = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/conversation-opt/golden', {
        complaint: goldenComplaint,
        messages: SAMPLE_CONVERSATION,
        questions: ['Duration?', 'Severity 1-10?', 'Associated symptoms?', 'Worst headache of life?', 'Neck stiffness?'],
        disposition: goldenDisposition,
        redFlagsAddressed: ['Thunderclap headache', 'Worst headache of life'],
        createdBy: 'admin',
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setGoldenResult(data);
      toast({ title: 'Golden conversation created', description: `ID: ${data.id}` });
    },
    onError: () => toast({ title: 'Golden creation failed', variant: 'destructive' }),
  });

  const runAllMut = useMutation({
    mutationFn: async () => {
      const [audit] = await Promise.all([
        apiRequest('POST', '/api/conversation-opt/audit', { messages: SAMPLE_CONVERSATION }).then((r) => r.json()),
        apiRequest('POST', '/api/conversation-opt/tone-strategy', { anxietyLevel: 0.7, severity: 'high' }).then((r) => r.json()),
      ]);
      return audit;
    },
    onSuccess: (data) => {
      setAuditResult(data);
      toast({ title: 'Clinical Brain executed', description: 'All engines fired. Check Audit + Trace tabs.' });
      qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace'] });
    },
    onError: () => toast({ title: 'Run failed', variant: 'destructive' }),
  });

  const isRunning = auditMut.isPending || toneMut.isPending || overrideMut.isPending || goldenMut.isPending || runAllMut.isPending;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Clinical Telemedicine Cockpit</h1>
              <p className="text-xs text-muted-foreground">Physician-supervised AI triage command centre · 71 engines · 12 layers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => runAllMut.mutate()}
              disabled={isRunning}
              data-testid="button-run-brain"
            >
              <Brain className="h-4 w-4 mr-2" />
              {runAllMut.isPending ? 'Running...' : 'Run Clinical Brain'}
            </Button>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="border-b border-border px-6 py-2 bg-muted/30 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => auditMut.mutate()} disabled={isRunning} data-testid="button-audit-conversation">
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Audit Conversation
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toneMut.mutate({ anxietyLevel: 0.75, severity: 'high', emotionalState: 'anxious' })}
          disabled={isRunning}
          data-testid="button-tone-strategy"
        >
          <Volume2 className="h-3.5 w-3.5 mr-1.5" /> Tone Strategy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setActiveTab('override'); }}
          data-testid="button-physician-override"
        >
          <Shield className="h-3.5 w-3.5 mr-1.5" /> Physician Override
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setActiveTab('golden'); }}
          data-testid="button-golden-conversation"
        >
          <Star className="h-3.5 w-3.5 mr-1.5" /> Create Golden Case
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setActiveTab('trace'); qc.invalidateQueries({ queryKey: ['/api/conversation-opt/engine-trace'] }); }}
          data-testid="button-view-trace"
        >
          <Activity className="h-3.5 w-3.5 mr-1.5" /> Engine Trace
        </Button>
        {isRunning && (
          <Badge variant="secondary" className="ml-auto animate-pulse">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Running engines...
          </Badge>
        )}
      </div>

      {/* Main Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-6 mt-4 mb-0 self-start">
            <TabsTrigger value="overview"  data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="reasoning" data-testid="tab-reasoning">Reasoning Graph</TabsTrigger>
            <TabsTrigger value="audit"     data-testid="tab-audit">
              Chat Audit {auditResult && <Badge variant="secondary" className="ml-1.5 text-[10px]">{auditResult.grade}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="override"  data-testid="tab-override">Physician Override</TabsTrigger>
            <TabsTrigger value="golden"    data-testid="tab-golden">Golden Cases</TabsTrigger>
            <TabsTrigger value="trace"     data-testid="tab-trace">Engine Trace</TabsTrigger>
          </TabsList>

          {/* OVERVIEW ─────────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Engines', value: '71', color: 'text-primary', icon: Cpu },
                { label: 'Processing Layers', value: '12', color: 'text-purple-500', icon: Brain },
                { label: 'Active Complaints', value: `${COMPLAINTS.length}`, color: 'text-teal-500', icon: Stethoscope },
                { label: 'Tone Strategies', value: '6', color: 'text-amber-500', icon: Volume2 },
              ].map((stat) => (
                <div key={stat.label} className="border border-border rounded-xl bg-card p-4 flex items-center gap-3">
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  <div>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3 text-foreground">System Architecture</h3>
              <MermaidDiagram chart={ARCHITECTURE_DIAGRAM} className="border border-border rounded-xl" />
            </div>

            {toneResult && (
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="h-4 w-4 text-teal-500" />
                  <h3 className="font-semibold text-sm">Tone Strategy Result</h3>
                  <Badge variant="secondary">{toneResult.strategy?.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-sm italic text-muted-foreground mb-2">"{toneResult.openingPhrase}"</p>
                <p className="text-xs text-muted-foreground">{toneResult.rationale}</p>
              </div>
            )}
          </TabsContent>

          {/* REASONING GRAPH ────────────────────────────────────────────────── */}
          <TabsContent value="reasoning" className="flex-1 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Label>Complaint</Label>
              <Select value={selectedComplaint} onValueChange={setSelectedComplaint}>
                <SelectTrigger className="w-64" data-testid="select-complaint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINTS.slice(0, 40).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ReasoningGraph complaint={selectedComplaint} height={480} />
            <p className="text-xs text-muted-foreground text-center">
              Interactive graph · Drag nodes to rearrange · Scroll to zoom · Click MiniMap to pan
            </p>
          </TabsContent>

          {/* CHAT AUDIT ─────────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="flex-1 p-6 space-y-4">
            {!auditResult ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-4">
                <MessageSquare className="h-12 w-12 opacity-30" />
                <p className="text-sm">No audit run yet</p>
                <Button onClick={() => auditMut.mutate()} disabled={auditMut.isPending} data-testid="button-run-audit">
                  {auditMut.isPending ? 'Auditing...' : 'Audit Sample Conversation'}
                </Button>
              </div>
            ) : (
              <ChatReviewPanel messages={SAMPLE_CONVERSATION} audit={auditResult} />
            )}
          </TabsContent>

          {/* PHYSICIAN OVERRIDE ──────────────────────────────────────────────── */}
          <TabsContent value="override" className="flex-1 p-6">
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="font-semibold text-sm mb-1">Physician Prompt Override</h3>
                <p className="text-xs text-muted-foreground">Inject physician context, tone directives, and question overrides into the AI conversation engine.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Physician Note (appended to AI system prompt)</Label>
                  <Textarea
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    placeholder="Patient is a known anxious presenter, has history of migraines..."
                    className="resize-none"
                    rows={3}
                    data-testid="input-physician-note"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block">Override Next Question</Label>
                  <Textarea
                    value={overrideQuestion}
                    onChange={(e) => setOverrideQuestion(e.target.value)}
                    placeholder="Ask specifically about neck stiffness and photophobia..."
                    className="resize-none"
                    rows={2}
                    data-testid="input-override-question"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block">Tone Override</Label>
                  <Select value={overrideTone} onValueChange={(v) => setOverrideTone(v as ToneStrategy)}>
                    <SelectTrigger data-testid="select-tone-override">
                      <SelectValue placeholder="(no tone override)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calm_reassuring">Calm & Reassuring</SelectItem>
                      <SelectItem value="urgent_directive">Urgent & Directive</SelectItem>
                      <SelectItem value="empathetic_gathering">Empathetic Gathering</SelectItem>
                      <SelectItem value="de_escalating">De-escalating</SelectItem>
                      <SelectItem value="focused_clinical">Focused Clinical</SelectItem>
                      <SelectItem value="gentle_informing">Gentle Informing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={deEscalateMode} onCheckedChange={setDeEscalateMode} data-testid="switch-deescalate" />
                    <Label className="text-sm">De-escalation Mode</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={urgencyBoost} onCheckedChange={setUrgencyBoost} data-testid="switch-urgency" />
                    <Label className="text-sm">Urgency Boost</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={suppressQuestion} onCheckedChange={setSuppressQuestion} data-testid="switch-suppress" />
                    <Label className="text-sm">Suppress Next Question</Label>
                  </div>
                </div>

                <Button onClick={() => overrideMut.mutate()} disabled={overrideMut.isPending} data-testid="button-apply-override">
                  <Shield className="h-4 w-4 mr-2" />
                  {overrideMut.isPending ? 'Applying...' : 'Apply Physician Override'}
                </Button>
              </div>

              {overrideResult && (
                <div className="border border-border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Override Applied</span>
                    <Badge variant="secondary">{overrideResult.summary}</Badge>
                  </div>
                  {overrideResult.systemAddendum && (
                    <div className="text-xs">
                      <span className="text-muted-foreground font-medium">Note: </span>
                      <span>{overrideResult.systemAddendum}</span>
                    </div>
                  )}
                  {overrideResult.nextQuestionOverride && (
                    <div className="text-xs">
                      <span className="text-muted-foreground font-medium">Question Override: </span>
                      <span className="font-medium">{overrideResult.nextQuestionOverride}</span>
                    </div>
                  )}
                  {overrideResult.toneOverride && (
                    <div className="text-xs">
                      <span className="text-muted-foreground font-medium">Tone: </span>
                      <Badge variant="outline">{overrideResult.toneOverride.replace(/_/g, ' ')}</Badge>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {overrideResult.deEscalationMode && <Badge className="bg-amber-500 text-white">De-escalation ON</Badge>}
                    {overrideResult.urgencyBoost && <Badge className="bg-red-500 text-white">Urgency Boost ON</Badge>}
                    {overrideResult.suppressAIQuestion && <Badge className="bg-slate-500 text-white">Question Suppressed</Badge>}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* GOLDEN CASES ───────────────────────────────────────────────────── */}
          <TabsContent value="golden" className="flex-1 p-6">
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="font-semibold text-sm mb-1">Golden Conversation Builder</h3>
                <p className="text-xs text-muted-foreground">Save ideal physician-approved conversations as benchmarks for AI training and quality scoring.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Complaint</Label>
                  <Select value={goldenComplaint} onValueChange={setGoldenComplaint}>
                    <SelectTrigger data-testid="select-golden-complaint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLAINTS.slice(0, 40).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1.5 block">Ideal Disposition</Label>
                  <Textarea
                    value={goldenDisposition}
                    onChange={(e) => setGoldenDisposition(e.target.value)}
                    placeholder="e.g. ED referral - thunderclap headache with meningism"
                    rows={2}
                    className="resize-none"
                    data-testid="input-golden-disposition"
                  />
                </div>

                <div className="border border-border rounded-xl bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Using sample conversation (5 turns)</p>
                  {SAMPLE_CONVERSATION.map((m, i) => (
                    <p key={i} className="text-xs mb-0.5">
                      <span className="font-medium capitalize text-foreground">{m.role}:</span>{' '}
                      <span className="text-muted-foreground">{m.text}</span>
                    </p>
                  ))}
                </div>

                <Button onClick={() => goldenMut.mutate()} disabled={goldenMut.isPending} data-testid="button-create-golden">
                  <Star className="h-4 w-4 mr-2" />
                  {goldenMut.isPending ? 'Saving...' : 'Create Golden Conversation'}
                </Button>
              </div>

              {goldenResult && (
                <div className="border border-green-500/30 rounded-xl bg-green-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-sm text-green-600 dark:text-green-400">Golden Case Saved</span>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{goldenResult.id}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Empathy Target: </span>
                      <span className="font-semibold">{Math.round(goldenResult.targetEmpathyScore * 100)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Completeness Target: </span>
                      <span className="font-semibold">{Math.round(goldenResult.targetCompletenessScore * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(goldenResult.tags ?? []).map((t: string) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ENGINE TRACE ───────────────────────────────────────────────────── */}
          <TabsContent value="trace" className="flex-1 p-6">
            <EngineTracePanel autoRefresh className="h-full" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
