import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, FlaskConical, Wind, Brain, ShieldCheck,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  ChevronRight, Loader2, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SofaComponents {
  respiratory: number; coagulation: number; liver: number;
  cardiovascular: number; cns: number; renal: number;
}
interface SofaResult {
  components: SofaComponents;
  total: number;
  interpretation: "LOW_RISK" | "MODERATE" | "HIGH" | "CRITICAL";
  mortalityEstimate: string;
  pfRatio: number | null;
  flags: string[];
}
interface HorizonRisk { h1: number; h4: number; h12: number; h24: number; }
interface BayesianState {
  alpha: number; beta: number; mean: number;
  lower95: number; upper95: number;
}
interface TrajectoryResult {
  state: BayesianState;
  trend: "improving" | "stable" | "worsening" | "rapidly_worsening";
  horizonRisk: HorizonRisk;
  sofaDelta: number | null;
  flags: string[];
  caveat: string;
  observations: Array<{ source: string; signal: string; detail: string; weight: number }>;
}
interface GoldenCaseDetail {
  caseId: string;
  sofaActual: number;
  sofaExpected: number;
  sofaMatch: boolean;
  interpretationActual: string;
  interpretationExpected: string;
  interpretationMatch: boolean;
  trendActual: string;
  trendExpected: string;
  trendMatch: boolean;
  safetyMismatch: boolean;
  error?: string;
}
interface ValidationResult {
  totalCases: number; sofaAccurate: number;
  interpretCorrect: number; trendCorrect: number;
  safetyMismatches: number; passed: boolean;
  details: GoldenCaseDetail[];
  blockingReason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const interpColor: Record<string, string> = {
  LOW_RISK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  MODERATE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  HIGH:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const trendIcon = (t: string) => {
  if (t === "rapidly_worsening") return <TrendingDown className="w-4 h-4 text-red-500" />;
  if (t === "worsening")         return <TrendingDown className="w-4 h-4 text-orange-500" />;
  if (t === "improving")         return <TrendingUp   className="w-4 h-4 text-emerald-500" />;
  return                                <Minus        className="w-4 h-4 text-muted-foreground" />;
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── SOFA form schema ───────────────────────────────────────────────────────────

const sofaSchema = z.object({
  scoredAt:            z.string(),
  encounterId:         z.string().optional(),
  paO2:                z.coerce.number().min(20).max(600).optional().or(z.literal("")),
  fiO2:                z.coerce.number().min(0.21).max(1).optional().or(z.literal("")),
  mechanicallyVentilated: z.boolean().optional(),
  platelets:           z.coerce.number().min(0).max(3000).optional().or(z.literal("")),
  bilirubin:           z.coerce.number().min(0).max(50).optional().or(z.literal("")),
  map:                 z.coerce.number().min(0).max(200).optional().or(z.literal("")),
  gcs:                 z.coerce.number().int().min(3).max(15).optional().or(z.literal("")),
  creatinine:          z.coerce.number().min(0).max(30).optional().or(z.literal("")),
  urineOutput24h:      z.coerce.number().min(0).max(10000).optional().or(z.literal("")),
  norepinephrineDose:  z.coerce.number().min(0).max(5).optional().or(z.literal("")),
  dopamineDose:        z.coerce.number().min(0).max(50).optional().or(z.literal("")),
});

type SofaFormValues = z.infer<typeof sofaSchema>;

// ── Lab form schema ────────────────────────────────────────────────────────────

const labSchema = z.object({
  panelType:  z.enum(["CBC", "CMP", "ABG"]),
  collectedAt: z.string(),
  encounterId: z.string().optional(),
  wbc: z.coerce.number().optional().or(z.literal("")),
  rbc: z.coerce.number().optional().or(z.literal("")),
  hgb: z.coerce.number().optional().or(z.literal("")),
  hct: z.coerce.number().optional().or(z.literal("")),
  plt: z.coerce.number().optional().or(z.literal("")),
  neutPct: z.coerce.number().optional().or(z.literal("")),
  sodium:     z.coerce.number().optional().or(z.literal("")),
  potassium:  z.coerce.number().optional().or(z.literal("")),
  creatinine: z.coerce.number().optional().or(z.literal("")),
  bun:        z.coerce.number().optional().or(z.literal("")),
  glucose:    z.coerce.number().optional().or(z.literal("")),
  totalBilirubin: z.coerce.number().optional().or(z.literal("")),
  albumin:    z.coerce.number().optional().or(z.literal("")),
  ph:         z.coerce.number().optional().or(z.literal("")),
  pco2:       z.coerce.number().optional().or(z.literal("")),
  po2:        z.coerce.number().optional().or(z.literal("")),
  hco3:       z.coerce.number().optional().or(z.literal("")),
  lactate:    z.coerce.number().optional().or(z.literal("")),
  fio2:       z.coerce.number().optional().or(z.literal("")),
  baseExcess: z.coerce.number().optional().or(z.literal("")),
  procalcitonin: z.coerce.number().optional().or(z.literal("")),
  inrPt:      z.coerce.number().optional().or(z.literal("")),
});

type LabFormValues = z.infer<typeof labSchema>;

// ── SOFA Score Widget ──────────────────────────────────────────────────────────

function sofaBar(score: number) {
  const pct = (score / 4) * 100;
  const color = score === 0 ? "bg-emerald-500" : score === 1 ? "bg-yellow-400" : score === 2 ? "bg-orange-400" : score <= 3 ? "bg-red-500" : "bg-red-700";
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SofaCard({ result, delta }: { result: SofaResult; delta: number | null }) {
  const components = [
    { label: "Respiratory",    value: result.components.respiratory },
    { label: "Coagulation",    value: result.components.coagulation },
    { label: "Liver",          value: result.components.liver },
    { label: "Cardiovascular", value: result.components.cardiovascular },
    { label: "CNS",            value: result.components.cns },
    { label: "Renal",          value: result.components.renal },
  ];
  return (
    <Card data-testid="sofa-result-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">SOFA Score</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={interpColor[result.interpretation]}>{result.interpretation.replace("_", " ")}</Badge>
            {delta !== null && (
              <Badge variant="outline" className={delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : ""}>
                Δ {delta > 0 ? "+" : ""}{delta}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <span className="text-4xl font-bold" data-testid="sofa-total">{result.total}</span>
          <div>
            <p className="text-sm text-muted-foreground">/ 24</p>
            <p className="text-xs text-muted-foreground">Est. mortality: {result.mortalityEstimate}</p>
          </div>
          {result.pfRatio !== null && (
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">P/F ratio</p>
              <p className="font-semibold" data-testid="pf-ratio">{result.pfRatio}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {components.map((c) => (
            <div key={c.label} className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{c.label}</span><span>{c.value}/4</span>
              </div>
              {sofaBar(c.value)}
            </div>
          ))}
        </div>
        {result.flags.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            {result.flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bayesian Trajectory Card ───────────────────────────────────────────────────

function TrajectoryCard({ result }: { result: TrajectoryResult }) {
  const trendLabel: Record<string, string> = {
    improving: "Improving", stable: "Stable",
    worsening: "Worsening", rapidly_worsening: "Rapidly Worsening",
  };
  const trendClass: Record<string, string> = {
    improving: "text-emerald-600", stable: "text-muted-foreground",
    worsening: "text-orange-600",  rapidly_worsening: "text-red-600 font-bold",
  };

  return (
    <Card data-testid="trajectory-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" /> Bayesian Trajectory
          </CardTitle>
          <div className={`flex items-center gap-1 text-sm ${trendClass[result.trend]}`}>
            {trendIcon(result.trend)}{trendLabel[result.trend]}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-muted/40 rounded-lg">
            <p className="text-2xl font-bold" data-testid="posterior-mean">{pct(result.state.mean)}</p>
            <p className="text-xs text-muted-foreground">Posterior risk</p>
          </div>
          <div className="text-center p-3 bg-muted/40 rounded-lg">
            <p className="text-lg font-semibold">{pct(result.state.lower95)}</p>
            <p className="text-xs text-muted-foreground">95% CI lower</p>
          </div>
          <div className="text-center p-3 bg-muted/40 rounded-lg">
            <p className="text-lg font-semibold">{pct(result.state.upper95)}</p>
            <p className="text-xs text-muted-foreground">95% CI upper</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Deterioration horizon risk</p>
          <div className="grid grid-cols-4 gap-2">
            {([["1h", result.horizonRisk.h1], ["4h", result.horizonRisk.h4], ["12h", result.horizonRisk.h12], ["24h", result.horizonRisk.h24]] as [string, number][]).map(([label, val]) => {
              const risk = val as number;
              const color = risk > 0.7 ? "text-red-600" : risk > 0.4 ? "text-orange-500" : "text-emerald-600";
              return (
                <div key={label} className="text-center p-2 border rounded">
                  <p className={`text-base font-bold ${color}`} data-testid={`horizon-${label}`}>{pct(risk)}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {result.flags.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {result.flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /><span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {result.observations.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {result.observations.length} signal(s) used
            </summary>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {result.observations.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">{o.source}</Badge>
                  <span className={o.signal === "deterioration" ? "text-red-600" : o.signal === "reassuring" ? "text-emerald-600" : ""}>
                    {o.detail}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        <Alert className="py-2">
          <AlertDescription className="text-[11px] text-muted-foreground">{result.caveat}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ── Golden Case Validation Card ────────────────────────────────────────────────

function GoldenCaseCard({ result }: { result: ValidationResult }) {
  return (
    <Card data-testid="golden-case-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Golden-Case Validation
          </CardTitle>
          <Badge className={result.passed
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}>
            {result.passed ? "PASSED" : "FAILED"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Cases", value: result.totalCases },
            { label: "SOFA ok", value: result.sofaAccurate },
            { label: "Interp ok", value: result.interpretCorrect },
            { label: "Safety ✗", value: result.safetyMismatches, bad: result.safetyMismatches > 0 },
          ].map((m) => (
            <div key={m.label} className="p-2 bg-muted/40 rounded">
              <p className={`text-xl font-bold ${m.bad ? "text-red-600" : ""}`}>{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {result.blockingReason && (
          <Alert className="border-red-300 bg-red-50 dark:bg-red-900/10">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-sm text-red-700 dark:text-red-400">
              {result.blockingReason}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {result.details.map((d) => (
            <div key={d.caseId} data-testid={`golden-case-${d.caseId}`}
              className="flex items-center justify-between p-2 border rounded text-xs">
              <div className="flex items-center gap-2">
                {d.safetyMismatch
                  ? <AlertTriangle className="w-3 h-3 text-red-500" />
                  : d.sofaMatch && d.interpretationMatch
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    : <Minus className="w-3 h-3 text-amber-500" />}
                <span className="font-mono">{d.caseId}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>SOFA {d.sofaActual} <span className={d.sofaMatch ? "text-emerald-600" : "text-red-500"}>(exp {d.sofaExpected})</span></span>
                <ChevronRight className="w-3 h-3" />
                <span className={d.interpretationMatch ? "text-emerald-600" : "text-red-500"}>
                  {d.interpretationActual}
                </span>
                <span className={d.trendMatch ? "text-emerald-600" : "text-amber-500"}>{d.trendActual}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ClinicalICUMonitor() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sofa");
  const [sofaResult, setSofaResult] = useState<{ sofa: SofaResult; delta: number | null } | null>(null);
  const [trajectoryResult, setTrajectoryResult] = useState<TrajectoryResult | null>(null);

  const { data: goldenData, refetch: refetchGolden, isFetching: goldenFetching } =
    useQuery<{ ok: boolean; validation: ValidationResult }>({
      queryKey: ["/api/labs/golden-cases/validate"],
      enabled: false,
    });

  const sofaForm = useForm<SofaFormValues>({
    resolver: zodResolver(sofaSchema),
    defaultValues: { scoredAt: new Date().toISOString().slice(0, 16), mechanicallyVentilated: false },
  });

  const labForm = useForm<LabFormValues>({
    resolver: zodResolver(labSchema),
    defaultValues: { panelType: "CBC", collectedAt: new Date().toISOString().slice(0, 16) },
  });

  const sofaMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/labs/sofa/calculate", data),
    onSuccess: async (res) => {
      const json = await res.json();
      setSofaResult({ sofa: json.sofa, delta: json.delta });
      toast({ title: "SOFA score calculated", description: `Total: ${json.sofa.total} — ${json.sofa.interpretation}` });
    },
    onError: () => toast({ title: "SOFA calculation failed", variant: "destructive" }),
  });

  const labMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/labs/ingest", data),
    onSuccess: () => toast({ title: "Lab panel ingested" }),
    onError: () => toast({ title: "Lab ingestion failed", variant: "destructive" }),
  });

  const trajectoryMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/labs/trajectory/bayesian", data),
    onSuccess: async (res) => {
      const json = await res.json();
      setTrajectoryResult(json.trajectory);
      toast({ title: "Bayesian trajectory computed", description: `Trend: ${json.trajectory.trend}` });
    },
    onError: () => toast({ title: "Trajectory failed", variant: "destructive" }),
  });

  const onSofaSubmit = useCallback((values: SofaFormValues) => {
    const clean: Record<string, unknown> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== "" && v !== undefined) clean[k] = v; });
    if (clean.scoredAt) clean.scoredAt = new Date(clean.scoredAt as string).toISOString();
    if (clean.encounterId) clean.encounterId = parseInt(clean.encounterId as string, 10);
    sofaMutation.mutate(clean);
  }, [sofaMutation]);

  const onLabSubmit = useCallback((values: LabFormValues) => {
    const clean: Record<string, unknown> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== "" && v !== undefined) clean[k] = v; });
    if (clean.collectedAt) clean.collectedAt = new Date(clean.collectedAt as string).toISOString();
    if (clean.encounterId) clean.encounterId = parseInt(clean.encounterId as string, 10);
    labMutation.mutate(clean);
  }, [labMutation]);

  const runDemoTrajectory = useCallback(() => {
    const now = Date.now();
    trajectoryMutation.mutate({
      vitals: [
        { timestamp: new Date(now - 7200000).toISOString(), hr: 118, spo2: 84, sbp: 72, rr: 28, sofaScore: 12 },
        { timestamp: new Date(now - 5400000).toISOString(), hr: 125, spo2: 82, sbp: 68, rr: 30, sofaScore: 14 },
        { timestamp: new Date(now - 3600000).toISOString(), hr: 132, spo2: 80, sbp: 65, rr: 33, sofaScore: 16 },
      ],
      priorAlpha: 1, priorBeta: 4,
    });
  }, [trajectoryMutation]);

  const panelType = labForm.watch("panelType");

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">ICU Clinical Monitor</h1>
            <p className="text-sm text-muted-foreground">Time-series Bayesian · Lab ingestion · SOFA delta · Golden-case validation</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sofa" data-testid="tab-sofa">
              <Activity className="w-4 h-4 mr-2" />SOFA
            </TabsTrigger>
            <TabsTrigger value="labs" data-testid="tab-labs">
              <FlaskConical className="w-4 h-4 mr-2" />Labs
            </TabsTrigger>
            <TabsTrigger value="trajectory" data-testid="tab-trajectory">
              <Brain className="w-4 h-4 mr-2" />Trajectory
            </TabsTrigger>
            <TabsTrigger value="validation" data-testid="tab-validation">
              <ShieldCheck className="w-4 h-4 mr-2" />Validation
            </TabsTrigger>
          </TabsList>

          {/* ── SOFA Tab ─────────────────────────────────────────────────────── */}
          <TabsContent value="sofa" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Compute SOFA Score</CardTitle></CardHeader>
              <CardContent>
                <Form {...sofaForm}>
                  <form onSubmit={sofaForm.handleSubmit(onSofaSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { name: "paO2",   label: "PaO₂ (mmHg)",      placeholder: "e.g. 65" },
                        { name: "fiO2",   label: "FiO₂ (0.21–1.0)",  placeholder: "e.g. 0.8" },
                        { name: "platelets", label: "Platelets (×10³)", placeholder: "e.g. 45" },
                        { name: "bilirubin", label: "Bilirubin (mg/dL)", placeholder: "e.g. 7.2" },
                        { name: "map",    label: "MAP (mmHg)",        placeholder: "e.g. 58" },
                        { name: "gcs",    label: "GCS (3–15)",        placeholder: "e.g. 8" },
                        { name: "creatinine", label: "Creatinine (mg/dL)", placeholder: "e.g. 4.1" },
                        { name: "norepinephrineDose", label: "Norepi (µg/kg/min)", placeholder: "e.g. 0.15" },
                        { name: "urineOutput24h", label: "Urine output (mL/24h)", placeholder: "e.g. 200" },
                      ].map((f) => (
                        <FormField key={f.name} control={sofaForm.control} name={f.name as keyof SofaFormValues}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">{f.label}</FormLabel>
                              <FormControl>
                                <Input data-testid={`sofa-${f.name}`} placeholder={f.placeholder}
                                  {...field} value={field.value === undefined ? "" : String(field.value)} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <FormField control={sofaForm.control} name="mechanicallyVentilated"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <input data-testid="sofa-ventilated" type="checkbox" checked={!!field.value}
                                onChange={(e) => field.onChange(e.target.checked)} className="w-4 h-4" />
                            </FormControl>
                            <FormLabel className="text-sm cursor-pointer">Mechanically ventilated</FormLabel>
                          </FormItem>
                        )} />
                    </div>
                    <Button type="submit" data-testid="button-calculate-sofa" disabled={sofaMutation.isPending}>
                      {sofaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Calculate SOFA
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {sofaResult && (
              <SofaCard result={sofaResult.sofa} delta={sofaResult.delta} />
            )}
          </TabsContent>

          {/* ── Labs Tab ─────────────────────────────────────────────────────── */}
          <TabsContent value="labs" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Ingest Lab Panel</CardTitle></CardHeader>
              <CardContent>
                <Form {...labForm}>
                  <form onSubmit={labForm.handleSubmit(onLabSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={labForm.control} name="panelType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Panel type</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger data-testid="select-panel-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CBC">CBC</SelectItem>
                                <SelectItem value="CMP">CMP</SelectItem>
                                <SelectItem value="ABG">ABG</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      <FormField control={labForm.control} name="collectedAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Collected at</FormLabel>
                            <FormControl><Input type="datetime-local" {...field} data-testid="input-collected-at" /></FormControl>
                          </FormItem>
                        )} />
                    </div>

                    {panelType === "CBC" && (
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { n: "wbc", l: "WBC (×10³/µL)" }, { n: "rbc", l: "RBC (×10⁶/µL)" },
                          { n: "hgb", l: "Hgb (g/dL)" },    { n: "hct", l: "Hct (%)" },
                          { n: "plt", l: "Platelets (×10³)" }, { n: "neutPct", l: "Neutrophils (%)" },
                        ].map(f => (
                          <FormField key={f.n} control={labForm.control} name={f.n as keyof LabFormValues}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{f.l}</FormLabel>
                                <FormControl><Input data-testid={`lab-${f.n}`} placeholder="—"
                                  {...field} value={field.value === undefined ? "" : String(field.value)} /></FormControl>
                              </FormItem>
                            )} />
                        ))}
                      </div>
                    )}

                    {panelType === "CMP" && (
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { n: "sodium", l: "Na (mEq/L)" },    { n: "potassium", l: "K (mEq/L)" },
                          { n: "creatinine", l: "Cr (mg/dL)" },{ n: "bun", l: "BUN (mg/dL)" },
                          { n: "glucose", l: "Glucose (mg/dL)" }, { n: "totalBilirubin", l: "T.Bili (mg/dL)" },
                          { n: "albumin", l: "Albumin (g/dL)" }, { n: "inrPt", l: "INR" },
                          { n: "procalcitonin", l: "PCT (ng/mL)" },
                        ].map(f => (
                          <FormField key={f.n} control={labForm.control} name={f.n as keyof LabFormValues}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{f.l}</FormLabel>
                                <FormControl><Input data-testid={`lab-${f.n}`} placeholder="—"
                                  {...field} value={field.value === undefined ? "" : String(field.value)} /></FormControl>
                              </FormItem>
                            )} />
                        ))}
                      </div>
                    )}

                    {panelType === "ABG" && (
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { n: "ph", l: "pH" },       { n: "pco2", l: "pCO₂ (mmHg)" },
                          { n: "po2", l: "pO₂ (mmHg)" }, { n: "hco3", l: "HCO₃ (mEq/L)" },
                          { n: "baseExcess", l: "Base excess" }, { n: "lactate", l: "Lactate (mmol/L)" },
                          { n: "fio2", l: "FiO₂ (0.21–1.0)" },
                        ].map(f => (
                          <FormField key={f.n} control={labForm.control} name={f.n as keyof LabFormValues}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{f.l}</FormLabel>
                                <FormControl><Input data-testid={`lab-${f.n}`} placeholder="—"
                                  {...field} value={field.value === undefined ? "" : String(field.value)} /></FormControl>
                              </FormItem>
                            )} />
                        ))}
                      </div>
                    )}

                    <Button type="submit" data-testid="button-ingest-lab" disabled={labMutation.isPending}>
                      {labMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Ingest Lab Panel
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Trajectory Tab ───────────────────────────────────────────────── */}
          <TabsContent value="trajectory" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bayesian Trajectory Model</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Beta-Binomial conjugate model — each abnormal vital/lab/SOFA change updates the posterior.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <Button data-testid="button-run-demo-trajectory" onClick={runDemoTrajectory}
                    disabled={trajectoryMutation.isPending}>
                    {trajectoryMutation.isPending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</>
                      : "Run Demo (Septic Shock Scenario)"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Demo uses a septic shock trajectory: HR 118→132, SpO2 84→80%, SBP 72→65, SOFA 12→16 over 2 hours.
                </p>
              </CardContent>
            </Card>
            {trajectoryResult && <TrajectoryCard result={trajectoryResult} />}
          </TabsContent>

          {/* ── Validation Tab ───────────────────────────────────────────────── */}
          <TabsContent value="validation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Golden-Case Validation Suite</CardTitle>
                <p className="text-sm text-muted-foreground">
                  4 curated clinical cases (septic shock, pneumonia, post-op, hepatic failure).
                  Safety-critical mismatches block deployment.
                </p>
              </CardHeader>
              <CardContent>
                <Button data-testid="button-run-golden-validation"
                  onClick={() => refetchGolden()} disabled={goldenFetching}>
                  {goldenFetching
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                    : <><RefreshCw className="w-4 h-4 mr-2" />Run Validation Suite</>}
                </Button>
              </CardContent>
            </Card>
            {goldenData?.validation && <GoldenCaseCard result={goldenData.validation} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
