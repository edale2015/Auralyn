/**
 * Global Command Center
 *
 * "Healthcare operating system for populations — at planetary scale."
 *
 * Surfaces:
 *   - Continent-level volume + trend signals
 *   - Recommended redistribution targets (underloaded regions)
 *   - Pandemic detection: respiratory + GI cluster thresholds
 *   - SIR spread simulation: next-day / next-week / next-month projections
 *   - Early warning system: alerts + prescribed actions
 *   - Global policy: country-level regulatory compliance snapshot
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
  Globe, AlertTriangle, TrendingUp, Shield, Activity,
  Thermometer, BarChart3, ArrowUpRight, CheckCircle2,
  Zap, Users, Map,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GlobalOutput {
  continentSignals: Array<{
    continent:   string;
    volume:      number;
    trend:       "spiking" | "stable" | "declining";
    avgStrain:   number;
    regionCount: number;
  }>;
  recommendedRedistribution: string[];
  overloadedRegions:         string[];
  pandemic: {
    symptomCounts:      Record<string, number>;
    clusters:           Array<[string, number]>;
    respiratoryCluster: boolean;
    giCluster:          boolean;
    alert:              boolean;
    topSymptom:         string | null;
    riskLevel:          "low" | "medium" | "high" | "critical";
  };
  simulation: {
    current:       number;
    nextDay:       number;
    nextWeek:      number;
    nextMonth:     number;
    riskLevel:     string;
    peakEstimate:  number;
    herdThreshold: number;
  };
  earlyWarning: {
    alert:    string | null;
    action:   string | null;
    severity: "none" | "watch" | "warning" | "critical";
  };
  policy: {
    telemedAllowed:       boolean;
    physicianRequired:    boolean;
    nhsRouting:           boolean;
    dataSovereigntyFlag:  boolean;
    whoReportingRequired: boolean;
    notes:                string[];
    jurisdiction:         string;
  };
  summary: {
    totalGlobalPatients:  number;
    hotContinents:        number;
    pandemicAlert:        boolean;
    redistributionNeeded: boolean;
    globalAlertLevel:     "green" | "yellow" | "orange" | "red";
  };
}

// ── Demo data — 5 continents, 10 regions ─────────────────────────────────────

const DEMO_REGIONS = [
  // North America
  {
    regionName: "NYC Metro", continent: "North America", country: "US",
    summary: { totalPatients: 480, erSuggested: 96 },
    capacityState: { strainScore: 7.2, systemState: "strained" as const },
    surgeState: { status: "surge" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 80 }, { complaint: "cough", count: 65 }] },
  },
  {
    regionName: "LA Metro", continent: "North America", country: "US",
    summary: { totalPatients: 340, erSuggested: 52 },
    capacityState: { strainScore: 4.8, systemState: "stable" as const },
    surgeState: { status: "watch" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 55 }, { complaint: "cough", count: 42 }] },
  },
  {
    regionName: "Toronto", continent: "North America", country: "CA",
    summary: { totalPatients: 210, erSuggested: 30 },
    capacityState: { strainScore: 3.2, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [{ complaint: "cough", count: 30 }, { complaint: "fever", count: 25 }] },
  },
  // Europe
  {
    regionName: "London", continent: "Europe", country: "GB",
    summary: { totalPatients: 520, erSuggested: 80 },
    capacityState: { strainScore: 6.5, systemState: "strained" as const },
    surgeState: { status: "surge" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 90 }, { complaint: "cough", count: 78 }, { complaint: "shortness_of_breath", count: 35 }] },
  },
  {
    regionName: "Berlin", continent: "Europe", country: "DE",
    summary: { totalPatients: 180, erSuggested: 22 },
    capacityState: { strainScore: 2.8, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [{ complaint: "cough", count: 20 }, { complaint: "sore_throat", count: 15 }] },
  },
  // Asia
  {
    regionName: "Mumbai", continent: "Asia", country: "IN",
    summary: { totalPatients: 850, erSuggested: 170 },
    capacityState: { strainScore: 8.8, systemState: "critical" as const },
    surgeState: { status: "critical" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 200 }, { complaint: "cough", count: 185 }, { complaint: "diarrhea", count: 90 }, { complaint: "vomiting", count: 80 }] },
  },
  {
    regionName: "Singapore", continent: "Asia", country: "SG",
    summary: { totalPatients: 140, erSuggested: 18 },
    capacityState: { strainScore: 3.5, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [{ complaint: "cough", count: 28 }, { complaint: "fever", count: 22 }] },
  },
  // Africa
  {
    regionName: "Nairobi", continent: "Africa", country: "KE",
    summary: { totalPatients: 290, erSuggested: 65 },
    capacityState: { strainScore: 7.9, systemState: "critical" as const },
    surgeState: { status: "critical" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 110 }, { complaint: "diarrhea", count: 85 }, { complaint: "vomiting", count: 70 }] },
  },
  // Oceania
  {
    regionName: "Sydney", continent: "Oceania", country: "AU",
    summary: { totalPatients: 160, erSuggested: 20 },
    capacityState: { strainScore: 3.0, systemState: "stable" as const },
    surgeState: { status: "none" as const },
    populationSignals: { topComplaints: [{ complaint: "cough", count: 30 }, { complaint: "fever", count: 22 }] },
  },
  // South America
  {
    regionName: "São Paulo", continent: "South America", country: "BR",
    summary: { totalPatients: 380, erSuggested: 70 },
    capacityState: { strainScore: 6.2, systemState: "strained" as const },
    surgeState: { status: "watch" as const },
    populationSignals: { topComplaints: [{ complaint: "fever", count: 95 }, { complaint: "cough", count: 80 }, { complaint: "diarrhea", count: 40 }] },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<string, string> = {
  green:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  yellow: "bg-yellow-500/15  text-yellow-400  border-yellow-500/30",
  orange: "bg-orange-500/15  text-orange-400  border-orange-500/30",
  red:    "bg-red-500/15     text-red-400     border-red-500/30",
};

const SEVERITY_COLORS: Record<string, string> = {
  none:     "bg-gray-700/20    text-gray-400",
  watch:    "bg-yellow-500/15  text-yellow-400",
  warning:  "bg-orange-500/15  text-orange-400",
  critical: "bg-red-500/15     text-red-400",
};

function trendIcon(trend: string) {
  if (trend === "spiking")   return <ArrowUpRight className="h-3.5 w-3.5 text-red-400"    />;
  if (trend === "declining") return <TrendingUp    className="h-3.5 w-3.5 text-emerald-400 rotate-180" />;
  return                            <Activity      className="h-3.5 w-3.5 text-gray-400"   />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlobalCommandCenter() {
  const mutation = useMutation<GlobalOutput, Error>({
    mutationFn: () =>
      apiRequest("POST", "/api/global/orchestrate", {
        regions:  DEMO_REGIONS,
        simInput: { R0: 1.8, population: 5_000_000, initialInfected: 320 },
      }).then(r => r.json()),
  });

  const data = mutation.data;

  return (
    <div className="space-y-5" data-testid="global-command-center">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-400" />
          <h2 className="text-base font-semibold">Global Command Center</h2>
          <span className="text-xs text-gray-500">Pandemic detection · SIR simulation · Continent signals · Global policy</span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-run-global"
          size="sm"
          className="bg-emerald-800 hover:bg-emerald-700 text-white"
        >
          <Globe className="h-4 w-4 mr-1.5" />
          {mutation.isPending ? "Orchestrating..." : "Run Global Orchestration"}
        </Button>
      </div>

      {mutation.isError && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-400" data-testid="global-error">
          {mutation.error?.message}
        </div>
      )}

      {data && (
        <div className="space-y-4" data-testid="global-output">

          {/* Early warning banner */}
          {data.earlyWarning.severity !== "none" && (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${data.earlyWarning.severity === "critical" ? "border-red-700/60 bg-red-950/50" : "border-orange-700/50 bg-orange-950/30"}`}
              data-testid="early-warning-banner">
              <Thermometer className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-red-300">{data.earlyWarning.alert}</span>
                  <Badge className={`border text-xs ${SEVERITY_COLORS[data.earlyWarning.severity]}`}>{data.earlyWarning.severity}</Badge>
                </div>
                {data.earlyWarning.action && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-400" /> {data.earlyWarning.action}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Global Patients",  value: data.summary.totalGlobalPatients.toLocaleString(), testId: "kpi-global-patients" },
              { label: "Hot Continents",   value: data.summary.hotContinents,                        testId: "kpi-hot-continents"  },
              { label: "Pandemic Alert",   value: data.summary.pandemicAlert ? "YES" : "No",         testId: "kpi-pandemic-alert"  },
              { label: "Alert Level",      value: data.summary.globalAlertLevel.toUpperCase(),        testId: "kpi-alert-level"     },
            ].map(({ label, value, testId }) => (
              <Card key={testId} className="border-gray-800 bg-gray-950" data-testid={testId}>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-gray-400 mb-1">{label}</div>
                  <div className={`text-2xl font-bold ${testId === "kpi-alert-level" ? ALERT_COLORS[data.summary.globalAlertLevel]?.split(" ")[1] ?? "" : ""}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Continent signals */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-continent-signals">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                <Map className="h-4 w-4" /> Continent Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.continentSignals.map(c => (
                  <div key={c.continent}
                    className="flex items-center gap-3 p-2 rounded-lg bg-gray-900/60 border border-gray-800"
                    data-testid={`continent-${c.continent.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="shrink-0">{trendIcon(c.trend)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{c.continent}</span>
                        <span className={`${c.trend === "spiking" ? "text-red-400" : "text-gray-400"}`}>{c.trend}</span>
                        <span className="text-gray-500">{c.regionCount} regions · {c.volume.toLocaleString()} patients</span>
                        <span className="text-gray-600">avg strain {c.avgStrain.toFixed(1)}/10</span>
                      </div>
                      <Progress value={c.avgStrain * 10} className="h-1 mt-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pandemic detection */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-pandemic">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Thermometer className="h-4 w-4" /> Pandemic Detection
                  <div className="ml-auto">
                    <Badge className={`border text-xs ${ALERT_COLORS[data.pandemic.riskLevel === "critical" ? "red" : data.pandemic.riskLevel === "high" ? "orange" : "green"]}`}>
                      {data.pandemic.riskLevel}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-gray-900/60 border border-gray-800 px-3 py-2">
                    <div className="text-gray-500">Respiratory cluster</div>
                    <div className={`font-semibold ${data.pandemic.respiratoryCluster ? "text-red-400" : "text-emerald-400"}`}>
                      {data.pandemic.respiratoryCluster ? "DETECTED" : "clear"}
                    </div>
                  </div>
                  <div className="rounded bg-gray-900/60 border border-gray-800 px-3 py-2">
                    <div className="text-gray-500">GI cluster</div>
                    <div className={`font-semibold ${data.pandemic.giCluster ? "text-orange-400" : "text-emerald-400"}`}>
                      {data.pandemic.giCluster ? "DETECTED" : "clear"}
                    </div>
                  </div>
                </div>
                {data.pandemic.topSymptom && (
                  <div className="text-xs text-gray-500">Top global symptom: <span className="text-gray-300">{data.pandemic.topSymptom.replace(/_/g, " ")}</span></div>
                )}
                {Object.entries(data.pandemic.symptomCounts).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(data.pandemic.symptomCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([s, count]) => (
                        <div key={s} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 w-28 truncate">{s.replace(/_/g, " ")}</span>
                          <Progress value={Math.min(100, count / 5)} className="h-1 flex-1" />
                          <span className="text-gray-500 w-8 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spread simulation */}
            <Card className="border-gray-800 bg-gray-950" data-testid="card-simulation">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4" /> SIR Spread Simulation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Current",    value: data.simulation.current.toLocaleString(),    testId: "sim-current"   },
                    { label: "Tomorrow",   value: data.simulation.nextDay.toLocaleString(),     testId: "sim-nextday"   },
                    { label: "Next week",  value: data.simulation.nextWeek.toLocaleString(),    testId: "sim-nextweek"  },
                    { label: "Next month", value: data.simulation.nextMonth.toLocaleString(),   testId: "sim-nextmonth" },
                  ].map(({ label, value, testId }) => (
                    <div key={testId} className="rounded bg-gray-900/60 border border-gray-800 px-3 py-2 text-xs" data-testid={testId}>
                      <div className="text-gray-500">{label}</div>
                      <div className="font-semibold text-base text-gray-200">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-500 space-y-1">
                  <div>Peak estimate: <span className="text-gray-300">{data.simulation.peakEstimate.toLocaleString()}</span></div>
                  <div>Herd threshold: <span className="text-gray-300">{data.simulation.herdThreshold.toLocaleString()}</span></div>
                  <div>Risk level: <span className={data.simulation.riskLevel === "critical" ? "text-red-400" : data.simulation.riskLevel === "high" ? "text-orange-400" : "text-emerald-400"}>{data.simulation.riskLevel}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Redistribution + Policy */}
          {(data.recommendedRedistribution.length > 0 || data.overloadedRegions.length > 0) && (
            <Card className="border-gray-800 bg-gray-950" data-testid="card-redistribution">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> Global Redistribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recommendedRedistribution.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">Underloaded — accept overflow:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.recommendedRedistribution.map(r => (
                        <Badge key={r} className="border border-emerald-600/30 bg-emerald-950/30 text-emerald-400 text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.overloadedRegions.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">Overloaded — divert non-critical:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.overloadedRegions.map(r => (
                        <Badge key={r} className="border border-red-600/30 bg-red-950/30 text-red-400 text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-12 text-center" data-testid="global-empty">
          <Globe className="h-10 w-10 mx-auto text-emerald-400/30 mb-3" />
          <p className="text-sm text-gray-500">
            Click <strong className="text-gray-300">Run Global Orchestration</strong> to activate the WHO-scale intelligence layer — continent signals, pandemic detection, SIR spread simulation, early warning, and global policy enforcement.
          </p>
        </div>
      )}
    </div>
  );
}
