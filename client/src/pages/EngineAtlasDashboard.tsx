import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Search, Brain, Layers, Users, Plug2, BarChart3,
  CheckCircle2, CircleDashed, AlertCircle, RefreshCw, Play, Clock, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EngineDescriptor {
  name: string;
  description: string;
  status: "active" | "stub" | "planned";
  filePath?: string;
  avgDurationMs?: number;
  layer?: string;
}

interface EngineCounts {
  [level: string]: { total: number; active: number; stub: number; planned: number };
}

interface EngineAtlasResponse {
  engines: EngineDescriptor[];
  counts: EngineCounts;
  total: number;
}

interface SkillRequirement {
  skill: string;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  relatedEngines: string[];
}

interface SkillAtlasResponse {
  complaints: string[];
  atlas: Record<string, SkillRequirement[]>;
}

interface Protocol {
  id: string;
  name: string;
  source: string;
  applicableComplaints: string[];
  evidenceLevel: string;
  keyRecommendations: string[];
  safetyPriorities: string[];
  dispositionGuidance: string;
}

interface SystemReviewSuggestion {
  module: string;
  priority: "critical" | "high" | "medium" | "low";
  suggestion: string;
  rationale: string;
  effort: "small" | "medium" | "large";
  status: "pending" | "in_progress" | "done";
}

interface SystemReviewResult {
  reviewedAt: string;
  totalEngines: number;
  activeEngines: number;
  stubEngines: number;
  plannedEngines: number;
  healthScore: number;
  suggestions: SystemReviewSuggestion[];
  nextPriorityModule: string;
}

const LEVEL_COLORS: Record<string, string> = {
  Safety:              "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
  Diagnostic:          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  Conversation:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  PhysicianControl:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  Learning:            "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  SystemIntelligence:  "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high:     "bg-orange-100 text-orange-800",
  medium:   "bg-yellow-100 text-yellow-800",
  low:      "bg-slate-100 text-slate-600",
};

const EFFORT_LABELS: Record<string, string> = { small: "⚡ Small", medium: "🔧 Medium", large: "🏗️ Large" };
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function StatusIcon({ status }: { status: "active" | "stub" | "planned" }) {
  if (status === "active") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (status === "stub")   return <CircleDashed className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

function EngineCard({ engine, level }: { engine: EngineDescriptor; level: string }) {
  return (
    <div data-testid={`engine-card-${engine.name}`} className="flex items-start gap-2 p-2.5 rounded-md border bg-card hover:bg-muted/40 transition-colors">
      <StatusIcon status={engine.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs font-semibold truncate">{engine.name}</span>
          {engine.avgDurationMs != null && engine.avgDurationMs > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{engine.avgDurationMs}ms
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{engine.description}</p>
      </div>
    </div>
  );
}

function EngineAtlasTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");

  const { data, isLoading } = useQuery<EngineAtlasResponse>({
    queryKey: ["/api/system-brain/engines"],
    queryFn: async () => {
      const res = await fetch("/api/system-brain/engines", { credentials: "include" });
      return res.json();
    },
  });

  const grouped = useMemo(() => {
    if (!data?.engines) return {};
    const levels: Record<string, EngineDescriptor[]> = {};
    for (const e of data.engines) {
      const level = e.layer ?? "Unknown";
      if (!levels[level]) levels[level] = [];
      if (statusFilter !== "all" && e.status !== statusFilter) continue;
      if (levelFilter !== "all" && level !== levelFilter) continue;
      if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.description.toLowerCase().includes(search.toLowerCase())) continue;
      levels[level].push(e);
    }
    return levels;
  }, [data, search, statusFilter, levelFilter]);

  const totalShown = Object.values(grouped).flat().length;

  if (isLoading) return <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading engine atlas…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input data-testid="input-engine-search" placeholder="Search engines…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-status-filter" className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="stub">Stubs only</SelectItem>
            <SelectItem value="planned">Planned only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger data-testid="select-level-filter" className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {Object.keys(LEVEL_COLORS).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground shrink-0">{totalShown} / {data?.total ?? 0} engines</span>
      </div>

      {data?.counts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(data.counts).map(([level, counts]) => (
            <div key={level} className={`rounded-lg border p-2.5 text-center ${LEVEL_COLORS[level] ?? ""}`}>
              <div className="text-lg font-bold">{counts.total}</div>
              <div className="text-[10px] font-medium truncate">{level}</div>
              <div className="text-[10px] opacity-70">{counts.active} active</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([level, engines]) => engines.length === 0 ? null : (
          <div key={level}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${LEVEL_COLORS[level] ?? "bg-muted"}`}>
                {level}
              </span>
              <span className="text-xs text-muted-foreground">{engines.length} engine{engines.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {engines.map((e) => <EngineCard key={e.name} engine={e} level={level} />)}
            </div>
          </div>
        ))}
        {totalShown === 0 && <p className="text-center text-sm text-muted-foreground py-8">No engines match your filters.</p>}
      </div>
    </div>
  );
}

function SkillAtlasTab() {
  const [selected, setSelected] = useState<string>("");

  const { data, isLoading } = useQuery<SkillAtlasResponse>({
    queryKey: ["/api/system-brain/skills"],
    queryFn: async () => {
      const res = await fetch("/api/system-brain/skills", { credentials: "include" });
      return res.json();
    },
  });

  const skills = selected && data?.atlas ? (data.atlas[selected] ?? []) : [];
  const sortedSkills = [...skills].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  if (isLoading) return <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading skill atlas…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger data-testid="select-skill-complaint" className="max-w-xs">
            <SelectValue placeholder="Select a complaint…" />
          </SelectTrigger>
          <SelectContent>
            {(data?.complaints ?? []).map((c) => (
              <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && <span className="text-sm text-muted-foreground">{skills.length} skills required</span>}
      </div>

      {!selected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.complaints ?? []).map((complaint) => {
            const cSkills = data?.atlas[complaint] ?? [];
            const critCount = cSkills.filter((s) => s.priority === "critical").length;
            return (
              <button key={complaint} data-testid={`skill-card-${complaint}`}
                onClick={() => setSelected(complaint)}
                className="p-3 rounded-lg border text-left hover:bg-muted/50 transition-colors">
                <div className="font-medium text-sm">{complaint.replace(/_/g, " ")}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{cSkills.length} skills</span>
                  {critCount > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700">{critCount} critical</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && sortedSkills.length > 0 && (
        <div className="space-y-2">
          {sortedSkills.map((skill) => (
            <div key={skill.skill} data-testid={`skill-item-${skill.skill}`}
              className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{skill.skill}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[skill.priority]}`}>{skill.priority}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                </div>
              </div>
              {skill.relatedEngines.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {skill.relatedEngines.map((e) => (
                    <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono">{e}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentAtlasTab() {
  const AGENTS = [
    { name: "ClinicalBrainAgent", role: "Master orchestrator — sequences all registered engines through the pipeline", engines: ["clinicalBrainOrchestrator", "engineRegistryManager", "skillGraphEngine", "protocolSelectionEngine"] },
    { name: "ConversationAgent", role: "Controls tone, pacing, and question strategy for messaging channels", engines: ["toneStrategyEngine", "conversationCompressionEngine", "nextBestQuestionEngine", "summaryEngine"] },
    { name: "DiagnosticAgent", role: "Runs the multi-engine differential diagnosis pipeline", engines: ["bayesianDifferentialEngine", "caseSimilarityEngine", "clusterScoringEngine", "confidenceCalibrationEngine"] },
    { name: "SafetyAgent", role: "Runs all safety screens before any disposition is issued", engines: ["redFlagEngine", "sepsisAlertEngine", "strokeAlertEngine", "miAlertEngine", "riskThresholdEngine"] },
    { name: "PhysicianInterfaceAgent", role: "Handles physician review, overrides, sign-off workflow, and audit trail", engines: ["physicianOverrideEngine", "goldenCaseTrainer", "auditTrailEngine", "physicianApprovalEngine"] },
    { name: "LearningAgent", role: "Collects outcome data and propagates corrections back to the reasoning pipeline", engines: ["physicianCorrectionLearning", "outcomeReinforcementEngine", "questionImpactLearning", "clinicalMemoryEngine"] },
    { name: "MessagingAgent", role: "Manages WhatsApp and Telegram channels with compression and channel-specific formatting", engines: ["conversationCompressionEngine", "languageSimplifier", "conversationStateTracker", "followUpQuestionEngine"] },
    { name: "SystemReviewAgent", role: "Periodic architecture review, improvement suggestions, and health monitoring", engines: ["systemReviewEngine", "architectureReviewEngine", "performanceMonitorEngine", "apiHealthMonitor"] },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {AGENTS.map((agent) => (
        <Card key={agent.name} data-testid={`agent-card-${agent.name}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              {agent.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{agent.role}</p>
            <div className="flex flex-wrap gap-1">
              {agent.engines.map((e) => (
                <span key={e} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-mono border border-violet-200 dark:border-violet-800">{e}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IntegrationAtlasTab() {
  const INTEGRATIONS = [
    { name: "Telegram", icon: "📱", purpose: "Patient intake via sequential chat + Mini App forms", status: "live", improvement: "Mini App form batching — send all symptom questions in one form instead of sequential messages" },
    { name: "WhatsApp", icon: "💬", purpose: "Patient triage via interactive messages and WhatsApp Flows", status: "live", improvement: "Compress multi-question steps using conversation compression engine to reduce abandonment" },
    { name: "OpenAI GPT-4o", icon: "🤖", purpose: "LLM explanation generation, chart sections, and clinical reasoning", status: "live", improvement: "Cache similar-complaint explanations — 30%+ of requests are near-duplicate, avg 1.8s latency" },
    { name: "Firestore", icon: "🔥", purpose: "Primary case storage, conversation state, audit logs, golden cases", status: "live", improvement: "Add composite indexes on complaintId + severity for queue queries — currently full table scan" },
    { name: "Google Sheets", icon: "📊", purpose: "Triage question configuration and clinical rule storage", status: "live", improvement: "Add cache invalidation webhook — changes take up to 5 min to reflect via TTL polling" },
    { name: "ECW / eClinicalWorks", icon: "🏥", purpose: "EHR sidecar export of completed triage encounters", status: "live", improvement: "FHIR resource batching — currently one resource per request, should batch per encounter" },
    { name: "Twilio", icon: "📞", purpose: "WhatsApp Business API message delivery", status: "live", improvement: "Add delivery receipt webhooks to detect failed messages and retry with SMS fallback" },
    { name: "Pinecone", icon: "🔍", purpose: "Case embedding vector store for similarity search", status: "live", improvement: "Periodic re-indexing as case volumes grow — vector freshness degrades after ~10k new cases" },
    { name: "LangChain", icon: "⛓️", purpose: "Clinical tool orchestration and chain execution", status: "live", improvement: "Add streaming support — chain results can be streamed to frontend as tokens arrive" },
    { name: "Microsoft Agent Framework", icon: "🪟", purpose: "Multi-agent async task orchestration with job queue", status: "live", improvement: "Persistent job store — current in-memory queue loses jobs on server restart" },
  ];

  const statusColor = (s: string) => s === "live" ? "bg-emerald-100 text-emerald-800" : s === "partial" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {INTEGRATIONS.map((i) => (
        <div key={i.name} data-testid={`integration-card-${i.name}`} className="rounded-lg border p-4 bg-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{i.icon}</span>
              <span className="font-semibold text-sm">{i.name}</span>
            </div>
            <Badge className={`text-[10px] px-2 ${statusColor(i.status)}`}>{i.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{i.purpose}</p>
          <div className="mt-2 rounded-md bg-muted/50 p-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Improvement Idea</div>
            <p className="text-xs">{i.improvement}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemReviewTab() {
  const { toast } = useToast();
  const [result, setResult] = useState<SystemReviewResult | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/system-brain/review");
      return (res as any).json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Review complete", description: `Health score: ${data.healthScore}%` });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  const { data: preloaded, isLoading } = useQuery<SystemReviewResult>({
    queryKey: ["/api/system-brain/review"],
    queryFn: async () => {
      const res = await fetch("/api/system-brain/review", { credentials: "include" });
      return res.json();
    },
  });

  const display = result ?? preloaded;

  const effortColor: Record<string, string> = { small: "text-emerald-600", medium: "text-amber-600", large: "text-red-600" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Architecture Review</h3>
          {display?.reviewedAt && <p className="text-xs text-muted-foreground">Last reviewed: {new Date(display.reviewedAt).toLocaleString()}</p>}
        </div>
        <Button data-testid="button-run-review" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending} className="gap-2">
          {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run Review
        </Button>
      </div>

      {isLoading && !display && (
        <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />Loading…
        </div>
      )}

      {display && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Engines", value: display.totalEngines, icon: <Brain className="w-4 h-4 text-blue-500" /> },
              { label: "Active", value: display.activeEngines, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
              { label: "Stubs", value: display.stubEngines, icon: <CircleDashed className="w-4 h-4 text-amber-400" /> },
              { label: "Planned", value: display.plannedEngines, icon: <AlertCircle className="w-4 h-4 text-slate-400" /> },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-3 pb-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{s.icon}<span className="text-xs">{s.label}</span></div>
                  <div className="text-2xl font-bold">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Platform Health Score</span>
              <span className="font-bold">{display.healthScore}%</span>
            </div>
            <HealthBar score={display.healthScore} />
            <p className="text-xs text-muted-foreground">Based on ratio of active to total engines. Target: 80%+</p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Improvement Suggestions ({display.suggestions.length})</h4>
            <div className="space-y-2">
              {display.suggestions.map((s, i) => (
                <div key={i} data-testid={`suggestion-${i}`} className="rounded-lg border p-3 bg-card space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={`text-[10px] px-1.5 ${PRIORITY_COLORS[s.priority]}`}>{s.priority}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">{s.module}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium ${effortColor[s.effort] ?? ""}`}>{EFFORT_LABELS[s.effort]}</span>
                      {s.status !== "pending" && <Badge variant="outline" className="text-[10px] px-1.5">{s.status}</Badge>}
                    </div>
                  </div>
                  <p className="text-sm font-medium">{s.suggestion}</p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EngineAtlasDashboard() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5" data-testid="page-engine-atlas">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-blue-500" />
            Clinical Brain Control Tower
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete atlas of all 100 engines, skills, agents, integrations, and system health across 6 architectural layers
          </p>
        </div>
      </div>

      <Tabs defaultValue="engines" data-testid="tabs-engine-atlas">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="engines" data-testid="tab-engines" className="gap-1.5"><Layers className="w-3.5 h-3.5" />Engines</TabsTrigger>
          <TabsTrigger value="skills" data-testid="tab-skills" className="gap-1.5"><Search className="w-3.5 h-3.5" />Skills</TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents" className="gap-1.5"><Users className="w-3.5 h-3.5" />Agents</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations" className="gap-1.5"><Plug2 className="w-3.5 h-3.5" />Integrations</TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />System Review</TabsTrigger>
        </TabsList>

        <TabsContent value="engines" className="mt-5"><EngineAtlasTab /></TabsContent>
        <TabsContent value="skills" className="mt-5"><SkillAtlasTab /></TabsContent>
        <TabsContent value="agents" className="mt-5"><AgentAtlasTab /></TabsContent>
        <TabsContent value="integrations" className="mt-5"><IntegrationAtlasTab /></TabsContent>
        <TabsContent value="review" className="mt-5"><SystemReviewTab /></TabsContent>
      </Tabs>
    </div>
  );
}
