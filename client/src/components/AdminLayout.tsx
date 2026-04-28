import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Stethoscope, LogOut, LayoutDashboard, BarChart3, Shield, Activity,
  ClipboardCheck, Zap, FileCheck, Package, Bell, Building, Pill,
  MessageSquare, Bot, Cpu, Sparkles, GitBranch, Rocket, Gauge,
  FlaskConical, Eye, AlertTriangle, Users, Settings, Search,
  TrendingUp, Layers, HeartPulse, Lightbulb, Video, Globe,
  ClipboardList, LineChart, Code2, MessageCircle, Building2,
  BrainCircuit, MapPin, Brain, Lock, Target, Microscope, Network, Radar, ShieldCheck,
  CircleDollarSign, Database, Grid3X3, Shuffle, Landmark, BookOpen, Smartphone,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Clinical Operations",
    items: [
      { path: "/telemedicine", label: "Visit Copilot", icon: Video },
      { path: "/telemed-doctor-dashboard", label: "Doctor Dashboard", icon: BrainCircuit },
      { path: "/rapid-telemed", label: "Rapid Telemed Console", icon: Zap },
      { path: "/telemed-split", label: "Split Pane (Telegram/WA)", icon: Zap },
      { path: "/acceptance-sla", label: "Acceptance + SLA Dashboard", icon: Zap },
      { path: "/recommendation-analytics", label: "Template Recommendations", icon: Zap },
      { path: "/operations-cockpit",  label: "Operations Cockpit",          icon: Zap },
      { path: "/clinical-cockpit",   label: "Telemedicine Cockpit",        icon: Stethoscope },
      { path: "/production-readiness", label: "Production Readiness", icon: Zap },
      { path: "/billing-intelligence", label: "Billing Intelligence", icon: CircleDollarSign },
      { path: "/revenue-war-room", label: "Revenue War Room", icon: Landmark },
      { path: "/architectural-compliance", label: "Architectural Compliance", icon: ShieldCheck },
      { path: "/moat-intelligence", label: "Moat Intelligence", icon: Shield },
      { path: "/executive-command", label: "Executive Command", icon: Cpu },
      { path: "/ehr-dead-letter", label: "EHR Dead Letter Review", icon: Zap },
      { path: "/reminder-timeline", label: "Reminder Timeline", icon: Zap },
      { path: "/multilingual-templates", label: "Multilingual Templates", icon: Zap },
      { path: "/complaint-control-center", label: "Complaint Control Center", icon: LayoutDashboard },
      { path: "/review-queue-v2", label: "Review Queue", icon: ClipboardCheck },
      { path: "/complaint-qa", label: "Complaint QA", icon: BarChart3 },
      { path: "/clinical-qa", label: "Clinical QA Dashboard", icon: FlaskConical },
      { path: "/clinical-validation", label: "Clinical Validation", icon: HeartPulse },
      { path: "/clinical-workflow-health", label: "Workflow Health", icon: Activity },
    ],
  },
  {
    label: "Diagnostics & Scoring",
    items: [
      { path: "/next-best-question", label: "Next Best Question", icon: Zap },
      { path: "/override-patterns", label: "Override Patterns", icon: TrendingUp },
      { path: "/question-gaps", label: "Question Gaps", icon: Search },
      { path: "/decision-graphs", label: "Decision Graphs", icon: GitBranch },
      { path: "/decision-graph-heatmaps", label: "Graph Heatmaps", icon: Layers },
    ],
  },
  {
    label: "Medications",
    items: [
      { path: "/formulary", label: "Formulary", icon: Pill },
    ],
  },
  {
    label: "Outcomes & Monitoring",
    items: [
      { path: "/outcome-capture", label: "Outcome Capture", icon: ClipboardCheck },
      { path: "/outcome-monitoring", label: "Outcome Monitoring", icon: Activity },
      { path: "/discrepancies", label: "Discrepancies", icon: AlertTriangle },
    ],
  },
  {
    label: "Export & Records",
    items: [
      { path: "/ecw-workbench", label: "eCW Export", icon: Package },
      { path: "/patient-consent", label: "Patient Consent", icon: FileCheck },
      { path: "/coercion-audit", label: "Coercion Audit", icon: Eye },
    ],
  },
  {
    label: "AI & Agents",
    items: [
      { path: "/ai-assistant", label: "AI Assistant", icon: Sparkles },
      { path: "/agent-ops", label: "Agent Ops", icon: Bot },
      { path: "/ms-agent-ops", label: "MS Agent Ops", icon: Cpu },
      { path: "/agent-control", label: "Agent Control", icon: Bot },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/ops-daily-digest", label: "Daily Digest", icon: BarChart3 },
      { path: "/runtime-analytics", label: "Runtime Analytics", icon: TrendingUp },
      { path: "/notifications", label: "Notifications", icon: Bell },
      { path: "/message-ops", label: "Messages", icon: MessageSquare },
      { path: "/messaging-status", label: "Channel Status", icon: MessageSquare },
      { path: "/conversation-optimization", label: "Conversation Optimizer", icon: MessageCircle },
      { path: "/shadow-mode-ops", label: "Shadow Mode", icon: Eye },
    ],
  },
  {
    label: "Clinical Knowledge",
    items: [
      { path: "/knowledge-hub", label: "Knowledge Hub", icon: Brain },
      { path: "/knowledge-base", label: "KB Admin (11 Tables)", icon: Database },
      { path: "/knowledge-ops", label: "KB Ops Dashboard", icon: Gauge },
      { path: "/knowledge-graph", label: "Knowledge Graph", icon: Network },
    ],
  },
  {
    label: "Validation Sprint",
    items: [
      { path: "/synthetic-testing", label: "Synthetic Testing", icon: FlaskConical },
      { path: "/golden-cases", label: "Golden Cases", icon: Target },
      { path: "/gold-reviews", label: "Gold Reviews", icon: ClipboardCheck },
      { path: "/rule-suggestions", label: "Rule Suggestions", icon: Lightbulb },
      { path: "/skill-layer-review", label: "Clinician Review", icon: Eye },
      { path: "/skill-layer-admin", label: "Platform Admin 2.x", icon: Settings },
      { path: "/site-management", label: "Site Management", icon: Globe },
    ],
  },
  {
    label: "Skill Layers 3–8",
    items: [
      { path: "/sl3-outcomes", label: "SL3 Outcome Feedback", icon: ClipboardList },
      { path: "/sl4-provider-analytics", label: "SL4 Provider Analytics", icon: Users },
      { path: "/sl5-population-health", label: "SL5 Population Health", icon: LineChart },
      { path: "/sl6-clinical-coding", label: "SL6 Clinical Coding", icon: Code2 },
      { path: "/sl7-comm-hub", label: "SL7 Comm Hub", icon: MessageCircle },
      { path: "/sl8-tenant-orchestration", label: "SL8 Tenant Orchestration", icon: Building2 },
    ],
  },
  {
    label: "Completion Modules",
    items: [
      { path: "/autonomous-intake", label: "Autonomous Intake", icon: Bot },
      { path: "/compact-intake", label: "Compact Structured Intake", icon: Smartphone },
      { path: "/rl-policy", label: "RL Policy Trainer", icon: BrainCircuit },
      { path: "/care-pathways", label: "Care Pathways", icon: MapPin },
      { path: "/clinical-copilot", label: "Clinician Copilot", icon: Lightbulb },
      { path: "/predictive-risk", label: "Predictive Risk", icon: Activity },
    ],
  },
  {
    label: "Self-Developing AI",
    items: [
      { path: "/meta-clinical", label: "Meta-Clinical Console", icon: Sparkles },
      { path: "/research-intelligence", label: "Research Intelligence", icon: Microscope },
      { path: "/research-inbox",    label: "Research Inbox (Medium Scout)", icon: BookOpen },
      { path: "/agent-handoff",      label: "Agent Handoff Queue",           icon: Bot },
      { path: "/cross-model-review", label: "Cross-Model Review Inbox",      icon: BookOpen },
      { path: "/slice-pipeline",     label: "Slice Pipeline Admin",          icon: BookOpen },
      { path: "/clinical-visualization", label: "Clinical Visualization", icon: Network },
      { path: "/simulation-lab", label: "Simulation Laboratory", icon: FlaskConical },
      { path: "/complaint-lab", label: "Complaint Lab", icon: FlaskConical },
      { path: "/control-tower", label: "Clinical Control Tower", icon: Radar },
      { path: "/clinical-control-tower", label: "CCT Decision Engine", icon: Brain },
      { path: "/system-control-tower", label: "System Control Tower", icon: Cpu },
      { path: "/integration-health", label: "Integration Health", icon: Activity },
      { path: "/engine-maintenance", label: "Engine Maintenance Console", icon: Settings },
      { path: "/agent-brain",       label: "Agentic Brain",      icon: Brain },
      { path: "/hardening-review",  label: "Hardening Review",   icon: Lock },
      { path: "/agent-lab", label: "Agent & Skill Lab", icon: FlaskConical },
      { path: "/multi-patient-command", label: "Multi-Patient Command Grid", icon: Grid3X3 },
      { path: "/schema-validator", label: "Schema Validator", icon: ShieldCheck },
      { path: "/clinical-governance", label: "Clinical Governance", icon: Shield },
      { path: "/clinical-version-control", label: "Version Control", icon: GitBranch },
      { path: "/intelligence-control-center", label: "Intelligence Control Center", icon: Radar },
      { path: "/clinical-analytics-engines", label: "Clinical Analytics Engines", icon: BarChart3 },
      { path: "/advanced-clinical-engines", label: "Advanced Clinical Engines", icon: Activity },
      { path: "/clinical-brain-monitor", label: "Clinical Brain Monitor", icon: Brain },
      { path: "/self-improving-brain", label: "Self-Improving Brain", icon: Zap },
      { path: "/auralyn", label: "Auralyn SaaS Platform", icon: Rocket },
      { path: "/ehr-integration", label: "EHR Integration & RBAC", icon: HeartPulse },
      { path: "/clinical-scale", label: "Clinical Scale Stack", icon: ClipboardCheck },
      { path: "/operations-dashboard", label: "Operations Dashboard", icon: Gauge },
      { path: "/smart-intake", label: "Smart Intake Pipeline", icon: MessageSquare },
      { path: "/intelligence-layer", label: "Intelligence Layer", icon: Radar },
      { path: "/adaptive-control", label: "Adaptive Control", icon: Activity },
      { path: "/pack-builder", label: "Pack Builder", icon: Package },
      { path: "/pack-simulator", label: "Pack Simulator", icon: FlaskConical },
      { path: "/pack-questions", label: "Pack Questions", icon: ClipboardList },
      { path: "/pack-audit-log", label: "Pack Audit Log", icon: Shield },
      { path: "/coverage-dashboard", label: "Coverage Dashboard", icon: BarChart3 },
      { path: "/kb-explorer", label: "Knowledge Base Explorer", icon: BookOpen },
      { path: "/system-ops-grid", label: "System Operations Grid", icon: Cpu },
      { path: "/patient-grid", label: "Patient Grid (High Volume)", icon: Grid3X3 },
      { path: "/physician-command-strip", label: "Physician Command Strip", icon: HeartPulse },
      { path: "/physician-dashboard", label: "Physician Control Center", icon: HeartPulse },
      { path: "/follow-up-monitoring", label: "Follow-Up Monitoring", icon: Activity },
      { path: "/executive-dashboard", label: "Executive Dashboard", icon: Building2 },
      { path: "/self-improve", label: "Improvement Engine", icon: Brain },
      { path: "/hybrid-reasoning", label: "Hybrid Reasoning Engine", icon: Zap },
      { path: "/ucsm", label: "Clinical State Model", icon: Activity },
      { path: "/clinical-ops", label: "Clinical Ops Console", icon: Lock },
    ],
  },
  {
    label: "Administration",
    items: [
      { path: "/organizations", label: "Organizations", icon: Building },
      { path: "/audit-reports", label: "Audit Reports", icon: Shield },
      { path: "/release-governance", label: "Releases", icon: Rocket },
      { path: "/performance-stats", label: "Performance", icon: Gauge },
      { path: "/engine-registry", label: "Engine Registry", icon: Cpu },
      { path: "/engine-atlas", label: "Brain Control Tower", icon: Brain },
      { path: "/engines", label: "Engine Control Center", icon: Settings },
      { path: "/patient-queue", label: "Live Patient Queue", icon: Activity },
      { path: "/stress-test", label: "Stress Test & Metrics", icon: Zap },
      { path: "/nyc-pilot", label: "NYC Pilot Dashboard", icon: MapPin },
      { path: "/fda-audit", label: "FDA Audit (21 CFR)", icon: ShieldCheck },
    ],
  },
];

const PINNED_COMMAND_CENTERS = [
  {
    path: "/mission-control",
    label: "Mission Control",
    icon: Cpu,
    testId: "nav-mission-control",
    className: "font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 mb-1",
  },
  {
    path: "/system-control-tower",
    label: "System Control Tower",
    icon: Activity,
    testId: "nav-system-control-tower",
    className: "",
  },
  {
    path: "/clinical-control-tower",
    label: "Clinical Control Tower",
    icon: Brain,
    testId: "nav-clinical-control-tower",
    className: "",
  },
  {
    path: "/autonomous-learning",
    label: "Autonomous Learning",
    icon: Sparkles,
    testId: "nav-autonomous-learning",
    className: "",
  },
  {
    path: "/command-center-v2",
    label: "CC v2 — EHR Writes + Audit",
    icon: HeartPulse,
    testId: "nav-command-center-v2",
    className: "",
  },
  {
    path: "/command-center-v3",
    label: "CC v3 — Predictive / ICU",
    icon: LineChart,
    testId: "nav-command-center-v3",
    className: "",
  },
  {
    path: "/command-center-v4",
    label: "CC v4 — Digital Twin + EMS",
    icon: Radar,
    testId: "nav-command-center-v4",
    className: "",
  },
];

const PINNED_SKILL_LABS = [
  {
    path: "/skill-map",
    label: "Skill Map",
    icon: Network,
    testId: "nav-skill-map",
    badge: "Graph",
    badgeClass: "border-blue-500/30 text-blue-400 bg-blue-500/10",
  },
  {
    path: "/skill-intelligence-lab",
    label: "Skill Intelligence Lab",
    icon: Microscope,
    testId: "nav-skill-intelligence-lab",
    badge: "AI Gen",
    badgeClass: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
  },
  {
    path: "/skill-evolution-lab",
    label: "Skill Evolution Lab",
    icon: Activity,
    testId: "nav-skill-evolution-lab",
    badge: "Evolve",
    badgeClass: "border-teal-500/30 text-teal-400 bg-teal-500/10",
  },
];

const PINNED_IMPROVEMENT_CENTERS = [
  {
    path: "/clinical-improvement-lab",
    label: "Clinical Improvement Lab",
    icon: FlaskConical,
    testId: "nav-clinical-improvement-lab",
    badge: "Self-Improving",
    badgeClass: "border-violet-500/30 text-violet-400 bg-violet-500/10",
  },
  {
    path: "/care-pathway-optimizer",
    label: "Care Pathway Optimizer",
    icon: Shuffle,
    testId: "nav-care-pathway-optimizer",
    badge: "A/B Engine",
    badgeClass: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, token, logout } = useAuth();

  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">You need to sign in to access this page.</p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-login">Go to Login</Button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="p-4 border-b border-sidebar-border">
            <Link href="/admin">
              <div className="flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-sm font-semibold truncate">Auralyn</h1>
                  <p className="text-xs text-muted-foreground truncate">Admin Panel</p>
                </div>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="overflow-y-auto">
            {/* ── Pinned: Core Command Centers ── */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3 pt-2 pb-0">Command Centers</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {PINNED_COMMAND_CENTERS.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <Link href={item.path}>
                        <SidebarMenuButton
                          data-active={location === item.path}
                          className={`data-[active=true]:bg-sidebar-accent w-full ${item.className}`}
                          data-testid={item.testId}
                        >
                          <item.icon className="w-4 h-4" />
                          <span className="flex-1 text-sm">{item.label}</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ── Pinned: Improvement & Optimization Centers ── */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3 pt-1 pb-0">Improvement Centers</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {PINNED_IMPROVEMENT_CENTERS.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <Link href={item.path}>
                        <SidebarMenuButton
                          data-active={location === item.path}
                          className="data-[active=true]:bg-sidebar-accent w-full"
                          data-testid={item.testId}
                        >
                          <item.icon className="w-4 h-4" />
                          <span className="flex-1 text-sm truncate">{item.label}</span>
                          <Badge variant="outline" className={`text-[9px] h-4 px-1 hidden data-[active=true]:flex flex-shrink-0 ${item.badgeClass}`}>
                            {item.badge}
                          </Badge>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ── Skill Labs ── */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3 pt-1 pb-0">Skill Labs</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {PINNED_SKILL_LABS.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <Link href={item.path}>
                        <SidebarMenuButton
                          data-active={location === item.path}
                          className="data-[active=true]:bg-sidebar-accent w-full"
                          data-testid={item.testId}
                        >
                          <item.icon className="w-4 h-4" />
                          <span className="flex-1 text-sm truncate">{item.label}</span>
                          <Badge variant="outline" className={`text-[9px] h-4 px-1 hidden data-[active=true]:flex flex-shrink-0 ${item.badgeClass}`}>
                            {item.badge}
                          </Badge>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ── All other nav sections ── */}
            {NAV_SECTIONS.map((section) => (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.path}>
                        <Link href={item.path}>
                          <SidebarMenuButton
                            data-active={location === item.path}
                            className="data-[active=true]:bg-sidebar-accent w-full"
                            data-testid={`nav-${item.path.slice(1)}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span className="flex-1 text-sm">{item.label}</span>
                          </SidebarMenuButton>
                        </Link>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-user-email">
                  {user?.email || "User"}
                </p>
                <span className="text-xs text-muted-foreground truncate block">
                  <Badge variant="outline" className="text-xs px-1 py-0">{user?.role || "unknown"}</Badge>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard" className="flex-1">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-clinic-dashboard">
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Clinic View
                </Button>
              </Link>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start mt-1"
              onClick={handleLogout}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-4 p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
