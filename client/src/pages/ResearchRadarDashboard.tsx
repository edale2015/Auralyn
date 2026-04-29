/**
 * ResearchRadarDashboard.tsx
 * client/src/pages/ResearchRadarDashboard.tsx
 *
 * Weekly automated monitoring for Recommendations 5 and 6 production readiness.
 * Route: /research-radar
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
  Calendar,
} from "lucide-react";

// ─── Readiness scale visual ───────────────────────────────────────────────────

function ReadinessBar({ score }: { score: number }) {
  const labels = ["Research only", "Preprint", "Code available", "Validated", "Deploy now"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(s => (
          <div
            key={s}
            data-testid={`readiness-bar-step-${s}`}
            className={`flex-1 h-2 rounded-full transition-colors ${
              s <= score
                ? s >= 4 ? "bg-green-500" : s >= 3 ? "bg-yellow-500" : "bg-blue-400"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400">
        {score}/5 — {labels[score - 1]}
      </p>
    </div>
  );
}

// ─── Target card ──────────────────────────────────────────────────────────────

function TargetCard({ target }: {
  target: {
    id:                string;
    name:              string;
    readinessScore:    number;
    lastScanned:       string | null;
    readyToImplement:  boolean;
    estimatedBuildTime: string;
  };
}) {
  const isReady = target.readyToImplement;
  const isClose = target.readinessScore >= 3;

  return (
    <Card
      data-testid={`radar-target-${target.id}`}
      className={`border ${
        isReady ? "border-green-300 bg-green-50/30 dark:border-green-700 dark:bg-green-950/20" :
        isClose ? "border-yellow-300 bg-yellow-50/30 dark:border-yellow-700 dark:bg-yellow-950/20" :
                  "border-gray-200 dark:border-gray-700"
      }`}
    >
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">
              {target.name}
            </CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Build time when ready: {target.estimatedBuildTime}
            </p>
          </div>
          {isReady ? (
            <Badge className="bg-green-600 text-white text-[10px] shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
              Deploy Now
            </Badge>
          ) : isClose ? (
            <Badge className="bg-yellow-500 text-white text-[10px] shrink-0">
              <TrendingUp className="h-2.5 w-2.5 mr-1" />
              Getting Close
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] shrink-0">
              Monitoring
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        <ReadinessBar score={target.readinessScore} />
        {target.lastScanned && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Last scanned: {new Date(target.lastScanned).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric"
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchRadarDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ["/api/research-radar/status"],
    queryFn:         () => apiRequest<{
      targets:  any[];
      nextScan: string;
      anyReady: boolean;
    }>("GET", "/api/research-radar/status"),
    refetchInterval: 60_000 * 60,
  });

  const targets  = data?.targets ?? [];
  const nextScan = data?.nextScan ? new Date(data.nextScan) : null;
  const anyReady = data?.anyReady ?? false;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Radar className="h-5 w-5 text-blue-600" />
              Research Radar
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Weekly automated monitoring for Recommendations 5 and 6 production readiness
            </p>
          </div>
          <button
            data-testid="button-refresh-radar"
            onClick={() => refetch()}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Alert banner */}
        {anyReady && (
          <Card className="border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20">
            <CardContent className="py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Implementation Alert — A recommendation is now ready to build
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  Review the target below and schedule an implementation session.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next scan info */}
        {nextScan && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Next automated scan: {nextScan.toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric"
              })} at 4:00am UTC
            </span>
          </div>
        )}

        {/* Readiness scale legend */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2">Readiness Scale</p>
            <div className="grid grid-cols-5 gap-1 text-[10px] text-center text-gray-600 dark:text-gray-400">
              {[
                { score: 1, label: "Research\nonly",       color: "bg-blue-300" },
                { score: 2, label: "Preprint\nvalidated",  color: "bg-blue-400" },
                { score: 3, label: "Code\navailable",      color: "bg-yellow-400" },
                { score: 4, label: "Clinically\nvalidated", color: "bg-green-400" },
                { score: 5, label: "Deploy\nnow",          color: "bg-green-600" },
              ].map(s => (
                <div key={s.score} className="space-y-1">
                  <div className={`h-2 rounded-full ${s.color}`} />
                  <p className="whitespace-pre-line leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Target cards */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map(i => (
              <Card key={i}>
                <CardContent className="py-6 space-y-3">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3" />
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {targets.map((t: any) => <TargetCard key={t.id} target={t} />)}
          </div>
        )}

        {/* What we're watching */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              What We're Watching
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-3 text-xs text-gray-600 dark:text-gray-400">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">Rec 5 — Temporal Graph EHR</p>
              <p>Scanning: arXiv, GitHub, InfEHR project, Epic/Oracle Health announcements, FDA device database for graph-based EHR CDS clearances. Alert triggers at score 4+ (open-source code + clinical validation).</p>
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">Rec 6 — GNN Differential Diagnosis</p>
              <p>Scanning: Zitnik Lab Harvard releases, SNOMED International API announcements, clinical AI companies (Nabla, Abridge, Suki) for GNN differential integration, arXiv q-bio.QM for clinical validation studies. Alert triggers at score 4+ (deployable library + validated study).</p>
            </div>
            <p className="text-gray-400 dark:text-gray-500 italic">
              When either reaches score 4, the next session will implement it directly into Auralyn's existing geometric reasoning layer (Win 12). The knowledge graph already built is structurally compatible — the GNN version uses learned weights rather than manually specified likelihood ratios.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
