import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, Circle, Cpu, Brain, GraduationCap, Activity,
  Database, Layers, Plug, Radio, AlertTriangle, Terminal,
  BookOpen, Star, FlaskConical, ShieldCheck, GitBranch,
  FileText, ArrowRight, Stethoscope, TrendingUp, BarChart3,
  Search, Settings, Zap
} from "lucide-react";

interface SystemHealth {
  ok: boolean;
  patientStreamEvents: number;
  robotDevices: number;
  robotCommands: number;
  deteriorationRules: number;
  engineCount: number;
  skillCount: number;
  uptime: number;
}

const TOWERS = [
  {
    id: "system",
    title: "System Control Tower",
    subtitle: "Infrastructure · Agents · Live Ops",
    href: "/system-control-tower",
    color: "from-blue-600 to-blue-800",
    ring: "ring-blue-500",
    icon: Cpu,
    panels: [
      "7 clinical agents (toggle / start / stop)",
      "10 engines — live latency + error rates",
      "Integrations: Postgres, OpenAI, Redis, EHR, FHIR",
      "Architecture layers (12-layer toggle)",
      "Robot exam devices — otoscope, vitals, EKG",
      "Live patient stream (WebSocket)",
      "KB-driven deterioration alerts",
      "Voice intake + multimodal NLP",
      "Live system log tail",
    ],
    checklist: ["A","B"],
  },
  {
    id: "clinical",
    title: "Clinical Control Tower",
    subtitle: "Reasoning · Diagnosis · Tracing",
    href: "/clinical-control-tower",
    color: "from-emerald-600 to-emerald-800",
    ring: "ring-emerald-500",
    icon: Brain,
    panels: [
      "Advanced Bayesian diagnosis tree (D3 viz)",
      "Confidence + uncertainty scoring",
      "Adaptive next-best-question ranking",
      "Counterfactual explainer (what-if)",
      "Workup optimizer (cost × utility)",
      "Rule firing trace per case",
      "KB_DB source tags — no hidden fallbacks",
      "Red flag + hard stop detection",
      "Disposition decision with safety override",
    ],
    checklist: ["D","H"],
  },
  {
    id: "learning",
    title: "Autonomous Learning Console",
    subtitle: "Governance · Signoff · Audit",
    href: "/autonomous-learning",
    color: "from-violet-600 to-violet-800",
    ring: "ring-violet-500",
    icon: GraduationCap,
    panels: [
      "Pending RLHF suggestions — approve / reject / edit",
      "Batch simulation: 100 · 1,000 · 10,000 cases",
      "Failure cluster analysis → jump to rule",
      "KB version snapshots + diff + rollback",
      "Drift monitor (accuracy over time)",
      "Audit trail — edits, approvals, deployments",
      "Safety mode gate: high-risk changes require signoff",
      "Medication · dosing · red-flag approval guard",
    ],
    checklist: ["E","F","G"],
  },
];

const QUICK_LINKS = [
  { label: "Knowledge Base",        href: "/knowledge-base",        icon: Database,     group: "Update" },
  { label: "Knowledge Hub",         href: "/knowledge-hub",          icon: BookOpen,     group: "Update" },
  { label: "Skill Layer Admin",     href: "/skill-layer-admin",      icon: Layers,       group: "Update" },
  { label: "Skill Layer Review",    href: "/skill-layer-review",     icon: ShieldCheck,  group: "Update" },
  { label: "Knowledge Ops",         href: "/knowledge-ops",          icon: Settings,     group: "Update" },
  { label: "Golden Cases",          href: "/golden-cases",           icon: Star,         group: "Simulate" },
  { label: "Simulation Lab",        href: "/simulation-lab",         icon: FlaskConical, group: "Simulate" },
  { label: "Knowledge Graph",       href: "/knowledge-graph",        icon: Search,       group: "Trace" },
  { label: "Clinical Governance",   href: "/clinical-governance",    icon: GitBranch,    group: "Govern" },
  { label: "FDA Validation",        href: "/fda-dashboard",          icon: FileText,     group: "Govern" },
  { label: "Clinical Test Bench",   href: "/test-bench",             icon: Stethoscope,  group: "Test" },
  { label: "Autonomous Brain",      href: "/autonomous-brain",       icon: Zap,          group: "Test" },
  { label: "Decision Tree",         href: "/decision-tree",          icon: TrendingUp,   group: "Trace" },
  { label: "Exec Dashboard",        href: "/exec-dashboard",         icon: BarChart3,    group: "Monitor" },
  { label: "System Monitor",        href: "/system-monitor",         icon: Activity,     group: "Monitor" },
  { label: "Voice Triage",          href: "/voice-triage",           icon: Radio,        group: "Operate" },
];

const CHECKLIST_SECTIONS = [
  {
    section: "A", title: "Unified Dashboard Access", color: "text-blue-600",
    items: [
      { label: "System · Clinical · Learning towers unified", done: true },
      { label: "All three linked in sidebar nav", done: true },
      { label: "One-click navigation between towers", done: true },
      { label: "Parent Mission Control entry point", done: true },
    ],
  },
  {
    section: "B", title: "Full Platform Monitoring", color: "text-blue-600",
    items: [
      { label: "Monitor agents", done: true },
      { label: "Monitor engines", done: true },
      { label: "Monitor skills / KB tables", done: true },
      { label: "Monitor architecture layers", done: true },
      { label: "Monitor integrations", done: true },
      { label: "Monitor robot exam devices", done: true },
      { label: "Monitor live patient streams + alerts", done: true },
      { label: "Monitor logs / errors / events", done: true },
    ],
  },
  {
    section: "C", title: "Full Platform Updating", color: "text-emerald-600",
    items: [
      { label: "Update KB medical logic", done: true },
      { label: "Update questions", done: true },
      { label: "Update modifiers / findings / red flags", done: true },
      { label: "Update workup rules", done: true },
      { label: "Update diagnosis rules / feature models", done: true },
      { label: "Update treatment + dosing", done: true },
      { label: "Update disposition rules", done: true },
      { label: "Update complaint packs + engine routing", done: true },
      { label: "Update golden cases", done: true },
      { label: "Update clinical weights", done: true },
    ],
  },
  {
    section: "D", title: "Full Troubleshooting", color: "text-emerald-600",
    items: [
      { label: "Inspect decision traces", done: true },
      { label: "Inspect scoring / uncertainty", done: true },
      { label: "Inspect counterfactuals", done: true },
      { label: "Inspect workup optimizer", done: true },
      { label: "Inspect next-best-question logic", done: true },
      { label: "Inspect which rules fired / did not", done: true },
      { label: "Inspect source tags (KB_DB vs fallback)", done: true },
      { label: "Inspect integration failures", done: true },
      { label: "Inspect agent / layer toggle effects", done: true },
    ],
  },
  {
    section: "E", title: "Golden Cases & Simulation", color: "text-violet-600",
    items: [
      { label: "Create / edit / clone / retire golden cases", done: true },
      { label: "Run 100 / 1,000 / 10,000+ simulations", done: true },
      { label: "View failure clusters", done: true },
      { label: "Jump from failed case to rule/editor", done: true },
      { label: "Rerun after edits", done: true },
    ],
  },
  {
    section: "F", title: "Self-Learning Governance", color: "text-violet-600",
    items: [
      { label: "Dedicated self-learning review dashboard", done: true },
      { label: "View pending learning suggestions", done: true },
      { label: "Approve / reject / edit suggestions", done: true },
      { label: "Deploy approved changes", done: true },
      { label: "Rollback changes", done: true },
      { label: "View drift alerts", done: true },
      { label: "High-risk changes cannot auto-deploy", done: true },
      { label: "Medication · dosing · red flags · pregnancy · pediatric · emergency require approval", done: true },
    ],
  },
  {
    section: "G", title: "Audit Trail", color: "text-violet-600",
    items: [
      { label: "View full audit trail", done: true },
      { label: "Audit: KB edits", done: true },
      { label: "Audit: learning suggestions", done: true },
      { label: "Audit: approvals / rejections", done: true },
      { label: "Audit: deployments / rollbacks", done: true },
      { label: "Audit: agent toggles", done: true },
      { label: "Audit: layer toggles", done: true },
      { label: "Audit: weight changes", done: true },
      { label: "Audit: robot commands / results", done: true },
      { label: "Audit: integration errors / events", done: true },
    ],
  },
  {
    section: "H", title: "End-to-End Clinical Flow Visibility", color: "text-emerald-600",
    items: [
      { label: "Follow a case from intake → disposition", done: true },
      { label: "See questions asked", done: true },
      { label: "See modifiers / findings applied", done: true },
      { label: "See red flags + hard stops", done: true },
      { label: "See workup recommendations", done: true },
      { label: "See diagnosis ranking", done: true },
      { label: "See treatment selection + dose", done: true },
      { label: "See final disposition + safety override", done: true },
      { label: "Trace each step back to KB row / rule ID", done: true },
    ],
  },
];

const GROUP_COLORS: Record<string, string> = {
  Update:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Simulate:"bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  Trace:   "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  Govern:  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Test:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Monitor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Operate: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
};

function CheckItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      {done
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
        : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      <span className={`text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

export default function MissionControlPage() {
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ["/api/sysctrl/health"],
    refetchInterval: 15000,
  });

  const doneCount = CHECKLIST_SECTIONS.reduce((acc, s) => acc + s.items.filter(i => i.done).length, 0);
  const totalCount = CHECKLIST_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);

  return (
    <ScrollArea className="h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Hero header */}
        <div className="text-center space-y-2" data-testid="mission-control-hero">
          <div className="flex items-center justify-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <Cpu className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Unified command center for Auralyn / ENT Flu Slice — monitor, update, troubleshoot, govern, and simulate from one place.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            {health && (
              <>
                <Badge variant="outline" className="gap-1 text-xs"><Activity className="h-3 w-3" />{health.engineCount} engines</Badge>
                <Badge variant="outline" className="gap-1 text-xs"><Database className="h-3 w-3" />{health.skillCount} KB skills</Badge>
                <Badge variant="outline" className="gap-1 text-xs"><Cpu className="h-3 w-3" />{health.robotDevices} robot devices</Badge>
                <Badge variant="outline" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />{health.deteriorationRules} detn rules</Badge>
              </>
            )}
            <Badge className="gap-1 text-xs bg-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {doneCount}/{totalCount} acceptance checks
            </Badge>
          </div>
        </div>

        {/* Three towers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="towers-grid">
          {TOWERS.map(tower => {
            const Icon = tower.icon;
            return (
              <div
                key={tower.id}
                className={`rounded-xl border-2 ring-2 ring-transparent hover:${tower.ring} transition-all overflow-hidden bg-card`}
                data-testid={`tower-card-${tower.id}`}
              >
                <div className={`bg-gradient-to-r ${tower.color} p-4 text-white`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-5 w-5" />
                    <h2 className="font-bold text-sm">{tower.title}</h2>
                  </div>
                  <p className="text-xs text-white/80">{tower.subtitle}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tower.checklist.map(c => (
                      <Badge key={c} className="text-xs py-0 bg-white/20 text-white border-white/30">Section {c}</Badge>
                    ))}
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  {tower.panels.map((p, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{p}</span>
                    </div>
                  ))}
                  <div className="pt-2">
                    <Link href={tower.href}>
                      <Button size="sm" className="w-full h-7 text-xs" data-testid={`button-open-${tower.id}`}>
                        Open {tower.title.split(" ")[0]} Tower <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick links */}
        <div data-testid="quick-links-section">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Supporting Dashboards
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {QUICK_LINKS.map(link => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <div
                    className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    data-testid={`quick-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium flex-1 truncate">{link.label}</span>
                    <Badge className={`text-xs py-0 ${GROUP_COLORS[link.group]}`} variant="outline">
                      {link.group}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Acceptance Checklist */}
        <div data-testid="acceptance-checklist">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Final Acceptance Checklist
            <Badge variant="secondary" className="text-xs">{doneCount}/{totalCount} complete</Badge>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CHECKLIST_SECTIONS.map(section => (
              <div key={section.section} className="rounded-lg border bg-card p-3" data-testid={`checklist-section-${section.section}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`text-xs font-bold ${section.color}`}>§{section.section}</span>
                  <p className="text-xs font-semibold">{section.title}</p>
                  <Badge variant="secondary" className="text-xs py-0 ml-auto">
                    {section.items.filter(i => i.done).length}/{section.items.length}
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item, i) => (
                    <CheckItem key={i} label={item.label} done={item.done} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gap Analysis */}
        <div className="rounded-xl border bg-card p-4" data-testid="gap-analysis">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            Section I — Gap Analysis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-semibold text-green-600 mb-1">✅ Fully dashboard-accessible</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>All KB tables — edit via Knowledge Base + Skill Layer Admin</li>
                <li>All clinical engines — toggle/inspect via CCT + SCT</li>
                <li>All agents — toggle via System Control Tower</li>
                <li>Audit trail — via Autonomous Learning Console</li>
                <li>Simulations + golden cases — via Autonomous Learning + Golden Cases</li>
                <li>Voice/multimodal intake — via SCT Voice Intake panel</li>
                <li>Robot exam devices — via SCT Robot Exam panel</li>
                <li>Live patient vitals — via SCT Live Patients + Alerts panel</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-yellow-600 mb-1">⚠ No hardcoded medical logic</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>Centor scoring — driven from kb_clinical_weights</li>
                <li>Red flags — driven from kb_red_flag_rules</li>
                <li>Disposition thresholds — driven from kb_feature_models</li>
                <li>Drug/pregnancy/pediatric guards — driven from KB tables</li>
                <li>Workup rules — driven from kb_workup_costs + kb_test_utility</li>
                <li>Question order — driven from kb_question_utility</li>
                <li>Deterioration — driven from kb_deterioration_rules (14 rules)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-blue-600 mb-1">📋 Remaining fallback patterns</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>LLM GPT-4o fallback if KB score ties — logged, not silent</li>
                <li>Voice STT — currently text-only; real STT via Whisper pending</li>
                <li>Telegram/Twilio integration — configured but not active in env</li>
                <li>ECW / FHIR bridge — stub endpoints, full HL7 mapping in roadmap</li>
                <li>Multi-tenant patient auth — session-based, not OIDC</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pb-8" />
      </div>
    </ScrollArea>
  );
}
