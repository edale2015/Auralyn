import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Shield,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  GitPullRequest,
  ClipboardList,
  ArrowRight,
  Settings2,
} from "lucide-react";

type DashboardData = {
  summary?: {
    totalCases: number;
    totalSignedOff: number;
    totalOverrides: number;
    totalDiscrepancies: number;
  };
};

type ShadowConfig = {
  enabled: boolean;
  requirePhysicianSignoffForAllCases: boolean;
  allowExportAfterSignoffOnly: boolean;
  autoCloseAfterExport: boolean;
  notes?: string[];
};

const CHECKLIST = [
  "Review queue monitored",
  "All clinical exports signoff-gated",
  "Discrepancies reviewed daily",
  "Runtime analytics reviewed for complaint drift",
  "Shadow-mode CSV and Firestore audit trails available",
];

export default function ShadowModeOps() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<DashboardData | null>(null);
  const [config, setConfig] = useState<ShadowConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [analyticsRes, configRes] = await Promise.allSettled([
        authFetch("/api/runtimeAnalytics/dashboard?limit=300"),
        authFetch("/api/shadowMode/config"),
      ]);

      if (configRes.status === "fulfilled" && configRes.value.ok) {
        const configJson = await configRes.value.json();
        setConfig(configJson);
      }

      if (analyticsRes.status === "fulfilled" && analyticsRes.value.ok) {
        const analyticsJson = await analyticsRes.value.json();
        setAnalytics(analyticsJson);
      } else {
        const msg = analyticsRes.status === "fulfilled"
          ? (await analyticsRes.value.json().catch(() => ({}))).error || "Failed to load analytics"
          : "Network error loading analytics";
        setError(msg);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load ops dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(key: keyof ShadowConfig, newValue: boolean) {
    if (!config) return;
    setToggling(key);
    try {
      const res = await authFetch("/api/shadowMode/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        toast({ title: "Config updated", description: `${key} set to ${newValue}` });
      } else {
        toast({ title: "Update failed", description: "Could not save setting", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach server", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const isEnabled = config?.enabled ?? false;

  const configCards = config
    ? [
        { label: "Shadow Mode", value: config.enabled ? "ENABLED" : "DISABLED", icon: Shield },
        { label: "All Cases Need Signoff", value: config.requirePhysicianSignoffForAllCases ? "YES" : "NO", icon: CheckCircle },
        { label: "Export Gate", value: config.allowExportAfterSignoffOnly ? "SIGNOFF FIRST" : "OPEN", icon: AlertTriangle },
        { label: "Auto Close After Export", value: config.autoCloseAfterExport ? "YES" : "NO", icon: GitPullRequest },
      ]
    : [];

  const summaryCards = analytics?.summary
    ? [
        { label: "Total Cases", value: analytics.summary.totalCases, icon: BarChart3 },
        { label: "Signed Off", value: analytics.summary.totalSignedOff, icon: CheckCircle },
        { label: "Overrides", value: analytics.summary.totalOverrides, icon: AlertTriangle },
        { label: "Discrepancies", value: analytics.summary.totalDiscrepancies, icon: GitPullRequest },
      ]
    : null;

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="status-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-shadow-mode-ops">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6" />
        <h2 className="text-xl font-semibold">Shadow Mode Ops</h2>
        <Badge variant={isEnabled ? "default" : "secondary"} data-testid="badge-shadow-status">
          {isEnabled ? "Active" : "Inactive"}
        </Badge>
      </div>

      {error && (
        <div className="text-sm text-destructive" data-testid="text-error">{error}</div>
      )}

      {configCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {configCards.map((card) => (
            <Card key={card.label} data-testid={`card-config-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
              <CardContent className="pt-4 flex flex-col items-start gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <card.icon className="h-3.5 w-3.5" />
                  {card.label}
                </div>
                <div className="text-lg font-bold" data-testid={`text-config-value-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summaryCards && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <Card key={card.label} data-testid={`card-summary-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
              <CardContent className="pt-4 flex flex-col items-start gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <card.icon className="h-3.5 w-3.5" />
                  {card.label}
                </div>
                <div className="text-2xl font-bold" data-testid={`text-summary-value-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {config?.notes && config.notes.length > 0 && (
        <Card data-testid="card-notes">
          <CardHeader>
            <CardTitle className="text-base">Shadow Mode Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {config.notes.map((note, i) => (
                <li key={i} className="text-sm text-muted-foreground" data-testid={`text-note-${i}`}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-checklist">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Operational Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {CHECKLIST.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-checklist-${i}`}>
                <CheckCircle className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <Link href="/review">
          <Button variant="outline" size="sm" data-testid="link-review-queue">
            Review Queue <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
        <Link href="/discrepancies">
          <Button variant="outline" size="sm" data-testid="link-discrepancies">
            Discrepancies <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
        <Link href="/runtime-analytics">
          <Button variant="outline" size="sm" data-testid="link-runtime-analytics">
            Runtime Analytics <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
