/**
 * Upgrade 4 — Template Health Dashboard
 *
 * Shows live health status for every automation template:
 *   - Confidence score per selector (green / yellow / red)
 *   - Broken selector count + repair recommendations
 *   - Per-template summary with expandable selector table
 *   - One-click trigger for an offline repair scan
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, CheckCircle, ChevronDown, RefreshCw, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectorScore {
  templateKey:   string;
  selector:      string;
  attempts:      number;
  successes:     number;
  confidence:    number;
  needsRepair:   boolean;
  lastAttemptAt: string | null;
}

interface TemplateSummary {
  templateKey:    string;
  totalSelectors: number;
  healthy:        number;
  degraded:       number;
  broken:         number;
  overallHealth:  "healthy" | "degraded" | "broken";
}

interface RepairRecommendation {
  templateKey:    string;
  brokenSelector: string;
  confidence:     number;
  attempts:       number;
  topCandidate?:  string;
  status:         "pending" | "no-candidates" | "ready";
}

interface RepairScanReport {
  scannedAt:       string;
  totalBroken:     number;
  withCandidates:  number;
  noCandidates:    number;
  recommendations: RepairRecommendation[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, attempts }: { confidence: number; attempts: number }) {
  if (attempts === 0) return <Badge variant="outline" data-testid="badge-untested">Untested</Badge>;
  if (confidence >= 0.8) return <Badge className="bg-green-600 text-white" data-testid="badge-healthy">Healthy {Math.round(confidence * 100)}%</Badge>;
  if (confidence >= 0.5) return <Badge className="bg-yellow-500 text-white" data-testid="badge-degraded">Degraded {Math.round(confidence * 100)}%</Badge>;
  return <Badge className="bg-red-600 text-white" data-testid="badge-broken">Broken {Math.round(confidence * 100)}%</Badge>;
}

function HealthBadge({ health }: { health: TemplateSummary["overallHealth"] }) {
  if (health === "healthy")  return <Badge className="bg-green-600 text-white">Healthy</Badge>;
  if (health === "degraded") return <Badge className="bg-yellow-500 text-white">Degraded</Badge>;
  return <Badge className="bg-red-600 text-white">Broken</Badge>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TemplateHealthDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [scanReport, setScanReport]   = useState<RepairScanReport | null>(null);

  const { data: summaries = [], isLoading: loadingSummaries } = useQuery<TemplateSummary[]>({
    queryKey: ["/api/automation/summaries"],
  });

  const { data: allScores = [], isLoading: loadingScores } = useQuery<SelectorScore[]>({
    queryKey: ["/api/automation/scores"],
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/automation/repair/scan"),
    onSuccess: async (res) => {
      const data = await res.json();
      setScanReport(data);
      toast({ title: `Repair scan complete — ${data.totalBroken} broken selector(s) found` });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: (body: { templateKey: string; originalSelector: string; replacement: string }) =>
      apiRequest("POST", "/api/automation/repair/apply", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/summaries"] });
      toast({ title: "Repair applied — template updated" });
    },
    onError: () => toast({ title: "Repair failed", variant: "destructive" }),
  });

  const scoresByTemplate = (key: string) =>
    allScores.filter((s) => s.templateKey === key);

  const healthy  = summaries.filter((s) => s.overallHealth === "healthy").length;
  const degraded = summaries.filter((s) => s.overallHealth === "degraded").length;
  const broken   = summaries.filter((s) => s.overallHealth === "broken").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Template Health Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selector confidence scores, drift detection, and autonomous repair
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          data-testid="button-run-scan"
          className="gap-2"
        >
          {scanMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Run Repair Scan
        </Button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-healthy-count">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Healthy</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold" data-testid="text-healthy-count">{healthy}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-degraded-count">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Degraded</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold" data-testid="text-degraded-count">{degraded}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-broken-count">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Broken</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold" data-testid="text-broken-count">{broken}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-template cards */}
      {loadingSummaries ? (
        <p className="text-muted-foreground text-sm">Loading templates…</p>
      ) : summaries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No templates tracked yet. Run an automation to start collecting selector scores.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {summaries.map((s) => (
            <Collapsible
              key={s.templateKey}
              open={expandedKey === s.templateKey}
              onOpenChange={(open) => setExpandedKey(open ? s.templateKey : null)}
            >
              <Card data-testid={`card-template-${s.templateKey}`}>
                <CardHeader className="py-3">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${expandedKey === s.templateKey ? "rotate-180" : ""}`}
                        />
                        <span className="font-medium" data-testid={`text-template-key-${s.templateKey}`}>{s.templateKey}</span>
                        <HealthBadge health={s.overallHealth} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{s.totalSelectors} selectors</span>
                        {s.broken > 0 && (
                          <span className="text-red-500 font-medium">{s.broken} broken</span>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {loadingScores ? (
                      <p className="text-sm text-muted-foreground">Loading scores…</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Selector</TableHead>
                            <TableHead>Confidence</TableHead>
                            <TableHead>Attempts</TableHead>
                            <TableHead>Successes</TableHead>
                            <TableHead>Last Attempt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scoresByTemplate(s.templateKey).map((score) => (
                            <TableRow
                              key={score.selector}
                              data-testid={`row-score-${score.selector}`}
                            >
                              <TableCell className="font-mono text-xs">{score.selector}</TableCell>
                              <TableCell>
                                <ConfidenceBadge confidence={score.confidence} attempts={score.attempts} />
                              </TableCell>
                              <TableCell>{score.attempts}</TableCell>
                              <TableCell>{score.successes}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {score.lastAttemptAt
                                  ? new Date(score.lastAttemptAt).toLocaleString()
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                          {scoresByTemplate(s.templateKey).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-4">
                                No selector activity recorded yet
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Repair scan report */}
      {scanReport && (
        <Card data-testid="card-repair-report">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Repair Scan — {new Date(scanReport.scannedAt).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 mb-4 text-sm">
              <span data-testid="text-scan-broken">{scanReport.totalBroken} broken selector(s)</span>
              <span className="text-green-600">{scanReport.withCandidates} with AI candidates</span>
              <span className="text-muted-foreground">{scanReport.noCandidates} no candidates</span>
            </div>
            {scanReport.recommendations.length === 0 ? (
              <p className="text-muted-foreground text-sm">All selectors are within acceptable confidence ranges.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Broken Selector</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Top AI Candidate</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanReport.recommendations.map((rec, i) => (
                    <TableRow key={i} data-testid={`row-repair-${i}`}>
                      <TableCell className="font-mono text-xs">{rec.templateKey}</TableCell>
                      <TableCell className="font-mono text-xs text-red-500">{rec.brokenSelector}</TableCell>
                      <TableCell>{Math.round(rec.confidence * 100)}%</TableCell>
                      <TableCell className="font-mono text-xs text-green-600">
                        {rec.topCandidate ?? "—"}
                      </TableCell>
                      <TableCell>
                        {rec.topCandidate ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={applyMutation.isPending}
                            data-testid={`button-apply-repair-${i}`}
                            onClick={() =>
                              applyMutation.mutate({
                                templateKey:      rec.templateKey,
                                originalSelector: rec.brokenSelector,
                                replacement:      rec.topCandidate!,
                              })
                            }
                          >
                            Apply Fix
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">No candidate</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
