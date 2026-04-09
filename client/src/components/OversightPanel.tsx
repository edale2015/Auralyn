/**
 * OversightPanel — Autonomous System Oversight Widget
 *
 * Displays the real-time health status produced by the autonomous oversight
 * agent. Clinicians and engineers use this to know:
 *   - Is the system drifting from its clinical baseline?
 *   - Where is it failing?
 *   - What actions are recommended?
 *   - Is it safe to deploy a new change?
 *
 * Uses useMutation (not useQuery) because the oversight check is an on-demand
 * computation, not a cached resource — running it uses system resources and
 * should be triggered deliberately.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ShieldCheck, Activity, RefreshCw, ChevronRight, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OversightDecision {
  alerts:         string[];
  actions:        string[];
  severity:       "low" | "medium" | "high" | "critical";
  driftReport?:   { driftDetected: boolean; magnitude: number; severity: string };
  topCluster?:    { complaint: string; ageGroup: string; count: number } | null;
  summary:        string;
}

// ── Severity styling ──────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
  medium:   "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200",
  low:      "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200",
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="h-4 w-4 text-red-600" />,
  high:     <AlertTriangle className="h-4 w-4 text-orange-500" />,
  medium:   <Info className="h-4 w-4 text-yellow-600" />,
  low:      <ShieldCheck className="h-4 w-4 text-green-600" />,
};

// ── Default snapshot metrics (used when real metrics aren't available) ─────────
// In production these would come from the system metrics store or a live API call.

const DEFAULT_METRICS = {
  latency:            0,
  errorRate:          0,
  fhirFailures:       0,
  safetyMismatchRate: 0,
  degradedRate:       0,
  rlhfViolations:     0,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OversightPanel() {
  const [lastRun, setLastRun] = useState<string | null>(null);

  const mutation = useMutation<OversightDecision, Error, void>({
    mutationFn: () =>
      apiRequest("POST", "/api/oversight/run", {
        input: {
          outcomes:      [],                // live system: pass real recent outcomes here
          systemMetrics: DEFAULT_METRICS,
          kbVersion:     "current",
          timestamp:     Date.now(),
        },
      }).then(r => r.json()),
    onSuccess: () => setLastRun(new Date().toLocaleTimeString()),
  });

  const decision = mutation.data;

  return (
    <Card data-testid="oversight-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Autonomous Oversight Agent</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && (
            <span
              data-testid="oversight-last-run"
              className="text-xs text-muted-foreground"
            >
              Last checked: {lastRun}
            </span>
          )}
          <Button
            data-testid="button-run-oversight"
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Running…</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Run Check</>
            }
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {mutation.isError && (
          <Alert variant="destructive" data-testid="oversight-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Oversight check failed</AlertTitle>
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        )}

        {!decision && !mutation.isPending && !mutation.isError && (
          <div className="text-sm text-muted-foreground text-center py-6">
            Click <strong>Run Check</strong> to evaluate system health
          </div>
        )}

        {decision && (
          <div className="space-y-4" data-testid="oversight-results">
            {/* Severity badge + summary */}
            <div className="flex items-start gap-3">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${SEVERITY_BADGE[decision.severity]}`}
                data-testid="oversight-severity">
                {SEVERITY_ICON[decision.severity]}
                {decision.severity.toUpperCase()}
              </div>
              <p className="text-sm text-muted-foreground leading-snug" data-testid="oversight-summary">
                {decision.summary}
              </p>
            </div>

            {/* Drift report */}
            {decision.driftReport?.driftDetected && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3"
                data-testid="oversight-drift">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-0.5">
                  Clinical Drift Detected
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Magnitude: {(decision.driftReport.magnitude * 100).toFixed(1)}% — {decision.driftReport.severity}
                </p>
              </div>
            )}

            {/* Top failure cluster */}
            {decision.topCluster && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 p-3"
                data-testid="oversight-cluster">
                <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-0.5">
                  Top Failure Cluster
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {decision.topCluster.complaint} / {decision.topCluster.ageGroup}
                  {" "}— {decision.topCluster.count} failure{decision.topCluster.count !== 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Alerts */}
            {decision.alerts.length > 0 && (
              <div data-testid="oversight-alerts">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Alerts ({decision.alerts.length})
                </p>
                <ul className="space-y-1.5">
                  {decision.alerts.map((alert, i) => (
                    <li
                      key={i}
                      data-testid={`oversight-alert-${i}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <span>{alert}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {decision.alerts.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300"
                data-testid="oversight-healthy">
                <ShieldCheck className="h-4 w-4" />
                No active alerts — system within normal bounds
              </div>
            )}

            <Separator />

            {/* Recommended actions */}
            {decision.actions.length > 0 && (
              <div data-testid="oversight-actions">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Recommended Actions
                </p>
                <ul className="space-y-1.5">
                  {decision.actions.map((action, i) => (
                    <li
                      key={i}
                      data-testid={`oversight-action-${i}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
