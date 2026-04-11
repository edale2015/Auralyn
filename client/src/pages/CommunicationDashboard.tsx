import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  MessageCircle, Pill, Shield, TrendingDown, Activity,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle2,
  Loader2, FlaskConical, Brain, Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScriptOutput {
  script: string;
  tone: string;
  variant: string;
  triggered: boolean;
  triggerReasons: string[];
}

interface DemandOutput {
  triggered: boolean;
  script: string;
  offerDelayedRx: boolean;
  rationale: string[];
  demandSignal?: { isDemandingAntibiotic: boolean; phrasesMatched: string[]; confidence: string };
}

interface CommStats {
  total: number;
  antibioticRequests: number;
  avoidedAntibiotics: number;
  returnVisits: number;
  variantBreakdown: Record<string, number>;
  toneBreakdown: Record<string, number>;
  avoidanceRate: number;
}

interface DemandStats {
  total: number;
  demands: number;
  demandRate: number;
  delayedOffered: number;
  delayedUsed: number;
  avoided: number;
  returns: number;
  acceptanceRate: number;
}

// ── Tone chip ─────────────────────────────────────────────────────────────────

const TONE_COLOR: Record<string, string> = {
  frustrated: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  demanding:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  anxious:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  neutral:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function ToneChip({ tone }: { tone: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TONE_COLOR[tone] ?? TONE_COLOR.neutral}`} data-testid={`chip-tone-${tone}`}>
      {tone}
    </span>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-0.5" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
    </Card>
  );
}

// ── Script Engine tab ─────────────────────────────────────────────────────────

function ScriptEngineTab() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("cough");
  const [visitCount, setVisitCount] = useState("3");
  const [durationDays, setDurationDays] = useState("10");
  const [priorAntibiotics, setPriorAntibiotics] = useState(false);
  const [patientText, setPatientText] = useState("");
  const [result, setResult] = useState<ScriptOutput | null>(null);
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/communication/generate-script", {
      method: "POST",
      body: JSON.stringify({
        complaint, visitCount: Number(visitCount), durationDays: Number(durationDays),
        priorAntibiotics, patientText,
      }),
    }),
    onSuccess: (r: ScriptOutput) => {
      setResult(r);
      setOpen(true);
      if (!r.triggered) toast({ title: "No trigger", description: "Conditions not met — no script generated." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" />Repeat Visit Script Generator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Complaint</label>
              <Input value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="cough / uri / sinus" data-testid="input-complaint" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Visit Count</label>
              <Input type="number" min={1} value={visitCount} onChange={e => setVisitCount(e.target.value)} data-testid="input-visit-count" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duration (days)</label>
              <Input type="number" min={1} value={durationDays} onChange={e => setDurationDays(e.target.value)} data-testid="input-duration-days" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="priorAbx" checked={priorAntibiotics} onChange={e => setPriorAntibiotics(e.target.checked)} data-testid="checkbox-prior-antibiotics" />
            <label htmlFor="priorAbx" className="text-sm">Prior antibiotics given this episode</label>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Patient text (optional — for tone detection)</label>
            <Textarea rows={3} value={patientText} onChange={e => setPatientText(e.target.value)} placeholder="Nothing is helping, I've been here multiple times…" data-testid="textarea-patient-text" />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-generate-script">
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
            Generate Script
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.triggered ? "border-green-500/40" : "border-muted"}>
          <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setOpen(p => !p)}>
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {result.triggered
                ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                : <AlertCircle className="w-4 h-4 text-muted-foreground" />
              }
              <span className="text-sm font-medium">{result.triggered ? "Script Generated" : "No Trigger"}</span>
              {result.triggered && <ToneChip tone={result.tone} />}
              {result.triggered && <Badge variant="outline" className="text-xs">{result.variant}</Badge>}
            </div>
          </CardHeader>
          {open && result.triggered && (
            <CardContent className="pt-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Trigger Reasons</p>
                <div className="flex flex-wrap gap-1">
                  {result.triggerReasons.map((r, i) => <Badge key={i} variant="secondary" className="text-xs">{r}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Clinical Script</p>
                <pre className="text-sm bg-muted/50 rounded p-4 whitespace-pre-wrap leading-relaxed" data-testid="text-script-output">{result.script}</pre>
              </div>
              <Button variant="outline" size="sm" onClick={async () => {
                await apiRequest("/api/communication/log-outcome", {
                  method: "POST",
                  body: JSON.stringify({
                    patientId: "demo", complaint, visitCount: Number(visitCount),
                    scriptVariant: result.variant, tone: result.tone,
                    antibioticsRequested: result.tone === "demanding", antibioticsGiven: false,
                  }),
                });
                queryClient.invalidateQueries({ queryKey: ["/api/communication/stats"] });
                toast({ title: "Outcome logged" });
              }} data-testid="button-log-outcome">Log as Avoided Antibiotics</Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Antibiotic Demand tab ─────────────────────────────────────────────────────

function AntibioticDemandTab() {
  const { toast } = useToast();
  const [patientText, setPatientText] = useState("");
  const [hasBacterialCriteria, setHasBacterialCriteria] = useState(false);
  const [priorAntibiotics, setPriorAntibiotics] = useState(false);
  const [centorScore, setCentorScore] = useState("0");
  const [result, setResult] = useState<DemandOutput | null>(null);
  const [rxResult, setRxResult] = useState<any>(null);

  const demandMutation = useMutation({
    mutationFn: () => apiRequest("/api/antibiotic/antibiotic-demand", {
      method: "POST",
      body: JSON.stringify({
        patientText, hasBacterialCriteria, priorAntibiotics, centorScore: Number(centorScore),
      }),
    }),
    onSuccess: (r: DemandOutput) => setResult(r),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rxMutation = useMutation({
    mutationFn: () => apiRequest("/api/antibiotic/delayed-rx/create", {
      method: "POST",
      body: JSON.stringify({
        patientId: "demo-patient",
        fever: true,
        throatPain: true,
        worsening: true,
      }),
    }),
    onSuccess: (r: any) => {
      setRxResult(r);
      toast({ title: "Delayed Rx created", description: r.record.id });
    },
    onError: (err: any) => toast({ title: "Rx error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Pill className="w-4 h-4" />Antibiotic Demand Detector</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Patient text</label>
            <Textarea rows={4} value={patientText} onChange={e => setPatientText(e.target.value)}
              placeholder="I know my body — it always turns into a sore throat and antibiotics always fix it…"
              data-testid="textarea-demand-text" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="bacterialCrit" checked={hasBacterialCriteria} onChange={e => setHasBacterialCriteria(e.target.checked)} data-testid="checkbox-bacterial-criteria" />
              <label htmlFor="bacterialCrit" className="text-sm">Bacterial criteria met</label>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="priorAbx2" checked={priorAntibiotics} onChange={e => setPriorAntibiotics(e.target.checked)} data-testid="checkbox-prior-abx-demand" />
              <label htmlFor="priorAbx2" className="text-sm">Prior antibiotics</label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Centor Score</label>
              <Input type="number" min={0} max={4} value={centorScore} onChange={e => setCentorScore(e.target.value)} data-testid="input-centor-score" />
            </div>
          </div>
          <Button onClick={() => demandMutation.mutate()} disabled={demandMutation.isPending} data-testid="button-analyze-demand">
            {demandMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-2" />}
            Analyze Demand
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.triggered ? "border-amber-500/40" : "border-muted"}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              {result.triggered
                ? <AlertCircle className="w-4 h-4 text-amber-500" />
                : <CheckCircle2 className="w-4 h-4 text-green-500" />
              }
              <span className="font-medium text-sm">{result.triggered ? "Demand Detected" : "No Demand Signal"}</span>
              {result.offerDelayedRx && <Badge className="bg-amber-100 text-amber-700 text-xs">Offer Delayed Rx</Badge>}
            </div>
            {result.demandSignal?.phrasesMatched && result.demandSignal.phrasesMatched.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Phrases matched</p>
                <div className="flex flex-wrap gap-1">
                  {result.demandSignal.phrasesMatched.map((p, i) => <Badge key={i} variant="secondary" className="text-xs font-mono">{p}</Badge>)}
                </div>
              </div>
            )}
            {result.script && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Recommended Response Script</p>
                <pre className="text-sm bg-muted/50 rounded p-4 whitespace-pre-wrap leading-relaxed" data-testid="text-demand-script">{result.script}</pre>
              </div>
            )}
            {result.offerDelayedRx && (
              <Button variant="outline" size="sm" onClick={() => rxMutation.mutate()} disabled={rxMutation.isPending} data-testid="button-create-delayed-rx">
                {rxMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
                Create Delayed Rx
              </Button>
            )}
            {rxResult && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Rx ID: <code>{rxResult.record?.id}</code> · Status: <code>{rxResult.record?.status}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Stats tab ──────────────────────────────────────────────────────────────────

function StatsTab() {
  const { data: commStats } = useQuery<CommStats>({
    queryKey: ["/api/communication/stats"],
  });

  const { data: demandStats } = useQuery<DemandStats>({
    queryKey: ["/api/antibiotic/stats"],
  });

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" data-testid="text-comm-stats-heading">Communication Intelligence</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Encounters" value={commStats?.total ?? 0} icon={<Activity className="w-5 h-5" />} />
        <StatCard label="Antibiotic Requests" value={commStats?.antibioticRequests ?? 0} icon={<Pill className="w-5 h-5" />} />
        <StatCard label="Avoided Antibiotics" value={commStats?.avoidedAntibiotics ?? 0} icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Return Visits (7d)" value={commStats?.returnVisits ?? 0} sub={commStats ? `${pct(1 - (commStats.returnVisits / (commStats.total || 1)))} retention` : ""} icon={<TrendingDown className="w-5 h-5" />} />
      </div>

      {commStats && Object.keys(commStats.variantBreakdown).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Script Variant Usage</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(commStats.variantBreakdown).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-sm w-40 truncate">{k}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.min(100, (v / (commStats.total || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <h3 className="text-sm font-semibold pt-2" data-testid="text-demand-stats-heading">Antibiotic Demand Intelligence</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Demand Rate" value={demandStats ? pct(demandStats.demandRate) : "—"} icon={<Pill className="w-5 h-5" />} />
        <StatCard label="Delayed Rx Used" value={demandStats?.delayedUsed ?? 0} sub={demandStats && demandStats.delayedOffered > 0 ? `${pct(demandStats.acceptanceRate)} acceptance` : undefined} icon={<Clock className="w-5 h-5" />} />
        <StatCard label="Avoided Antibiotics" value={demandStats?.avoided ?? 0} icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Return Visits" value={demandStats?.returns ?? 0} icon={<TrendingDown className="w-5 h-5" />} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CommunicationDashboard() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <MessageCircle className="w-7 h-7 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-comm-page-title">Communication Intelligence</h1>
          <p className="text-sm text-muted-foreground">Adaptive scripts · Tone detection · Antibiotic demand handling · Outcome tracking</p>
        </div>
      </div>

      <Tabs defaultValue="script">
        <TabsList data-testid="tabs-communication">
          <TabsTrigger value="script" data-testid="tab-script">Repeat Visit Script</TabsTrigger>
          <TabsTrigger value="demand" data-testid="tab-demand">Antibiotic Demand</TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">Outcomes & Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="script" className="mt-4"><ScriptEngineTab /></TabsContent>
        <TabsContent value="demand" className="mt-4"><AntibioticDemandTab /></TabsContent>
        <TabsContent value="stats" className="mt-4"><StatsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
