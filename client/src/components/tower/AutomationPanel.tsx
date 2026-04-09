/**
 * Automation Panel — System Control Tower (Packet 20)
 *
 * Shows live automation health in the control tower:
 *   - Run counts, failure rate, selector heal count
 *   - Per-template breakdown
 *   - Instability alert banner
 *   - Link to full Template Health Dashboard
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle, ExternalLink, Wrench, Zap } from "lucide-react";

interface AutomationMetrics {
  runsTotal:          number;
  failuresTotal:      number;
  selectorHealCount:  number;
  lastUpdatedAt:      string | null;
  latencyMs: {
    count: number;
    sum:   number;
    max:   number;
    p95:   number;
  };
  byTemplate: Record<string, { runs: number; failures: number; heals: number }>;
}

interface QueueState {
  running:     number;
  pending:     number;
  failureRate: number;
}

interface AutomationHealth {
  metrics:    AutomationMetrics;
  queue:      QueueState;
  prometheus: string;
}

export default function AutomationPanel() {
  const { data, isLoading } = useQuery<AutomationHealth>({
    queryKey:       ["/api/automation/metrics"],
    refetchInterval: 8_000,
  });

  const metrics     = data?.metrics;
  const queue       = data?.queue;
  const failureRate = metrics && metrics.runsTotal > 0
    ? metrics.failuresTotal / metrics.runsTotal
    : 0;

  const isUnstable = failureRate > 0.1;

  const templateEntries = metrics
    ? Object.entries(metrics.byTemplate)
    : [];

  return (
    <div className="p-4 space-y-4" data-testid="panel-automation">
      {/* Instability alert */}
      {isUnstable && (
        <div className="flex items-start gap-3 rounded-lg border border-red-600/40 bg-red-950/30 p-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">Automation Instability Detected</p>
            <p className="text-xs text-red-400 mt-0.5">
              Failure rate: {(failureRate * 100).toFixed(1)}% — consider running a repair scan
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Total Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold" data-testid="text-runs-total">{metrics?.runsTotal ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Failures
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className={`text-2xl font-bold ${isUnstable ? "text-red-400" : ""}`} data-testid="text-failures-total">
              {metrics?.failuresTotal ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Selectors Healed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold text-green-400" data-testid="text-heal-count">
              {metrics?.selectorHealCount ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> P95 Latency
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold" data-testid="text-latency-p95">
              {metrics?.latencyMs.p95 ? `${metrics.latencyMs.p95}ms` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Queue state */}
      {queue && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border rounded-lg p-3">
          <span data-testid="text-queue-running">
            <span className="text-foreground font-medium">{queue.running}</span> running
          </span>
          <span data-testid="text-queue-pending">
            <span className="text-foreground font-medium">{queue.pending}</span> pending
          </span>
          <span data-testid="text-queue-failure-rate">
            Rate: <span className={`font-medium ${isUnstable ? "text-red-400" : "text-green-400"}`}>
              {(queue.failureRate * 100).toFixed(1)}%
            </span>
          </span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {isUnstable ? (
              <><AlertTriangle className="h-2.5 w-2.5 mr-1 text-red-400" />Unstable</>
            ) : (
              <><CheckCircle className="h-2.5 w-2.5 mr-1 text-green-400" />Healthy</>
            )}
          </Badge>
        </div>
      )}

      {/* Per-template table */}
      {templateEntries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Per-Template</p>
          <div className="space-y-1.5">
            {templateEntries.map(([key, t]) => (
              <div
                key={key}
                className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border"
                data-testid={`row-template-${key}`}
              >
                <span className="font-mono text-muted-foreground truncate max-w-[45%]">{key}</span>
                <div className="flex items-center gap-3">
                  <span>{t.runs} runs</span>
                  <span className={t.failures > 0 ? "text-red-400" : "text-green-400"}>
                    {t.failures} fail
                  </span>
                  {t.heals > 0 && (
                    <span className="text-yellow-400">{t.heals} healed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading && !metrics && (
        <p className="text-xs text-muted-foreground text-center py-4">Loading automation metrics…</p>
      )}

      {/* Link to full dashboard */}
      <Link href="/automation/health">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
          data-testid="button-open-health-dashboard"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Template Health Dashboard
        </Button>
      </Link>
    </div>
  );
}
