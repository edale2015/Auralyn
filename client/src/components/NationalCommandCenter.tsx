/**
 * National Command Center
 *
 * "The national nervous system — federation + CDC-like surveillance."
 *
 * Surfaces:
 *   - Federation: total national patient volume, ER demand, avg strain, region health tiers
 *   - Cross-Region Learning: top national complaint signals + cross-regional alerts
 *   - Load Balancing: recommended shift target, overflow regions, transfer suggestions
 *   - Policy: jurisdictional compliance snapshot
 *   - Autonomous Scaling: recommended actions + alert level
 *   - Population Intelligence: national complaint clusters + pandemic watch/alert signals
 *
 * Adapted from the packet's raw props component to TanStack Query useMutation.
 */

import { useMutation }     from "@tanstack/react-query";
import { apiRequest }      from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }           from "@/components/ui/badge";
import { Button }          from "@/components/ui/button";
import { Progress }        from "@/components/ui/progress";
import {
  Globe2, TrendingUp, AlertTriangle, Shield, Zap, BarChart3,
  Users, Building2, ArrowRight, CheckCircle2, Scale, Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NationalOutput {
  federation: {
    totalPatients:    number;
    totalER:          number;
    avgStrainScore:   number;
    avgLoad:          number;
    criticalRegions:  string[];
    surgeRegions:     string[];
    stableRegions:    string[];
    regions:          Array<{ name: string; load: string; surge: string; patients: number; strainScore: number }>;
  };
  learning: {
    topNationalSignals:   Array<[string, number]>;
    learningSignals:      Array<{ complaint: string; nationalCount: number; regionCount: number; trend: string; confidenceScore: number }>;
    recommendation:       string | null;
    crossRegionalAlerts:  string[];
  };
  loadBalance: {
    recommendedShift:    string | null;
    reason:              string;
    overflowRegions:     string[];
    transferSuggestions: Array<{ from: string; to: string; reason: string }>;
    telemedOverflowViable: boolean;
    nationalTelemedLoad:  string;
  };
  policy: {
    allowTelemed:                boolean;
    requiresPhysicianReview:     boolean;
    ilcCompactMember:            boolean;
    mandatoryReportingThreshold: number;
    notes:                       string[];
    jurisdiction:                string;
  };
  scaling: {
    actions:         Array<{ action: string; priority: string; trigger: string }>;
    alertLevel:      string;
    autonomousScale: boolean;
    summary:         string;
  };
  population: {
    clusters:           Array<{ complaint: string; count: number; regionSpread: number; alertLevel: string; syndromicLabel: string | null }>;
    alert:              boolean;
    pandemicSignal:     boolean;
    publicHealthAlerts: string[];
    topComplaints:      Array<{ complaint: string; count: number }>;
  };
  summary: {
    totalRegions:         number;
    totalPatients:        number;
    criticalRegions:      number;
    scalingActionsCount:  number;
    scalingAlertLevel:    string;
    nationalPatternAlert: boolean;
    pandemicSignal:       boolean;
    topRecommendation:    string | null;
  };
}

// ── Demo data — 6 regions ─────────────────────────────────────────────────────

const DEMO_REGIONS = [
  {
    regionName: "NYC Metro",
    state: "NY",
    summary: { totalPatients: 480, erSuggested: 96 },
    capacityState: { strainScore: 7.2, systemState: "strained" as const },
    surgeState: { status: "surge" as const },
    populationSignals: { topComplaints: [
      { complaint: "fever",              count: 80 },
      { complaint: "cough",              count: 65 },
      { complaint: "chest_pain",         count: 28 },
      { complaint: "shortness_of_breath", count: 22 },
    ]},
  },
  {
    regionName: "LA Metro",
    state: "CA",
    summary: { totalPatients: 340, erSuggested: 52 },
    capacityState: { strainScore: 4.8, systemState: "stable" as const },
    surgeState: { status: "watch" as const },
    populationSignals: { topComplaints: [
      { complaint: "fever",   count: 55 },
      { complaint: "cough",   count: 42 },
      { complaint: "rash",    count: 18 },
    ]},
  },
  {
    regionName: "Chicago Metro",
    state: "IL",
    summary: { totalPatients: 260, erSuggested: 38 },
    capacityState: { strainScore: 3.5, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [
      { complaint: "fever",          count: 40 },
      { complaint: "sore_throat",    count: 30 },
      { complaint: "abdominal_pain", count: 15 },
    ]},
  },
  {
    regionName: "Houston Metro",
    state: "TX",
    summary: { totalPatients: 195, erSuggested: 45 },
    capacityState: { strainScore: 5.5, systemState: "strained" as const },
    surgeState: { status: "watch" as const },
    populationSignals: { topComplaints: [
      { complaint: "chest_pain", count: 35 },
      { complaint: "fever",      count: 28 },
    ]},
  },
  {
    regionName: "Miami Metro",
    state: "FL",
    summary: { totalPatients: 180, erSuggested: 60 },
    capacityState: { strainScore: 8.9, systemState: "critical" as const },
    surgeState: { status: "critical" as const },
    populationSignals: { topComplaints: [
      { complaint: "fever",   count: 70 },
      { complaint: "cough",   count: 58 },
      { complaint: "vomiting", count: 22 },
    ]},
  },
  {
    regionName: "Seattle Metro",
    state: "WA",
    summary: { totalPatients: 120, erSuggested: 18 },
    capacityState: { strainScore: 2.1, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [
      { complaint: "cough",       count: 25 },
      { complaint: "headache",    count: 15 },
    ]},
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function alertBadge(level: string) {
  const map: Record<string, string> = {
    normal:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    elevated: "bg-yellow-500/15  text-yellow-400  border-yellow-500/30",
    high:     "bg-orange-500/15  text-orange-400  border-orange-500/30",
    critical: "bg-red-500/15     text-red-400     border-red-500/30",
  };
  return <Badge className={`border text-xs ${map[level] ?? map.normal}`}>{level}</Badge>;
}

function loadBadge(load: string) {
  const map: Record<string, string> = {
    stable:   "bg-emerald-500/10 text-emerald-400",
    strained: "bg-yellow-500/10  text-yellow-400",
    critical: "bg-red-500/10     text-red-400",
  };
  return <Badge className={`text-xs ${map[load] ?? map.stable}`}>{load}</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NationalCommandCenter() {
  const mutation = useMutation<NationalOutput, Error>({
    mutationFn: () =>
      apiRequest("POST", "/api/national/orchestrate", {
        regions:       DEMO_REGIONS,
        policyContext: { state: "NY", country: "US" },
      }).then(r => r.json()),
  });

  const data = mutation.data;

  return (
    <div className="space-y-5" data-testid="national-command-center">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold">National Command Center</h2>
          <span className="text-xs text-gray-500">Federation · Load balancing · CDC surveillance · Autonomous scaling</span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-run-national"
          size="sm"
          className="bg-blue-700 hover:bg-blue-600 text-white"
        >
          <Globe2 className="h-4 w-4 mr-1.5" />
          {mutation.isPending ? "Orchestrating..." : "Run National Orchestration"}
        </Button>
      </div>

      {mutation.isError && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-400" data-testid="national-error">
          {mutation.error?.message}
        </div>
      )}

      {data && (
        <div className="space-y-4" data-testid="national-output">

          {/* Pandemic / pattern alert banner */}
          {(data.population.pandemicSignal || data.population.alert) && (
            <div className="rounded-xl border border-red-700/60 bg-red-950/50 px-4 py-3 flex items-start gap-3" data-testid="national-pandemic-banner">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-sm text-red-300">
                  {data.population.pandemicSignal ? "Pandemic Signal" : "National Pattern Alert"}
                </span>
                <div className="mt-1 space-y-1">
                  {data.population.publicHealthAlerts.map((a, i) => (
                    <p key={i} className="text-xs text-gray-400">{a}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top recommendation */}
          {data.summary.topRecommendation && (
            <div className="rounded-xl border border-blue-700/40 bg-blue-950/30 px-4 py-3 flex items-start gap-3" data-testid="national-recommendation">
              <Zap className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-200">{data.summary.topRecommendation}</p>
            </div>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Regions",   value: data.summary.totalRegions,        icon: <Globe2      className="h-3.5 w-3.5" />,                                testId: "kpi-regions" },
              { label: "National Patients", value: data.summary.totalPatients,     icon: <Users       className="h-3.5 w-3.5 text-cyan-400"   />,                 testId: "kpi-national-patients" },
              { label: "Critical Regions", value: data.summary.criticalRegions,   icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,                  testId: "kpi-critical-regions" },
              { label: "Scaling Actions",  value: data.summary.scalingActionsCount, icon: <Zap         className="h-3.5 w-3.5 text-yellow-400"  />,               testId: "kpi-scaling-actions" },
            ].map(({ label, value, icon, testId }) => (
              <Card key={testId} className="border-gray-800 bg-gray-950" data-testid={testId}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{icon} {label}</div>
                  <div className="text-2xl font-bold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Federation — region grid */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-federation">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <Globe2 className="h-4 w-4" /> Regional Federation
                <span className="text-gray-600 font-normal">· Avg strain {data.federation.avgStrainScore.toFixed(1)}/10</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.federation.regions.map(r => (
                  <div key={r.name}
                    className="flex items-center gap-3 p-2 rounded-lg bg-gray-900/60 border border-gray-800"
                    data-testid={`region-${r.name.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-medium">{r.name}</span>
                        {loadBadge(r.load)}
                        <span className="text-gray-500">surge: {r.surge}</span>
                        <span className="text-gray-500">{r.patients} patients</span>
                      </div>
                      <Progress value={r.strainScore * 10} className="h-1 mt-1.5" />
                    </div>
                    <div className="text-xs text-gray-500 shrink-0">{r.strainScore}/10</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Load Balance */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-load-balance">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Scale className="h-4 w-4" /> Load Balancing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.loadBalance.recommendedShift && (
                  <div className="rounded-lg bg-emerald-950/30 border border-emerald-700/30 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                      <ArrowRight className="h-3.5 w-3.5" /> Route non-critical to: {data.loadBalance.recommendedShift}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{data.loadBalance.reason}</p>
                  </div>
                )}
                {data.loadBalance.overflowRegions.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Overflow regions:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.loadBalance.overflowRegions.map(r => (
                        <Badge key={r} className="border border-orange-600/30 bg-orange-950/30 text-orange-400 text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Telemed overflow: <span className={data.loadBalance.telemedOverflowViable ? "text-emerald-400" : "text-red-400"}>
                    {data.loadBalance.telemedOverflowViable ? "viable" : "at capacity"}
                  </span>
                  {" · "}National telemed load: <span className="text-gray-300">{data.loadBalance.nationalTelemedLoad}</span>
                </div>
              </CardContent>
            </Card>

            {/* Autonomous Scaling */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-scaling">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Zap className="h-4 w-4" /> Scaling Controller
                  <div className="ml-auto">{alertBadge(data.scaling.alertLevel)}</div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.scaling.actions.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> System operating within normal parameters
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {data.scaling.actions.map((a, i) => {
                      const colors: Record<string, string> = {
                        critical: "border-l-red-500    bg-red-950/20    text-red-300",
                        high:     "border-l-orange-500 bg-orange-950/20 text-orange-300",
                        medium:   "border-l-yellow-500 bg-yellow-950/20 text-yellow-300",
                        low:      "border-l-gray-500   bg-gray-900/40   text-gray-400",
                      };
                      return (
                        <div key={i}
                          className={`border-l-2 pl-3 pr-2 py-1.5 rounded-r text-xs ${colors[a.priority] ?? colors.low}`}
                          data-testid={`scaling-action-${i}`}>
                          <div className="font-medium">{a.action}</div>
                          <div className="text-gray-500 mt-0.5">{a.trigger}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cross-Region Learning */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-learning">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> Cross-Region Learning
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {data.learning.topNationalSignals.slice(0, 5).map(([complaint, count]) => (
                    <div key={complaint}
                      className="flex items-center gap-2 text-xs"
                      data-testid={`signal-${complaint}`}>
                      <span className="text-gray-300 w-36 truncate">{complaint.replace(/_/g, " ")}</span>
                      <Progress value={Math.min(100, (count / Math.max(1, data.learning.topNationalSignals[0][1])) * 100)} className="h-1.5 flex-1" />
                      <span className="text-gray-500 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
                {data.learning.crossRegionalAlerts.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {data.learning.crossRegionalAlerts.map((alert, i) => (
                      <p key={i} className="text-xs text-yellow-400/80 flex items-start gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5" />{alert}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Policy + Population clusters */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-policy-population">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Shield className="h-4 w-4" /> Policy + Population
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Policy snapshot */}
                <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2 text-xs space-y-1">
                  <div className="font-medium text-gray-300">Jurisdiction: {data.policy.jurisdiction}</div>
                  <div className="flex flex-wrap gap-3 text-gray-500">
                    <span>Telemed: <span className={data.policy.allowTelemed ? "text-emerald-400" : "text-red-400"}>{data.policy.allowTelemed ? "allowed" : "restricted"}</span></span>
                    <span>MD review: <span className={data.policy.requiresPhysicianReview ? "text-yellow-400" : "text-gray-400"}>{data.policy.requiresPhysicianReview ? "required" : "optional"}</span></span>
                    <span>ILC: <span className={data.policy.ilcCompactMember ? "text-emerald-400" : "text-gray-400"}>{data.policy.ilcCompactMember ? "member" : "non-member"}</span></span>
                  </div>
                </div>
                {/* Population clusters */}
                {data.population.clusters.length > 0 && (
                  <div className="space-y-1.5">
                    {data.population.clusters.slice(0, 4).map(c => (
                      <div key={c.complaint}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`pop-cluster-${c.complaint}`}>
                        <span className="text-gray-300 flex-1 truncate">{c.complaint.replace(/_/g, " ")}</span>
                        <span className="text-gray-500">{c.regionSpread} regions</span>
                        <Badge className={`text-xs border ${c.alertLevel === "pandemic_signal" ? "border-red-600/40 bg-red-950 text-red-400" : c.alertLevel === "alert" ? "border-orange-600/40 bg-orange-950/40 text-orange-400" : "border-yellow-600/30 bg-yellow-950/30 text-yellow-400"}`}>
                          {c.alertLevel.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-gray-500 w-10 text-right">{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-12 text-center" data-testid="national-empty">
          <Globe2 className="h-10 w-10 mx-auto text-blue-400/30 mb-3" />
          <p className="text-sm text-gray-500">
            Click <strong className="text-gray-300">Run National Orchestration</strong> to federate all regional states, compute load balancing, enforce policy compliance, trigger autonomous scaling, and run CDC-style epidemiological surveillance.
          </p>
        </div>
      )}
    </div>
  );
}
