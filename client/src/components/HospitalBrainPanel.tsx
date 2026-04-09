/**
 * Hospital Brain Panel
 *
 * Command grid view for the Hospital Brain orchestrator.
 * Lets the operations team run on-demand or real-time hospital-wide
 * intelligence: demand forecast, capacity state, surge alert, population
 * signals, and per-patient routing recommendations.
 *
 * Uses TanStack Query useMutation — triggered explicitly by the user
 * (hospital brain runs are deliberate operational decisions, not auto-polls).
 */

import { useState }             from "react";
import { useMutation }          from "@tanstack/react-query";
import { apiRequest }           from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }                from "@/components/ui/badge";
import { Button }               from "@/components/ui/button";
import { Progress }             from "@/components/ui/progress";
import {
  Activity, AlertTriangle, Brain, Building2, Heart, Home,
  MonitorSmartphone, Stethoscope, TrendingUp, Users, Wifi, WifiOff, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OperationalState {
  telemedOpenSlots:    number;
  clinicOpenSlots:     number;
  physicianAvailable:  number;
  nurseAvailable:      number;
  currentQueueSize:    number;
  averageWaitMinutes:  number;
  ehrHealthy:          boolean;
  fhirHealthy:         boolean;
}

interface HospitalBrainOutput {
  demandForecast: {
    nextHourVolume:    number;
    nextHourEr:        number;
    next4HourVolume:   number;
    queuePressureBoost: number;
    riskLevel:         "low" | "medium" | "high";
  };
  capacityState: {
    telemedUtilization:   number;
    clinicUtilization:    number;
    strainScore:          number;
    systemState:          "stable" | "busy" | "strained";
    canAbsorbMoreTelemed: boolean;
    canAbsorbMoreClinic:  boolean;
  };
  surgeState: {
    score:              number;
    status:             "normal" | "watch" | "surge" | "critical";
    recommendedActions: string[];
  };
  populationSignals: {
    topComplaints:           Array<{ complaint: string; count: number }>;
    erRate:                  number;
    nextHourVolume:          number;
    nextHourEr:              number;
    possibleSyndromicSignal: string | null;
  };
  patientPlans: Array<{
    patientId:    string;
    deterioration: { score: number; riskLevel: "low" | "medium" | "high" };
    route:        { destination: "ER" | "CLINIC" | "TELEMED" | "HOME"; urgency: string; reason: string };
  }>;
  summary: {
    totalPatients:    number;
    erSuggested:      number;
    clinicSuggested:  number;
    telemedSuggested: number;
    homeSuggested:    number;
    highRiskPatients: number;
  };
}

// ── Default demo state ────────────────────────────────────────────────────────

const DEFAULT_OPS: OperationalState = {
  telemedOpenSlots:   12,
  clinicOpenSlots:    6,
  physicianAvailable: 3,
  nurseAvailable:     5,
  currentQueueSize:   18,
  averageWaitMinutes: 25,
  ehrHealthy:         true,
  fhirHealthy:        true,
};

const DEMO_PATIENTS = [
  { patientId: "pt-001", ageYears: 72, complaint: "chest_pain",           symptoms: ["confusion"],     safetyDisposition: "ER_NOW"  as const },
  { patientId: "pt-002", ageYears: 45, complaint: "shortness_of_breath",  symptoms: ["cough"],          safetyDisposition: "URGENT" as const },
  { patientId: "pt-003", ageYears: 28, complaint: "fever",                symptoms: ["sore_throat"],   safetyDisposition: "ROUTINE" as const },
  { patientId: "pt-004", ageYears: 55, complaint: "fever",                symptoms: ["cough"],          safetyDisposition: "ROUTINE" as const },
  { patientId: "pt-005", ageYears: 34, complaint: "fever",                symptoms: ["fatigue"],        safetyDisposition: "CONTINUE" as const },
  { patientId: "pt-006", ageYears: 68, complaint: "chest_pain",           symptoms: ["syncope"],        safetyDisposition: "URGENT" as const, vitals: { systolicBp: 92, heartRate: 125 } },
  { patientId: "pt-007", ageYears: 22, complaint: "sore_throat",          symptoms: [],                 safetyDisposition: "ROUTINE" as const },
  { patientId: "pt-008", ageYears: 81, complaint: "shortness_of_breath",  symptoms: ["confusion"],      safetyDisposition: "URGENT" as const, vitals: { oxygenSaturation: 89, respiratoryRate: 24 } },
];

const DEMO_HISTORY = Array.from({ length: 24 }, (_, i) => ({
  ts:          Date.now() - (23 - i) * 3_600_000,
  count:       Math.round(12 + Math.sin(i / 4) * 6 + Math.random() * 3),
  erCount:     Math.round(2  + Math.random() * 2),
  telemedCount: Math.round(5 + Math.random() * 3),
  clinicCount:  Math.round(3 + Math.random() * 2),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function surgeBadge(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    normal:   { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Normal"   },
    watch:    { color: "bg-yellow-500/15  text-yellow-400  border-yellow-500/30",  label: "Watch"    },
    surge:    { color: "bg-orange-500/15  text-orange-400  border-orange-500/30",  label: "Surge"    },
    critical: { color: "bg-red-500/15     text-red-400     border-red-500/30",     label: "Critical" },
  };
  const m = map[status] ?? map.normal;
  return (
    <Badge className={`border text-xs font-semibold px-2 py-0.5 ${m.color}`}>
      {m.label}
    </Badge>
  );
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    medium: "bg-yellow-500/10  text-yellow-400  border-yellow-500/30",
    high:   "bg-red-500/10     text-red-400     border-red-500/30",
  };
  return (
    <Badge className={`border text-xs ${map[level] ?? map.low}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </Badge>
  );
}

function destIcon(dest: string) {
  switch (dest) {
    case "ER":      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    case "CLINIC":  return <Building2      className="h-3.5 w-3.5 text-blue-400" />;
    case "TELEMED": return <MonitorSmartphone className="h-3.5 w-3.5 text-purple-400" />;
    case "HOME":    return <Home           className="h-3.5 w-3.5 text-gray-400" />;
    default:        return null;
  }
}

function destColor(dest: string) {
  switch (dest) {
    case "ER":      return "text-red-400";
    case "CLINIC":  return "text-blue-400";
    case "TELEMED": return "text-purple-400";
    case "HOME":    return "text-gray-400";
    default:        return "";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HospitalBrainPanel() {
  const [ops, setOps] = useState<OperationalState>(DEFAULT_OPS);

  const mutation = useMutation<HospitalBrainOutput, Error>({
    mutationFn: () =>
      apiRequest("POST", "/api/hospital-brain/run", {
        traceId:          crypto.randomUUID(),
        nowTs:            Date.now(),
        incomingPatients: DEMO_PATIENTS,
        historicalVolumes: DEMO_HISTORY,
        operationalState: ops,
      }).then(r => r.json()),
  });

  const data = mutation.data;

  return (
    <div className="space-y-5" data-testid="hospital-brain-panel">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-400" />
          <h2 className="text-base font-semibold">Hospital Brain</h2>
          <span className="text-xs text-gray-500">Predictive demand · Capacity · Routing · Population</span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-run-hospital-brain"
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Zap className="h-4 w-4 mr-1.5" />
          {mutation.isPending ? "Running..." : "Run Hospital Brain"}
        </Button>
      </div>

      {/* ── Operational State Controls ── */}
      <Card className="border-gray-800 bg-gray-950">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
            <Activity className="h-4 w-4" /> Operational State
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {(
              [
                { key: "currentQueueSize",   label: "Queue size",        min: 0,  max: 200 },
                { key: "averageWaitMinutes", label: "Avg wait (min)",    min: 0,  max: 120 },
                { key: "telemedOpenSlots",   label: "Telemed slots",     min: 0,  max: 50  },
                { key: "clinicOpenSlots",    label: "Clinic slots",      min: 0,  max: 30  },
                { key: "physicianAvailable", label: "Physicians",        min: 0,  max: 20  },
                { key: "nurseAvailable",     label: "Nurses",            min: 0,  max: 20  },
              ] as const
            ).map(({ key, label, min, max }) => (
              <label key={key} className="flex flex-col gap-1" data-testid={`input-ops-${key}`}>
                <span className="text-xs text-gray-500">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={(ops as any)[key]}
                  onChange={e => setOps(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-white text-sm focus:outline-none focus:border-indigo-500"
                  data-testid={`number-${key}`}
                />
              </label>
            ))}

            <div className="flex flex-col gap-2 col-span-2 md:col-span-2">
              <span className="text-xs text-gray-500">System health</span>
              <div className="flex gap-3 mt-0.5">
                <button
                  onClick={() => setOps(prev => ({ ...prev, ehrHealthy: !prev.ehrHealthy }))}
                  data-testid="toggle-ehr-health"
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                    ops.ehrHealthy
                      ? "border-emerald-600 bg-emerald-950 text-emerald-400"
                      : "border-red-700 bg-red-950 text-red-400"
                  }`}
                >
                  {ops.ehrHealthy ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  EHR {ops.ehrHealthy ? "Healthy" : "Down"}
                </button>
                <button
                  onClick={() => setOps(prev => ({ ...prev, fhirHealthy: !prev.fhirHealthy }))}
                  data-testid="toggle-fhir-health"
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                    ops.fhirHealthy
                      ? "border-emerald-600 bg-emerald-950 text-emerald-400"
                      : "border-red-700 bg-red-950 text-red-400"
                  }`}
                >
                  {ops.fhirHealthy ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  FHIR {ops.fhirHealthy ? "Healthy" : "Down"}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {mutation.isError && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-400"
          data-testid="hospital-brain-error">
          {mutation.error?.message ?? "Unknown error from Hospital Brain"}
        </div>
      )}

      {/* ── Output ── */}
      {data && (
        <div className="space-y-4" data-testid="hospital-brain-output">

          {/* Surge banner */}
          {data.surgeState.status !== "normal" && (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
              data.surgeState.status === "critical"
                ? "border-red-700/60 bg-red-950/50"
                : data.surgeState.status === "surge"
                ? "border-orange-700/60 bg-orange-950/40"
                : "border-yellow-700/60 bg-yellow-950/40"
            }`} data-testid="surge-banner">
              <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                data.surgeState.status === "critical" ? "text-red-400" :
                data.surgeState.status === "surge"    ? "text-orange-400" : "text-yellow-400"
              }`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Surge Alert</span>
                  {surgeBadge(data.surgeState.status)}
                  <span className="text-xs text-gray-400">Score: {data.surgeState.score}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {data.surgeState.recommendedActions.map((a, i) => (
                    <li key={i} className="text-xs text-gray-300">• {a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Top summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-gray-800 bg-gray-950" data-testid="kpi-total-patients">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Users className="h-3.5 w-3.5" /> Total Patients
                </div>
                <div className="text-3xl font-bold">{data.summary.totalPatients}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {data.summary.highRiskPatients} high-risk
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-950" data-testid="kpi-demand-forecast">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Next Hour
                </div>
                <div className="text-3xl font-bold">{data.demandForecast.nextHourVolume}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {riskBadge(data.demandForecast.riskLevel)}
                  <span className="text-xs text-gray-500">{data.demandForecast.nextHourEr} ER</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-950" data-testid="kpi-system-state">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Activity className="h-3.5 w-3.5" /> System State
                </div>
                <div className="text-3xl font-bold capitalize">{data.capacityState.systemState}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Strain score: {data.capacityState.strainScore.toFixed(1)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-950" data-testid="kpi-surge-status">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Zap className="h-3.5 w-3.5" /> Surge Status
                </div>
                <div className="mt-1">{surgeBadge(data.surgeState.status)}</div>
                <div className="text-xs text-gray-500 mt-1.5">
                  ER rate: {(data.populationSignals.erRate * 100).toFixed(0)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Routing summary + capacity utilization */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-gray-800 bg-gray-950" data-testid="card-routing-summary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4" /> Routing Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    { key: "erSuggested",      label: "ER",      icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,       color: "bg-red-500"    },
                    { key: "clinicSuggested",  label: "Clinic",  icon: <Building2 className="h-3.5 w-3.5 text-blue-400" />,         color: "bg-blue-500"   },
                    { key: "telemedSuggested", label: "Telemed", icon: <MonitorSmartphone className="h-3.5 w-3.5 text-purple-400" />, color: "bg-purple-500" },
                    { key: "homeSuggested",    label: "Home",    icon: <Home className="h-3.5 w-3.5 text-gray-400" />,              color: "bg-gray-500"   },
                  ] as const
                ).map(({ key, label, icon, color }) => {
                  const val = data.summary[key];
                  const pct = data.summary.totalPatients > 0
                    ? (val / data.summary.totalPatients) * 100 : 0;
                  return (
                    <div key={key} className="space-y-1" data-testid={`routing-${key}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">{icon} {label}</span>
                        <span className="text-gray-300 font-medium">{val} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${color}`} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-950" data-testid="card-capacity">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Heart className="h-4 w-4" /> Capacity Utilization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <MonitorSmartphone className="h-3.5 w-3.5 text-purple-400" /> Telemed
                    </span>
                    <span>{(data.capacityState.telemedUtilization * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={data.capacityState.telemedUtilization * 100} className="h-2" />
                  <div className="text-xs text-gray-500">
                    {data.capacityState.canAbsorbMoreTelemed ? "✓ Can absorb more" : "✗ At capacity"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-400" /> Clinic
                    </span>
                    <span>{(data.capacityState.clinicUtilization * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={data.capacityState.clinicUtilization * 100} className="h-2" />
                  <div className="text-xs text-gray-500">
                    {data.capacityState.canAbsorbMoreClinic ? "✓ Can absorb more" : "✗ At capacity"}
                  </div>
                </div>
                <div className="pt-1 border-t border-gray-800 text-xs text-gray-500">
                  4-hour volume projection: <span className="text-white font-medium">{data.demandForecast.next4HourVolume}</span> patients
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Population signals */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-population-signals">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Population Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.populationSignals.possibleSyndromicSignal && (
                <div className="mb-3 rounded-lg border border-yellow-700/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-300"
                  data-testid="syndromic-signal">
                  {data.populationSignals.possibleSyndromicSignal}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {data.populationSignals.topComplaints.map((c) => (
                  <div key={c.complaint}
                    className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-center"
                    data-testid={`complaint-${c.complaint}`}>
                    <div className="text-lg font-bold">{c.count}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{c.complaint.replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Per-patient routing table */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-patient-plans">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                <Brain className="h-4 w-4" /> Patient Routing Plans
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-patient-plans">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left pb-2 pr-4">Patient ID</th>
                      <th className="text-left pb-2 pr-4">Risk</th>
                      <th className="text-left pb-2 pr-4">Score</th>
                      <th className="text-left pb-2 pr-4">Destination</th>
                      <th className="text-left pb-2 pr-4">Urgency</th>
                      <th className="text-left pb-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {data.patientPlans.map((plan, i) => (
                      <tr key={plan.patientId} className="hover:bg-gray-900/50 transition-colors"
                        data-testid={`row-patient-${i}`}>
                        <td className="py-2 pr-4 font-mono text-gray-300">{plan.patientId}</td>
                        <td className="py-2 pr-4">{riskBadge(plan.deterioration.riskLevel)}</td>
                        <td className="py-2 pr-4 text-gray-400">{plan.deterioration.score}</td>
                        <td className="py-2 pr-4">
                          <span className={`flex items-center gap-1 font-semibold ${destColor(plan.route.destination)}`}>
                            {destIcon(plan.route.destination)} {plan.route.destination}
                          </span>
                        </td>
                        <td className="py-2 pr-4 capitalize text-gray-400">{plan.route.urgency}</td>
                        <td className="py-2 text-gray-500">{plan.route.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!data && !mutation.isPending && !mutation.isError && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-12 text-center"
          data-testid="hospital-brain-empty">
          <Brain className="h-10 w-10 mx-auto text-indigo-400/40 mb-3" />
          <p className="text-sm text-gray-500">
            Adjust the operational state above, then click <strong className="text-gray-300">Run Hospital Brain</strong> to generate demand forecast, capacity analysis, and per-patient routing plans.
          </p>
        </div>
      )}
    </div>
  );
}
