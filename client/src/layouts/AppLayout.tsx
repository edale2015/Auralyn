import { Link, useLocation } from "wouter";
import { ROUTES } from "../routes/routeRegistry";
import {
  Activity, Stethoscope, ClipboardList, Shield, BrainCircuit,
  Server, Settings, Bot, PenTool, Cpu, PlayCircle, Zap, Eye,
  Smartphone, LayoutGrid, Radio, MonitorDot, FlaskConical,
  FileCheck, CreditCard, Globe2, Phone, GitBranch, ShieldCheck,
  Hospital, LayoutDashboard, Brain, Database, BarChart3,
  Landmark, Package, Radar, GraduationCap, ClipboardCheck, Map, List,
} from "lucide-react";

// ── Nav structure: grouped sections ──────────────────────────────────────────
type NavItem = { path: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { heading: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Clinical",
    items: [
      { path: "/encounter",              label: "Clinical Encounter",     icon: Stethoscope  },
      { path: "/complaints-review",      label: "Complaints Review",      icon: List         },
      { path: "/rule-map",               label: "Master Rule Map",        icon: Map          },
      { path: ROUTES.CLINICAL,           label: "Clinical Review",        icon: ClipboardCheck },
      { path: ROUTES.INTAKE,             label: "Intake",                 icon: ClipboardList },
      { path: "/pathway-review",         label: "Pathway Review",         icon: GitBranch    },
      { path: "/live-clinic",            label: "Live Clinic",            icon: Hospital     },
      { path: ROUTES.LIVE_MONITOR,       label: "Live Patient Monitor",   icon: Activity     },
    ],
  },
  {
    heading: "Knowledge & AI",
    items: [
      { path: ROUTES.COMPONENT_HUB,          label: "Component Hub",         icon: LayoutDashboard },
      { path: ROUTES.KNOWLEDGE_BASE,         label: "Knowledge Base",         icon: Database        },
      { path: ROUTES.KNOWLEDGE_OPS,          label: "KB Ops Dashboard",       icon: BarChart3       },
      { path: ROUTES.TEST_BENCH,             label: "Test Bench",             icon: FlaskConical    },
      { path: ROUTES.AUTONOMOUS_LEARNING,    label: "Learning Console",       icon: Brain           },
      { path: ROUTES.AUTONOMOUS_BRAIN,       label: "Autonomous Brain",       icon: Zap             },
      { path: ROUTES.COGNITIVE_BRAIN,        label: "Cognitive Brain v2",     icon: BrainCircuit    },
      { path: ROUTES.MEMORY_EXPLORER,        label: "Memory Explorer",        icon: BrainCircuit    },
      { path: ROUTES.LEARNING,               label: "Learning",               icon: BrainCircuit    },
    ],
  },
  {
    heading: "Operations",
    items: [
      { path: ROUTES.OPS,                    label: "Operations",             icon: Activity        },
      { path: ROUTES.COMMAND_CENTER,         label: "Command Center",         icon: MonitorDot      },
      { path: ROUTES.CONTROL_TOWER,          label: "War Room",               icon: Radio           },
      { path: "/system-war-room",            label: "System War Room",        icon: Activity        },
      { path: ROUTES.ORCHESTRATION,          label: "Live Rooms",             icon: LayoutGrid      },
      { path: ROUTES.HOSPITAL,              label: "Hospital Layer",           icon: Hospital        },
      { path: "/simulation-lab",             label: "Simulation Lab",         icon: FlaskConical    },
      { path: "/clinical-improvement-lab",   label: "Clinical Improvement",   icon: FlaskConical    },
      { path: "/care-pathway-optimizer",     label: "Care Pathway Optimizer", icon: GitBranch       },
      { path: ROUTES.AGENT_SYSTEM,           label: "Agent System",           icon: ShieldCheck     },
      { path: ROUTES.AURALYN,               label: "Auralyn Control System",  icon: Brain           },
      { path: "/hospital-wall",             label: "ICU Wall Display",         icon: MonitorDot      },
    ],
  },
  {
    heading: "Analytics & Research",
    items: [
      { path: "/intent-analytics",           label: "Intent Analytics",       icon: BarChart3       },
      { path: "/fda-dashboard",              label: "FDA Validation",          icon: FlaskConical    },
      { path: "/population-health",          label: "Population Health",       icon: Globe2          },
      { path: "/research-radar",             label: "Research Radar",          icon: Radar           },
      { path: "/clinical-skills",            label: "Clinical Skills",         icon: Brain           },
      { path: "/cme-quiz",                   label: "CME Quiz",                icon: GraduationCap   },
      { path: ROUTES.CLINICAL_BRAIN_DASHBOARD, label: "Brain Control Tower",  icon: Brain           },
      { path: ROUTES.HIERARCHICAL_COUNCIL,   label: "Council Dashboard",      icon: Brain           },
      { path: ROUTES.BRAIN_COMMAND_CENTER,   label: "Brain Command Center",   icon: BrainCircuit    },
      { path: ROUTES.AI_INTERACTION_MONITOR, label: "Interaction Monitor",    icon: Eye             },
    ],
  },
  {
    heading: "Revenue & Compliance",
    items: [
      { path: "/revenue-war-room",           label: "Revenue War Room",        icon: Landmark       },
      { path: "/prior-auth",                 label: "Prior Auth",              icon: FileCheck       },
      { path: "/eligibility",                label: "Eligibility",             icon: CreditCard      },
      { path: "/governance-command-center",  label: "Governance",              icon: ShieldCheck     },
      { path: ROUTES.SAFETY,                 label: "Safety",                  icon: Shield          },
    ],
  },
  {
    heading: "System",
    items: [
      { path: ROUTES.SYSTEM,                 label: "System",                  icon: Server          },
      { path: ROUTES.AUTOMATION,             label: "Automation",              icon: Bot             },
      { path: "/infra-status",               label: "Infrastructure",          icon: Activity        },
      { path: "/system-monitor",             label: "System Monitor",          icon: MonitorDot      },
      { path: ROUTES.TEMPLATE_STUDIO,        label: "Template Studio",         icon: PenTool         },
      { path: ROUTES.ROBOTICS,               label: "Robotic Assist",          icon: Cpu             },
      { path: ROUTES.ROBOT_ADVANCED,         label: "Robot Advanced",          icon: Cpu             },
      { path: ROUTES.ROBOT_CAMERA,           label: "Robot Vision",            icon: Eye             },
      { path: ROUTES.PHYSICIAN_MOBILE,       label: "Mobile Dashboard",        icon: Smartphone      },
      { path: ROUTES.REPLAY_INSPECTOR,       label: "Replay Inspector",        icon: PlayCircle      },
      { path: "/voice-triage",               label: "Voice Triage",            icon: Phone           },
      { path: "/decision-tree",              label: "Decision Tree",           icon: GitBranch       },
      { path: "/experiments",                label: "A/B Experiments",         icon: FlaskConical    },
      { path: "/admin/claude-export",        label: "Claude Review",           icon: Package         },
      { path: ROUTES.SETTINGS,              label: "Settings",                 icon: Settings        },
    ],
  },
];

interface Props { children: React.ReactNode }

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

        <nav className="flex flex-col p-3 flex-1 overflow-y-auto gap-0.5">

          {/* ── Pinned: Clinical KB Editor ──────────────────────────── */}
          <Link
            to="/kb-editor"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition-colors mb-3 border ${
              location === "/kb-editor"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
            }`}
            data-testid="nav-link-clinical-kb-editor-top"
          >
            <ClipboardList className="h-5 w-5 shrink-0" />
            <span className="text-[15px] font-bold tracking-wide">Clinical KB Editor</span>
          </Link>

          {/* ── Grouped sections ─────────────────────────────────────── */}
          {NAV_SECTIONS.map(section => (
            <div key={section.heading} className="mb-3">
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-3 mb-1">
                {section.heading}
              </div>
              {section.items.map(({ path, label, icon: Icon }) => {
                const active = location === path || location.startsWith(path + "/");
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
            </div>
          ))}
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
