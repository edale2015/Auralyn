import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Brain, Shield, Database, Zap, Hash, Clock,
} from "lucide-react";

const AUTH = () => {
  const t = localStorage.getItem("app_auth_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function apiFetch(url: string) {
  const res = await fetch(url, { headers: AUTH() });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const ROLES = ["triage", "differential", "disposition", "billing", "supervisor"] as const;

function MetricCard({
  icon, label, value, sub, color = "text-foreground",
}: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function StabilityBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-muted-foreground text-xs">No data</span>;
  const pct = Math.round(rate * 100);
  const color = pct >= 95 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Prefix Stability Rate</span>
        <span className={pct >= 95 ? "text-green-600 font-semibold" : "text-yellow-600 font-semibold"}>{pct}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ContextHealthPanel() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const summaryQ = useQuery<any>({
    queryKey: ["/api/context-health/summary"],
    queryFn:  () => apiFetch("/api/context-health/summary"),
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  const violationsQ = useQuery<any>({
    queryKey: ["/api/context-health/violations"],
    queryFn:  () => apiFetch("/api/context-health/violations"),
    refetchInterval: autoRefresh ? 15_000 : false,
  });

  const memoryQ = useQuery<any>({
    queryKey: ["/api/context-health/memory"],
    queryFn:  () => apiFetch("/api/context-health/memory"),
  });

  const s = summaryQ.data?.summary;
  const violations: any[] = violationsQ.data?.violations ?? [];
  const memEntries: any[] = memoryQ.data?.entries ?? [];
  const isLoading = summaryQ.isLoading || violationsQ.isLoading;

  function refresh() {
    summaryQ.refetch();
    violationsQ.refetch();
    memoryQ.refetch();
  }

  return (
    <div className="space-y-6" data-testid="context-health-panel">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Context Engineering Health</span>
          <Badge variant="outline" className="text-xs">24-hour window</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="button-auto-refresh-toggle"
            onClick={() => setAutoRefresh(v => !v)}
            className={autoRefresh ? "border-green-500 text-green-600" : ""}
          >
            <Zap className={`h-3 w-3 mr-1 ${autoRefresh ? "text-green-500" : ""}`} />
            {autoRefresh ? "Auto ✓" : "Auto"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-context-health-refresh"
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading
              ? <Loader2 className="animate-spin h-3 w-3 mr-1" />
              : <RefreshCw className="h-3 w-3 mr-1" />
            }
            Refresh
          </Button>
        </div>
      </div>

      {summaryQ.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="animate-spin h-4 w-4" />Loading context health metrics…
        </div>
      )}

      {summaryQ.isError && (
        <div className="border border-red-200 bg-red-50 dark:bg-red-950 rounded-md p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Could not load context metrics — pipeline may not have run yet in this session.
        </div>
      )}

      {s && (
        <>
          {/* Top metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={<Shield className="h-4 w-4" />}
              label="Contract Violations"
              value={s.contract_violations ?? 0}
              sub="24h window"
              color={(s.contract_violations ?? 0) > 0 ? "text-red-600" : "text-green-600"}
            />
            <MetricCard
              icon={<Zap className="h-4 w-4" />}
              label="Compaction Events"
              value={`${s.compaction_events?.mean ?? 0} avg`}
              sub="per encounter"
              color="text-orange-500"
            />
            <MetricCard
              icon={<Brain className="h-4 w-4" />}
              label="Artifacts / Encounter"
              value={`p50: ${s.artifacts_per_encounter?.p50 ?? 0}`}
              sub={`p95: ${s.artifacts_per_encounter?.p95 ?? 0}`}
            />
            <MetricCard
              icon={<Hash className="h-4 w-4" />}
              label="Prefix Stability"
              value={
                s.prefix_stability === null
                  ? "—"
                  : `${Math.round((s.prefix_stability ?? 0) * 100)}%`
              }
              sub={s.sample_count ? `${s.sample_count} samples` : "No data yet"}
              color={(s.prefix_stability ?? 1) >= 0.95 ? "text-green-600" : "text-yellow-600"}
            />
          </div>

          {/* Prefix stability bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="h-4 w-4 text-indigo-500" />
                Prompt Prefix Stability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StabilityBar rate={s.prefix_stability ?? null} />
              <p className="text-xs text-muted-foreground mt-2">
                Measures how often each role's immutable prefix hash stays unchanged across encounters.
                Drops below 95% when shared knowledge base or system-level context changes unexpectedly.
              </p>
            </CardContent>
          </Card>

          {/* Prompt tokens by role */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-500" />
                Prompt Tokens by Role (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-center">
                {ROLES.map(role => {
                  const d = s.prompt_tokens_by_role?.[role] ?? { p50: 0, p95: 0 };
                  const overBudget = d.p95 > 12_000;
                  return (
                    <div
                      key={role}
                      data-testid={`metric-tokens-${role}`}
                      className={`border rounded p-2 space-y-1 ${overBudget ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30" : ""}`}
                    >
                      <div className="font-semibold capitalize">{role}</div>
                      <div className={`text-base font-bold ${overBudget ? "text-orange-600" : ""}`}>
                        {d.p50.toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">p50</div>
                      <div className="text-slate-400">{d.p95.toLocaleString()} p95</div>
                      {overBudget && <Badge className="bg-orange-100 text-orange-700 text-xs">Over budget</Badge>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Memory store + top excluded types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-purple-500" />
                  Memory Hits by Scope (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(s.memory_store_size ?? {}).length === 0 ? (
                  <div className="text-muted-foreground text-xs py-2">No memory hits recorded yet.</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {Object.entries(s.memory_store_size ?? {}).map(([scope, count]: [string, any]) => (
                      <div key={scope} className="flex items-center justify-between">
                        <span className="text-muted-foreground capitalize">{scope}</span>
                        <Badge variant="outline" data-testid={`memory-scope-${scope}`}>{count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Top Budget-Excluded Artifact Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(s.top_excluded_types ?? []).length === 0 ? (
                  <div className="text-muted-foreground text-xs py-2">No exclusions recorded — context is within budget.</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {(s.top_excluded_types ?? []).map((item: any) => (
                      <div key={item.type} className="flex items-center justify-between">
                        <span className="text-muted-foreground font-mono text-xs">{item.type}</span>
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          {item.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Contract violations table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-500" />
            Contract Violations (last 200, 24h)
            {violations.length > 0 && (
              <Badge className="bg-red-600 text-white ml-1">{violations.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {violationsQ.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="animate-spin h-3 w-3" />Loading…
            </div>
          )}
          {!violationsQ.isLoading && violations.length === 0 && (
            <div className="flex items-center gap-2 text-green-600 text-sm py-2">
              <CheckCircle2 className="h-4 w-4" />
              No contract violations in the current 24-hour window.
            </div>
          )}
          {violations.length > 0 && (
            <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs">Artifact Type</TableHead>
                    <TableHead className="text-xs">Encounter</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violations.map((v: any, i: number) => (
                    <TableRow key={i} data-testid={`row-violation-${i}`}>
                      <TableCell className="text-xs font-medium capitalize">{v.role}</TableCell>
                      <TableCell className="text-xs font-mono">{v.artifact_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                        {v.encounterId ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(v.occurredAt).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clinical memory writes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-500" />
            Clinical Memory Store (recent 100 entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memoryQ.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="animate-spin h-3 w-3" />Loading…
            </div>
          )}
          {!memoryQ.isLoading && memEntries.length === 0 && (
            <div className="text-muted-foreground text-xs py-2">
              No memory entries yet — entries are written by the supervisor gate after pipeline completion.
            </div>
          )}
          {memEntries.length > 0 && (
            <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Scope</TableHead>
                    <TableHead className="text-xs">Key</TableHead>
                    <TableHead className="text-xs">Confidence</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">
                      <Clock className="h-3 w-3 inline mr-1" />Updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memEntries.map((m: any, i: number) => (
                    <TableRow key={m.id ?? i} data-testid={`row-memory-${i}`}>
                      <TableCell className="text-xs capitalize">{m.scope}</TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-[140px]">{m.key}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={
                            Number(m.confidence) >= 0.8
                              ? "border-green-400 text-green-700"
                              : Number(m.confidence) >= 0.5
                              ? "border-yellow-400 text-yellow-700"
                              : "border-red-300 text-red-600"
                          }
                        >
                          {Number(m.confidence).toFixed(2)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          className={
                            m.status === "verified"
                              ? "bg-green-100 text-green-700"
                              : m.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-slate-100 text-slate-600"
                          }
                        >
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.source ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.updated_at
                          ? new Date(m.updated_at).toLocaleString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ContextHealthPanel;
