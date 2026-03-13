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
  BrainCircuit, MapPin, Brain,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Clinical Operations",
    items: [
      { path: "/telemedicine", label: "Visit Copilot", icon: Video },
      { path: "/telemed-doctor-dashboard", label: "Doctor Dashboard", icon: BrainCircuit },
      { path: "/complaint-control-center", label: "Complaint Control Center", icon: LayoutDashboard },
      { path: "/review-queue-v2", label: "Review Queue", icon: ClipboardCheck },
      { path: "/complaint-qa", label: "Complaint QA", icon: BarChart3 },
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
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/ops-daily-digest", label: "Daily Digest", icon: BarChart3 },
      { path: "/runtime-analytics", label: "Runtime Analytics", icon: TrendingUp },
      { path: "/notifications", label: "Notifications", icon: Bell },
      { path: "/message-ops", label: "Messages", icon: MessageSquare },
      { path: "/shadow-mode-ops", label: "Shadow Mode", icon: Eye },
    ],
  },
  {
    label: "Validation Sprint",
    items: [
      { path: "/synthetic-testing", label: "Synthetic Testing", icon: FlaskConical },
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
      { path: "/rl-policy", label: "RL Policy Trainer", icon: BrainCircuit },
      { path: "/care-pathways", label: "Care Pathways", icon: MapPin },
      { path: "/clinical-copilot", label: "Clinician Copilot", icon: Lightbulb },
      { path: "/predictive-risk", label: "Predictive Risk", icon: Activity },
    ],
  },
  {
    label: "Self-Developing AI",
    items: [
      { path: "/self-improve", label: "Improvement Engine", icon: Brain },
    ],
  },
  {
    label: "Administration",
    items: [
      { path: "/organizations", label: "Organizations", icon: Building },
      { path: "/audit-reports", label: "Audit Reports", icon: Shield },
      { path: "/release-governance", label: "Releases", icon: Rocket },
      { path: "/performance-stats", label: "Performance", icon: Gauge },
    ],
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
                  <h1 className="text-sm font-semibold truncate">ENT Flu Slice</h1>
                  <p className="text-xs text-muted-foreground truncate">Admin Panel</p>
                </div>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="overflow-y-auto">
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
