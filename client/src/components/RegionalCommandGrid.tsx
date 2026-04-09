/**
 * Regional Command Grid
 *
 * "Google Maps + ICU triage + public health radar" in a single panel.
 *
 * Shows:
 *   - Regional facility capacity across the network (ER, clinic, telemed)
 *   - Per-patient geo routing decisions with reasons
 *   - Admission risk + bounceback scores
 *   - Callback plans (timing + method)
 *   - Outbreak / syndromic cluster alerts
 *
 * Adapted from the packet's raw props-based component to use TanStack Query
 * useMutation — the user explicitly triggers a regional orchestration run,
 * which is a deliberate clinical/operational decision.
 */

import { useState }              from "react";
import { useMutation }           from "@tanstack/react-query";
import { apiRequest }            from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }                 from "@/components/ui/badge";
import { Button }                from "@/components/ui/button";
import { Progress }              from "@/components/ui/progress";
import {
  AlertTriangle, Building2, Globe, Heart, Home, MapPin,
  MonitorSmartphone, Phone, MessageSquare, Users, Zap,
  Thermometer, Activity, Shield, TrendingUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FacilityCapacity {
  name:             string;
  type:             string;
  distance:         number;
  openSlots:        number;
  totalSlots:       number;
  waitMinutes:      number;
  loadScore:        number;
  saturation:       "low" | "medium" | "high" | "critical";
  canAcceptUrgent:  boolean;
  canAcceptRoutine: boolean;
  estimatedWaitRating: string;
}

interface PatientPlan {
  patientId:      string;
  route:          { destination: string; type: string; distance: number; loadScore: number; reason: string };
  admissionRisk:  { score: number; risk: "low" | "medium" | "high"; recommendDirectAdmissionPath: boolean; contributingFactors: string[] };
  bouncebackRisk: { score: number; risk: "low" | "medium" | "high"; needsFollowup: boolean; followupWindow: string; reason: string };
  callbackPlan:   { timing: string; method: string; reason: string; messageTemplate: string; priority: string };
}

interface OutbreakReport {
  clusters:   Array<{ complaint: string; count: number; alertLevel: string; syndromicLabel: string | null }>;
  alert:      boolean;
  watchCount: number;
  alertCount: number;
  summary:    string;
}

interface RegionalOutput {
  regionalCapacity: FacilityCapacity[];
  patientPlans:     PatientPlan[];
  outbreak:         OutbreakReport;
  summary: {
    totalPatients:      number;
    highAdmissionRisk:  number;
    highBouncebackRisk: number;
    callbacksScheduled: number;
    urgentCallbacks:    number;
    outbreakAlert:      boolean;
  };
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_FACILITIES = [
  { name: "NYC Health + Hospitals / Bellevue", type: "ER",      distance: 1.2,  openSlots: 4,  totalSlots: 20, physicianCount: 6,  waitMinutes: 55, specialties: ["trauma", "stroke"] },
  { name: "NYU Langone Urgent Care — Murray Hill", type: "CLINIC", distance: 0.8,  openSlots: 8,  totalSlots: 15, physicianCount: 3,  waitMinutes: 20, specialties: ["cardiology"] },
  { name: "Mount Sinai ER",                     type: "ER",      distance: 3.1,  openSlots: 12, totalSlots: 30, physicianCount: 8,  waitMinutes: 35, specialties: ["stroke", "cath"] },
  { name: "Auralyn Telemed Pool",               type: "TELEMED", distance: 0,    openSlots: 40, totalSlots: 50, physicianCount: 10, waitMinutes: 5,  specialties: [] },
  { name: "Cornell Weill — East Side Clinic",   type: "CLINIC",  distance: 2.4,  openSlots: 3,  totalSlots: 12, physicianCount: 2,  waitMinutes: 40, specialties: [] },
  { name: "NewYork-Presbyterian Cath Lab",       type: "CATH",    distance: 4.5,  openSlots: 2,  totalSlots: 4,  physicianCount: 3,  waitMinutes: 15, specialties: ["cath", "cardiology"] },
];

const DEMO_PATIENTS = [
  { patientId: "r-001", ageYears: 78, complaint: "chest_pain",           symptoms: ["confusion", "syncope"], safetyDisposition: "ER_NOW"  as const, riskLevel: "high" as const, vitals: { systolicBp: 90, oxygenSaturation: 88 }, siteName: "Site A" },
  { patientId: "r-002", ageYears: 45, complaint: "shortness_of_breath",  symptoms: ["cough"],                safetyDisposition: "URGENT" as const,  riskLevel: "high" as const, siteName: "Site A" },
  { patientId: "r-003", ageYears: 28, complaint: "fever",                symptoms: ["sore_throat"],          safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  siteName: "Site B" },
  { patientId: "r-004", ageYears: 82, complaint: "abdominal_pain",       symptoms: ["vomiting"],             safetyDisposition: "URGENT" as const,  riskLevel: "medium" as const, priorVisits30Days: 3, siteName: "Site B" },
  { patientId: "r-005", ageYears: 33, complaint: "fever",                symptoms: [],                       safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  siteName: "Site A" },
  { patientId: "r-006", ageYears: 29, complaint: "fever",                symptoms: [],                       safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  siteName: "Site C" },
  { patientId: "r-007", ageYears: 35, complaint: "fever",                symptoms: [],                       safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  siteName: "Site C" },
  { patientId: "r-008", ageYears: 31, complaint: "fever",                symptoms: [],                       safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  siteName: "Site B" },
  { patientId: "r-009", ageYears: 60, complaint: "chest_pain",           symptoms: [],                       safetyDisposition: "URGENT" as const,  riskLevel: "medium" as const, requiredSpecialty: "cath", siteName: "Site A" },
  { patientId: "r-010", ageYears: 66, complaint: "headache",             symptoms: [],                       safetyDisposition: "ROUTINE" as const, riskLevel: "low" as const,  priorVisits30Days: 2, siteName: "Site C" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function saturationBadge(s: string) {
  const map: Record<string, string> = {
    low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    medium:   "bg-yellow-500/15  text-yellow-400  border-yellow-500/30",
    high:     "bg-orange-500/15  text-orange-400  border-orange-500/30",
    critical: "bg-red-500/15     text-red-400     border-red-500/30",
  };
  return <Badge className={`border text-xs ${map[s] ?? map.low}`}>{s}</Badge>;
}

function riskBadge(r: string) {
  const map: Record<string, string> = {
    low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    medium: "bg-yellow-500/10  text-yellow-400  border-yellow-500/30",
    high:   "bg-red-500/10     text-red-400     border-red-500/30",
  };
  return <Badge className={`border text-xs ${map[r] ?? map.low}`}>{r}</Badge>;
}

function typeIcon(type: string) {
  switch (type) {
    case "ER":      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    case "CLINIC":  return <Building2      className="h-3.5 w-3.5 text-blue-400" />;
    case "TELEMED": return <MonitorSmartphone className="h-3.5 w-3.5 text-purple-400" />;
    case "CATH":    return <Heart          className="h-3.5 w-3.5 text-pink-400" />;
    case "STROKE":  return <Activity       className="h-3.5 w-3.5 text-orange-400" />;
    default:        return <MapPin         className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function callbackIcon(method: string) {
  if (method === "phone") return <Phone         className="h-3.5 w-3.5 text-emerald-400" />;
  if (method === "sms")   return <MessageSquare className="h-3.5 w-3.5 text-blue-400"    />;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RegionalCommandGrid() {
  const [showCallbacks, setShowCallbacks] = useState(false);

  const mutation = useMutation<RegionalOutput, Error>({
    mutationFn: () =>
      apiRequest("POST", "/api/regional/orchestrate", {
        patients:   DEMO_PATIENTS,
        facilities: DEMO_FACILITIES,
      }).then(r => r.json()),
  });

  const data = mutation.data;

  return (
    <div className="space-y-5" data-testid="regional-command-grid">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-semibold">Regional Command Grid</h2>
          <span className="text-xs text-gray-500">Geo routing · Capacity federation · Admission risk · Outbreak detection</span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-run-regional"
          size="sm"
          className="bg-cyan-700 hover:bg-cyan-600 text-white"
        >
          <Globe className="h-4 w-4 mr-1.5" />
          {mutation.isPending ? "Orchestrating..." : "Run Regional Orchestration"}
        </Button>
      </div>

      {/* ── Error ── */}
      {mutation.isError && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-400"
          data-testid="regional-error">
          {mutation.error?.message ?? "Unknown error"}
        </div>
      )}

      {/* ── Output ── */}
      {data && (
        <div className="space-y-4" data-testid="regional-output">

          {/* Outbreak alert banner */}
          {data.outbreak.alert && (
            <div className="rounded-xl border border-red-700/60 bg-red-950/50 px-4 py-3 flex items-start gap-3"
              data-testid="outbreak-banner">
              <Thermometer className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-red-300">Regional Outbreak Signal</span>
                  <Badge className="border border-red-500/50 bg-red-500/15 text-red-400 text-xs">
                    {data.outbreak.alertCount} alert
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mt-1">{data.outbreak.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.outbreak.clusters.map(c => (
                    <span key={c.complaint}
                      className={`text-xs px-2 py-0.5 rounded border ${c.alertLevel === "alert" ? "border-red-600/50 bg-red-950 text-red-300" : "border-yellow-600/40 bg-yellow-950/40 text-yellow-300"}`}
                      data-testid={`outbreak-cluster-${c.complaint}`}>
                      {c.complaint.replace(/_/g, " ")} ×{c.count}
                      {c.syndromicLabel && ` · ${c.syndromicLabel}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total Patients",    value: data.summary.totalPatients,      icon: <Users          className="h-3.5 w-3.5" />, testId: "kpi-total"         },
              { label: "High Admission Risk", value: data.summary.highAdmissionRisk, icon: <TrendingUp     className="h-3.5 w-3.5 text-orange-400" />, testId: "kpi-admission"     },
              { label: "High Bounceback",   value: data.summary.highBouncebackRisk, icon: <Shield         className="h-3.5 w-3.5 text-yellow-400" />, testId: "kpi-bounceback"    },
              { label: "Callbacks Needed",  value: data.summary.callbacksScheduled, icon: <Phone          className="h-3.5 w-3.5 text-emerald-400"/>, testId: "kpi-callbacks"     },
              { label: "Urgent Callbacks",  value: data.summary.urgentCallbacks,    icon: <Zap            className="h-3.5 w-3.5 text-red-400"   />, testId: "kpi-urgent-callbacks" },
              { label: "Outbreak Alert",    value: data.summary.outbreakAlert ? "YES" : "No", icon: <Thermometer className="h-3.5 w-3.5 text-pink-400" />, testId: "kpi-outbreak" },
            ].map(({ label, value, icon, testId }) => (
              <Card key={testId} className="border-gray-800 bg-gray-950" data-testid={testId}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{icon} {label}</div>
                  <div className={`text-2xl font-bold ${label === "Outbreak Alert" && data.summary.outbreakAlert ? "text-red-400" : ""}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Facility capacity grid */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-regional-capacity">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Regional Facility Capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.regionalCapacity.map((f) => (
                  <div key={f.name}
                    className="flex items-center gap-3 p-2 rounded-lg bg-gray-900/60 border border-gray-800"
                    data-testid={`facility-${f.name.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="shrink-0">{typeIcon(f.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate">{f.name}</span>
                        {saturationBadge(f.saturation)}
                        <span className="text-xs text-gray-500">{f.distance > 0 ? `${f.distance} km` : "Virtual"}</span>
                        <span className="text-xs text-gray-500">~{f.waitMinutes}min wait</span>
                      </div>
                      <Progress value={f.loadScore * 100} className="h-1 mt-1.5" />
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">
                      {f.openSlots}/{f.totalSlots}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Patient routing + risk table */}
          <Card className="border-gray-800 bg-gray-950" data-testid="card-patient-routing">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Globe className="h-4 w-4" /> Patient Routing Plans
                </CardTitle>
                <button
                  onClick={() => setShowCallbacks(v => !v)}
                  data-testid="toggle-callbacks"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {showCallbacks ? "Hide" : "Show"} callbacks
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-patient-routing">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left pb-2 pr-3">Patient</th>
                      <th className="text-left pb-2 pr-3">Destination</th>
                      <th className="text-left pb-2 pr-3">Admission</th>
                      <th className="text-left pb-2 pr-3">Bounceback</th>
                      {showCallbacks && <th className="text-left pb-2 pr-3">Callback</th>}
                      <th className="text-left pb-2">Routing reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {data.patientPlans.map((plan, i) => (
                      <tr key={plan.patientId}
                        className="hover:bg-gray-900/50 transition-colors"
                        data-testid={`row-regional-${i}`}>
                        <td className="py-2 pr-3 font-mono text-gray-300">{plan.patientId}</td>
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1 font-medium">
                            {typeIcon(plan.route.type)} {plan.route.destination}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{riskBadge(plan.admissionRisk.risk)}</td>
                        <td className="py-2 pr-3">{riskBadge(plan.bouncebackRisk.risk)}</td>
                        {showCallbacks && (
                          <td className="py-2 pr-3">
                            {plan.callbackPlan.timing !== "none" ? (
                              <span className="flex items-center gap-1 text-gray-300">
                                {callbackIcon(plan.callbackPlan.method)}
                                {plan.callbackPlan.timing} {plan.callbackPlan.method}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 text-gray-500 max-w-xs truncate" title={plan.route.reason}>
                          {plan.route.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Callback plans detail (when shown) */}
          {showCallbacks && data.patientPlans.some(p => p.callbackPlan.timing !== "none") && (
            <Card className="border-gray-800 bg-gray-950" data-testid="card-callback-detail">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400 flex items-center gap-1.5">
                  <Phone className="h-4 w-4" /> Callback Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.patientPlans
                    .filter(p => p.callbackPlan.timing !== "none")
                    .map(p => (
                      <div key={p.patientId}
                        className={`rounded-lg border px-3 py-2 ${p.callbackPlan.priority === "urgent" ? "border-orange-700/50 bg-orange-950/30" : "border-gray-700 bg-gray-900/50"}`}
                        data-testid={`callback-${p.patientId}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-gray-300">{p.patientId}</span>
                          <div className="flex items-center gap-2">
                            {callbackIcon(p.callbackPlan.method)}
                            <span className="text-xs text-gray-400">{p.callbackPlan.timing} · {p.callbackPlan.method}</span>
                            {p.callbackPlan.priority === "urgent" && (
                              <Badge className="border border-orange-600/40 bg-orange-950 text-orange-400 text-xs">urgent</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{p.callbackPlan.reason}</p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* Empty state */}
      {!data && !mutation.isPending && !mutation.isError && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-12 text-center"
          data-testid="regional-empty">
          <Globe className="h-10 w-10 mx-auto text-cyan-400/30 mb-3" />
          <p className="text-sm text-gray-500">
            Click <strong className="text-gray-300">Run Regional Orchestration</strong> to compute facility capacity, route patients across the network, predict admission and bounceback risk, and detect outbreak signals.
          </p>
        </div>
      )}
    </div>
  );
}
