import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronRight, RefreshCw, Search, X,
  ExternalLink, RotateCcw, Activity, Cpu, Layers,
  Zap, Box, Settings, Database, TriangleAlert
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type OpsHealth = "green" | "amber" | "red" | "gray";
type OpsStatus = "active" | "degraded" | "error" | "stopped" | "stub" | "planned" | "unknown";
type OpsType = "Engine" | "Skill" | "Agent" | "Loop" | "Service" | "Integration";

interface OpsComponent {
  id: string;
  name: string;
  type: OpsType;
  category: string;
  status: OpsStatus;
  health: OpsHealth;
  description: string;
  latencyMs?: number;
  errorCount: number;
  cycleCount?: number;
  lastRunMs?: number;
  enabled: boolean;
  canRestart: boolean;
  canToggle: boolean;
  dashboardPath?: string;
  tags?: string[];
  detail?: string;
  filePath?: string;
}

interface GridResponse {
  components: OpsComponent[];
  total: number;
  generatedAt: string;
}

type FilterMode = "all" | "Engine" | "Skill" | "Agent" | "Loop" | "Service" | "Integration" | "errors" | "degraded";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_DOT: Record<OpsHealth, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

const HEALTH_RING: Record<OpsHealth, string> = {
  green: "ring-emerald-200",
  amber: "ring-amber-200",
  red: "ring-red-200",
  gray: "ring-slate-200",
};

const STATUS_BADGE: Record<OpsStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  degraded: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  stopped: "bg-slate-100 text-slate-600",
  stub: "bg-blue-100 text-blue-700",
  planned: "bg-purple-100 text-purple-700",
  unknown: "bg-slate-100 text-slate-500",
};

const TYPE_ICON: Record<OpsType, React.ReactNode> = {
  Engine: <Cpu className="h-3 w-3" />,
  Skill: <Layers className="h-3 w-3" />,
  Agent: <Zap className="h-3 w-3" />,
  Loop: <Activity className="h-3 w-3" />,
  Service: <Box className="h-3 w-3" />,
  Integration: <Database className="h-3 w-3" />,
};

const TYPE_COLOR: Record<OpsType, string> = {
  Engine: "bg-violet-100 text-violet-700",
  Skill: "bg-teal-100 text-teal-700",
  Agent: "bg-yellow-100 text-yellow-800",
  Loop: "bg-blue-100 text-blue-700",
  Service: "bg-orange-100 text-orange-700",
  Integration: "bg-slate-100 text-slate-600",
};

function msAgo(ms?: number): string {
  if (!ms) return "—";
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function latencyLabel(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 10) return `${ms}ms`;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function rowBg(c: OpsComponent): string {
  if (c.health === "red") return "bg-red-50/40 dark:bg-red-950/20 border-l-4 border-red-500";
  if (c.health === "amber") return "bg-amber-50/30 dark:bg-amber-950/10 border-l-4 border-amber-400";
  if (c.status === "stopped" || c.status === "planned") return "opacity-60 border-l-4 border-transparent";
  return "border-l-4 border-transparent";
}

// ─── HealthDot ────────────────────────────────────────────────────────────────

function HealthDot({ health, pulse }: { health: OpsHealth; pulse?: boolean }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ${HEALTH_RING[health]}`}>
      {pulse && (health === "red" || health === "amber") && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${HEALTH_DOT[health]} opacity-60`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${HEALTH_DOT[health]}`} />
    </span>
  );
}

// ─── ExpandedRow ──────────────────────────────────────────────────────────────

function ExpandedRow({ c, onRestart, onToggle, restarting, toggling }: {
  c: OpsComponent;
  onRestart: () => void;
  onToggle: (enabled: boolean) => void;
  restarting: boolean;
  toggling: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-2 text-xs">
        <div className="col-span-2 md:col-span-3 xl:col-span-4">
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Description</span>
          <p className="mt-0.5 text-slate-700 dark:text-slate-300 leading-relaxed">{c.description}</p>
        </div>

        {c.detail && c.detail !== c.description && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wide">Detail</span>
            <p className="mt-0.5 text-slate-600 dark:text-slate-400">{c.detail}</p>
          </div>
        )}
        {c.filePath && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wide">File</span>
            <p className="mt-0.5 text-slate-500 font-mono text-[10px]">{c.filePath}</p>
          </div>
        )}
        {c.tags && c.tags.length > 0 && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wide">Tags</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {c.tags.map(t => (
                <span key={t} className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-sm text-slate-600 dark:text-slate-300">{t}</span>
              ))}
            </div>
          </div>
        )}
        {c.cycleCount != null && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wide">Cycles</span>
            <p className="mt-0.5 text-slate-600 dark:text-slate-400 font-mono">{c.cycleCount.toLocaleString()}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 flex-wrap">
        {c.canRestart && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={onRestart} disabled={restarting} data-testid={`restart-${c.id}`}>
            <RotateCcw className="h-3 w-3" />
            {restarting ? "Restarting…" : "Restart"}
          </Button>
        )}
        {c.canToggle && (
          <div className="flex items-center gap-2">
            <Switch checked={c.enabled} onCheckedChange={onToggle} disabled={toggling}
              data-testid={`toggle-${c.id}`} />
            <span className="text-xs text-slate-500">{c.enabled ? "Enabled" : "Disabled"}</span>
          </div>
        )}
        {c.dashboardPath && (
          <Link href={c.dashboardPath}>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-slate-600" data-testid={`view-${c.id}`}>
              <ExternalLink className="h-3 w-3" />
              Open Dashboard
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── ComponentRow ─────────────────────────────────────────────────────────────

function ComponentRow({ c, expanded, onExpand, onRestart, onToggle, restarting, toggling }: {
  c: OpsComponent;
  expanded: boolean;
  onExpand: () => void;
  onRestart: () => void;
  onToggle: (enabled: boolean) => void;
  restarting: boolean;
  toggling: boolean;
}) {
  return (
    <>
      <tr
        className={`group h-10 cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${rowBg(c)}`}
        onClick={onExpand}
        data-testid={`ops-row-${c.id}`}
      >
        {/* Expand */}
        <td className="w-6 px-1 text-slate-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>

        {/* Health dot */}
        <td className="w-10 px-1 text-center">
          <HealthDot health={c.health} pulse />
        </td>

        {/* Type badge */}
        <td className="w-24 px-1">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLOR[c.type]}`}>
            {TYPE_ICON[c.type]}
            {c.type}
          </span>
        </td>

        {/* Name */}
        <td className="min-w-40 max-w-56 px-2">
          <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate block" title={c.name}>
            {c.name}
          </span>
        </td>

        {/* Category */}
        <td className="min-w-24 max-w-36 px-2 hidden sm:table-cell">
          <span className="text-[11px] text-slate-500 truncate block">{c.category}</span>
        </td>

        {/* Description */}
        <td className="min-w-64 max-w-96 px-2 hidden lg:table-cell">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block" title={c.description}>
            {c.description.length > 80 ? c.description.slice(0, 80) + "…" : c.description}
          </span>
        </td>

        {/* Status badge */}
        <td className="w-24 px-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[c.status]}`}>
            {c.status.toUpperCase()}
          </span>
        </td>

        {/* Latency */}
        <td className="w-16 px-1 text-center hidden md:table-cell">
          <span className={`text-[11px] font-mono ${c.latencyMs && c.latencyMs > 1000 ? "text-amber-600 font-bold" : "text-slate-500"}`}>
            {latencyLabel(c.latencyMs)}
          </span>
        </td>

        {/* Errors */}
        <td className="w-14 px-1 text-center hidden md:table-cell">
          <span className={`text-[11px] font-mono ${c.errorCount > 0 ? "text-red-500 font-bold" : "text-slate-400"}`}>
            {c.errorCount > 0 ? c.errorCount : "—"}
          </span>
        </td>

        {/* Last Run */}
        <td className="w-20 px-1 text-center hidden xl:table-cell">
          <span className="text-[11px] text-slate-400">{msAgo(c.lastRunMs)}</span>
        </td>

        {/* Enabled toggle (inline for quick toggle) */}
        <td className="w-16 px-1 text-center" onClick={e => e.stopPropagation()}>
          {c.canToggle ? (
            <Switch checked={c.enabled} onCheckedChange={onToggle} disabled={toggling}
              className="scale-75 data-[state=checked]:bg-emerald-500"
              data-testid={`inline-toggle-${c.id}`} />
          ) : (
            <span className={`inline-block w-2 h-2 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-slate-300"}`} />
          )}
        </td>

        {/* Actions */}
        <td className="w-20 px-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {c.canRestart && (
              <button onClick={onRestart} disabled={restarting}
                className="p-1 rounded hover:bg-blue-100 text-blue-500 transition-colors"
                title="Restart" data-testid={`inline-restart-${c.id}`}>
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {c.dashboardPath && (
              <Link href={c.dashboardPath}>
                <button className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors" title="Open Dashboard">
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </Link>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr data-testid={`ops-expanded-${c.id}`}>
          <td colSpan={12} className="p-0">
            <ExpandedRow c={c} onRestart={onRestart} onToggle={onToggle} restarting={restarting} toggling={toggling} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemOpsGridPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"health" | "name" | "type" | "latency" | "errors">("health");

  const { data, isLoading, refetch, isFetching } = useQuery<GridResponse>({
    queryKey: ["/api/system-ops/grid"],
    queryFn: () => fetch("/api/system-ops/grid").then(r => r.json()),
    refetchInterval: 30000,
  });

  const all: OpsComponent[] = data?.components ?? [];

  // Counts for filter tabs
  const counts = useMemo(() => ({
    all: all.length,
    Engine: all.filter(c => c.type === "Engine").length,
    Skill: all.filter(c => c.type === "Skill").length,
    Agent: all.filter(c => c.type === "Agent").length,
    Loop: all.filter(c => c.type === "Loop").length,
    Service: all.filter(c => c.type === "Service").length,
    Integration: all.filter(c => c.type === "Integration").length,
    errors: all.filter(c => c.health === "red").length,
    degraded: all.filter(c => c.health === "amber").length,
  }), [all]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = all;
    if (filter === "errors") list = list.filter(c => c.health === "red");
    else if (filter === "degraded") list = list.filter(c => c.health === "amber");
    else if (filter !== "all") list = list.filter(c => c.type === filter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "health") {
        const order: Record<OpsHealth, number> = { red: 0, amber: 1, gray: 2, green: 3 };
        return order[a.health] - order[b.health];
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "type") return a.type.localeCompare(b.type);
      if (sortBy === "latency") return (b.latencyMs ?? 0) - (a.latencyMs ?? 0);
      if (sortBy === "errors") return b.errorCount - a.errorCount;
      return 0;
    });

    return list;
  }, [all, filter, search, sortBy]);

  // Mutations
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/system-ops/grid"] });

  const restartMut = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/system-ops/loops/${encodeURIComponent(name)}/restart`, {}),
    onSuccess: (_, name) => { toast({ title: `Loop restarted: ${name}` }); invalidate(); },
    onError: () => toast({ title: "Restart failed", variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("POST", `/api/system-ops/skills/${encodeURIComponent(id)}/toggle`, { enabled }),
    onSuccess: (_, { id, enabled }) => { toast({ title: `${id}: ${enabled ? "Enabled" : "Disabled"}` }); invalidate(); },
    onError: () => toast({ title: "Toggle failed", variant: "destructive" }),
  });

  const resetMut = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/system-ops/engines/${encodeURIComponent(name)}/reset`, {}),
    onSuccess: () => { toast({ title: "Engine status reset" }); invalidate(); },
  });

  const filterTabs: { key: FilterMode; label: string; color: string }[] = [
    { key: "all", label: "All", color: "text-slate-600" },
    { key: "errors", label: "🔴 Errors", color: "text-red-600" },
    { key: "degraded", label: "🟡 Degraded", color: "text-amber-600" },
    { key: "Engine", label: "Engines", color: "text-violet-600" },
    { key: "Loop", label: "Loops", color: "text-blue-600" },
    { key: "Skill", label: "Skills", color: "text-teal-600" },
    { key: "Agent", label: "Agents", color: "text-yellow-700" },
    { key: "Service", label: "Services", color: "text-orange-600" },
    { key: "Integration", label: "Infra", color: "text-slate-600" },
  ];

  const SortBtn = ({ field, label }: { field: typeof sortBy; label: string }) => (
    <button
      onClick={() => setSortBy(field)}
      className={`text-[10px] uppercase tracking-wide font-medium transition-colors ${sortBy === field ? "text-slate-800 dark:text-white" : "text-slate-400 hover:text-slate-600"}`}
    >
      {label} {sortBy === field && "↓"}
    </button>
  );

  const errorCount = counts.errors;
  const degradedCount = counts.degraded;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-slate-500" />
            <h1 className="text-base font-semibold text-slate-800 dark:text-white">System Operations Grid</h1>
            {(errorCount > 0 || degradedCount > 0) && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <TriangleAlert className="h-3 w-3" />
                {errorCount} error{errorCount !== 1 ? "s" : ""}
                {degradedCount > 0 && `, ${degradedCount} degraded`}
              </span>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {filterTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                data-testid={`ops-filter-${t.key}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${filter === t.key
                    ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                    : `bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 ${t.color}`
                  }`}
              >
                {t.label}
                <span className="bg-white/20 dark:bg-black/20 rounded-full px-1 text-[10px] font-bold">
                  {counts[t.key as keyof typeof counts]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search components…"
              className="pl-7 h-8 text-xs"
              data-testid="ops-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500 whitespace-nowrap" data-testid="ops-count">
            {isLoading ? "Loading…" : `${filtered.length} components`}
          </span>

          <button onClick={() => refetch()}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh" data-testid="ops-refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Last updated line */}
        {data?.generatedAt && (
          <p className="text-[10px] text-slate-400 mt-1">
            Snapshot: {new Date(data.generatedAt).toLocaleTimeString()} · auto-refreshes every 30s
          </p>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" data-testid="ops-grid-table">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 800 }}>
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr className="h-9">
              <th className="w-6" />
              <th className="w-10 text-center">
                <span className="text-[10px] text-slate-400">●</span>
              </th>
              <th className="w-24 px-1 text-left">
                <SortBtn field="type" label="Type" />
              </th>
              <th className="min-w-40 px-2 text-left">
                <SortBtn field="name" label="Name" />
              </th>
              <th className="min-w-24 px-2 text-left hidden sm:table-cell">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Category</span>
              </th>
              <th className="min-w-64 px-2 text-left hidden lg:table-cell">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Description</span>
              </th>
              <th className="w-24 px-2 text-left">
                <SortBtn field="health" label="Status" />
              </th>
              <th className="w-16 px-1 text-center hidden md:table-cell">
                <SortBtn field="latency" label="Latency" />
              </th>
              <th className="w-14 px-1 text-center hidden md:table-cell">
                <SortBtn field="errors" label="Errs" />
              </th>
              <th className="w-20 px-1 text-center hidden xl:table-cell">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Last Run</span>
              </th>
              <th className="w-16 px-1 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">On</span>
              </th>
              <th className="w-20" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {isLoading && (
              <tr>
                <td colSpan={12} className="py-16 text-center text-slate-400 text-sm">
                  Loading system components…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="py-16 text-center">
                  <Settings className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No components match this filter.</p>
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const loopName = c.id.replace("loop:", "");
              const skillId = c.id.replace("skill:", "");
              const engineName = c.id.replace("engine:", "");
              return (
                <ComponentRow
                  key={c.id}
                  c={c}
                  expanded={expanded === c.id}
                  onExpand={() => setExpanded(prev => prev === c.id ? null : c.id)}
                  onRestart={() => restartMut.mutate(loopName)}
                  onToggle={(enabled) => {
                    if (c.canToggle) toggleMut.mutate({ id: skillId, enabled });
                    else if (c.type === "Engine") resetMut.mutate(engineName);
                  }}
                  restarting={restartMut.isPending && restartMut.variables === loopName}
                  toggling={toggleMut.isPending && toggleMut.variables?.id === skillId}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
