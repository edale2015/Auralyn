import { Link, useLocation } from "wouter";
import { ROUTES } from "../routes/routeRegistry";
import {
  Activity,
  Stethoscope,
  ClipboardList,
  Shield,
  BrainCircuit,
  Server,
  Settings,
  Bot,
  PenTool,
  Cpu,
  PlayCircle,
  Zap,
  Eye,
  Smartphone,
  LayoutGrid,
  Radio,
  MonitorDot,
  FlaskConical,
  FileCheck,
  CreditCard,
  Globe2,
  Phone,
  GitBranch,
  ShieldCheck,
  Hospital,
  LayoutDashboard,
  Brain,
  Database,
  BarChart3,
  Landmark,
} from "lucide-react";

const NAV_ITEMS = [
  { path: ROUTES.COMPONENT_HUB, label: "Component Hub", icon: LayoutDashboard },
  { path: ROUTES.KNOWLEDGE_BASE, label: "Knowledge Base", icon: Database },
  { path: ROUTES.KNOWLEDGE_OPS, label: "KB Ops Dashboard", icon: BarChart3 },
  { path: ROUTES.TEST_BENCH, label: "Test Bench", icon: FlaskConical },
  { path: ROUTES.AUTONOMOUS_LEARNING, label: "Learning Console", icon: Brain },
  { path: ROUTES.OPS, label: "Operations", icon: Activity },
  { path: ROUTES.CLINICAL, label: "Clinical Review", icon: Stethoscope },
  { path: ROUTES.INTAKE, label: "Intake", icon: ClipboardList },
  { path: ROUTES.SAFETY, label: "Safety", icon: Shield },
  { path: ROUTES.LEARNING, label: "Learning", icon: BrainCircuit },
  { path: ROUTES.SYSTEM, label: "System", icon: Server },
  { path: ROUTES.AUTOMATION, label: "Automation", icon: Bot },
  { path: ROUTES.TEMPLATE_STUDIO, label: "Template Studio", icon: PenTool },
  { path: ROUTES.ROBOTICS, label: "Robotic Assist", icon: Cpu },
  { path: ROUTES.REPLAY_INSPECTOR, label: "Replay Inspector", icon: PlayCircle },
  { path: ROUTES.AUTONOMOUS_BRAIN, label: "Autonomous Brain", icon: Zap },
  { path: ROUTES.MEMORY_EXPLORER, label: "Memory Explorer", icon: BrainCircuit },
  { path: ROUTES.ROBOT_ADVANCED, label: "Robot Advanced", icon: Cpu },
  { path: ROUTES.ROBOT_CAMERA, label: "Robot Vision", icon: Eye },
  { path: ROUTES.PHYSICIAN_MOBILE, label: "Mobile Dashboard", icon: Smartphone },
  { path: ROUTES.ORCHESTRATION, label: "Live Rooms", icon: LayoutGrid },
  { path: ROUTES.CONTROL_TOWER, label: "War Room", icon: Radio },
  { path: "/revenue-war-room", label: "Revenue War Room", icon: Landmark },
  { path: "/clinical-improvement-lab", label: "Clinical Improvement Lab", icon: FlaskConical },
  { path: "/care-pathway-optimizer", label: "Care Pathway Optimizer", icon: GitBranch },
  { path: "/governance-command-center", label: "Governance Command Center", icon: ShieldCheck },
  { path: "/system-monitor", label: "System Monitor", icon: MonitorDot },
  { path: "/fda-dashboard", label: "FDA Validation", icon: FlaskConical },
  { path: "/prior-auth", label: "Prior Auth", icon: FileCheck },
  { path: "/eligibility", label: "Eligibility", icon: CreditCard },
  { path: "/population-health", label: "Population Health", icon: Globe2 },
  { path: "/experiments", label: "A/B Experiments", icon: FlaskConical },
  { path: "/voice-triage", label: "Voice Triage", icon: Phone },
  { path: "/decision-tree", label: "Decision Tree", icon: GitBranch },
  { path: "/fda-dashboard", label: "FDA Dashboard", icon: ShieldCheck },
  { path: "/live-clinic", label: "Live Clinic", icon: Hospital },
  { path: ROUTES.SETTINGS, label: "Settings", icon: Settings },
];

interface Props {
  children: React.ReactNode;
}

export default function AppLayout({ children }: Props) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="w-56 shrink-0 border-r bg-white dark:bg-gray-900 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b dark:border-gray-800">
          <span className="text-base font-semibold tracking-tight text-gray-800 dark:text-gray-100">
            Auralyn / ENT
          </span>
        </div>

        <nav className="flex flex-col gap-1 p-3 flex-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
                data-testid={`nav-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t dark:border-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-600">v4 · control surface</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
