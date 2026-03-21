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
} from "lucide-react";

const NAV_ITEMS = [
  { path: ROUTES.OPS, label: "Operations", icon: Activity },
  { path: ROUTES.CLINICAL, label: "Clinical Review", icon: Stethoscope },
  { path: ROUTES.INTAKE, label: "Intake", icon: ClipboardList },
  { path: ROUTES.SAFETY, label: "Safety", icon: Shield },
  { path: ROUTES.LEARNING, label: "Learning", icon: BrainCircuit },
  { path: ROUTES.SYSTEM, label: "System", icon: Server },
  { path: ROUTES.AUTOMATION, label: "Automation", icon: Bot },
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
