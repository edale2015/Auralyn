/**
 * RoutingTelemetryDashboard.tsx — T020
 *
 * Displays live routing telemetry from GET /api/model-telemetry.
 * NEVER uses mock/hardcoded data — all rows come from the real T019 endpoint.
 */

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Lock, Zap, AlertCircle } from "lucide-react";
import { useState } from "react";

interface TelemetryRow {
  id:           number;
  agent:        string;
  chosen_model: string;
  pinned:       boolean;
  score:        string | null;
  encounter_id: string | null;
  created_at:   string;
}

const MODEL_COLOR: Record<string, string> = {
  "claude-opus-4-20250514":    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "claude-sonnet-4-20250514":  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "gpt-4o":                    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "gpt-4o-mini":               "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function modelBadgeClass(model: string): string {
  return MODEL_COLOR[model] ?? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function RoutingTelemetryDashboard() {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [pinnedFilter, setPinnedFilter] = useState<string>("all");

  const params = new URLSearchParams();
  if (agentFilter !== "all") params.set("agent", agentFilter);
  if (pinnedFilter !== "all") params.set("pinned", pinnedFilter);
  params.set("limit", "200");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<TelemetryRow[]>({
    queryKey: ["/api/model-telemetry", agentFilter, pinnedFilter],
    queryFn: async () => {
      const res = await fetch(`/api/model-telemetry?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token") ?? ""}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const rows = data ?? [];

  // Derive agent list for filter
  const allAgents = rows.length > 0
    ? [...new Set(rows.map(r => r.agent))].sort()
    : [];

  // Per-agent summary
  const agentSummary = allAgents.map(agent => {
    const agentRows = rows.filter(r => r.agent === agent);
    const pinned    = agentRows.some(r => r.pinned);
    const model     = agentRows[0]?.chosen_model ?? "—";
    const avgScore  = agentRows.length > 0
      ? (agentRows.reduce((s, r) => s + (r.score ? parseFloat(r.score) : 0), 0) / agentRows.length).toFixed(3)
      : null;
    return { agent, pinned, model, count: agentRows.length, avgScore };
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="routing-telemetry-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Model Routing Telemetry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live routing decisions — sourced from <code className="text-xs bg-muted px-1 rounded">/api/model-telemetry</code>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-telemetry"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {agentSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {agentSummary.map(s => (
            <Card key={s.agent} className="relative" data-testid={`card-agent-${s.agent}`}>
              {s.pinned && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                </div>
              )}
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-mono truncate">{s.agent}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${modelBadgeClass(s.model)}`}>
                  {s.model.length > 20 ? s.model.slice(0, 20) + "…" : s.model}
                </Badge>
                <div className="text-[11px] text-muted-foreground">
                  {s.count} decision{s.count !== 1 ? "s" : ""}
                  {s.avgScore && <span className="ml-1 text-foreground font-medium">· score {s.avgScore}</span>}
                </div>
                {s.pinned && (
                  <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-0.5">
                    <Lock className="h-2.5 w-2.5" /> PINNED
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-48" data-testid="select-agent-filter">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {allAgents.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={pinnedFilter} onValueChange={setPinnedFilter}>
          <SelectTrigger className="w-40" data-testid="select-pinned-filter">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Pinned + Routed</SelectItem>
            <SelectItem value="true">Pinned only</SelectItem>
            <SelectItem value="false">Routed only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main table */}
      {isLoading && (
        <div className="text-sm text-muted-foreground py-12 text-center" data-testid="status-loading">
          Loading routing telemetry…
        </div>
      )}

      {isError && (
        <Card className="border-destructive" data-testid="status-error">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive font-medium">Failed to load telemetry</p>
            <p className="text-xs text-muted-foreground mt-1">Check that the server is running and /api/model-telemetry is reachable</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <Card data-testid="status-empty">
          <CardContent className="py-12 text-center">
            <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No routing decisions recorded yet</p>
            <p className="text-xs text-muted-foreground mt-1">Routing telemetry appears here after the first encounter is processed</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="rounded-lg border overflow-hidden" data-testid="table-telemetry">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-xs">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-xs">Model</th>
                <th className="text-left px-4 py-3 font-medium text-xs">Pinned</th>
                <th className="text-left px-4 py-3 font-medium text-xs">Score</th>
                <th className="text-left px-4 py-3 font-medium text-xs">Encounter</th>
                <th className="text-left px-4 py-3 font-medium text-xs">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/30 transition-colors"
                  data-testid={`row-telemetry-${row.id}`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{row.agent}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${modelBadgeClass(row.chosen_model)}`}>
                      {row.chosen_model}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.pinned ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold" data-testid={`badge-pinned-${row.id}`}>
                        <Lock className="h-3 w-3" /> Yes
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Routed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">
                    {row.score ? (
                      <span className={parseFloat(row.score) >= 0.7 ? "text-green-600 font-medium" : parseFloat(row.score) >= 0.5 ? "text-yellow-600" : "text-red-500"}>
                        {parseFloat(row.score).toFixed(3)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                    {row.encounter_id ? row.encounter_id.slice(0, 12) + "…" : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatRelative(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {rows.length} decision{rows.length !== 1 ? "s" : ""} · Auto-refreshes every 15s
      </p>
    </div>
  );
}
