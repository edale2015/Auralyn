/**
 * Command Center v4 — Digital Twin · EMS Integration · Learning System
 * Real-time physiological models, EMS dispatch, RLHF feedback, outcome predictions.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Ambulance, TrendingUp, Activity, RefreshCw, Send,
  CheckCircle, AlertTriangle, Zap, RotateCcw, Heart, Thermometer,
  Wind, Droplets, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown,
} from "lucide-react";

function VitalChip({ label, value, unit, trend }: { label: string; value: number; unit: string; trend: string }) {
  const trendColor = trend === "rising" ? "text-amber-400" : trend === "falling" ? "text-red-400" : "text-emerald-400";
  return (
    <div className="bg-slate-800 rounded-lg p-2.5 flex flex-col gap-0.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-100">{value}<span className="text-xs text-slate-500 ml-1">{unit}</span></p>
      <p className={`text-xs ${trendColor}`}>{trend}</p>
    </div>
  );
}

export default function CommandCenterV4Page() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"twin" | "ems" | "learning" | "outcomes">("twin");
  const [twinPatientId, setTwinPatientId] = useState("P002");
  const [twinQueried, setTwinQueried] = useState("P002");
  const [feedbackForm, setFeedbackForm] = useState({ caseId: "", signal: "positive" as "positive" | "negative" | "correction", notes: "" });

  const { data: twin, isLoading: twinLoading, refetch: refetchTwin } = useQuery<any>({
    queryKey: ["/api/cc-v4/digital-twin", twinQueried],
    refetchInterval: 10_000,
  });

  const { data: emsData, isLoading: emsLoading, refetch: refetchEMS } = useQuery<any>({
    queryKey: ["/api/cc-v4/ems/units"],
    refetchInterval: 8_000,
  });

  const { data: learningData, isLoading: learningLoading } = useQuery<any>({
    queryKey: ["/api/cc-v4/learning/performance"],
    refetchInterval: 60_000,
  });

  const { data: outcomes, isLoading: outLoading } = useQuery<any>({
    queryKey: ["/api/cc-v4/outcomes"],
    refetchInterval: 30_000,
  });

  const dispatchMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/cc-v4/ems/dispatch", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cc-v4/ems/units"] });
      toast({ title: "EMS Dispatched", description: `${data.unitId} ETA ~${data.estimatedArrivalMins} min` });
    },
    onError: (e: any) => toast({ title: "Dispatch Failed", description: e.message, variant: "destructive" }),
  });

  const feedbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cc-v4/learning/feedback", feedbackForm),
    onSuccess: () => {
      toast({ title: "Feedback Submitted", description: "Queued for RLHF weight update cycle" });
      setFeedbackForm(f => ({ ...f, caseId: "", notes: "" }));
    },
  });

  const twinData   = twin?.twin;
  const units      = emsData?.units ?? [];
  const emsSum     = emsData?.summary ?? {};
  const metrics    = learningData?.metrics ?? {};
  const preds      = outcomes?.predictions ?? [];

  const ORGAN_COLORS: Record<string, string> = {
    normal: "text-emerald-400", compromised: "text-red-400", acute_injury: "text-red-600",
  };

  const tabs = [
    { id: "twin",     label: "Digital Twin", icon: Brain     },
    { id: "ems",      label: "EMS Tracker",  icon: Ambulance },
    { id: "learning", label: "Learning",     icon: TrendingUp },
    { id: "outcomes", label: "Outcomes",     icon: Activity  },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Command Center v4</h1>
            <p className="text-xs text-slate-400">Digital Twin · EMS Integration · Learning System</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => { refetchTwin(); refetchEMS(); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} data-testid={`tab-v4-${id}`} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === id ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Digital Twin */}
      {activeTab === "twin" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input className="bg-slate-800 border-slate-700 text-slate-100 max-w-xs"
              data-testid="input-twin-patient-id"
              placeholder="Patient ID (e.g. P002)"
              value={twinPatientId}
              onChange={e => setTwinPatientId(e.target.value)} />
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="button-load-twin"
              onClick={() => setTwinQueried(twinPatientId)}>
              Load Twin
            </Button>
          </div>

          {twinLoading && <p className="text-xs text-slate-500">Generating digital twin model...</p>}
          {twinData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Vitals */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-400" /> Live Vitals — {twinData.patientId}
                    <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 ml-auto">{twinData.modelVersion}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <VitalChip label="Heart Rate"  value={twinData.vitals.heartRate.value}        unit={twinData.vitals.heartRate.unit}        trend={twinData.vitals.heartRate.trend} />
                    <VitalChip label="SBP"         value={twinData.vitals.systolicBP.value}       unit={twinData.vitals.systolicBP.unit}       trend={twinData.vitals.systolicBP.trend} />
                    <VitalChip label="SpO₂"        value={twinData.vitals.oxygenSaturation.value} unit={twinData.vitals.oxygenSaturation.unit} trend={twinData.vitals.oxygenSaturation.trend} />
                    <VitalChip label="Resp. Rate"  value={twinData.vitals.respiratoryRate.value}  unit={twinData.vitals.respiratoryRate.unit}  trend={twinData.vitals.respiratoryRate.trend} />
                    <VitalChip label="Temp"        value={twinData.vitals.temperature.value}      unit={twinData.vitals.temperature.unit}      trend={twinData.vitals.temperature.trend} />
                    <div className="bg-slate-800 rounded-lg p-2.5 flex flex-col gap-0.5">
                      <p className="text-xs text-slate-500">NEWS2 Score</p>
                      <p className={`text-lg font-bold ${twinData.vitals.news2Score > 5 ? "text-red-400" : twinData.vitals.news2Score > 2 ? "text-amber-400" : "text-emerald-400"}`}>
                        {twinData.vitals.news2Score}
                      </p>
                      <p className="text-xs text-slate-500">of 20</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trajectory + Organs */}
              <div className="space-y-3">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-purple-400" /> Predicted Trajectory
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(twinData.predictedTrajectory).map(([window, val]: [string, any]) => (
                      <div key={window} className="flex items-center justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                        <span className="text-slate-400 font-mono">{window.replace("next", "Next ").replace("h", "h")}</span>
                        <Badge variant="outline" className={`text-xs border-slate-600 ${
                          val.includes("deterioration") ? "text-red-400 border-red-800" :
                          val.includes("monitoring")    ? "text-amber-400 border-amber-800" :
                          "text-emerald-400 border-emerald-800"
                        }`}>{val.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-200">Organ Systems</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-1.5">
                    {Object.entries(twinData.organSystems).map(([sys, status]: [string, any]) => (
                      <div key={sys} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${status === "normal" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="capitalize text-slate-400">{sys}</span>
                        <span className={`ml-auto font-mono ${ORGAN_COLORS[status] ?? "text-slate-400"}`}>{status.replace("_", " ")}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Intervention Recommendations */}
              <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" /> AI Intervention Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {twinData.interventionRecommendations.map((r: any) => (
                    <div key={r.priority} className="flex items-start gap-3 bg-slate-800 rounded-lg p-3">
                      <Badge className="bg-amber-900 text-amber-200 shrink-0">P{r.priority}</Badge>
                      <div>
                        <p className="text-sm text-slate-200 font-medium">{r.action}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{r.rationale}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* EMS Tracker */}
      {activeTab === "ems" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Units",  value: emsSum.total,      color: "text-slate-300" },
              { label: "Available",    value: emsSum.available,   color: "text-emerald-400" },
              { label: "Dispatched",   value: emsSum.dispatched,  color: "text-amber-400" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="bg-slate-900 border-slate-800">
                <CardContent className="p-3">
                  <p className={`text-2xl font-bold ${color}`}>{value ?? "—"}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Ambulance className="w-4 h-4 text-amber-400" /> EMS Units
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {emsLoading && <p className="text-xs text-slate-500">Loading units...</p>}
              {units.map((u: any) => (
                <div key={u.unitId} data-testid={`ems-unit-${u.unitId}`}
                  className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                  <Ambulance className={`w-4 h-4 shrink-0 ${
                    u.status === "available" ? "text-emerald-400" :
                    u.status === "dispatched" ? "text-amber-400" : "text-red-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{u.unitId} <span className="text-xs text-slate-500">({u.type})</span></p>
                    <p className="text-xs text-slate-500">{u.borough}</p>
                  </div>
                  <Badge className={`text-xs shrink-0 ${
                    u.status === "available" ? "bg-emerald-900 text-emerald-200" :
                    u.status === "dispatched" ? "bg-amber-900 text-amber-200" :
                    u.status === "standby"    ? "bg-slate-800 text-slate-400" :
                    "bg-red-900 text-red-200"
                  }`}>{u.status}</Badge>
                  {u.status === "available" && (
                    <Button size="sm" variant="outline"
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs shrink-0"
                      data-testid={`button-dispatch-${u.unitId}`}
                      disabled={dispatchMutation.isPending}
                      onClick={() => dispatchMutation.mutate({ unitId: u.unitId, address: "Auralyn Urgent Care – Midtown", priority: "HIGH" })}>
                      Dispatch
                    </Button>
                  )}
                  {u.eta && <span className="text-xs text-amber-400 shrink-0">~{u.eta} min</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Learning System */}
      {activeTab === "learning" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-400" /> RLHF Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {learningLoading && <p className="text-xs text-slate-500">Loading metrics...</p>}
              {[
                { label: "Feedback Collected",  value: metrics.feedbackCollected },
                { label: "Acceptance Rate",      value: metrics.feedbackAcceptance },
                { label: "Model Iterations",     value: metrics.modelIterations },
                { label: "Accuracy Delta",       value: metrics.accuracyDelta,  highlight: true },
                { label: "Calibration Score",    value: metrics.calibrationScore },
                { label: "Brier Score",          value: metrics.brier },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex items-center justify-between text-xs border-b border-slate-800 last:border-0 py-1.5">
                  <span className="text-slate-400">{label}</span>
                  <span className={`font-mono font-medium ${highlight ? "text-emerald-400" : "text-slate-200"}`}>{value ?? "—"}</span>
                </div>
              ))}
              {metrics.topImprovedConditions && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Top improved conditions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.topImprovedConditions.map((c: string) => (
                      <Badge key={c} className="bg-emerald-900 text-emerald-200 text-xs">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ThumbsUp className="w-4 h-4 text-emerald-400" /> Submit Physician Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-400">Case ID</Label>
                <Input className="bg-slate-800 border-slate-700 text-slate-100 mt-1"
                  data-testid="input-feedback-case-id"
                  placeholder="e.g. CASE-2026-001847"
                  value={feedbackForm.caseId}
                  onChange={e => setFeedbackForm(f => ({ ...f, caseId: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Signal</Label>
                <div className="flex gap-2 mt-1">
                  {(["positive", "negative", "correction"] as const).map(sig => (
                    <button key={sig} data-testid={`signal-${sig}`}
                      onClick={() => setFeedbackForm(f => ({ ...f, signal: sig }))}
                      className={`flex-1 text-xs py-1.5 rounded border transition-all ${
                        feedbackForm.signal === sig
                          ? sig === "positive" ? "bg-emerald-700 border-emerald-600 text-white"
                          : sig === "negative" ? "bg-red-700 border-red-600 text-white"
                          : "bg-amber-700 border-amber-600 text-white"
                          : "border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}>
                      {sig}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Notes (optional)</Label>
                <Textarea className="bg-slate-800 border-slate-700 text-slate-100 mt-1 text-sm resize-none"
                  data-testid="textarea-feedback-notes"
                  rows={2}
                  placeholder="What was incorrect or exemplary?"
                  value={feedbackForm.notes}
                  onChange={e => setFeedbackForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid="button-submit-feedback"
                disabled={feedbackMutation.isPending || !feedbackForm.caseId}
                onClick={() => feedbackMutation.mutate()}>
                <Send className="w-3.5 h-3.5 mr-2" />
                {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Outcome Predictions */}
      {activeTab === "outcomes" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Outcome Predictions
              {outcomes && <Badge variant="secondary" className="text-xs ml-auto">AUC {outcomes.auc}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outLoading && <p className="text-xs text-slate-500">Running outcome model...</p>}
            {preds.map((p: any) => (
              <div key={p.patientId} data-testid={`outcome-card-${p.patientId}`}
                className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                <span className="font-mono text-xs text-slate-400 w-10 shrink-0">{p.patientId}</span>
                <Badge className={`text-xs shrink-0 ${
                  p.outcome === "ICU_ADMISSION"       ? "bg-red-900 text-red-200" :
                  p.outcome === "HOSPITAL_ADMISSION"  ? "bg-amber-900 text-amber-200" :
                  "bg-emerald-900 text-emerald-200"
                }`}>{p.outcome.replace("_", " ")}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${
                      p.probability > 0.8 ? "bg-red-500" : p.probability > 0.6 ? "bg-amber-500" : "bg-emerald-500"
                    }`} style={{ width: `${Math.round(p.probability * 100)}%` }} />
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-200 w-10 text-right shrink-0">{Math.round(p.probability * 100)}%</span>
                <span className="text-xs text-slate-500 shrink-0">~{p.timeframeHours}h</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
