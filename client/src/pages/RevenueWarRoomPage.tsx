import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ShieldAlert, TrendingUp, Brain, FileText, DollarSign,
  Loader2, CheckCircle2, AlertTriangle, XCircle, Zap,
  ArrowRight, BarChart3, Target, Star, Award
} from "lucide-react";
import {
  BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell
} from "recharts";

// ─── Shared helpers ────────────────────────────────────────────────────────────
function StatBox({ label, value, color = "text-foreground" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center p-3 rounded border border-border/40 bg-card/40" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={cn("text-2xl font-black", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant = pct < 20 ? "outline" : pct < 50 ? "secondary" : "destructive";
  const color = pct < 20 ? "text-green-400 border-green-500/40" : pct < 50 ? "text-yellow-400 border-yellow-500/40" : "text-red-400 border-red-500/40";
  return <Badge variant={variant} className={cn("text-[10px]", color)}>{pct}% denial risk</Badge>;
}

// ─── Tab 1: Denial Predictor ───────────────────────────────────────────────────
function DenialPredictorTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ diagnosis: "", complaint: "", triage: "routine", confidence: "0.8", hpiText: "", planText: "" });
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/denial-prediction/predict", {
      diagnosis: form.diagnosis, complaint: form.complaint, triage: form.triage,
      confidence: parseFloat(form.confidence), hpiText: form.hpiText, planText: form.planText,
      differentials: [],
    }).then(r => r.json()),
    onSuccess: d => setResult(d),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const demos = [
    { label: "Chest Pain (ED)", diagnosis: "Chest pain, unspecified", complaint: "chest tightness and shortness of breath", triage: "emergency", confidence: "0.72" },
    { label: "Strep Throat", diagnosis: "Strep pharyngitis", complaint: "sore throat fever", triage: "urgent", confidence: "0.91" },
    { label: "Migraine", diagnosis: "Migraine without aura", complaint: "severe headache photophobia", triage: "routine", confidence: "0.88" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex gap-2.5 items-start" data-testid="denial-predictor-disclaimer">
        <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-xs font-semibold text-yellow-400 mb-0.5">Statistical Estimates Only — Not for Clinical or Coding Decisions</div>
          <div className="text-[11px] text-yellow-300/80 leading-relaxed">
            Denial risk predictions are statistical estimates based on limited historical data and should <strong>not</strong> be used to alter clinical documentation, select CPT/ICD-10 codes, or justify billing modifications. Using AI predictions to modify coding with intent to circumvent expected denials may constitute billing fraud under 18 U.S.C. § 1347. All predictions require human verification by a qualified billing compliance officer before any action is taken.
          </div>
        </div>
      </div>
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <ShieldAlert size={14} className="text-red-400" />
          <span className="text-xs font-semibold">Payer-Specific Denial Predictor</span>
          <span className="ml-auto text-[10px] text-muted-foreground">ML + rule hybrid engine</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {demos.map(d => (
              <Button key={d.label} size="sm" variant="outline" className="text-[10px] h-6"
                onClick={() => setForm(f => ({ ...f, ...d }))} data-testid={`demo-${d.label.toLowerCase().replace(/\s+/g, "-")}`}>
                {d.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Primary Diagnosis</Label>
              <Input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                placeholder="e.g. Chest pain, unspecified" className="h-8 text-xs" data-testid="input-diagnosis" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Chief Complaint</Label>
              <Input value={form.complaint} onChange={e => setForm(f => ({ ...f, complaint: e.target.value }))}
                placeholder="e.g. chest tightness and shortness of breath" className="h-8 text-xs" data-testid="input-complaint" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Triage Level</Label>
              <Select value={form.triage} onValueChange={v => setForm(f => ({ ...f, triage: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-triage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Diagnostic Confidence (0–1)</Label>
              <Input value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}
                type="number" min="0" max="1" step="0.05" className="h-8 text-xs" data-testid="input-confidence" />
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={mut.isPending || !form.diagnosis || !form.complaint}
            onClick={() => mut.mutate()} data-testid="button-predict-denial">
            {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
            Predict Denial Risk
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <span className="text-xs font-semibold">Prediction Result</span>
            <RiskBadge score={result.prediction?.riskScore ?? 0} />
            <Badge variant="outline" className="ml-auto text-[10px]">{result.coding?.cpt?.code ?? result.coding?.cpt ?? "—"}</Badge>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Risk Score" value={((result.prediction?.riskScore ?? 0) * 100).toFixed(1) + "%"}
                color={(result.prediction?.riskScore ?? 1) < 0.2 ? "text-green-400" : (result.prediction?.riskScore ?? 1) < 0.5 ? "text-yellow-400" : "text-red-400"} />
              <StatBox label="Risk Level" value={result.prediction?.riskLevel ?? "—"} />
              <StatBox label="CPT Code" value={String(result.coding?.cpt?.code ?? result.coding?.cpt ?? "—")} color="text-blue-400" />
            </div>
            {result.prediction?.reasons?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">Risk Factors</div>
                {result.prediction.reasons.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-red-500/5 border border-red-500/20 rounded p-2" data-testid={`denial-reason-${i}`}>
                    <AlertTriangle size={10} className="text-red-400 mt-0.5 flex-shrink-0" />
                    {r}
                  </div>
                ))}
              </div>
            )}
            {result.prediction?.recommendations?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">Recommendations</div>
                {result.prediction.recommendations.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-green-500/5 border border-green-500/20 rounded p-2">
                    <CheckCircle2 size={10} className="text-green-400 mt-0.5 flex-shrink-0" />
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 2: Reimbursement Optimizer ───────────────────────────────────────────
const ALL_CPT_OPTIONS = ["99213", "99214", "99215", "99203", "99204", "99205", "99281", "99282", "99283", "99284", "99285", "99441", "99442", "99443"];

function ReimbursementOptimizerTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ diagnosis: "", complaint: "", triage: "routine", confidence: "0.85" });
  const [selectedCpts, setSelectedCpts] = useState<string[]>(["99213", "99214", "99215"]);
  const [result, setResult] = useState<any>(null);

  const toggleCpt = (cpt: string) => setSelectedCpts(prev => prev.includes(cpt) ? prev.filter(c => c !== cpt) : [...prev, cpt]);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/revenue-pipeline/optimize-reimbursement", {
      diagnosis: form.diagnosis, complaint: form.complaint, triage: form.triage,
      confidence: parseFloat(form.confidence), cptOptions: selectedCpts,
    }).then(r => r.json()),
    onSuccess: d => { if (d.ok) setResult(d); else toast({ title: "Error", description: d.error, variant: "destructive" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <DollarSign size={14} className="text-green-400" />
          <span className="text-xs font-semibold">Real-Time Reimbursement Optimizer</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Expected value ranking</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Diagnosis</Label>
              <Input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                placeholder="e.g. Acute sinusitis" className="h-8 text-xs" data-testid="input-optimize-diagnosis" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Chief Complaint</Label>
              <Input value={form.complaint} onChange={e => setForm(f => ({ ...f, complaint: e.target.value }))}
                placeholder="e.g. sinus pressure, congestion" className="h-8 text-xs" data-testid="input-optimize-complaint" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Triage Level</Label>
              <Select value={form.triage} onValueChange={v => setForm(f => ({ ...f, triage: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-optimize-triage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Confidence</Label>
              <Input value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}
                type="number" min="0" max="1" step="0.05" className="h-8 text-xs" data-testid="input-optimize-confidence" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px]">CPT Codes to Evaluate</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CPT_OPTIONS.map(cpt => (
                <button key={cpt} onClick={() => toggleCpt(cpt)}
                  className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors", selectedCpts.includes(cpt) ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary/50")}
                  data-testid={`cpt-toggle-${cpt}`}>
                  {cpt}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={mut.isPending || !form.diagnosis || selectedCpts.length === 0}
            onClick={() => mut.mutate()} data-testid="button-optimize-reimbursement">
            {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : <TrendingUp size={12} />}
            Optimize Reimbursement
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Star size={12} className="text-yellow-400" />
            <span className="text-xs font-semibold">Optimal CPT: <span className="text-green-400 font-mono">{result.bestCpt}</span></span>
            <Badge variant="outline" className="ml-auto text-green-400 border-green-500/40 text-[10px]">
              ${result.maxExpectedValue?.toFixed(2)} expected
            </Badge>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={result.ranked} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="cpt" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "Expected Value"]} />
                <Bar dataKey="expectedValue" radius={[3, 3, 0, 0]}>
                  {result.ranked?.map((r: any, i: number) => <Cell key={i} fill={r.recommended ? "#22c55e" : "#3b82f6"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-3">
              {result.ranked?.map((r: any, i: number) => (
                <div key={r.cpt} className={cn("flex items-center gap-2 text-xs p-2 rounded border", r.recommended ? "border-green-500/40 bg-green-500/5" : "border-border/30")}
                  data-testid={`optimize-result-${r.cpt}`}>
                  <span className="font-mono font-bold w-14 text-[11px]">{r.cpt}</span>
                  {r.recommended && <Star size={10} className="text-yellow-400" />}
                  <span className="text-muted-foreground text-[10px] flex-1">base ${r.baseRate}</span>
                  <RiskBadge score={r.denialRisk} />
                  <span className="font-bold text-green-400 font-mono text-[11px]">${r.expectedValue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: Physician Coaching ─────────────────────────────────────────────────
const DEMO_CLINICIANS = [
  { id: "DR-001", totalCases: 842, accuracyScore: 0.76, escalationRate: 0.28, avgDecisionTimeMs: 8200, denialRate: 0.19, topDiagnoses: ["Chest Pain", "Dyspnea", "Syncope"] },
  { id: "DR-002", totalCases: 1204, accuracyScore: 0.94, escalationRate: 0.08, avgDecisionTimeMs: 2800, denialRate: 0.04, topDiagnoses: ["Pharyngitis", "Otitis Media", "URI"] },
  { id: "DR-003", totalCases: 563, accuracyScore: 0.88, escalationRate: 0.15, avgDecisionTimeMs: 5100, denialRate: 0.11, topDiagnoses: ["Migraine", "Back Pain", "Anxiety"] },
];

function PhysicianCoachingTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ clinicianId: DEMO_CLINICIANS[0].id, totalCases: String(DEMO_CLINICIANS[0].totalCases), accuracyScore: String(DEMO_CLINICIANS[0].accuracyScore), escalationRate: String(DEMO_CLINICIANS[0].escalationRate), avgDecisionTimeMs: String(DEMO_CLINICIANS[0].avgDecisionTimeMs), denialRate: String(DEMO_CLINICIANS[0].denialRate) });
  const [result, setResult] = useState<any>(null);

  const loadDemo = (c: typeof DEMO_CLINICIANS[0]) => {
    setForm({ clinicianId: c.id, totalCases: String(c.totalCases), accuracyScore: String(c.accuracyScore), escalationRate: String(c.escalationRate), avgDecisionTimeMs: String(c.avgDecisionTimeMs), denialRate: String(c.denialRate) });
  };

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/revenue-pipeline/coaching", {
      clinicianId: form.clinicianId, totalCases: Number(form.totalCases),
      accuracyScore: parseFloat(form.accuracyScore), escalationRate: parseFloat(form.escalationRate),
      avgDecisionTimeMs: Number(form.avgDecisionTimeMs), denialRate: parseFloat(form.denialRate),
    }).then(r => r.json()),
    onSuccess: d => { if (d.ok) setResult(d); else toast({ title: "Error", description: d.error, variant: "destructive" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const priorityColor = result?.priority === "high" ? "text-red-400" : result?.priority === "medium" ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Brain size={14} className="text-purple-400" />
          <span className="text-xs font-semibold">Physician Coaching Agent</span>
          <span className="ml-auto text-[10px] text-muted-foreground">AI-powered feedback</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {DEMO_CLINICIANS.map(c => (
              <Button key={c.id} size="sm" variant="outline" className="text-[10px] h-6" onClick={() => loadDemo(c)} data-testid={`demo-clinician-${c.id.toLowerCase()}`}>
                {c.id}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Clinician ID</Label>
              <Input value={form.clinicianId} onChange={e => setForm(f => ({ ...f, clinicianId: e.target.value }))}
                placeholder="e.g. DR-001" className="h-8 text-xs" data-testid="input-clinician-id" />
            </div>
            {[
              { key: "totalCases", label: "Total Cases", type: "number" },
              { key: "accuracyScore", label: "Accuracy (0-1)", type: "number" },
              { key: "escalationRate", label: "Escalation Rate (0-1)", type: "number" },
              { key: "avgDecisionTimeMs", label: "Avg Decision Time (ms)", type: "number" },
              { key: "denialRate", label: "Claim Denial Rate (0-1)", type: "number" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-[10px]">{f.label}</Label>
                <Input value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  type={f.type} className="h-8 text-xs" data-testid={`input-${f.key.toLowerCase()}`} />
              </div>
            ))}
          </div>
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={mut.isPending}
            onClick={() => mut.mutate()} data-testid="button-generate-coaching">
            {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
            Generate Coaching Report
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Award size={12} className="text-purple-400" />
            <span className="text-xs font-semibold">Coaching Report — {result.clinicianId}</span>
            <Badge variant="outline" className={cn("ml-auto text-[10px]", priorityColor)}>{result.priority} priority</Badge>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-5 gap-2">
              <StatBox label="Cases" value={result.metrics?.totalCases} />
              <StatBox label="Accuracy" value={(result.metrics?.accuracyScore * 100).toFixed(0) + "%"} color={result.metrics?.accuracyScore > 0.9 ? "text-green-400" : result.metrics?.accuracyScore > 0.8 ? "text-yellow-400" : "text-red-400"} />
              <StatBox label="Escalation" value={(result.metrics?.escalationRate * 100).toFixed(0) + "%"} color={result.metrics?.escalationRate < 0.15 ? "text-green-400" : "text-red-400"} />
              <StatBox label="Decision" value={(result.metrics?.avgDecisionTimeMs / 1000).toFixed(1) + "s"} color={result.metrics?.avgDecisionTimeMs < 4000 ? "text-green-400" : "text-yellow-400"} />
              <StatBox label="Denial Rate" value={(result.metrics?.denialRate * 100).toFixed(0) + "%"} color={result.metrics?.denialRate < 0.1 ? "text-green-400" : "text-red-400"} />
            </div>
            {result.summary && (
              <div className="text-xs italic text-muted-foreground border-l-2 border-purple-500/40 pl-3 py-1">{result.summary}</div>
            )}
            {result.aiRecommendations?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">AI Recommendations</div>
                {result.aiRecommendations.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-purple-500/5 border border-purple-500/20 rounded p-2" data-testid={`coaching-rec-${i}`}>
                    <ArrowRight size={10} className="text-purple-400 mt-0.5 flex-shrink-0" />
                    {r}
                  </div>
                ))}
              </div>
            )}
            {result.strengths?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">Strengths</div>
                {result.strengths.map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-green-500/5 border border-green-500/20 rounded p-2">
                    <CheckCircle2 size={10} className="text-green-400 mt-0.5 flex-shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            )}
            {result.focusArea && (
              <div className="text-xs font-medium text-foreground flex items-center gap-2">
                <Target size={12} className="text-orange-400" />
                Top Priority: <span className="text-orange-400">{result.focusArea}</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: Contract Simulation ────────────────────────────────────────────────
const PAYER_PRESETS = [
  { payerId: "BCBS", payerName: "Blue Cross Blue Shield", currentRate: 110, proposedRate: 132, visitVolume: 2400, denialRate: 0.08 },
  { payerId: "AETNA", payerName: "Aetna Health", currentRate: 95, proposedRate: 118, visitVolume: 1800, denialRate: 0.12 },
  { payerId: "UHC", payerName: "UnitedHealthcare", currentRate: 105, proposedRate: 140, visitVolume: 3200, denialRate: 0.14 },
  { payerId: "CIGNA", payerName: "Cigna", currentRate: 88, proposedRate: 105, visitVolume: 1200, denialRate: 0.09 },
];

function ContractSimulationTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ payerId: "BCBS", payerName: "Blue Cross Blue Shield", currentRate: "110", proposedRate: "132", visitVolume: "2400", denialRate: "0.08" });
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/revenue-pipeline/contract-simulate", {
      payerId: form.payerId, payerName: form.payerName,
      currentRate: parseFloat(form.currentRate), proposedRate: parseFloat(form.proposedRate),
      visitVolume: parseInt(form.visitVolume), denialRate: parseFloat(form.denialRate),
    }).then(r => r.json()),
    onSuccess: d => { if (d.ok) setResult(d); else toast({ title: "Error", description: d.error, variant: "destructive" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <FileText size={14} className="text-blue-400" />
          <span className="text-xs font-semibold">Contract Simulation Engine</span>
          <span className="ml-auto text-[10px] text-muted-foreground">What-if rate analysis</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {PAYER_PRESETS.map(p => (
              <Button key={p.payerId} size="sm" variant="outline" className="text-[10px] h-6"
                onClick={() => setForm({ payerId: p.payerId, payerName: p.payerName, currentRate: String(p.currentRate), proposedRate: String(p.proposedRate), visitVolume: String(p.visitVolume), denialRate: String(p.denialRate) })}
                data-testid={`payer-preset-${p.payerId.toLowerCase()}`}>
                {p.payerName.split(" ")[0]}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Payer ID</Label>
              <Input value={form.payerId} onChange={e => setForm(f => ({ ...f, payerId: e.target.value }))} className="h-8 text-xs" data-testid="input-payer-id" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Payer Name</Label>
              <Input value={form.payerName} onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))} className="h-8 text-xs" data-testid="input-payer-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Current Rate ($/visit)</Label>
              <Input value={form.currentRate} onChange={e => setForm(f => ({ ...f, currentRate: e.target.value }))} type="number" className="h-8 text-xs" data-testid="input-current-rate" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Proposed Rate ($/visit)</Label>
              <Input value={form.proposedRate} onChange={e => setForm(f => ({ ...f, proposedRate: e.target.value }))} type="number" className="h-8 text-xs" data-testid="input-proposed-rate" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Annual Visit Volume</Label>
              <Input value={form.visitVolume} onChange={e => setForm(f => ({ ...f, visitVolume: e.target.value }))} type="number" className="h-8 text-xs" data-testid="input-visit-volume" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Current Denial Rate (0–1)</Label>
              <Input value={form.denialRate} onChange={e => setForm(f => ({ ...f, denialRate: e.target.value }))} type="number" min="0" max="1" step="0.01" className="h-8 text-xs" data-testid="input-denial-rate" />
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={mut.isPending || !form.payerId}
            onClick={() => mut.mutate()} data-testid="button-simulate-contract">
            {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Run Simulation
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border border-border/50">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <TrendingUp size={12} className="text-blue-400" />
            <span className="text-xs font-semibold">{result.payerName} Simulation</span>
            <Badge variant="outline" className={cn("ml-auto text-[10px]", result.netGain > 0 ? "text-green-400 border-green-500/40" : "text-red-400 border-red-500/40")}>
              {result.rateChangePct > 0 ? "+" : ""}{result.rateChangePct}% rate change
            </Badge>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Current Revenue" value={"$" + result.currentRevenue?.toLocaleString()} />
              <StatBox label="Projected Revenue" value={"$" + result.projectedRevenue?.toLocaleString()} color="text-blue-400" />
              <StatBox label="Annual Gain" value={"$" + result.revenueGain?.toLocaleString()} color={result.revenueGain > 0 ? "text-green-400" : "text-red-400"} />
              <StatBox label="ROI" value={result.roi + "%"} color={result.roi > 100 ? "text-green-400" : result.roi > 0 ? "text-yellow-400" : "text-red-400"} />
            </div>
            <div className={cn("text-xs p-3 rounded border", result.netGain > 0 ? "bg-green-500/5 border-green-500/30" : "bg-yellow-500/5 border-yellow-500/30")} data-testid="contract-recommendation">
              <span className="font-semibold capitalize">{result.strategy}</span>: {result.recommendation}
            </div>
            {result.breakEvenMonths && (
              <div className="text-xs text-muted-foreground">Break-even: <span className="text-foreground font-medium">{result.breakEvenMonths} months</span> | Negotiation cost: <span className="text-foreground">${result.negotiationCost?.toLocaleString()}</span></div>
            )}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Volume Scenarios</div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={result.scenarios} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="visitVolume" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={40} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, "Projected Revenue"]} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 5: Outcome-Weighted Revenue ─────────────────────────────────────────
function OutcomeRevenueTab() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/revenue-pipeline/outcome-revenue"],
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)}
    </div>
  );

  const grade = data?.grade ?? "—";
  const gradeColor = data?.gradeColor === "green" ? "text-green-400" : data?.gradeColor === "yellow" ? "text-yellow-400" : data?.gradeColor === "orange" ? "text-orange-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <BarChart3 size={14} className="text-emerald-400" />
          <span className="text-xs font-semibold">Outcome-Weighted Revenue Dashboard</span>
          <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px]" onClick={() => refetch()} data-testid="button-refresh-revenue">Refresh</Button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            <StatBox label="Revenue Health" value={grade} color={gradeColor} />
            <StatBox label="Total Revenue" value={"$" + (data?.revenue?.totalRevenue ?? 0).toLocaleString()} color="text-green-400" />
            <StatBox label="QA-Adjusted" value={"$" + (data?.qualityAdjustedRevenue ?? 0).toLocaleString()} color="text-blue-400" />
            <StatBox label="Denial Rate" value={(data?.denialRate ?? 0) + "%"} color={(data?.denialRate ?? 0) < 10 ? "text-green-400" : "text-red-400"} />
            <StatBox label="Outcome Efficiency" value={(data?.outcomeEfficiency ?? 0) + "%"} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Total Encounters" value={data?.revenue?.totalEncounters ?? 0} />
            <StatBox label="Paid Rate" value={(data?.stats?.paidRate ?? 0) + "%"} color={(data?.stats?.paidRate ?? 0) > 85 ? "text-green-400" : "text-yellow-400"} />
            <StatBox label="Revenue Lost" value={"$" + (data?.revenue?.revenueLostToDenials ?? 0).toLocaleString()} color="text-red-400" />
          </div>
          {data?.revenue?.cptBreakdown?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">CPT Revenue Breakdown</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={data.revenue.cptBreakdown} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="cpt" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={35} tickFormatter={v => `$${v.toLocaleString()}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {data?.opportunities?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Top Recovery Opportunities</div>
              <div className="space-y-1.5">
                {data.opportunities.map((o: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded border border-border/30" data-testid={`opportunity-${i}`}>
                    <span className="font-mono text-[10px] text-muted-foreground w-24 truncate">{o.key}</span>
                    <Badge variant="outline" className={cn("text-[9px]", o.priority === "high" ? "text-red-400 border-red-500/40" : o.priority === "medium" ? "text-yellow-400 border-yellow-500/40" : "text-muted-foreground")}>
                      {o.priority}
                    </Badge>
                    <span className="text-muted-foreground text-[10px] ml-auto">{o.denials} denials</span>
                    <span className="text-green-400 font-bold text-[11px]">${o.recoveryPotential?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!data?.revenue?.totalEncounters || data.revenue.totalEncounters === 0) && (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
              <BarChart3 size={24} className="opacity-20" />
              <div className="text-xs">No claim data yet — submit outcomes via Billing Intelligence</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function RevenueWarRoomPage() {
  return (
    <ScrollArea className="h-screen">
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <DollarSign size={18} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-base font-bold" data-testid="page-title-revenue-war-room">Revenue War Room</h1>
            <p className="text-[10px] text-muted-foreground">Denial prediction · Reimbursement optimization · Physician coaching · Contract simulation · Outcome-weighted revenue</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] text-green-400 border-green-500/40">5-Engine Suite</Badge>
        </div>

        <Tabs defaultValue="denial" className="w-full">
          <TabsList className="h-8 text-[11px] w-full grid grid-cols-5">
            <TabsTrigger value="denial" className="text-[10px]" data-testid="tab-denial">Denial Predictor</TabsTrigger>
            <TabsTrigger value="reimburse" className="text-[10px]" data-testid="tab-reimburse">Reimbursement</TabsTrigger>
            <TabsTrigger value="coaching" className="text-[10px]" data-testid="tab-coaching">Coaching</TabsTrigger>
            <TabsTrigger value="contract" className="text-[10px]" data-testid="tab-contract">Contract Sim</TabsTrigger>
            <TabsTrigger value="revenue" className="text-[10px]" data-testid="tab-revenue">Outcome Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="denial" className="mt-4"><DenialPredictorTab /></TabsContent>
          <TabsContent value="reimburse" className="mt-4"><ReimbursementOptimizerTab /></TabsContent>
          <TabsContent value="coaching" className="mt-4"><PhysicianCoachingTab /></TabsContent>
          <TabsContent value="contract" className="mt-4"><ContractSimulationTab /></TabsContent>
          <TabsContent value="revenue" className="mt-4"><OutcomeRevenueTab /></TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
