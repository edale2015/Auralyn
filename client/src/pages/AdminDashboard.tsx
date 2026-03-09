import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  LayoutDashboard, ClipboardCheck, BarChart3, Pill,
  Activity, Shield, Sparkles, Gauge, Bot,
  GitBranch, Rocket, FlaskConical, Package,
} from "lucide-react";

const QUICK_LINKS = [
  { path: "/complaint-control-center", label: "Complaint Control Center", icon: LayoutDashboard, desc: "Overview of all complaints" },
  { path: "/review-queue-v2", label: "Review Queue", icon: ClipboardCheck, desc: "Cases awaiting review" },
  { path: "/complaint-qa", label: "Complaint QA", icon: BarChart3, desc: "Quality assurance dashboard" },
  { path: "/clinical-workflow-health", label: "Workflow Health", icon: Activity, desc: "System health score" },
  { path: "/formulary", label: "Formulary", icon: Pill, desc: "Medication management" },
  { path: "/ai-assistant", label: "AI Assistant", icon: Sparkles, desc: "AI-powered reasoning" },
  { path: "/agent-ops", label: "Agent Operations", icon: Bot, desc: "Agent task management" },
  { path: "/ecw-workbench", label: "eCW Export", icon: Package, desc: "Export management" },
  { path: "/decision-graphs", label: "Decision Graphs", icon: GitBranch, desc: "Trace visualization" },
  { path: "/audit-reports", label: "Audit Reports", icon: Shield, desc: "Access and compliance" },
  { path: "/release-governance", label: "Releases", icon: Rocket, desc: "Release gate management" },
  { path: "/performance-stats", label: "Performance", icon: Gauge, desc: "System performance" },
  { path: "/synthetic-testing", label: "Synthetic Testing", icon: FlaskConical, desc: "Engine testing" },
];

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-6" data-testid="page-admin-dashboard">
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {user?.email || "Admin"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Role: <Badge variant="outline" className="text-xs">{user?.role || "unknown"}</Badge>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUICK_LINKS.map((link) => (
          <Link key={link.path} href={link.path}>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" data-testid={`quick-link-${link.path.slice(1)}`}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <link.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{link.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{link.desc}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
