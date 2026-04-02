import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  LayoutDashboard, ClipboardCheck, BarChart3, Pill,
  Activity, Shield, Sparkles, Gauge, Bot,
  GitBranch, Rocket, FlaskConical, Package,
  AlertTriangle, CheckCircle2, Clock, Users,
  TrendingUp, Zap, Database, RefreshCw, Brain,
  FileText, Settings, Layers, Download, Snowflake,
} from "lucide-react";

const LINK_GROUPS = [
  {
    label: "Clinical Operations",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    links: [
      { path: "/complaint-control-center", label: "Complaint Control Center", icon: LayoutDashboard, desc: "All complaints overview" },
      { path: "/review-queue-v2", label: "Review Queue", icon: ClipboardCheck, desc: "Cases awaiting review" },
      { path: "/complaint-qa", label: "Complaint QA", icon: BarChart3, desc: "Quality assurance" },
      { path: "/clinical-workflow-health", label: "Workflow Health", icon: Activity, desc: "System health score" },
    ],
  },
  {
    label: "Decision Pipeline",
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    links: [
      { path: "/clinical-pipeline", label: "Decision Pipeline", icon: Layers, desc: "KB source → disposition trace" },
      { path: "/knowledge-base", label: "Knowledge Base", icon: Database, desc: "Edit KB rules & layers" },
      { path: "/trace-viewer", label: "Case Traces", icon: GitBranch, desc: "Step-by-step case traces" },
      { path: "/decision-graphs", label: "Decision Graphs", icon: Zap, desc: "Visual decision flows" },
    ],
  },
  {
    label: "AI & Learning",
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    links: [
      { path: "/ai-assistant", label: "AI Assistant", icon: Sparkles, desc: "AI-powered reasoning" },
      { path: "/agent-ops", label: "Agent Operations", icon: Bot, desc: "Agent task management" },
      { path: "/simulation-lab", label: "Simulation Lab", icon: Brain, desc: "Clinical failure testing" },
      { path: "/autonomous-learning-console", label: "Learning Console", icon: TrendingUp, desc: "RLHF & drift monitor" },
    ],
  },
  {
    label: "Data & Audit",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    links: [
      { path: "/decision-graphs", label: "Decision Graphs", icon: GitBranch, desc: "Trace visualization" },
      { path: "/audit-reports", label: "Audit Reports", icon: Shield, desc: "Access & compliance" },
      { path: "/ecw-workbench", label: "eCW Export", icon: Package, desc: "Export management" },
      { path: "/trace-viewer", label: "Trace Viewer", icon: FileText, desc: "Engine trace logs" },
    ],
  },
  {
    label: "System & Governance",
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    links: [
      { path: "/release-governance", label: "Releases", icon: Rocket, desc: "Release gate management" },
      { path: "/performance-stats", label: "Performance", icon: Gauge, desc: "System performance" },
      { path: "/synthetic-testing", label: "Synthetic Testing", icon: FlaskConical, desc: "Engine testing" },
      { path: "/formulary", label: "Formulary", icon: Pill, desc: "Medication management" },
    ],
  },
];

function LiveMetrics() {
  const { data: snap, isLoading: snapLoading } = useQuery<any>({
    queryKey: ["/api/ops/snapshot"],
    refetchInterval: 30_000,
  });
  const { data: queueData, isLoading: queueLoading } = useQuery<any>({
    queryKey: ["/api/ops/queue"],
    refetchInterval: 15_000,
  });
  const { data: drift, isLoading: driftLoading } = useQuery<any>({
    queryKey: ["/api/ops/drift"],
    refetchInterval: 60_000,
  });
  const { data: prod } = useQuery<any>({
    queryKey: ["/api/production-readiness"],
    refetchInterval: 120_000,
  });

  const loading = snapLoading || queueLoading || driftLoading;

  const metrics = [
    {
      label: "Pending Cases",
      value: queueData?.stats?.pending ?? snap?.pendingCases ?? "—",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      urgent: (queueData?.stats?.pending ?? 0) > 10,
    },
    {
      label: "Escalated",
      value: queueData?.stats?.escalated ?? "—",
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950/30",
      urgent: (queueData?.stats?.escalated ?? 0) > 0,
    },
    {
      label: "Cases Reviewed",
      value: queueData?.stats?.reviewed ?? "—",
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
      urgent: false,
    },
    {
      label: "Drift Alerts",
      value: drift?.activeAlerts ?? "—",
      icon: TrendingUp,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      urgent: (drift?.activeAlerts ?? 0) > 0,
    },
    {
      label: "Active Agents",
      value: snap?.activeAgents ?? "—",
      icon: Bot,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      urgent: false,
    },
    {
      label: "Accuracy",
      value: drift?.baselineAccuracy != null
        ? `${(drift.baselineAccuracy * 100).toFixed(1)}%`
        : snap?.systemAccuracy != null
        ? `${(snap.systemAccuracy * 100).toFixed(1)}%`
        : "—",
      icon: Zap,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      urgent: false,
    },
    {
      label: "DB Health",
      value: prod?.checks?.database ?? snap?.dbStatus ?? "—",
      icon: Database,
      color: "text-slate-600",
      bg: "bg-slate-50 dark:bg-slate-950/30",
      urgent: false,
    },
    {
      label: "Prod Ready",
      value: prod?.ready === true ? "Yes" : prod?.ready === false ? "No" : "—",
      icon: Layers,
      color: prod?.ready ? "text-green-600" : "text-red-600",
      bg: prod?.ready ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30",
      urgent: prod?.ready === false,
    },
  ];

  return (
    <div data-testid="admin-live-metrics">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Live System Status
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin-slow opacity-50" />
          Auto-refreshing
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {metrics.map((m) => (
          <Card
            key={m.label}
            className={`border ${m.urgent ? "ring-1 ring-red-400 border-red-300 dark:border-red-700" : ""}`}
            data-testid={`metric-${m.label.toLowerCase().replace(/\s/g, "-")}`}
          >
            <CardContent className="p-3 text-center">
              {loading ? (
                <Skeleton className="h-7 w-12 mx-auto mb-1" />
              ) : (
                <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              )}
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{m.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SystemControls() {
  const { toast } = useToast();
  const [isFrozen, setIsFrozen] = useState(false);

  const { data: releaseSummary } = useQuery<any>({
    queryKey: ["/api/fda-dashboard/release/summary"],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (releaseSummary?.isLocked !== undefined) setIsFrozen(releaseSummary.isLocked);
  }, [releaseSummary?.isLocked]);

  const freezeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/fda-dashboard/release/freeze", {});
      return res.json();
    },
    onSuccess: (data) => {
      setIsFrozen(true);
      toast({ title: "Learning Frozen", description: data.message ?? "All learning signals paused." });
    },
    onError: () => toast({ title: "Freeze failed", variant: "destructive" }),
  });

  const [auditDownloading, setAuditDownloading] = useState(false);

  async function downloadAuditPackage() {
    setAuditDownloading(true);
    try {
      const res = await fetch("/api/audit/export-package", {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token") ?? ""}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auralyn-audit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Audit package downloaded" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setAuditDownloading(false);
    }
  }

  return (
    <Card data-testid="system-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="w-4 h-4" /> System Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${isFrozen ? "bg-blue-50 dark:bg-blue-950/30" : "bg-muted/30"}`}>
            <Snowflake className={`w-4 h-4 ${isFrozen ? "text-blue-600" : "text-muted-foreground"}`} />
          </div>
          <div>
            <Label htmlFor="learning-freeze" className="text-sm font-medium cursor-pointer">
              Learning Freeze
            </Label>
            <div className="text-[11px] text-muted-foreground">Pause all RLHF & auto-learning signals</div>
          </div>
          <Switch
            id="learning-freeze"
            checked={isFrozen}
            onCheckedChange={(checked) => { if (checked) freezeMutation.mutate(); }}
            disabled={freezeMutation.isPending || isFrozen}
            data-testid="switch-learning-freeze"
          />
          {isFrozen && (
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
              <Snowflake className="w-2.5 h-2.5 mr-1" /> FROZEN
            </Badge>
          )}
        </div>

        <div className="h-8 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <Download className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-medium">FDA Audit Package</div>
            <div className="text-[11px] text-muted-foreground">90-day KB changes, audit chain, queue history</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadAuditPackage}
            disabled={auditDownloading}
            data-testid="button-download-audit"
          >
            {auditDownloading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Export</span>
          </Button>
        </div>

        <div className="h-8 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <div className="text-sm font-medium">Decision Pipeline</div>
            <div className="text-[11px] text-muted-foreground">Trace KB rules to disposition</div>
          </div>
          <Link href="/clinical-pipeline">
            <Button variant="outline" size="sm" data-testid="link-clinical-pipeline">Open →</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto" data-testid="page-admin-dashboard">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Admin Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, <strong>{user?.email || "Admin"}</strong> —{" "}
            <Badge variant="outline" className="text-xs ml-1">{user?.role || "unknown"}</Badge>
          </p>
        </div>
        <Badge variant="secondary" className="text-xs gap-1 mt-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" /> System Operational
        </Badge>
      </div>

      <LiveMetrics />

      {/* Q11: Legacy Auth Deprecation Banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20" data-testid="banner-legacy-auth-deprecation">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Legacy Auth Deprecation Notice</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            The single-password clinician auth system (<code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">CLINICIAN_PASSWORD</code>) is deprecated.
            Migrate all integrations to{" "}
            <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">POST /api/roleAuth/login</code>{" "}
            with JWT role-based auth. Sunset date: <strong>2026-12-31</strong>.
          </p>
        </div>
        <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700 flex-shrink-0">
          Sunset v2.0
        </Badge>
      </div>

      <SystemControls />

      <div className="space-y-6">
        {LINK_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${group.color}`}>
              {group.label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {group.links.map((link) => (
                <Link key={link.path} href={link.path}>
                  <Card
                    className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 h-full"
                    data-testid={`quick-link-${link.path.slice(1)}`}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-md ${group.bg} flex items-center justify-center flex-shrink-0`}>
                          <link.icon className={`w-4 h-4 ${group.color}`} />
                        </div>
                        <div>
                          <div className="font-medium text-sm leading-tight">{link.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{link.desc}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
