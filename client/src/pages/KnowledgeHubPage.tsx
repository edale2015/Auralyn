import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Database, FlaskConical, Shield, Target, Network,
  RefreshCw, CheckCircle2, AlertCircle, ArrowRight,
  ClipboardList, Stethoscope, Pill, Zap, Activity, Settings,
  Eye, BarChart3, BookOpen, MessageCircle, Cpu, ClipboardCheck,
  Smartphone,
} from "lucide-react";

interface CacheStatus {
  priors: { count: number; ageMs: number };
  redFlags: { count: number; ageMs: number };
  treatments: { count: number; ageMs: number };
  ttlMs: number;
}

interface KbStats {
  complaints?: number;
  questions?: number;
  redFlags?: number;
  diagnosisRules?: number;
  treatmentRules?: number;
  dispositionRules?: number;
  goldenCases?: number;
  changes?: number;
}

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-3 rounded-lg ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs mt-0.5 opacity-80">{label}</span>
    </div>
  );
}

const HUB_LINKS = [
  {
    href: "/knowledge-base",
    icon: Database,
    title: "KB Admin — 11 Tables",
    description: "Full CRUD for complaints, questions, red flags, diagnosis rules, treatment rules, disposition rules, modifiers, workup rules, templates, golden cases, and change log.",
    badge: "Primary Editor",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    tabs: ["Complaints", "Questions", "Red Flags", "Diagnosis Rules", "Treatment Rules", "Disposition Rules", "Modifiers", "Workup", "Templates", "Golden Cases", "Change Log"],
  },
  {
    href: "/golden-cases",
    icon: Target,
    title: "Golden Cases",
    description: "Create, edit, clone, and export reference cases that drive regression testing and monitor pipeline accuracy. Each case has expected diagnosis, disposition, and symptom set.",
    badge: "Validation",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    tabs: [],
  },
  {
    href: "/knowledge-ops",
    icon: BarChart3,
    title: "KB Ops Dashboard",
    description: "Coverage stats, source-map, domain health checklist, and a how-to guide for KB editors. Shows which clinical domains have editable rules in Postgres vs hardcoded fallbacks.",
    badge: "Ops",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    tabs: [],
  },
  {
    href: "/skill-layer-admin",
    icon: Settings,
    title: "Platform Admin 2.x",
    description: "Skill layer management — deployment readiness, release gates, rule governance editor, complaint rollout manager, golden case auto-generator, and explainability scoring.",
    badge: "Admin",
    badgeColor: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300",
    tabs: [],
  },
  {
    href: "/skill-layer-review",
    icon: Eye,
    title: "Clinician Review",
    description: "Clinical decision review interface. Runs a live triage session, shows differentials, red flags, chart notes, discharge instructions, audit trace, and allows outcome recording.",
    badge: "Clinical",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    tabs: [],
  },
  {
    href: "/knowledge-graph",
    icon: Network,
    title: "Clinical Knowledge Graph",
    description: "Interactive graph of complaints → symptoms → diagnoses → dispositions. Explore coverage gaps, upload batch data, view audit history, and run safety checks.",
    badge: "Explorer",
    badgeColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    tabs: [],
  },
  {
    href: "/kb-explorer",
    icon: BookOpen,
    title: "KB Protocol Explorer",
    description: "Deep-dive into every complaint protocol: 7 tabs covering questions (734), diagnoses (617), red flags (272), disposition rules (289), workup tests, medications, and discharge plans.",
    badge: "New",
    badgeColor: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
    tabs: ["Overview", "Questions", "Diagnoses", "Decision Tree", "Workup / Tests", "Medications", "Discharge Plan"],
  },
  {
    href: "/gold-reviews",
    icon: ClipboardCheck,
    title: "Gold Review Workbench",
    description: "Physician clinical review interface for producing canonical gold-standard responses: top diagnosis, disposition, must-ask questions, workup, medications to consider or avoid, and red flags.",
    badge: "Clinical",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    tabs: [],
  },
  {
    href: "/conversation-optimization",
    icon: MessageCircle,
    title: "AI Conversation Audit",
    description: "Review AI-patient exchanges for tone, empathy, completeness, and safety. Audit transcripts, apply coaching goals (de-escalation, clarity, engagement), and generate optimized rewrites.",
    badge: "Patient AI",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    tabs: ["Audit", "Tone Optimizer", "Coaching"],
  },
  {
    href: "/system-ops-grid",
    icon: Cpu,
    title: "System Ops Grid",
    description: "Real-time operations matrix — clinical engine health, queue depths, scheduler status, memory system, multi-tenant orchestration, and adaptive intelligence. Admin-only.",
    badge: "Ops",
    badgeColor: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300",
    tabs: [],
  },
  {
    href: "/compact-intake",
    icon: Smartphone,
    title: "Compact Patient Intake",
    description: "Structured patient-facing intake form — complaint selector, safety toggles, severity slider, duration radio, and symptom checkboxes. Telegram/WhatsApp-optimized. Minimal scrolling.",
    badge: "Patient UI",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    tabs: [],
  },
];

const QUICK_ACTIONS = [
  { label: "Test Differential", href: "/test-bench", icon: FlaskConical, desc: "Run a clinical scenario through the Bayesian engine" },
  { label: "Decision Tree", href: "/decision-tree", icon: Brain, desc: "Explore the decision logic visually" },
  { label: "Autonomous Learning", href: "/autonomous-learning", icon: Activity, desc: "Drift monitor, RLHF queue, simulation lab" },
  { label: "Pack Builder", href: "/pack-builder", icon: ClipboardList, desc: "Build and simulate complaint packs" },
  { label: "Formulary", href: "/formulary", icon: Pill, desc: "View medication safety rules" },
  { label: "Clinical Validation", href: "/clinical-validation", icon: Stethoscope, desc: "Run the clinical validation suite" },
  { label: "KB Explorer", href: "/kb-explorer", icon: BookOpen, desc: "Browse all 78 complaint protocols across 7 tabs" },
  { label: "Gold Reviews", href: "/gold-reviews", icon: ClipboardCheck, desc: "Physician canonical response workbench" },
  { label: "Conversation Audit", href: "/conversation-optimization", icon: MessageCircle, desc: "Review and improve AI-patient exchanges" },
  { label: "Compact Intake", href: "/compact-intake", icon: Smartphone, desc: "Structured patient intake — no free text" },
];

export default function KnowledgeHubPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: cache, isLoading: cacheLoading } = useQuery<CacheStatus>({
    queryKey: ["/api/kb/cache-status"],
    refetchInterval: 30_000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<KbStats>({
    queryKey: ["/api/kb/stats"],
  });

  const reloadMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/cache-reload"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/cache-status"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/stats"] });
      toast({ title: "Cache reloaded", description: "All clinical rules refreshed from database." });
    },
    onError: () => toast({ title: "Reload failed", variant: "destructive" }),
  });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/seed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/cache-status"] });
      toast({ title: "Knowledge base seeded", description: "All tables populated including 12 Bayesian core priors." });
    },
    onError: () => toast({ title: "Seed failed", variant: "destructive" }),
  });

  const cacheAgeS = cache ? Math.round((cache.priors.ageMs) / 1000) : null;
  const cacheFresh = cacheAgeS !== null && cacheAgeS < 60;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-blue-600" />
            Clinical Knowledge Hub
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            All medical decision-making tables, golden cases, and skills management — in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reloadMut.mutate()}
            disabled={reloadMut.isPending}
            data-testid="button-reload-cache"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${reloadMut.isPending ? "animate-spin" : ""}`} />
            Reload Cache
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            data-testid="button-seed-kb"
          >
            <Database className="h-4 w-4 mr-1" />
            {seedMut.isPending ? "Seeding…" : "Seed KB"}
          </Button>
        </div>
      </div>

      {/* Runtime Cache Status */}
      <Card data-testid="card-cache-status">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Live Runtime Cache
            {!cacheLoading && cache && (
              <Badge className={cacheFresh ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {cacheFresh ? "Fresh" : `${cacheAgeS}s old`}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cacheLoading ? (
            <p className="text-sm text-muted-foreground">Loading cache status…</p>
          ) : cache ? (
            <div className="flex flex-wrap gap-3">
              <StatPill label="Bayesian Priors" value={cache.priors.count} color="bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200" />
              <StatPill label="Red Flag Rules" value={cache.redFlags.count} color="bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200" />
              <StatPill label="Treatment Rules" value={cache.treatments.count} color="bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-200" />
              <div className="flex flex-col justify-center ml-2 text-xs text-muted-foreground">
                <span>TTL: {Math.round((cache.ttlMs ?? 0) / 1000)}s</span>
                <span className="mt-0.5">Cache age: {cacheAgeS}s</span>
                <span className="mt-0.5 text-green-600">Auto-reloads on every KB write</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              Cache unavailable
            </div>
          )}
        </CardContent>
      </Card>

      {/* DB Stats */}
      {!statsLoading && stats && (
        <Card data-testid="card-kb-stats">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              Knowledge Base — Database Row Counts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {stats.complaints != null && <StatPill label="Complaints" value={stats.complaints} color="bg-slate-50 text-slate-900 dark:bg-slate-800/40 dark:text-slate-200" />}
              {stats.questions != null && <StatPill label="Questions" value={stats.questions} color="bg-slate-50 text-slate-900 dark:bg-slate-800/40 dark:text-slate-200" />}
              {stats.redFlags != null && <StatPill label="Red Flags" value={stats.redFlags} color="bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200" />}
              {stats.diagnosisRules != null && <StatPill label="Diagnosis Rules" value={stats.diagnosisRules} color="bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200" />}
              {stats.treatmentRules != null && <StatPill label="Treatment Rules" value={stats.treatmentRules} color="bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-200" />}
              {stats.dispositionRules != null && <StatPill label="Disposition Rules" value={stats.dispositionRules} color="bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-200" />}
              {stats.goldenCases != null && <StatPill label="Golden Cases" value={stats.goldenCases} color="bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200" />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Hub Links */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Knowledge Management Sections
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {HUB_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card
                  className="h-full hover:shadow-md transition-shadow cursor-pointer border-border hover:border-blue-300 dark:hover:border-blue-700"
                  data-testid={`card-hub-${link.href.replace(/\//g, "-")}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-base">{link.title}</CardTitle>
                      </div>
                      <Badge className={`text-xs shrink-0 ${link.badgeColor}`}>{link.badge}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{link.description}</p>
                    {link.tabs.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {link.tabs.map((t) => (
                          <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center text-xs text-blue-600 font-medium mt-1">
                      Open <ArrowRight className="h-3 w-3 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Related Tools
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href}>
                <div
                  className="flex flex-col items-center text-center p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-blue-300 transition-colors cursor-pointer"
                  data-testid={`quick-action-${a.href.replace(/\//g, "-")}`}
                >
                  <Icon className="h-6 w-6 text-blue-500 mb-2" />
                  <span className="text-xs font-medium">{a.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 leading-tight">{a.desc}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bayesian Priors info */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <CheckCircle2 className="h-4 w-4" />
            Bayesian Engine — KB-Driven (Verified)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All 12 core clinical priors (Influenza A, COVID-19, Strep Pharyngitis, Viral URI, Sinusitis,
            Otitis Media, Pneumonia, Allergic Rhinitis, Rotator Cuff, Shoulder Dislocation, AC Joint,
            Cervical Radiculopathy) are stored in the <strong>Diagnosis Rules</strong> table under
            complaint ID <code className="text-xs bg-muted px-1 py-0.5 rounded">bayesian_global</code>.
            Editing a rule's probability or feature likelihoods auto-reloads the cache and immediately
            affects live differential rankings — no code deploy needed.
          </p>
          <div className="flex gap-2 mt-3">
            <Link href="/knowledge-base">
              <Button size="sm" variant="outline" data-testid="button-edit-bayesian-priors">
                <Database className="h-3.5 w-3.5 mr-1" />
                Edit Priors in KB Admin
              </Button>
            </Link>
            <Link href="/test-bench">
              <Button size="sm" variant="outline" data-testid="button-test-differential">
                <FlaskConical className="h-3.5 w-3.5 mr-1" />
                Test Differential
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
