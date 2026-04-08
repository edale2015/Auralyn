import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Brain, Activity, Shield, Cpu, Users, TrendingUp, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, Scale, Eye,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface EngineSummary {
  successRate: number;
  avgDurationMs: number;
  timeoutRate: number;
  totalRuns: number;
  recentRuns: { success: boolean; durationMs: number; timedOut?: boolean; timestamp?: string }[];
}

interface EngineHealthData {
  engines: Record<string, EngineSummary>;
  generatedAt: string;
}

interface BanditRecord {
  ucbScore: number;
  count: number;
  reward: number;
}

interface MetaWeight {
  weight: number;
}

interface CouncilStats {
  councils: Record<string, { count: number; reward: number; ucb: number }>;
  generatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function HealthBadge({ rate }: { rate: number }) {
  if (rate >= 0.95) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Healthy</Badge>;
  if (rate >= 0.80) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Degraded</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Failing</Badge>;
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function ms(n: number)  { return `${n.toFixed(0)}ms`; }

// ── Engine Health Panel ───────────────────────────────────────────────────────
function EngineHealthPanel() {
  const { data, isLoading } = useQuery<EngineHealthData>({
    queryKey: ["/api/brain-intel/engine-health"],
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Clock className="h-4 w-4 animate-spin" />Loading engine telemetry…</div>;
  if (!data) return <p className="p-6 text-muted-foreground">No telemetry data available.</p>;

  const engines = Object.entries(data.engines ?? {});

  return (
    <div data-testid="engine-health-panel">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {engines.length} engines tracked · updated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" />≥95% healthy</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-yellow-500" />≥80% degraded</span>
          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" />&lt;80% failing</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {engines.map(([name, eng]) => (
          <div
            key={name}
            data-testid={`engine-card-${name}`}
            className="border rounded-lg p-3 bg-card"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-foreground truncate max-w-[60%]" title={name}>{name}</span>
              <HealthBadge rate={eng.successRate ?? 0} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Success rate</span>
                <span className="font-medium text-foreground">{pct(eng.successRate ?? 0)}</span>
              </div>
              <Progress value={(eng.successRate ?? 0) * 100} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Avg latency</span>
                <span>{ms(eng.avgDurationMs ?? 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Timeouts</span>
                <span>{pct(eng.timeoutRate ?? 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Total runs</span>
                <span>{(eng.totalRuns ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Meta-Learning Panel ───────────────────────────────────────────────────────
function MetaLearningPanel() {
  const { data: meta, isLoading } = useQuery<{ engineWeights: Record<string, number>; uncertaintyScale: number; generatedAt: string }>({
    queryKey: ["/api/brain-intel/meta-weights"],
    refetchInterval: 30000,
  });

  const recordOutcome = useMutation({
    mutationFn: (payload: { engines: string[]; outcomeImproved: boolean }) =>
      apiRequest("POST", "/api/brain-intel/meta-weights/outcome", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/brain-intel/meta-weights"] }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Clock className="h-4 w-4 animate-spin" />Loading meta-weights…</div>;

  const weights = Object.entries(meta?.engineWeights ?? {});

  return (
    <div data-testid="meta-learning-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Uncertainty scale</span>
          <Badge variant="outline">{(meta?.uncertaintyScale ?? 1).toFixed(3)}</Badge>
        </div>
        <Button
          data-testid="button-simulate-outcome"
          size="sm"
          variant="outline"
          disabled={recordOutcome.isPending}
          onClick={() => recordOutcome.mutate({ engines: ["riskStratificationEngine", "clinicalGovernanceEngine"], outcomeImproved: true })}
        >
          <TrendingUp className="h-3 w-3 mr-1" />
          Simulate positive outcome
        </Button>
      </div>

      {weights.length === 0 ? (
        <p className="text-muted-foreground text-sm p-4 border rounded-lg bg-muted/30">
          No meta-weights recorded yet. Weights self-tune as physician outcomes are recorded.
        </p>
      ) : (
        <div className="space-y-2">
          {weights.sort(([, a], [, b]) => (b as number) - (a as number)).map(([name, weight]) => (
            <div key={name} data-testid={`meta-weight-${name}`} className="flex items-center gap-3">
              <span className="text-xs font-mono w-64 truncate text-muted-foreground" title={name}>{name}</span>
              <Progress value={Math.min(100, ((weight as number) / 2) * 100)} className="flex-1 h-2" />
              <span className="text-xs font-medium w-12 text-right">{(weight as number).toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Oversight Panel ───────────────────────────────────────────────────────────
function OversightPanel() {
  const { data: drift } = useQuery<{ driftDetected: boolean }>({
    queryKey: ["/api/brain-intel/oversight-drift"],
    refetchInterval: 10000,
  });

  const setDrift = useMutation({
    mutationFn: (detected: boolean) =>
      apiRequest("POST", "/api/brain-intel/oversight-drift", { detected }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/brain-intel/oversight-drift"] }),
  });

  const isDrifting = drift?.driftDetected ?? false;

  return (
    <div data-testid="oversight-panel" className="space-y-4">
      <div className={`flex items-center gap-4 p-4 rounded-lg border ${isDrifting ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"}`}>
        {isDrifting
          ? <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
          : <CheckCircle   className="h-6 w-6 text-green-600 flex-shrink-0" />
        }
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {isDrifting ? "Diagnostic drift detected" : "No diagnostic drift"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isDrifting
              ? "AI output distribution has shifted from baseline. Physician review recommended."
              : "AI output distribution is stable. Oversight checks passing."
            }
          </p>
        </div>
        <Button
          data-testid="button-toggle-drift"
          size="sm"
          variant={isDrifting ? "destructive" : "outline"}
          disabled={setDrift.isPending}
          onClick={() => setDrift.mutate(!isDrifting)}
        >
          {isDrifting ? "Clear flag" : "Simulate drift"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            AI-Watches-AI — 6 active oversight checks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { check: "Uncertainty bounds validation",     desc: "Flags entropy > 0.85" },
              { check: "Engine failure critical path",      desc: "Escalates on 3+ critical failures" },
              { check: "Confidence distribution check",     desc: "Detects overconfident low-evidence outputs" },
              { check: "Disposition-risk alignment",        desc: "Guards against discharge with high risk" },
              { check: "Red flag propagation check",        desc: "Ensures red flags reach disposition" },
              { check: "Differential coverage check",       desc: "Detects empty differentials on high risk" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">{item.check}</span>
                  <span className="text-muted-foreground text-xs block">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Council Panel ─────────────────────────────────────────────────────────────
function CouncilPanel() {
  const { data: stats, isLoading } = useQuery<CouncilStats>({
    queryKey: ["/api/brain-intel/council-stats"],
    refetchInterval: 30000,
  });

  const sendFeedback = useMutation({
    mutationFn: (payload: { council: string; helpful: boolean }) =>
      apiRequest("POST", "/api/brain-intel/council-feedback", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/brain-intel/council-stats"] }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Clock className="h-4 w-4 animate-spin" />Loading council stats…</div>;

  const councils = stats?.councils ?? {};
  const COUNCIL_META: Record<string, { icon: string; label: string; desc: string }> = {
    cardiology:          { icon: "❤️", label: "Cardiology",          desc: "Chest pain · ACS · Palpitations" },
    infectious_disease:  { icon: "🦠", label: "Infectious Disease",  desc: "Fever · Sepsis · Pneumonia" },
    icu:                 { icon: "🏥", label: "ICU",                 desc: "High-risk · Organ failure · Shock" },
  };

  return (
    <div data-testid="council-panel" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Specialist councils are activated by a hybrid heuristic + UCB bandit.
        Feedback from physician outcomes auto-tunes which councils add value.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["cardiology", "infectious_disease", "icu"] as const).map((c) => {
          const s    = councils[c] ?? { count: 0, reward: 0, ucb: 0 };
          const meta = COUNCIL_META[c];
          return (
            <Card key={c} data-testid={`council-card-${c}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>{meta.icon}</span>
                  {meta.label}
                </CardTitle>
                <CardDescription className="text-xs">{meta.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold">{s.count}</div>
                    <div className="text-xs text-muted-foreground">activations</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{s.reward.toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">reward</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{s.ucb.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">UCB</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid={`button-feedback-helpful-${c}`}
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    disabled={sendFeedback.isPending}
                    onClick={() => sendFeedback.mutate({ council: c, helpful: true })}
                  >
                    👍 Helpful
                  </Button>
                  <Button
                    data-testid={`button-feedback-unhelpful-${c}`}
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    disabled={sendFeedback.isPending}
                    onClick={() => sendFeedback.mutate({ council: c, helpful: false })}
                  >
                    👎 Noisy
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Hierarchical Council Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground mb-2">Decision flow per encounter:</div>
            {[
              "1. Specialist councils run in parallel (if activated by bandit)",
              "2. Each specialist runs internal debate between domain agents",
              "3. Cross-council debate — specialists challenge each other",
              "4. Master consensus — weighted synthesis across all councils",
              "5. Chief Resident reflection — consistency check",
              "6. Safety Escalation Guard — hard override rules",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-primary font-mono">{step}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function ClinicalBrainDashboard() {
  const [activeTab, setActiveTab] = useState("engines");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="clinical-brain-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Clinical Brain Control Tower</h1>
            <p className="text-sm text-muted-foreground">
              v3.0 — Phase-parallel · Per-engine timeouts · Self-aware AI supervision
            </p>
          </div>
        </div>
        <Badge variant="outline" className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-green-500" />
          Live
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Phase parallelism", value: "6 phases", icon: Cpu,       desc: "Sequential → parallel"  },
          { label: "Active engines",    value: "28",        icon: Activity,  desc: "Per-engine timeout"     },
          { label: "Council system",    value: "3 specialist", icon: Users,  desc: "+ base 5-agent council" },
          { label: "Safety layers",     value: "4 guards",   icon: Shield,   desc: "Oversight → guard → reflection" },
        ].map((s) => (
          <Card key={s.label} data-testid={`stat-card-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="brain-dashboard-tabs">
          <TabsTrigger value="engines"    data-testid="tab-engines"><Activity className="h-3.5 w-3.5 mr-1.5" />Engine Health</TabsTrigger>
          <TabsTrigger value="meta"       data-testid="tab-meta"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Meta-Learning</TabsTrigger>
          <TabsTrigger value="oversight"  data-testid="tab-oversight"><Eye className="h-3.5 w-3.5 mr-1.5" />Oversight</TabsTrigger>
          <TabsTrigger value="councils"   data-testid="tab-councils"><Users className="h-3.5 w-3.5 mr-1.5" />Councils</TabsTrigger>
        </TabsList>

        <TabsContent value="engines" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Per-Engine Telemetry
              </CardTitle>
              <CardDescription>
                Every engine run is streamed to Redis. Success rate, average latency,
                and timeout rate are computed from the last 100 runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EngineHealthPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meta" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Self-Tuning Importance Weights
              </CardTitle>
              <CardDescription>
                Engine importance weights adjust after each physician outcome.
                Engines that consistently contribute to correct diagnoses gain weight.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetaLearningPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oversight" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                AI Oversight System
              </CardTitle>
              <CardDescription>
                The oversight agent runs 6 checks on every brain output before it leaves the system.
                Chief Resident Reflection catches consistency failures.
                Safety Escalation Guard enforces hard clinical override rules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OversightPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="councils" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Hierarchical Specialist Councils
              </CardTitle>
              <CardDescription>
                Specialist councils (cardiology, infectious disease, ICU) activate via
                a hybrid heuristic + UCB bandit. Each council runs internal debate before
                contributing to the master consensus.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CouncilPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
