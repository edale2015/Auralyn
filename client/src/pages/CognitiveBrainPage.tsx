import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Siren, Scale, Zap, MemoryStick, MessageCircle, History } from "lucide-react";

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function dispositionColor(d: string) {
  if (d === "ED")           return "bg-red-600 text-white";
  if (d === "URGENT_CARE")  return "bg-orange-500 text-white";
  if (d === "HOME")         return "bg-emerald-600 text-white";
  return "bg-blue-500 text-white";
}

function urgencyColor(u: string) {
  if (u === "immediate") return "text-red-600 font-bold";
  if (u === "prompt")    return "text-orange-500 font-semibold";
  return "text-emerald-600";
}

function confidenceBar(val: number) {
  const pct = Math.round(val * 100);
  const col  = val > 0.75 ? "bg-emerald-500" : val > 0.4 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded h-2">
      <div className={`h-2 rounded ${col} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ─── types ─────────────────────────────────────────────────────────────────── */
interface CogResult {
  caseId:        string;
  diagnosis:     string;
  disposition:   string;
  confidence:    number;
  strategy:      string;
  urgencyScore:  number;
  patientMessage:{ headline: string; body: string; returnPrecautions: string[]; urgency: string };
  reasoning: {
    monologue:  Record<string, unknown>;
    debate:     Record<string, unknown>;
    safePlan:   Record<string, unknown>;
  };
  durationMs: number;
}

interface MemoryEntry { symptom: string; diagnosis: string; frequency: number; lastSeen: string }
interface CogCase     { id: string; diagnosis: string; disposition: string; confidence: number; strategy: string; durationMs: number; createdAt: string }

/* ─── sub-panels ─────────────────────────────────────────────────────────────── */
function RunPanel() {
  const [symptomsRaw, setSymptomsRaw] = useState("cough, fever");
  const [redFlags,    setRedFlags]    = useState(false);
  const [result, setResult]  = useState<CogResult | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const symptoms = symptomsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      return apiRequest<CogResult>("POST", "/api/cognitive-run", { symptoms, redFlags });
    },
    onSuccess: (data) => setResult(data),
  });

  const mon     = result?.reasoning?.monologue as any;
  const deb     = result?.reasoning?.debate    as any;
  const safePlan= result?.reasoning?.safePlan  as any;

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4"/>Run Cognitive Brain</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-1 block">Symptoms (comma-separated)</Label>
            <Textarea
              data-testid="input-symptoms"
              rows={2}
              value={symptomsRaw}
              onChange={(e) => setSymptomsRaw(e.target.value)}
              placeholder="e.g. chest pain, fever, dyspnea"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch data-testid="toggle-red-flags" checked={redFlags} onCheckedChange={setRedFlags} />
            <Label>Red Flags Active</Label>
            {redFlags && <Badge className="bg-red-600 text-white">Active</Badge>}
          </div>
          <Button
            data-testid="btn-run-cognitive"
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="w-full"
          >
            {run.isPending ? "Thinking…" : "Run Cognitive Brain"}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Diagnosis</p>
                <p data-testid="text-diagnosis" className="font-semibold mt-1">{result.diagnosis}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Disposition</p>
                <Badge data-testid="badge-disposition" className={`mt-1 ${dispositionColor(result.disposition)}`}>
                  {result.disposition}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Strategy</p>
                <p data-testid="text-strategy" className="font-semibold capitalize mt-1">{result.strategy.replace("_"," ")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Confidence</p>
                <p data-testid="text-confidence" className="font-semibold mt-1">{(result.confidence*100).toFixed(0)}%</p>
                {confidenceBar(result.confidence)}
              </CardContent>
            </Card>
          </div>

          {/* Patient message */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="w-4 h-4"/>Patient Communication</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className={`font-semibold ${urgencyColor(result.patientMessage.urgency)}`} data-testid="text-msg-headline">
                {result.patientMessage.headline}
              </p>
              <p data-testid="text-msg-body" className="text-sm text-muted-foreground">{result.patientMessage.body}</p>
              {result.patientMessage.returnPrecautions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Return precautions:</p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                    {result.patientMessage.returnPrecautions.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monologue */}
          {mon && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4 text-purple-500"/>Internal Monologue</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Uncertainty</span>
                  <span data-testid="text-uncertainty" className="font-semibold">{((mon.uncertainty_level??0)*100).toFixed(0)}%</span>
                </div>
                {confidenceBar(1 - (mon.uncertainty_level ?? 0))}
                <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                  <div>
                    <p className="font-medium mb-1">Dangerous Misses</p>
                    {(mon.dangerous_misses as string[])?.map((m,i) => <Badge key={i} variant="destructive" className="mr-1 mb-1 text-[10px]">{m}</Badge>)}
                    {!(mon.dangerous_misses as string[])?.length && <span className="text-muted-foreground">none</span>}
                  </div>
                  <div>
                    <p className="font-medium mb-1">Bias Flags</p>
                    {(mon.bias_flags as string[])?.map((b,i) => <Badge key={i} className="bg-orange-200 text-orange-800 mr-1 mb-1 text-[10px]">{b}</Badge>)}
                    {!(mon.bias_flags as string[])?.length && <span className="text-muted-foreground">none</span>}
                  </div>
                  <div>
                    <p className="font-medium mb-1">Confidence Gaps</p>
                    {(mon.confidence_gaps as string[])?.map((g,i) => <Badge key={i} variant="outline" className="mr-1 mb-1 text-[10px]">{g}</Badge>)}
                    {!(mon.confidence_gaps as string[])?.length && <span className="text-muted-foreground">none</span>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">{mon.reasoning_summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Debate */}
          {deb && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="w-4 h-4 text-blue-500"/>Specialist Debate Council</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span>Disagreement: <strong>{((deb.disagreementScore??0)*100).toFixed(0)}%</strong></span>
                  <span>Most dangerous miss: <Badge variant="destructive" className="text-[10px]">{deb.most_dangerous_miss}</Badge></span>
                </div>
                <div className="divide-y">
                  {(deb.opinions as any[])?.map((op: any, i: number) => (
                    <div key={i} className="py-2 flex items-center justify-between text-sm">
                      <span data-testid={`text-specialist-${i}`} className="font-medium w-36">{op.specialist ?? op.name}</span>
                      <span className="flex-1 text-muted-foreground truncate px-2">{op.diagnosis}</span>
                      <Badge variant="outline">{((op.confidence??0)*100).toFixed(0)}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bias safe plan */}
          {safePlan && (safePlan.suppressedActions?.length > 0 || safePlan.biasCorrections?.length > 0) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Siren className="w-4 h-4 text-red-500"/>Bias Suppression Layer</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                {safePlan.suppressedActions?.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Suppressed Actions</p>
                    {(safePlan.suppressedActions as string[]).map((a,i) => <Badge key={i} variant="destructive" className="mr-1">{a}</Badge>)}
                  </div>
                )}
                {safePlan.biasCorrections?.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Bias Corrections Applied</p>
                    {(safePlan.biasCorrections as string[]).map((c,i) => <Badge key={i} className="bg-blue-100 text-blue-800 mr-1">{c}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-right">Case ID: {result.caseId} · {result.durationMs}ms</p>
        </>
      )}
    </div>
  );
}

function MemoryPanel() {
  const { data: memory = [], isLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/cognitive/memory"],
    refetchInterval: 5000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MemoryStick className="w-4 h-4"/>Symptom→Diagnosis Memory Graph
          <Badge variant="outline" className="ml-auto">{memory.length} patterns</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!isLoading && memory.length === 0 && (
          <p className="text-muted-foreground text-sm">No patterns yet — run a case first.</p>
        )}
        <div className="divide-y">
          {memory.map((e, i) => (
            <div key={i} data-testid={`row-memory-${i}`} className="py-2 flex items-center gap-3 text-sm">
              <Badge variant="outline" className="shrink-0 w-6 text-center">{e.frequency}</Badge>
              <span className="font-medium w-28 shrink-0">{e.symptom}</span>
              <span className="text-muted-foreground">→</span>
              <span className="flex-1">{e.diagnosis}</span>
              <span className="text-xs text-muted-foreground hidden md:block">{new Date(e.lastSeen).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryPanel() {
  const { data, isLoading } = useQuery<{ cases: CogCase[]; total: number }>({
    queryKey: ["/api/cognitive/cases"],
    refetchInterval: 5000,
  });

  const cases = data?.cases ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-4 h-4"/>Recent Cognitive Cases
          <Badge variant="outline" className="ml-auto">{data?.total ?? 0} total</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && cases.length === 0 && <p className="text-sm text-muted-foreground">No cases yet.</p>}
        <div className="divide-y">
          {cases.map((c) => (
            <div key={c.id} data-testid={`row-case-${c.id}`} className="py-2 grid grid-cols-4 gap-2 text-sm">
              <span className="font-medium truncate">{c.diagnosis}</span>
              <Badge className={`w-fit ${dispositionColor(c.disposition)}`}>{c.disposition}</Badge>
              <span className="text-muted-foreground text-xs">{c.strategy} · {(c.confidence*100).toFixed(0)}%</span>
              <span className="text-muted-foreground text-xs text-right">{c.durationMs}ms · {new Date(c.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── main page ─────────────────────────────────────────────────────────────── */
export default function CognitiveBrainPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
          <Brain className="w-6 h-6 text-purple-600 dark:text-purple-300"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cognitive Medical Brain</h1>
          <p className="text-sm text-muted-foreground">
            Monologue → Bayesian → Specialist Debate → Bias Guard → Disposition
          </p>
        </div>
        <Badge className="ml-auto bg-purple-600 text-white"><Zap className="w-3 h-3 mr-1"/>v2 Live</Badge>
      </div>

      <Tabs defaultValue="run">
        <TabsList className="grid grid-cols-3 w-full md:w-96">
          <TabsTrigger value="run" data-testid="tab-run">Run</TabsTrigger>
          <TabsTrigger value="memory" data-testid="tab-memory">Memory</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="run"     className="mt-4"><RunPanel /></TabsContent>
        <TabsContent value="memory"  className="mt-4"><MemoryPanel /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
