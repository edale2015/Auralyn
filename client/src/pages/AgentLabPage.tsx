import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot, Zap, Layers, TrendingUp, Activity, AlertTriangle, CheckCircle2,
  RefreshCw, Play, PowerOff, Power, Search, Clock, BarChart2, Eye,
  ChevronDown, ChevronRight, Sparkles, ShieldAlert, FlaskConical, Terminal,
} from "lucide-react";

/* ── helpers ──────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    idle:    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    error:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    disabled:"bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    critical:"bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    busy:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    green:   "bg-emerald-100 text-emerald-800",
    yellow:  "bg-amber-100 text-amber-800",
    red:     "bg-red-100 text-red-800",
    gray:    "bg-zinc-100 text-zinc-500",
    active:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      {status}
    </span>
  );
}

function SafetyBadge({ sc }: { sc: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border border-red-200",
    high:     "bg-amber-100 text-amber-800 border border-amber-200",
    medium:   "bg-blue-100 text-blue-700 border border-blue-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${map[sc] ?? ""}`}>
      {sc === "critical" && <ShieldAlert className="h-3 w-3" />}
      {sc}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-zinc-500" />
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
      {count !== undefined && (
        <span className="ml-1 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

/* ── AGENTS TAB ───────────────────────────────────────────────── */

function AgentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agent-lab/agents"],
  });

  const runMut = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/agent-lab/agents/${encodeURIComponent(name)}/run`),
    onSuccess: (_, name) => {
      toast({ title: `Agent "${name}" triggered`, description: "Run complete — check log tab." });
      qc.invalidateQueries({ queryKey: ["/api/agent-lab/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/agent-lab/log"] });
    },
    onError: (_, name) => toast({ variant: "destructive", title: `Failed to run "${name}"` }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ name, action }: { name: string; action: "enable" | "disable" }) =>
      apiRequest("POST", `/api/agent-lab/agents/${encodeURIComponent(name)}/${action}`),
    onSuccess: (_, { name, action }) => {
      toast({ title: `Agent "${name}" ${action}d` });
      qc.invalidateQueries({ queryKey: ["/api/agent-lab/agents"] });
    },
  });

  if (isLoading) return <div className="text-sm text-zinc-400 py-8 text-center">Loading agents…</div>;
  if (!data) return null;

  const agents: any[] = data.agents ?? [];
  const filtered = agents.filter((a) => {
    const matchName = a.name.toLowerCase().includes(filter.toLowerCase());
    const matchSource = sourceFilter === "all" || a.source === sourceFilter;
    return matchName && matchSource;
  });

  return (
    <div className="space-y-4">
      {/* summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Agents" value={data.summary?.total ?? 0} />
        <StatCard label="Coordinator" value={data.summary?.coordinator ?? 0} />
        <StatCard label="Task" value={data.summary?.task ?? 0} />
        <StatCard label="Governance" value={data.summary?.governance ?? 0} />
        <StatCard label="Healthy / Idle" value={data.summary?.healthy ?? 0} sub="running or idle" />
        <StatCard label="Error / Disabled" value={(data.summary?.error ?? 0) + (data.summary?.disabled ?? 0)} />
      </div>

      {/* filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Search agents…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-agent-filter"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-agent-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="coordinator">Coordinator</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()} data-testid="btn-agents-refresh">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* table */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Agent</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Source / Layer</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Status</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Runs</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Errors</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Avg ms</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((agent) => {
              const isExpanded = expandedAgent === agent.name;
              const hasResult = agent.lastResult !== null || agent.lastError !== null;
              return (
                <>
                  <tr
                    key={agent.name}
                    className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer"
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                    data-testid={`row-agent-${agent.name}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-zinc-400" /> : <ChevronRight className="h-3 w-3 text-zinc-400" />}
                        <div>
                          <p className="font-medium text-zinc-800 dark:text-zinc-200">{agent.name}</p>
                          {agent.description && (
                            <p className="text-xs text-zinc-400 truncate max-w-[200px]">{agent.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-zinc-500">{agent.source}</span>
                        <span className="text-xs text-zinc-400">{agent.layer ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={agent.status} /></td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{agent.runCount ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={agent.errorCount > 0 ? "text-red-600 font-medium" : "text-zinc-400"}>
                        {agent.errorCount ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">{agent.avgDurationMs != null ? `${agent.avgDurationMs}ms` : "—"}</td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {agent.source === "coordinator" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => runMut.mutate(agent.name)}
                              disabled={runMut.isPending || agent.status === "disabled"}
                              data-testid={`btn-run-${agent.name}`}
                            >
                              <Play className="h-3 w-3 mr-1" /> Run
                            </Button>
                            {agent.status === "disabled" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-emerald-600"
                                onClick={() => toggleMut.mutate({ name: agent.name, action: "enable" })}
                                data-testid={`btn-enable-${agent.name}`}
                              >
                                <Power className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-red-500"
                                onClick={() => toggleMut.mutate({ name: agent.name, action: "disable" })}
                                data-testid={`btn-disable-${agent.name}`}
                              >
                                <PowerOff className="h-3 w-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${agent.name}-expand`} className="bg-zinc-50 dark:bg-zinc-800/30">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="font-medium text-zinc-500 mb-1">Last Run</p>
                            <p className="text-zinc-700 dark:text-zinc-300">{agent.lastRun ?? "Never"}</p>
                          </div>
                          {agent.orchestratorMetrics && (
                            <div>
                              <p className="font-medium text-zinc-500 mb-1">Orchestrator Metrics</p>
                              <p className="text-zinc-700 dark:text-zinc-300">
                                p95: {agent.orchestratorMetrics.p95Latency ?? "—"}ms &nbsp;|&nbsp;
                                success rate: {agent.orchestratorMetrics.successRate ?? "—"}%
                              </p>
                            </div>
                          )}
                          {agent.trackingStats && (
                            <div>
                              <p className="font-medium text-zinc-500 mb-1">Tracking Stats</p>
                              <p className="text-zinc-700 dark:text-zinc-300">
                                {agent.trackingStats.runs} runs &nbsp;|&nbsp; {agent.trackingStats.successRate}% success
                              </p>
                            </div>
                          )}
                          {agent.lastError && (
                            <div className="col-span-3">
                              <p className="font-medium text-red-500 mb-1">Last Error</p>
                              <code className="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded block">
                                {agent.lastError}
                              </code>
                            </div>
                          )}
                          {agent.lastResult && (
                            <div className="col-span-3">
                              <p className="font-medium text-zinc-500 mb-1">Last Result (preview)</p>
                              <pre className="text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded overflow-x-auto text-xs max-h-24">
                                {JSON.stringify(agent.lastResult, null, 2).slice(0, 400)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-sm text-zinc-400 py-8">No agents match current filter.</div>
        )}
      </div>
    </div>
  );
}

/* ── SKILLS TAB ───────────────────────────────────────────────── */

function SkillsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [safetyFilter, setSafetyFilter] = useState("all");

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agent-lab/skills"],
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/agent-lab/skills/${id}/toggle`),
    onSuccess: (_, id) => {
      toast({ title: `Skill ${id} toggled (runtime only)` });
      qc.invalidateQueries({ queryKey: ["/api/agent-lab/skills"] });
    },
  });

  if (isLoading) return <div className="text-sm text-zinc-400 py-8 text-center">Loading skills…</div>;
  if (!data) return null;

  const skills: any[] = data.skills ?? [];
  const categories: string[] = ["all", ...Array.from(new Set(skills.map((s: any) => s.category)))];
  const safetyClasses = ["all", "critical", "high", "medium"];

  const filtered = skills.filter((s) => {
    const matchName = s.skillName.toLowerCase().includes(filter.toLowerCase()) ||
      s.skillId.toLowerCase().includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase());
    const matchCat = categoryFilter === "all" || s.category === categoryFilter;
    const matchSafety = safetyFilter === "all" || s.safetyClass === safetyFilter;
    return matchName && matchCat && matchSafety;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Skills" value={data.summary?.total ?? 0} />
        <StatCard label="Enabled" value={data.summary?.enabled ?? 0} />
        <StatCard label="Disabled" value={data.summary?.disabled ?? 0} />
        <StatCard label="Critical Safety" value={data.summary?.critical ?? 0} />
      </div>

      {/* category breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.summary?.byCategory ?? {}).map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              categoryFilter === cat
                ? "bg-zinc-800 text-white border-zinc-800 dark:bg-zinc-200 dark:text-zinc-900"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
            }`}
            data-testid={`btn-category-${cat}`}
          >
            {cat} <span className="opacity-60">({count as number})</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Search skill ID, name, or description…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-skill-filter"
          />
        </div>
        <Select value={safetyFilter} onValueChange={setSafetyFilter}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-safety-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {safetyClasses.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All safety" : s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()} data-testid="btn-skills-refresh">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">ID</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Skill</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Category</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Safety</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Trigger</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Health</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((skill) => (
              <tr
                key={skill.skillId}
                className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                data-testid={`row-skill-${skill.skillId}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{skill.skillId}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{skill.skillName}</p>
                  <p className="text-xs text-zinc-400 truncate max-w-[220px]">{skill.description}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded">
                    {skill.category}
                  </span>
                </td>
                <td className="px-3 py-2"><SafetyBadge sc={skill.safetyClass} /></td>
                <td className="px-3 py-2 text-xs text-zinc-500 font-mono">{skill.triggerType}</td>
                <td className="px-3 py-2">
                  {skill.health ? (
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={skill.health.status} />
                      {skill.health.avgLatencyMs && (
                        <span className="text-xs text-zinc-400">{Math.round(skill.health.avgLatencyMs)}ms</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-300 italic">not tracked</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant={skill.enabled ? "default" : "outline"}
                    className={`h-7 px-3 text-xs ${skill.runtimeDisabled ? "opacity-60" : ""}`}
                    onClick={() => toggleMut.mutate(skill.skillId)}
                    disabled={toggleMut.isPending}
                    data-testid={`btn-toggle-skill-${skill.skillId}`}
                  >
                    {skill.enabled ? "ON" : "OFF"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-sm text-zinc-400 py-8">No skills match current filter.</div>
        )}
      </div>
      <p className="text-xs text-zinc-400">
        Toggle state is runtime-only and resets on server restart. Static defaults are defined in the skill registry.
      </p>
    </div>
  );
}

/* ── LAYERS TAB ───────────────────────────────────────────────── */

const LAYER_COLORS: Record<string, string> = {
  SL3: "from-emerald-50 to-emerald-100 border-emerald-200 dark:from-emerald-950/40 dark:to-emerald-900/20 dark:border-emerald-800",
  SL4: "from-blue-50 to-blue-100 border-blue-200 dark:from-blue-950/40 dark:to-blue-900/20 dark:border-blue-800",
  SL5: "from-violet-50 to-violet-100 border-violet-200 dark:from-violet-950/40 dark:to-violet-900/20 dark:border-violet-800",
  SL6: "from-amber-50 to-amber-100 border-amber-200 dark:from-amber-950/40 dark:to-amber-900/20 dark:border-amber-800",
  SL7: "from-rose-50 to-rose-100 border-rose-200 dark:from-rose-950/40 dark:to-rose-900/20 dark:border-rose-800",
  SL8: "from-cyan-50 to-cyan-100 border-cyan-200 dark:from-cyan-950/40 dark:to-cyan-900/20 dark:border-cyan-800",
};

function LayersTab() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agent-lab/layers"],
  });

  if (isLoading) return <div className="text-sm text-zinc-400 py-8 text-center">Loading layers…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-zinc-500">
          Layer stack — SL3 through SL8 provide increasingly higher-order clinical intelligence above the core engine.
        </p>
        <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()} data-testid="btn-layers-refresh">
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.layers ?? []).map((layer: any) => (
          <div
            key={layer.layer}
            className={`bg-gradient-to-br ${LAYER_COLORS[layer.layer] ?? "from-zinc-50 to-zinc-100 border-zinc-200"} border rounded-xl p-4`}
            data-testid={`card-layer-${layer.layer}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/40 px-2 py-0.5 rounded">
                  {layer.layer}
                </span>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">{layer.name}</h3>
              </div>
              <StatusBadge status={layer.status} />
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">{layer.description}</p>
            <div className="flex items-center gap-2 mb-3">
              <code className="text-xs bg-white/60 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded font-mono">
                {layer.endpoint}
              </code>
            </div>
            {layer.stats && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(layer.stats).map(([k, v]) => (
                  <div key={k} className="bg-white/50 dark:bg-zinc-900/40 rounded px-2 py-1.5">
                    <p className="text-xs text-zinc-400">{k}</p>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-400 mt-2 font-mono">{layer.primaryFile}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── EVOLUTION TAB ────────────────────────────────────────────── */

function EvolutionTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agent-lab/evolution"],
  });

  const runEvolution = useMutation({
    mutationFn: () => apiRequest("POST", "/api/agent-lab/evolution/run"),
    onSuccess: () => {
      toast({ title: "Evolution analysis complete" });
      qc.invalidateQueries({ queryKey: ["/api/agent-lab/evolution"] });
    },
  });

  if (isLoading) return <div className="text-sm text-zinc-400 py-8 text-center">Loading evolution state…</div>;
  if (!data) return null;

  const { proposal, analyzedAt, systemContext } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Self-Evolution Engine</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Analyses safety data, learning cycles, and error rates to propose targeted improvements to agent configurations.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => runEvolution.mutate()}
          disabled={runEvolution.isPending}
          data-testid="btn-run-evolution"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          {runEvolution.isPending ? "Analysing…" : "Run Analysis"}
        </Button>
      </div>

      {/* system context */}
      {systemContext && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Agents" value={systemContext.totalAgents} />
          <StatCard label="Error Agents" value={systemContext.errorAgents} />
          <StatCard label="Total Runs" value={systemContext.totalRuns} />
          <StatCard label="Total Errors" value={systemContext.totalErrors} />
        </div>
      )}

      {/* proposal card */}
      {proposal ? (
        <div className={`rounded-xl border p-5 ${
          proposal.urgency === "high"
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            : proposal.urgency === "medium"
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
            : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
        }`} data-testid="card-evolution-proposal">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className={`h-4 w-4 ${
              proposal.urgency === "high" ? "text-red-500" : proposal.urgency === "medium" ? "text-amber-500" : "text-blue-500"
            }`} />
            <span className={`text-xs font-bold uppercase tracking-wide ${
              proposal.urgency === "high" ? "text-red-600" : proposal.urgency === "medium" ? "text-amber-600" : "text-blue-600"
            }`}>
              {proposal.urgency} urgency proposal
            </span>
            <span className="ml-auto text-xs text-zinc-400">{analyzedAt ? new Date(analyzedAt).toLocaleString() : "—"}</span>
          </div>
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Target: <code className="font-mono bg-white/60 dark:bg-zinc-900/40 px-1.5 py-0.5 rounded">{proposal.agent}</code>
              <span className="mx-2 text-zinc-300">›</span>
              <code className="font-mono bg-white/60 dark:bg-zinc-900/40 px-1.5 py-0.5 rounded">{proposal.change}</code>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{proposal.reason}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 font-medium mb-1">Proposed Config Changes</p>
            <pre className="bg-white/70 dark:bg-zinc-900/50 text-xs text-zinc-700 dark:text-zinc-300 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(proposal.newConfig, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">No evolution needed</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              System is healthy. No agent changes are currently proposed.
              {analyzedAt && ` Last analysed ${new Date(analyzedAt).toLocaleString()}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LOG & TRACES TAB ─────────────────────────────────────────── */

function LogTab() {
  const [agentFilter, setAgentFilter] = useState("");
  const [limit, setLimit] = useState(50);

  const { data: logData, isLoading: logLoading, refetch: refetchLog } = useQuery<any>({
    queryKey: ["/api/agent-lab/log", agentFilter, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (agentFilter) params.set("agent", agentFilter);
      return fetch(`/api/agent-lab/log?${params}`).then((r) => r.json());
    },
  });

  const { data: traceData, isLoading: traceLoading, refetch: refetchTrace } = useQuery<any>({
    queryKey: ["/api/agent-lab/traces"],
  });

  const agentNames: string[] = logData
    ? Array.from(new Set(Object.keys(logData.stats ?? {})))
    : [];

  return (
    <div className="space-y-6">
      {/* agent stats row */}
      {logData?.stats && Object.keys(logData.stats).length > 0 && (
        <div>
          <SectionHeader icon={BarChart2} title="Agent Execution Stats" count={Object.keys(logData.stats).length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(logData.stats).map(([name, s]: any) => (
              <div key={name} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-sm"
                data-testid={`stats-agent-${name}`}>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 mb-1">{name}</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span>{s.runs} runs</span>
                  <span className="text-emerald-600">{s.successRate}%</span>
                  <span>{s.avgMs}ms avg</span>
                  {s.failures > 0 && <span className="text-red-500">{s.failures} fails</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* log entries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader icon={Terminal} title="Execution Log" count={logData?.totalEntries ?? 0} />
          <div className="flex gap-2 items-center">
            <Select value={agentFilter || "__all__"} onValueChange={(v) => setAgentFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-7 w-40 text-xs" data-testid="select-log-agent">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All agents</SelectItem>
                {agentNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-7 w-20 text-xs" data-testid="select-log-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7" onClick={() => refetchLog()} data-testid="btn-log-refresh">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {logLoading ? (
          <div className="text-sm text-zinc-400 py-6 text-center">Loading log…</div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-zinc-500">Timestamp</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-500">Agent</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-500">Status</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-500">Duration</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-500">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(logData?.entries ?? []).map((entry: any, i: number) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800"
                    data-testid={`row-log-${i}`}>
                    <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">{entry.agent}</td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-zinc-500">{entry.durationMs}ms</td>
                    <td className="px-3 py-1.5 text-zinc-500 truncate max-w-[250px]">
                      {entry.errorMessage
                        ? <span className="text-red-500">{entry.errorMessage}</span>
                        : JSON.stringify(entry.resultSummary ?? {}).slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logData?.entries?.length && (
              <div className="text-center text-sm text-zinc-400 py-6">No log entries yet. Run an agent to see activity here.</div>
            )}
          </div>
        )}
      </div>

      {/* case traces */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader icon={Eye} title="Case Skill Traces" count={traceData?.total ?? 0} />
          <Button variant="outline" size="sm" className="h-7" onClick={() => refetchTrace()} data-testid="btn-trace-refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {traceLoading ? (
          <div className="text-sm text-zinc-400 py-4 text-center">Loading traces…</div>
        ) : (
          <div className="space-y-2">
            {(traceData?.traces ?? []).slice(0, 20).map((trace: any, i: number) => (
              <div key={trace.caseId ?? i} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3"
                data-testid={`card-trace-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-zinc-500">{trace.caseId}</span>
                  <span className="text-xs text-zinc-400">{new Date(trace.startedAt).toLocaleString()}</span>
                  <span className="ml-auto text-xs text-zinc-400">{trace.steps?.length ?? 0} steps</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(trace.steps ?? []).map((step: any, j: number) => (
                    <span
                      key={j}
                      className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                        step.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : step.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {step.skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!traceData?.traces?.length && (
              <div className="text-center text-sm text-zinc-400 py-6">No case traces available yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PAGE ROOT ────────────────────────────────────────────────── */

export default function AgentLabPage() {
  const [tab, setTab] = useState("agents");

  const { data: agentData } = useQuery<any>({ queryKey: ["/api/agent-lab/agents"] });
  const { data: skillData } = useQuery<any>({ queryKey: ["/api/agent-lab/skills"] });

  const agentErrors = agentData?.summary?.error ?? 0;
  const disabledAgents = agentData?.summary?.disabled ?? 0;
  const disabledSkills = skillData?.summary?.disabled ?? 0;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6" data-testid="page-agent-lab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-violet-500" />
            Agent & Skill Lab
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Live inspection, testing, toggling, and troubleshooting for all agents, skills, and layers.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {agentErrors > 0 && (
            <Badge variant="destructive" className="gap-1" data-testid="badge-agent-errors">
              <AlertTriangle className="h-3 w-3" /> {agentErrors} agent error{agentErrors !== 1 ? "s" : ""}
            </Badge>
          )}
          {disabledAgents > 0 && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-disabled-agents">
              <PowerOff className="h-3 w-3" /> {disabledAgents} disabled
            </Badge>
          )}
          {disabledSkills > 0 && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-disabled-skills">
              <Zap className="h-3 w-3" /> {disabledSkills} skills off
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1" data-testid="tabs-agent-lab">
          <TabsTrigger value="agents" className="flex items-center gap-1.5 data-testid=tab-agents">
            <Bot className="h-3.5 w-3.5" /> Agents
          </TabsTrigger>
          <TabsTrigger value="skills" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="layers" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Layers SL3–SL8
          </TabsTrigger>
          <TabsTrigger value="evolution" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Evolution
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Log & Traces
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4"><AgentsTab /></TabsContent>
        <TabsContent value="skills" className="mt-4"><SkillsTab /></TabsContent>
        <TabsContent value="layers" className="mt-4"><LayersTab /></TabsContent>
        <TabsContent value="evolution" className="mt-4"><EvolutionTab /></TabsContent>
        <TabsContent value="log" className="mt-4"><LogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
