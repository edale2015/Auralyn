import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Database, AlertTriangle, CheckCircle, RefreshCw,
  Shield, Activity, FileText, Stethoscope, Pill, BookOpen, Search,
  TrendingUp, Info, Clock, ExternalLink, Brain, Zap, XCircle,
  AlertCircle, ChevronDown, ChevronRight, FlaskConical, GitBranch, Play,
} from "lucide-react";
import { Link } from "wouter";
import { ROUTES } from "@/routes/routeRegistry";
import { useState } from "react";

function StatCard({ icon: Icon, label, value, sub, color = "blue", href }: any) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-800",
    green: "border-green-200 dark:border-green-800",
    red: "border-red-200 dark:border-red-800",
    yellow: "border-yellow-200 dark:border-yellow-800",
    purple: "border-purple-200 dark:border-purple-800",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600", green: "text-green-600", red: "text-red-600",
    yellow: "text-yellow-600", purple: "text-purple-600",
  };
  return (
    <Card className={`border-l-4 ${colorMap[color]}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-muted/50">
          <Icon className={`h-6 w-6 ${iconColor[color]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {href && (
          <Link href={href}>
            <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ── Knowledge Health Panel ───────────────────────────────────────────────────

function CoverageGapList({ label, items, fixHref, icon: Icon = AlertTriangle }: {
  label: string; items: { complaintId: string; label: string }[]; fixHref: string; icon?: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const ok = items.length === 0;
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-green-200 bg-green-50 dark:bg-green-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
      <button
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`coverage-gap-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          {ok
            ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            : <Icon className="h-4 w-4 text-red-600 shrink-0" />
          }
          <span className="text-sm font-medium">{label}</span>
          {!ok && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs">{items.length}</Badge>}
        </div>
        {!ok && (expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
      </button>
      {!ok && expanded && (
        <div className="mt-2 space-y-1">
          {items.map(i => (
            <div key={i.complaintId} className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">{i.complaintId}</span>
              <span>{i.label}</span>
            </div>
          ))}
          <Link href={fixHref}>
            <Button size="sm" variant="link" className="text-xs p-0 h-auto mt-1">Fix in KB Admin →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function KnowledgeHealthPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/kb/health"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-muted/40 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!data) return <div className="text-sm text-muted-foreground">Health data unavailable</div>;

  const { bayesian, rules, coverage, pctKbDriven, pctFallback } = data;
  const isKbDriven = bayesian?.source === "KB_DB";

  return (
    <div className="space-y-5">
      {/* Bayesian source status */}
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${isKbDriven ? "border-green-300 bg-green-50 dark:bg-green-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}>
        <Brain className={`h-5 w-5 mt-0.5 shrink-0 ${isKbDriven ? "text-green-600" : "text-red-600"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">Bayesian Engine Source</span>
            <Badge className={isKbDriven ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}>
              {bayesian?.source ?? "UNKNOWN"}
            </Badge>
            <Badge variant="outline" className="text-xs">{bayesian?.priorCount ?? 0} priors active</Badge>
          </div>
          {bayesian?.activatedAt && (
            <div className="text-xs text-muted-foreground mt-1">Activated: {new Date(bayesian.activatedAt).toLocaleString()}</div>
          )}
          {!isKbDriven && bayesian?.fallbackReason && (
            <div className="text-xs text-red-700 dark:text-red-300 mt-1 font-mono">{bayesian.fallbackReason}</div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Phase 3: KB-driven percentage bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-yellow-500" /> Phase 3: KB-Driven Coverage
          </span>
          <span className="text-muted-foreground text-xs">
            <span className="text-green-700 font-semibold">{rules?.diagnosisRulesWithLikelihoods ?? 0}</span>
            {" / "}
            <span>{rules?.bayesianPriors ?? 0}</span>
            {" Bayesian priors have feature rows"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={pctKbDriven ?? 0} className="flex-1 h-3" />
          <span className="text-sm font-semibold w-14 text-right">
            <span className={pctKbDriven === 100 ? "text-green-600" : "text-yellow-600"}>{pctKbDriven ?? 0}%</span>
          </span>
        </div>
        {/* Phase 3 feature table stats */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span><strong>{rules?.featureTable?.rows ?? 0}</strong> feature rows in <code className="font-mono bg-muted px-0.5 rounded">kb_feature_likelihoods</code></span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span><strong>{rules?.featureTable?.uniqueRules ?? 0}</strong> unique diagnosis rules covered</span>
          </span>
          {(rules?.diagnosisRulesMissingLikelihoods ?? 0) === 0
            ? <span className="text-green-600 font-medium">✓ 100% KB-driven — no hardcoded fallbacks</span>
            : <span className="text-yellow-600">{rules.diagnosisRulesMissingLikelihoods} priors still using JSONB fallback</span>
          }
        </div>
      </div>

      {/* Rules missing feature rows — sample */}
      {(rules?.diagnosisRulesMissingLikelihoods ?? 0) > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
            <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
              {rules.diagnosisRulesMissingLikelihoods} Bayesian priors missing from <code className="font-mono text-xs">kb_feature_likelihoods</code>:
            </span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {(rules.missingLikelihoodsSample ?? []).map((r: any) => (
              <div key={r.ruleId} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground w-32 truncate shrink-0">{r.ruleId}</span>
                <span className="text-yellow-800 dark:text-yellow-200 truncate">{r.diagnosisLabel}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
            Run <strong>Phase 3 Migration</strong> below to populate the normalized feature table from existing data.
          </div>
        </div>
      )}

      {/* Coverage gaps */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Coverage Gaps</div>
        <CoverageGapList
          label="Complaints without red flag rules"
          items={coverage?.complaintsWithoutRedFlags ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={Shield}
        />
        <CoverageGapList
          label="Complaints without treatment rules"
          items={coverage?.complaintsWithoutTreatments ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={Pill}
        />
        <CoverageGapList
          label="Complaints without approved golden cases"
          items={coverage?.complaintsWithoutGoldenCases ?? []}
          fixHref={ROUTES.GOLDEN_CASES}
          icon={XCircle}
        />
        <CoverageGapList
          label="Complaints without disposition rules"
          items={coverage?.complaintsWithoutDisposition ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={FileText}
        />
      </div>
    </div>
  );
}

// ── Audit Report Panel ────────────────────────────────────────────────────────

function AuditReportPanel() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/kb/audit-report"] });
  const [showTrace, setShowTrace] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground animate-pulse">Loading audit report…</div>;
  if (!data) return null;

  const { summary, hardcodedLogicInventory, exampleTrace } = data;

  const riskColor = (risk: string) =>
    risk === "high" ? "text-red-600" : risk === "medium" ? "text-yellow-600" : "text-green-600";

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Diagnosis engine KB-driven", ok: summary.diagnosisEngineKbDriven },
          { label: "All priors from DB", ok: summary.allPriorsFromDB },
          { label: "CSV does NOT affect live differential", ok: !summary.csvAffectsRuntimeDifferential },
        ].map(item => (
          <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${item.ok ? "border-green-200 bg-green-50 dark:bg-green-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
            {item.ok
              ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              : <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            }
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Hardcoded inventory */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Remaining Hardcoded Logic</div>
        {(hardcodedLogicInventory ?? []).map((item: any) => (
          <div key={item.id} className="rounded-lg border border-border p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{item.id}</span>
              <Badge className={`text-xs shrink-0 ${item.risk === "high" ? "bg-red-100 text-red-800" : item.risk === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                {item.risk} risk
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{item.location}</div>
            <div className="text-xs">{item.description}</div>
            <div className="text-xs">
              <span className="font-medium">Status: </span>
              <span className={item.status.startsWith("INACTIVE") ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400"}>
                {item.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Fix: </span>{item.remediation}
            </div>
          </div>
        ))}
      </div>

      {/* Example trace */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200 w-full text-left"
          onClick={() => setShowTrace(t => !t)}
        >
          <Brain className="h-4 w-4" />
          KB Row → Diagnosis → Treatment → Disposition Example Trace
          {showTrace ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
        </button>
        {showTrace && (
          <ol className="mt-3 space-y-1.5">
            {(exampleTrace?.steps ?? []).map((s: string, i: number) => (
              <li key={i} className="text-xs font-mono text-blue-800 dark:text-blue-200 leading-relaxed">{s}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Source Map Table ──────────────────────────────────────────────────────────

function SourceMapTable() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/kb/audit/source-map"],
  });

  if (isLoading) return <div className="text-center py-6 text-muted-foreground">Loading source map…</div>;
  if (!data) return null;

  const STATUS_CLASS = (editable: boolean) => editable
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 flex items-start gap-3 ${data.sheetsStatus.configured ? "border-green-300 bg-green-50 dark:bg-green-950" : "border-yellow-300 bg-yellow-50 dark:bg-yellow-950"}`}>
        <Info className="h-5 w-5 mt-0.5 flex-shrink-0 text-yellow-600" />
        <div>
          <div className="font-semibold text-sm">Google Sheets Status</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {data.sheetsStatus.configured ? "Active" : `Not configured — ${data.sheetsStatus.reason}`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.sheetsStatus.activeAtRuntime ? "Sheets are active at runtime." : `Fallback: ${data.sheetsStatus.fallback}`}
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Domain", "Current Source", "App-Editable", "CSV Fallback", "Hardcoded?", "Notes"].map(h => (
                <th key={h} className="text-left p-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data.domains || []).map((d: any) => (
              <tr key={d.domain} className="hover:bg-muted/30">
                <td className="p-3 font-medium whitespace-nowrap">{d.domain}</td>
                <td className="p-3 text-xs font-mono">{d.source}</td>
                <td className="p-3">
                  <Badge className={STATUS_CLASS(d.editable)}>{d.editable ? "Yes" : "No"}</Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{d.csvFallback ?? "—"}</td>
                <td className="p-3 text-xs text-orange-600">{d.hardcoded ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground max-w-[200px]">{d.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.hardcodedStillActive?.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950 p-4">
          <div className="font-semibold text-sm text-orange-800 dark:text-orange-200 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Hardcoded Medical Logic Still Active
          </div>
          <ul className="space-y-1">
            {data.hardcodedStillActive.map((item: string) => (
              <li key={item} className="text-xs text-orange-700 dark:text-orange-300 font-mono">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Recent Changes ────────────────────────────────────────────────────────────

function RecentChanges() {
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/changes?limit=20"],
  });

  const ACTION_COLORS: Record<string, string> = {
    create: "bg-green-100 text-green-800", update: "bg-blue-100 text-blue-800",
    delete: "bg-red-100 text-red-800", clone: "bg-purple-100 text-purple-800",
  };

  if (isLoading) return <div className="text-center py-4 text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="text-center py-4 text-muted-foreground">No changes yet. Seed and edit knowledge to see the log.</div>;

  return (
    <div className="space-y-2">
      {rows.map((r: any) => (
        <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-b-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</span>
          <Badge className={ACTION_COLORS[r.action] ?? ""}>{r.action}</Badge>
          <Badge variant="outline" className="text-xs">{r.domain}</Badge>
          <span className="font-mono text-xs truncate flex-1">{r.recordId}</span>
          <span className="text-xs text-muted-foreground">{r.changedBy}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pipeline Entry Points ─────────────────────────────────────────────────────

function PipelineEntryPoints() {
  const { data } = useQuery<any>({ queryKey: ["/api/kb/audit/source-map"] });
  if (!data) return null;
  const { verified = [], needsAudit = [] } = data.canonicalPipelineEntryPoints ?? {};
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-1">
          <CheckCircle className="h-4 w-4" /> Verified canonical entry points
        </div>
        <div className="space-y-1">
          {verified.map((ep: string) => (
            <div key={ep} className="font-mono text-xs bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 px-3 py-1.5 rounded">{ep}</div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2 flex items-center gap-1">
          <AlertTriangle className="h-4 w-4" /> Needs pipeline audit
        </div>
        <div className="space-y-1">
          {needsAudit.map((ep: string) => (
            <div key={ep} className="font-mono text-xs bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 px-3 py-1.5 rounded">{ep}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeOpsDashboardPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/kb/stats"] });

  const seed = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/seed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/health"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/audit-report"] });
      toast({ title: "Seeded", description: "Knowledge base populated from existing data." });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const reload = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/cache-reload"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/health"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/audit-report"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/cache-status"] });
      toast({ title: "Cache reloaded", description: "All clinical rules refreshed from DB." });
    },
    onError: () => toast({ title: "Reload failed", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" /> Knowledge Ops Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Health, coverage, and source-of-truth metrics for the clinical knowledge base</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stats?.complaints === 0 && (
            <Button onClick={() => seed.mutate()} disabled={seed.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
              <RefreshCw className="h-4 w-4 mr-1" /> Seed Knowledge Base
            </Button>
          )}
          <Button variant="outline" onClick={() => reload.mutate()} disabled={reload.isPending} data-testid="button-reload-cache">
            <RefreshCw className={`h-4 w-4 mr-1 ${reload.isPending ? "animate-spin" : ""}`} /> Reload Cache
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh Stats
          </Button>
          <Link href={ROUTES.KNOWLEDGE_BASE}>
            <Button><Database className="h-4 w-4 mr-1" /> Open KB Admin</Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-muted/30" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Active Complaints" value={stats?.activeComplaints ?? 0} sub={`of ${stats?.complaints ?? 0} total`} color="blue" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Shield} label="Approved Golden Cases" value={stats?.approvedGoldenCases ?? 0} sub={`of ${stats?.goldenCases ?? 0} total`} color="green" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={AlertTriangle} label="Red Flag Rules" value={stats?.redFlags ?? 0} color="red" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Activity} label="Modifier Rules" value={stats?.modifiers ?? 0} color="purple" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Stethoscope} label="Diagnosis Rules" value={stats?.diagnosisRules ?? 0} color="blue" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Pill} label="Treatment Rules" value={stats?.treatmentRules ?? 0} color="green" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={FileText} label="Disposition Rules" value={stats?.dispositionRules ?? 0} color="yellow" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Database} label="Knowledge Changes" value={stats?.knowledgeChanges ?? 0} sub="in audit log" color="purple" href={ROUTES.KNOWLEDGE_BASE} />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Knowledge Health Panel (NEW) ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" /> Knowledge Health Panel
                <Badge variant="outline" className="ml-2 text-xs">Phase 2</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KnowledgeHealthPanel />
            </CardContent>
          </Card>
        </div>

        {/* ── Audit Report ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" /> Hardcoded Logic Audit Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditReportPanel />
            </CardContent>
          </Card>
        </div>

        {/* Source of Truth Map */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" /> Source-of-Truth Audit Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SourceMapTable />
            </CardContent>
          </Card>
        </div>

        {/* Recent Changes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Recent Knowledge Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecentChanges />
          </CardContent>
        </Card>

        {/* Pipeline Entry Points */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Pipeline Entry Point Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineEntryPoints />
          </CardContent>
        </Card>

        {/* Coverage Health Checklist */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Coverage Health Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "All active complaints have at least 1 golden case", ok: (stats?.approvedGoldenCases ?? 0) >= (stats?.activeComplaints ?? 0), fix: "Add golden cases in KB Admin → Golden Cases" },
                { label: "Red flag rules exist for all complaints", ok: (stats?.redFlags ?? 0) > 0, fix: "Add red flag rules in KB Admin → Red Flags" },
                { label: "Disposition rules cover all complaints", ok: (stats?.dispositionRules ?? 0) > 0, fix: "Add disposition rules in KB Admin → Disposition" },
                { label: "Treatment rules available", ok: (stats?.treatmentRules ?? 0) > 0, fix: "Add treatment rules in KB Admin → Treatment" },
                { label: "Diagnosis rules seeded", ok: (stats?.diagnosisRules ?? 0) > 0, fix: "Add or seed diagnosis rules" },
                { label: "Workup rules configured", ok: (stats?.workupRules ?? 0) > 0, fix: "Add workup rules in KB Admin → Workup Rules" },
                { label: "Modifier rules active", ok: (stats?.modifiers ?? 0) > 0, fix: "Seed modifiers in KB Admin" },
                { label: "Plan templates available", ok: (stats?.planTemplates ?? 0) > 0, fix: "Add plan templates in KB Admin → Plan Templates" },
              ].map(item => (
                <div key={item.label} className={`flex items-start gap-3 p-3 rounded-lg border ${item.ok ? "border-green-200 bg-green-50 dark:bg-green-950" : "border-red-200 bg-red-50 dark:bg-red-950"}`}>
                  {item.ok ? <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    {!item.ok && <div className="text-xs text-muted-foreground mt-0.5">Fix: {item.fix}</div>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How-to guide */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> How to Add a New Complaint (No Code Required)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                { n: 1, step: "Complaint Registry", desc: "Add the new complaint with ID, system, aliases, and scoring module." },
                { n: 2, step: "Core Questions", desc: "Add complaint-specific questions — set type, required status, and order." },
                { n: 3, step: "Modifiers", desc: "Configure modifier rules (pregnancy, CKD, penicillin allergy, etc.)." },
                { n: 4, step: "Red Flag Rules", desc: "Define HARD/SOFT triggers that escalate to ER_NOW or URGENT." },
                { n: 5, step: "Workup Rules", desc: "Add lab, imaging, and bedside test rules with modifier-aware overrides." },
                { n: 6, step: "Diagnosis Rules", desc: "Add differentials with base probabilities AND featureLikelihoods (required for Bayesian engine)." },
                { n: 7, step: "Treatment Rules", desc: "Add first-line and alternative medications with dosing and allergy adjustments." },
                { n: 8, step: "Disposition Rules", desc: "Define when each disposition fires — connect to red flag results and scores." },
                { n: 9, step: "Plan Templates", desc: "Add discharge text, home care instructions, return precautions." },
                { n: 10, step: "Golden Cases", desc: "Add ≥3 golden cases per complaint (one per severity/modifier). Set status to Approved." },
                { n: 11, step: "Simulation", desc: "Use the Simulation Lab below — run 1,000–10,000 synthetic cases and inspect failures before deploying." },
              ].map(item => (
                <div key={item.n} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{item.n}</div>
                  <div>
                    <span className="font-semibold text-sm">{item.step}</span>
                    <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                  </div>
                </div>
              ))}
            </ol>
            <div className="mt-4">
              <Link href={ROUTES.KNOWLEDGE_BASE}>
                <Button className="w-full">Open Knowledge Base Admin <ExternalLink className="h-4 w-4 ml-2" /></Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Phase 3: Feature Normalizer ─────────────────────────────────────── */}
      <Phase3MigrationPanel />

      {/* ── Simulation Lab ─────────────────────────────────────────────────── */}
      <SimulationLabPanel />

      {/* ── Decision Trace ──────────────────────────────────────────────────── */}
      <DecisionTracePanel />
    </div>
  );
}

// ── Phase 3: Migration Panel ───────────────────────────────────────────────────
function Phase3MigrationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);

  const { data: coverage } = useQuery<any>({ queryKey: ["/api/kb/feature-coverage"] });

  const migrate = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/kb/migrate-to-feature-table", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Migration failed");
      return data;
    },
    onSuccess: (data) => {
      setResult(data.migration);
      queryClient.invalidateQueries({ queryKey: ["/api/kb/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kb/feature-coverage"] });
      toast({ title: `Migration complete — ${data.migration.pctKbDriven}% KB-driven` });
    },
    onError: (e: any) => toast({ title: "Migration error", description: e.message, variant: "destructive" }),
  });

  const isFullyCovered = (coverage?.pctKbDriven ?? 0) === 100;

  return (
    <Card className={`border-l-4 ${isFullyCovered ? "border-green-400" : "border-amber-400"}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-blue-600" /> Phase 3: Feature Normalizer
            <Badge className={`ml-1 ${isFullyCovered ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {coverage?.pctKbDriven ?? "…"}% KB-driven
            </Badge>
          </CardTitle>
          <Button
            size="sm"
            variant={isFullyCovered ? "outline" : "default"}
            onClick={() => migrate.mutate()}
            disabled={migrate.isPending}
            data-testid="button-phase3-migrate"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${migrate.isPending ? "animate-spin" : ""}`} />
            {migrate.isPending ? "Migrating…" : isFullyCovered ? "Re-run Migration" : "Run Migration"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Moves all clinical likelihood data from JSONB blobs and hardcoded TypeScript constants into the normalized
          <code className="mx-1 font-mono text-xs bg-muted px-1 rounded">kb_feature_likelihoods</code>
          table. After migration, every diagnosis decision is traceable to a specific Postgres row.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Coverage summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Bayesian rules", val: coverage?.total ?? "—", color: "text-blue-700" },
            { label: "Covered", val: coverage?.covered ?? "—", color: "text-green-700" },
            { label: "Feature rows", val: coverage?.featureRows ?? "—", color: "text-purple-700" },
            { label: "Missing", val: coverage?.missing?.length ?? "—", color: (coverage?.missing?.length ?? 0) === 0 ? "text-green-600" : "text-red-600" },
          ].map(s => (
            <div key={s.label} className="text-center p-3 bg-muted/40 rounded-lg">
              <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Migration result */}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800 dark:text-green-200">Migration completed in {result.durationMs}ms</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><span className="font-medium">Priors migrated:</span> {result.priorsProcessed}/12</div>
              <div><span className="font-medium">JSONB rules:</span> {result.jsonbRulesProcessed}</div>
              <div><span className="font-medium">Feature rows:</span> {result.featureRowsInserted} new → {result.featureRowsTotal} total</div>
            </div>
            {result.errors?.length > 0 && (
              <div className="text-xs text-red-700 dark:text-red-300 mt-1">
                Errors: {result.errors.join("; ")}
              </div>
            )}
          </div>
        )}

        {/* Missing rules list */}
        {(coverage?.missing?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">
              {coverage.missing.length} priors still missing feature rows:
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {coverage.missing.map((r: any) => (
                <div key={r.ruleId} className="text-xs font-mono flex gap-2">
                  <span className="text-muted-foreground shrink-0 w-36 truncate">{r.ruleId}</span>
                  <span className="text-amber-800 dark:text-amber-200">{r.diagnosisLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Simulation Lab ────────────────────────────────────────────────────────────
function SimulationLabPanel() {
  const { toast } = useToast();
  const [cases, setCases] = useState(1000);
  const [result, setResult] = useState<any>(null);

  const run = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/kb/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ cases }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Simulation failed");
      return data;
    },
    onSuccess: (data) => { setResult(data); toast({ title: `Simulation complete — ${data.accuracyRate} accuracy` }); },
    onError: (e: any) => toast({ title: "Simulation error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="border-l-4 border-purple-400">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-600" /> Simulation Lab — Monte Carlo Engine Test
          </CardTitle>
          {result && (
            <Badge className={`text-sm px-3 py-1 ${parseFloat(result.accuracyRate) >= 75 ? "bg-green-100 text-green-800" : parseFloat(result.accuracyRate) >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
              {result.accuracyRate} accuracy
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Runs synthetic symptom sets through the Bayesian engine to measure accuracy, identify weak diagnoses, and surface remediation actions — before deploying rule changes.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium min-w-[80px]">Cases to run:</label>
          <Input type="number" min={100} max={10000} step={500} value={cases} onChange={e => setCases(Math.min(10000, Math.max(100, Number(e.target.value))))} className="w-32" data-testid="input-simulation-cases" />
          <Button onClick={() => run.mutate()} disabled={run.isPending} data-testid="button-run-simulation" className="bg-purple-600 hover:bg-purple-700 text-white">
            <Play className="h-4 w-4 mr-1" />{run.isPending ? `Running ${cases.toLocaleString()} cases…` : `Run ${cases.toLocaleString()} Cases`}
          </Button>
        </div>

        {result && (
          <div className="space-y-4">
            {/* Accuracy bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm"><span>Overall top-1 accuracy</span><span className="font-semibold">{result.accuracyRate}</span></div>
              <Progress value={parseFloat(result.accuracyRate)} className="h-3" />
              <p className="text-xs text-muted-foreground">Engine source: {result.engineSource} · {result.activePriors} active priors · {result.n.toLocaleString()} synthetic cases</p>
            </div>

            {/* Diagnosis clusters */}
            <div>
              <p className="text-sm font-semibold mb-2">Diagnosis Clusters (by frequency)</p>
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {result.clusters?.map((c: any) => (
                  <div key={c.diagnosis} className="flex items-center gap-3 text-xs">
                    <div className="w-36 truncate font-medium">{c.diagnosis}</div>
                    <div className="flex-1">
                      <div className="bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-purple-500 h-full" style={{ width: c.pctOfTotal }} />
                      </div>
                    </div>
                    <span className="w-10 text-right">{c.pctOfTotal}</span>
                    <span className="text-muted-foreground w-20 text-right">avg P={c.avgPosterior}</span>
                    <Badge variant="outline" className="text-xs">{c.source}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-diagnosis accuracy */}
            <div>
              <p className="text-sm font-semibold mb-2">Per-Diagnosis Match Rate</p>
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr><th className="text-left p-2">Diagnosis</th><th className="text-left p-2">Cases</th><th className="text-left p-2">Match Rate</th><th className="text-left p-2">Avg Posterior</th></tr></thead>
                  <tbody className="divide-y">
                    {result.diagnosisReport?.map((d: any) => (
                      <tr key={d.diagnosis} className="hover:bg-muted/30">
                        <td className="p-2 font-medium">{d.diagnosis}</td>
                        <td className="p-2">{d.casesGenerated}</td>
                        <td className="p-2">
                          <Badge className={`text-xs ${parseFloat(d.topMatchRate) >= 75 ? "bg-green-100 text-green-800" : parseFloat(d.topMatchRate) >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                            {d.topMatchRate}
                          </Badge>
                        </td>
                        <td className="p-2">{d.avgPosterior}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fix suggestions */}
            {result.fixSuggestions?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" /> Suggested Fixes ({result.fixSuggestions.length})</p>
                {result.fixSuggestions.map((f: any, i: number) => (
                  <div key={i} className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 p-3 space-y-1">
                    <p className="text-sm font-medium">{f.diagnosis}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">{f.issue}</p>
                    <p className="text-xs text-muted-foreground">Action: {f.action}</p>
                  </div>
                ))}
              </div>
            )}

            {result.fixSuggestions?.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-950 rounded-md p-3">
                <CheckCircle className="h-4 w-4" /> All diagnoses performing within acceptable accuracy thresholds. No remediation needed.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Decision Trace ─────────────────────────────────────────────────────────────
function DecisionTracePanel() {
  const { toast } = useToast();
  const [symptomInput, setSymptomInput] = useState("sore throat, fever, tonsillar exudate");
  const [result, setResult] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const trace = useMutation({
    mutationFn: async () => {
      const symptoms = symptomInput.split(",").map(s => s.trim()).filter(Boolean);
      const resp = await fetch("/api/kb/trace", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ symptoms }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Trace failed");
      return data;
    },
    onSuccess: (data) => { setResult(data); setExpanded({}); },
    onError: (e: any) => toast({ title: "Trace error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="border-l-4 border-blue-400">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-blue-600" /> Decision Trace — Full Provenance
        </CardTitle>
        <p className="text-sm text-muted-foreground">Enter symptoms to see exactly which DB rule drove each diagnosis — ruleId, tableName, version, posterior, matched features.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={symptomInput}
            onChange={e => setSymptomInput(e.target.value)}
            placeholder="sore throat, fever, tonsillar exudate, lymphadenopathy"
            data-testid="input-trace-symptoms"
            className="flex-1"
          />
          <Button onClick={() => trace.mutate()} disabled={trace.isPending} data-testid="button-run-trace">
            <Search className="h-4 w-4 mr-1" />{trace.isPending ? "Tracing…" : "Trace"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground border-b pb-2">
              <Badge className={result.engineSource === "KB_DB" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>{result.engineSource}</Badge>
              <span>{result.activePriorCount} active priors</span>
              <span>Cache age: {result.cacheAge}</span>
              <span>Symptoms: {result.symptoms?.join(", ")}</span>
            </div>
            {result.trace?.map((t: any) => (
              <div key={t.rank} className={`rounded-md border p-3 space-y-2 ${t.rank === 1 ? "border-blue-300 bg-blue-50 dark:bg-blue-950" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{t.rank}</span>
                    <span className="font-semibold">{t.diagnosis}</span>
                    <Badge className={t.confidence === "high" ? "bg-green-100 text-green-800" : t.confidence === "moderate" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-700"}>{t.confidence}</Badge>
                    <span className="text-sm font-mono">{(t.posterior * 100).toFixed(1)}%</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(p => ({ ...p, [t.rank]: !p[t.rank] }))}>
                    {expanded[t.rank] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
                {/* Provenance line — always visible */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pl-8">
                  <span><span className="font-medium text-foreground">Source:</span> {t.tableName ?? t.source}</span>
                  {t.ruleId && <span><span className="font-medium text-foreground">Rule ID:</span> {t.ruleId}</span>}
                  {t.version && <span><span className="font-medium text-foreground">Version:</span> v{t.version}</span>}
                  <span><span className="font-medium text-foreground">Matched:</span> {t.matchedFeatures?.join(", ") || "none"}</span>
                </div>
                {/* Expanded: featureLikelihoods */}
                {expanded[t.rank] && t.featureLikelihoods && (
                  <div className="pl-8 pt-1">
                    <p className="text-xs font-medium mb-1">Full feature likelihoods (P(symptom | {t.diagnosis})):</p>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(t.featureLikelihoods as Record<string, number>).sort(([,a],[,b]) => b - a).map(([sym, prob]) => (
                        <div key={sym} className="flex items-center gap-2 text-xs">
                          <div className="flex-1 flex items-center gap-1">
                            <span className={t.matchedFeatures?.includes(sym) ? "font-semibold text-blue-700 dark:text-blue-300" : "text-muted-foreground"}>{sym}</span>
                            {t.matchedFeatures?.includes(sym) && <CheckCircle className="h-3 w-3 text-blue-500" />}
                          </div>
                          <span className="font-mono text-xs w-10 text-right">{(prob * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
