// ARCHIVED — Phase 4 Step 21 cleanup
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  BookOpen, Database, CheckCircle, TrendingUp, MessageSquare,
  Shield, PlusCircle, Play, ChevronDown, ChevronUp, AlertTriangle, Zap,
} from "lucide-react";

interface ResearchSource {
  id: string; title: string; sourceType: string; authorityTier: number;
  domain: string; url?: string; addedBy: string; requiresHumanReview: boolean;
  active: boolean; addedAt: string; description?: string;
}
interface KnowledgeEdge {
  from: string; to: string; relation: string; confidence?: number;
  provenance: { sourceTitle: string; evidenceStrength: string; reviewedByHuman: boolean; approvedForClinicalUse: boolean; reviewNotes?: string };
}

const TIER_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-800', 2: 'bg-blue-100 text-blue-800',
  3: 'bg-yellow-100 text-yellow-800', 4: 'bg-gray-100 text-gray-800',
};
const TIER_LABELS: Record<number, string> = { 1: 'Tier 1 — Guideline', 2: 'Tier 2 — Review', 3: 'Tier 3 — Commentary', 4: 'Tier 4 — Forum/Patient' };
const DECISION_COLORS: Record<string, string> = { APPROVED: 'text-green-600', REVIEW_REQUIRED: 'text-yellow-600', BLOCK: 'text-red-600' };

// ── Source Registry Tab ───────────────────────────────────────────────────────
function SourceRegistryTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ sources: ResearchSource[]; active: number }>({ queryKey: ['/api/research/sources'] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: '', title: '', sourceType: 'guideline', authorityTier: '1', domain: 'clinical_rule', url: '', description: '', requiresHumanReview: false });

  const addMutation = useMutation({
    mutationFn: async (payload: object) => { const r = await apiRequest('POST', '/api/research/sources', payload); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/research/sources'] }); toast({ title: 'Source registered' }); setShowForm(false); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const sources = data?.sources ?? [];
  const byTier: Record<number, ResearchSource[]> = { 1: [], 2: [], 3: [], 4: [] };
  sources.forEach((s) => { (byTier[s.authorityTier] ??= []).push(s); });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="outline">{sources.length} sources</Badge>
          <Badge className="bg-green-600">{data?.active ?? 0} active</Badge>
        </div>
        <Button data-testid="button-add-source" onClick={() => setShowForm(!showForm)} size="sm" className="gap-2">
          <PlusCircle className="h-4 w-4" /> Add Source
        </Button>
      </div>

      {showForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Source ID</Label><Input data-testid="input-source-id" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="uptodate_ent" /></div>
              <div><Label>Title</Label><Input data-testid="input-source-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="UpToDate ENT" /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.sourceType} onValueChange={(v) => setForm({ ...form, sourceType: v })}>
                  <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['guideline', 'review', 'flowchart', 'sheet', 'journalism', 'commentary', 'forum', 'patient_language'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Authority Tier</Label>
                <Select value={form.authorityTier} onValueChange={(v) => setForm({ ...form, authorityTier: v })}>
                  <SelectTrigger data-testid="select-authority-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 — Clinical Guideline</SelectItem>
                    <SelectItem value="2">Tier 2 — Systematic Review</SelectItem>
                    <SelectItem value="3">Tier 3 — Commentary</SelectItem>
                    <SelectItem value="4">Tier 4 — Forum / Patient</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Domain</Label>
                <Select value={form.domain} onValueChange={(v) => setForm({ ...form, domain: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinical_rule">Clinical Rule</SelectItem>
                    <SelectItem value="patient_language">Patient Language</SelectItem>
                    <SelectItem value="trend_surveillance">Trend Surveillance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>URL (optional)</Label><Input data-testid="input-source-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.requiresHumanReview} onCheckedChange={(v) => setForm({ ...form, requiresHumanReview: v })} />
              <Label>Requires human review before clinical use</Label>
            </div>
            <Button data-testid="button-submit-source" onClick={() => addMutation.mutate({ ...form, authorityTier: parseInt(form.authorityTier), addedBy: 'admin', active: true })} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Saving…' : 'Register Source'}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <div className="text-muted-foreground text-sm text-center py-6">Loading sources…</div>}

      {[1, 2, 3, 4].map((tier) => {
        const tierSources = byTier[tier] ?? [];
        if (!tierSources.length) return null;
        return (
          <div key={tier}>
            <div className="text-xs font-medium text-muted-foreground mb-2">{TIER_LABELS[tier]} ({tierSources.length})</div>
            <div className="space-y-2">
              {tierSources.map((s) => (
                <Card key={s.id} data-testid={`source-card-${s.id}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{s.title}</span>
                          <Badge className={`text-xs ${TIER_COLORS[s.authorityTier]}`}>T{s.authorityTier}</Badge>
                          <Badge variant="outline" className="text-xs">{s.sourceType}</Badge>
                          {s.requiresHumanReview && <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">Review req.</Badge>}
                          {!s.active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                        {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">{s.url}</a>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(s.addedAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Knowledge Ingestion + Pipeline Tab ────────────────────────────────────────
function IngestionTab() {
  const { toast } = useToast();
  const { data: sourcesData } = useQuery<{ sources: ResearchSource[] }>({ queryKey: ['/api/research/sources'] });
  const [text, setText] = useState(`fever causes infection\ninfection leads to sepsis\ncough suggests pneumonia\npneumonia requires chest_xray\nchest_xray indicates consolidation\ntachycardia is associated with dehydration`);
  const [sourceId, setSourceId] = useState('uptodate');
  const [result, setResult] = useState<any>(null);
  const [expandEdge, setExpandEdge] = useState<number | null>(null);

  const pipelineMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest('POST', '/api/research/pipeline', { text, sourceId }); return r.json(); },
    onSuccess: (d) => { setResult(d); toast({ title: `Pipeline complete: ${d.safe} safe edges, ${d.rejected} rejected` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const sources = sourcesData?.sources ?? [];
  const edges: KnowledgeEdge[] = result?.edges ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label>Clinical text to ingest</Label>
          <Textarea data-testid="input-ingest-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-sm mt-1" placeholder="fever causes infection&#10;cough suggests pneumonia..." />
        </div>
        <div className="space-y-3">
          <div>
            <Label>Source</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger data-testid="select-ingest-source"><SelectValue /></SelectTrigger>
              <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.title.slice(0, 30)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button data-testid="button-run-pipeline" onClick={() => pipelineMutation.mutate()} disabled={pipelineMutation.isPending} className="w-full gap-2">
            <Play className="h-4 w-4" /> {pipelineMutation.isPending ? 'Processing…' : 'Run Full Pipeline'}
          </Button>
          {result && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Ingested:</span><span>{result.ingested}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Safe:</span><span className="text-green-600">{result.safe}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rejected:</span><span className="text-red-500">{result.rejected}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Promoted:</span><span className="text-blue-600">{result.promoted}</span></div>
            </div>
          )}
        </div>
      </div>

      {edges.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">{edges.length} extracted edges</div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {edges.map((e, i) => (
              <div key={i} data-testid={`edge-row-${i}`}>
                <div
                  className="flex items-center gap-2 text-xs bg-muted px-3 py-2 rounded cursor-pointer hover:bg-muted/80"
                  onClick={() => setExpandEdge(expandEdge === i ? null : i)}
                >
                  <span className="text-blue-600 font-mono">{e.from}</span>
                  <span className="text-muted-foreground">—{e.relation}→</span>
                  <span className="text-green-600 font-mono">{e.to}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {e.provenance.approvedForClinicalUse && <CheckCircle className="h-3 w-3 text-green-500" />}
                    {e.provenance.evidenceStrength !== 'unknown' && <Badge className="text-[10px] h-4 px-1">{e.provenance.evidenceStrength}</Badge>}
                    {expandEdge === i ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </span>
                </div>
                {expandEdge === i && (
                  <div className="px-3 py-2 bg-muted/50 text-xs space-y-1 rounded-b border-t">
                    <div><span className="text-muted-foreground">Source:</span> {e.provenance.sourceTitle}</div>
                    <div><span className="text-muted-foreground">Evidence:</span> {e.provenance.evidenceStrength}</div>
                    <div><span className="text-muted-foreground">Reviewed:</span> {e.provenance.reviewedByHuman ? 'Yes' : 'Pending'}</div>
                    <div><span className="text-muted-foreground">Clinical use:</span> {e.provenance.approvedForClinicalUse ? '✅ Approved' : '⏳ Pending'}</div>
                    {e.provenance.reviewNotes && <div className="italic text-muted-foreground">{e.provenance.reviewNotes}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Meta AI Supervisor Tab ────────────────────────────────────────────────────
function SupervisorTab() {
  const { toast } = useToast();
  const [entropy, setEntropy] = useState('1.3');
  const [tests, setTests] = useState('');
  const [redFlags, setRedFlags] = useState('');
  const [safetyTriggered, setSafetyTriggered] = useState(false);
  const [disposition, setDisposition] = useState('HOME_CARE');
  const [questionCompleteness, setQuestionCompleteness] = useState('0.7');
  const [result, setResult] = useState<any>(null);

  const runMutation = useMutation({
    mutationFn: async (payload: object) => { const r = await apiRequest('POST', '/api/research/supervisor', payload); return r.json(); },
    onSuccess: (d) => { setResult(d); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const run = () => runMutation.mutate({
    entropy: parseFloat(entropy) || 0,
    tests: tests.split(',').map((t) => t.trim()).filter(Boolean),
    redFlags: redFlags.split(',').map((f) => f.trim()).filter(Boolean),
    safetyTriggered,
    disposition,
    questionCompleteness: parseFloat(questionCompleteness) || 0,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><Label>Entropy (0–2)</Label><Input data-testid="input-entropy" type="number" step="0.1" min="0" max="2" value={entropy} onChange={(e) => setEntropy(e.target.value)} /></div>
        <div><Label>Tests ordered (comma-sep)</Label><Input data-testid="input-tests" value={tests} onChange={(e) => setTests(e.target.value)} placeholder="ECG, Troponin" /></div>
        <div><Label>Red flags (comma-sep)</Label><Input data-testid="input-redflags" value={redFlags} onChange={(e) => setRedFlags(e.target.value)} placeholder="chest_pain, syncope" /></div>
        <div>
          <Label>Disposition</Label>
          <Select value={disposition} onValueChange={setDisposition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY', 'ER_NOW', 'NEEDS_PHYSICIAN_REVIEW', 'BLOCK'].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Question completeness (0–1)</Label><Input data-testid="input-completeness" type="number" step="0.1" min="0" max="1" value={questionCompleteness} onChange={(e) => setQuestionCompleteness(e.target.value)} /></div>
        <div className="flex items-center gap-2 pt-5">
          <Switch checked={safetyTriggered} onCheckedChange={setSafetyTriggered} />
          <Label>Safety Triggered</Label>
        </div>
      </div>
      <Button data-testid="button-run-supervisor" onClick={run} disabled={runMutation.isPending} className="gap-2">
        <Shield className="h-4 w-4" /> {runMutation.isPending ? 'Running…' : 'Run Meta AI Supervisor'}
      </Button>

      {result && (
        <Card className={`border-2 ${result.supervisorDecision === 'APPROVED' ? 'border-green-400' : result.supervisorDecision === 'BLOCK' ? 'border-red-500' : 'border-yellow-400'}`}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold">Decision:</span>
              <span className={`text-xl font-bold ${DECISION_COLORS[result.supervisorDecision]}`}>{result.supervisorDecision}</span>
              <Badge variant="outline">{result.confidence} confidence</Badge>
            </div>
            {result.escalationReason && <div className="text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded">{result.escalationReason}</div>}
            {result.flags.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Flags ({result.flags.length})</div>
                {result.flags.map((f: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />{f}</div>
                ))}
              </div>
            )}
            {result.recommendedActions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Recommended Actions</div>
                {result.recommendedActions.map((a: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />{a}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Comment Distillation Tab ──────────────────────────────────────────────────
function DistillationTab() {
  const { toast } = useToast();
  const [comments, setComments] = useState(`I had a terrible cough for two weeks and finally saw a doctor who said it was bronchitis. The antibiotics helped a lot.
My ear pain was so bad I couldn't sleep. They found an ear infection and gave me ear drops.
Just got diagnosed with pneumonia after having fever and shortness of breath for three days. Going to hospital now.
Sore throat won't go away, doctor tested me for strep and it came back positive. Started penicillin today.
My chest feels tight when I breathe. Doctor said it might be asthma and prescribed an inhaler.`);
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const commentList = comments.split('\n').filter((c) => c.trim().length > 0);
      const r = await apiRequest('POST', '/api/research/distill', { comments: commentList });
      return r.json();
    },
    onSuccess: (d) => { setResult(d); toast({ title: `Distilled ${d.commentCount} comments — ${d.medicalTermsDetected.length} medical terms` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Forum comments / patient posts (one per line)</Label>
        <Textarea data-testid="input-comments" value={comments} onChange={(e) => setComments(e.target.value)} rows={7} className="mt-1 text-sm" placeholder="Paste forum comments here…" />
      </div>
      <Button data-testid="button-distill" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
        <MessageSquare className="h-4 w-4" /> {mutation.isPending ? 'Distilling…' : 'Distil Comments'}
      </Button>
      {result && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Badge variant="outline">{result.commentCount} comments</Badge>
            <Badge className="bg-blue-600">{result.medicalTermsDetected.length} medical terms</Badge>
            <Badge variant="outline">{result.topThemes.length} themes</Badge>
          </div>
          <div className="space-y-1.5">
            {result.summaryBullets.map((b: string, i: number) => (
              <div key={i} className={`text-sm px-3 py-2 rounded ${b.startsWith('ℹ️') ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300' : 'bg-muted'}`}>{b}</div>
            ))}
          </div>
          {result.medicalTermsDetected.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Medical Terms Detected</div>
              <div className="flex flex-wrap gap-2">
                {result.medicalTermsDetected.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Top Themes</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {result.topThemes.slice(0, 12).map((t: { word: string; count: number }) => (
                <div key={t.word} className="flex justify-between text-xs bg-muted px-2 py-1 rounded">
                  <span>{t.word}</span><span className="text-muted-foreground">{t.count}×</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResearchIntelligencePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-500" />
          Research Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Research source registry, clinical knowledge ingestion with provenance, Meta AI Supervisor, and comment distillation
        </p>
      </div>

      <Tabs defaultValue="sources">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="sources" data-testid="tab-sources" className="gap-1"><Database className="h-3.5 w-3.5" />Sources</TabsTrigger>
          <TabsTrigger value="ingest" data-testid="tab-ingest" className="gap-1"><Zap className="h-3.5 w-3.5" />Ingestion Pipeline</TabsTrigger>
          <TabsTrigger value="supervisor" data-testid="tab-supervisor" className="gap-1"><Shield className="h-3.5 w-3.5" />Meta AI Supervisor</TabsTrigger>
          <TabsTrigger value="distill" data-testid="tab-distill" className="gap-1"><MessageSquare className="h-3.5 w-3.5" />Comment Distillation</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-4"><SourceRegistryTab /></TabsContent>
        <TabsContent value="ingest" className="mt-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-violet-500" />Knowledge Ingestion → Validate → Provenance Pipeline</CardTitle></CardHeader><CardContent><IngestionTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="supervisor" className="mt-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" />Meta AI Supervisor — Clinical Governance Check</CardTitle></CardHeader><CardContent><SupervisorTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="distill" className="mt-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-blue-500" />Comment Distillation Engine — Patient Forum Analysis</CardTitle></CardHeader><CardContent><DistillationTab /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
