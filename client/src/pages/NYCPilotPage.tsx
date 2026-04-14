/**
 * NYC Pilot + FDA Audit + Deployment System
 * Operational metrics, FDNY EMS activity, FDA readiness checklist, deployment status, compliance.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  MapPin, Activity, CheckCircle, Clock, AlertCircle, RefreshCw,
  Ambulance, Shield, Server, BarChart3, FileCheck, Globe,
  TrendingUp, ChevronRight, Circle,
} from "lucide-react";

function StatusDot({ status }: { status: "complete" | "in_progress" | "pending" | string }) {
  const cls =
    status === "complete"    ? "bg-emerald-500" :
    status === "in_progress" ? "bg-amber-500 animate-pulse" :
    "bg-slate-600";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0 mt-0.5`} />;
}

function DeploymentBar({ pct }: { pct: number }) {
  return (
    <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function NYCPilotPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"metrics" | "ems" | "fda" | "deployments" | "compliance">("metrics");

  const { data: metrics,     refetch: refetchMetrics }   = useQuery<any>({ queryKey: ["/api/nyc-pilot/metrics"],      refetchInterval: 30_000 });
  const { data: throughput,  refetch: refetchThroughput } = useQuery<any>({ queryKey: ["/api/nyc-pilot/throughput"],   refetchInterval: 60_000 });
  const { data: emsActivity, refetch: refetchEMS }        = useQuery<any>({ queryKey: ["/api/nyc-pilot/ems-activity"], refetchInterval: 15_000 });
  const { data: fda }       = useQuery<any>({ queryKey: ["/api/nyc-pilot/fda-readiness"],  refetchInterval: 120_000 });
  const { data: deploys }   = useQuery<any>({ queryKey: ["/api/nyc-pilot/deployments"],    refetchInterval: 30_000 });
  const { data: compliance } = useQuery<any>({ queryKey: ["/api/nyc-pilot/compliance"],     refetchInterval: 120_000 });

  const promoteMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/nyc-pilot/deployment/promote", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/nyc-pilot/deployments"] });
      toast({ title: "Promotion Queued", description: `${data.fromEnv} → ${data.toEnv} · ETA ~${data.estimatedCompletionMins} min` });
    },
    onError: (e: any) => toast({ title: "Promotion Failed", description: e.message, variant: "destructive" }),
  });

  const pilot  = metrics?.pilot  ?? {};
  const hourly = throughput?.hourly ?? [];
  const ems    = emsActivity ?? {};
  const fdaData = fda ?? {};
  const envs   = deploys?.environments ?? [];
  const comp   = compliance?.scores ?? {};

  const tabs = [
    { id: "metrics",     label: "Pilot Metrics",  icon: BarChart3   },
    { id: "ems",         label: "EMS / FDNY",     icon: Ambulance   },
    { id: "fda",         label: "FDA Readiness",  icon: FileCheck   },
    { id: "deployments", label: "Deployments",    icon: Server      },
    { id: "compliance",  label: "Compliance",     icon: Shield      },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-700">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">NYC Pilot · FDA Deployment</h1>
            <p className="text-xs text-slate-400">
              {pilot.sites?.length ?? 3} sites · {pilot.daysSinceLaunch ?? "—"} days active · {pilot.fdaSubmissionStatus ?? "FDA: pending"}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => { refetchMetrics(); refetchEMS(); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Patients",     value: pilot.patientsTotal?.toLocaleString(),  color: "text-slate-200" },
          { label: "Triage Accuracy",    value: pilot.triageAccuracy,                   color: "text-emerald-400" },
          { label: "Avg Triage Time",    value: pilot.avgTriageTimeMin ? `${pilot.avgTriageTimeMin} min` : "—", color: "text-blue-400" },
          { label: "EHR Write Success",  value: pilot.ehrWriteSuccess,                  color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-3">
              <p className={`text-xl font-bold ${color}`} data-testid={`kpi-${label.toLowerCase().replace(/ /g, "-")}`}>{value ?? "—"}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-lg p-1 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} data-testid={`tab-nyc-${id}`} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === id ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Pilot Metrics */}
      {activeTab === "metrics" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Pilot Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Start Date",          value: pilot.startDate ? new Date(pilot.startDate).toLocaleDateString() : "—" },
                { label: "Days Active",         value: pilot.daysSinceLaunch },
                { label: "Patients Today",      value: pilot.patientsToday },
                { label: "Time Saved (est.)",   value: pilot.physicianTimesSaved },
                { label: "Adverse Events",      value: pilot.adverseEventsFlag ?? 0 },
                { label: "FDA Status",          value: pilot.fdaSubmissionStatus },
                { label: "NYC DOHMH Liaison",   value: metrics?.geography?.nycHhsLiaison },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800 last:border-0">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-200 font-medium text-right max-w-[60%] truncate" title={String(value)}>{value ?? "—"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> 24h Patient Throughput
                {throughput && <span className="text-xs text-slate-500 ml-auto">{throughput.total24h} total</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-56">
                <div className="space-y-1">
                  {hourly.slice(-12).map((h: any) => {
                    const maxPts = Math.max(...hourly.map((x: any) => x.patients), 1);
                    return (
                      <div key={h.hour} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-14 shrink-0 font-mono">{new Date(h.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded" style={{ width: `${(h.patients / maxPts) * 100}%` }} />
                        </div>
                        <span className="text-slate-300 w-6 text-right shrink-0">{h.patients}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Pilot sites */}
          <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-400" /> Active Pilot Sites
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(pilot.sites ?? []).map((site: string) => (
                <Badge key={site} variant="outline" className="text-xs border-slate-600 text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {site}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* EMS / FDNY */}
      {activeTab === "ems" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "24h Transports",    value: ems.last24hTransports },
              { label: "Auralyn Received",  value: ems.auralynReceived },
              { label: "Active Calls",      value: ems.activeCalls?.length ?? 0 },
            ].map(({ label, value }) => (
              <Card key={label} className="bg-slate-900 border-slate-800">
                <CardContent className="p-3">
                  <p className="text-2xl font-bold text-slate-100">{value ?? "—"}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {ems.diversionActive && (
            <div className="bg-red-950 border border-red-700 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-300 font-medium">DIVERSION ACTIVE — not accepting new transports</p>
            </div>
          )}

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Ambulance className="w-4 h-4 text-amber-400" /> Active FDNY Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(ems.activeCalls ?? []).map((call: any) => (
                <div key={call.callId} data-testid={`ems-call-${call.callId}`}
                  className="bg-slate-800 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-200">{call.callId}</p>
                    <Badge className="bg-amber-900 text-amber-200 text-xs">Priority {call.priority}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">{call.complaint} · {call.borough}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(call.dispatchedAt).toLocaleTimeString()}</span>
                    <span>·</span>
                    <span>ETA ~{call.eta} min</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-blue-400">{call.destinationClinic}</span>
                  </div>
                </div>
              ))}
              {(ems.activeCalls ?? []).length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">No active calls at this time</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* FDA Readiness */}
      {activeTab === "fda" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Readiness",     value: `${fdaData.readinessPct ?? 0}%`, color: (fdaData.readinessPct ?? 0) > 80 ? "text-emerald-400" : "text-amber-400" },
              { label: "Completed",     value: fdaData.summary?.complete,       color: "text-emerald-400" },
              { label: "In Progress",   value: fdaData.summary?.inProgress,     color: "text-amber-400" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="bg-slate-900 border-slate-800">
                <CardContent className="p-3">
                  <p className={`text-2xl font-bold ${color}`}>{value ?? "—"}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {fdaData.targetSubmissionDate && (
            <div className="bg-blue-950 border border-blue-700 rounded-lg p-3 flex items-center gap-3">
              <FileCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm text-blue-200 font-medium">{fdaData.regulatoryPathway}</p>
                <p className="text-xs text-blue-400">Target submission: {fdaData.targetSubmissionDate}</p>
              </div>
            </div>
          )}

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200">FDA 510(k) Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-1.5">
                  {(fdaData.checklist ?? []).map((item: any, i: number) => (
                    <div key={i} data-testid={`fda-item-${i}`}
                      className="flex items-start gap-2.5 py-2 border-b border-slate-800 last:border-0">
                      <StatusDot status={item.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200">{item.item}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{item.detail}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${
                        item.status === "complete"    ? "border-emerald-700 text-emerald-400" :
                        item.status === "in_progress" ? "border-amber-700 text-amber-400" :
                        "border-slate-700 text-slate-500"
                      }`}>{item.status.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deployments */}
      {activeTab === "deployments" && (
        <div className="space-y-3">
          {envs.map((env: any) => (
            <Card key={env.name} data-testid={`deploy-env-${env.name}`} className="bg-slate-900 border-slate-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${env.status === "healthy" ? "bg-emerald-500" : "bg-red-500"} animate-pulse`} />
                    <p className="text-sm font-semibold text-slate-200 uppercase tracking-wide">{env.name}</p>
                    <Badge variant="outline" className="text-xs border-slate-700 text-slate-400 font-mono">{env.version}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400 font-mono">{env.uptime}</span>
                    <Badge className={`text-xs ${env.status === "healthy" ? "bg-emerald-900 text-emerald-200" : "bg-red-900 text-red-200"}`}>
                      {env.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                  <Globe className="w-3 h-3" />{env.url}
                  <span>·</span><span>{env.region}</span>
                  <span>·</span><span>Last deploy {new Date(env.lastDeploy).toLocaleString()}</span>
                </div>
                {env.name !== "production" && (
                  <Button size="sm" variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                    data-testid={`button-promote-${env.name}`}
                    disabled={promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate({
                      fromEnv: env.name, toEnv: env.name === "dev" ? "staging" : "production", version: env.version,
                    })}>
                    Promote {env.name === "dev" ? "→ staging" : "→ production"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {deploys?.promotionPipeline && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-200">Promotion Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deploys.promotionPipeline.map((step: any) => (
                  <div key={`${step.from}-${step.to}`} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-800 last:border-0">
                    <span className="text-slate-400 font-mono">{step.from}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-slate-400 font-mono">{step.to}</span>
                    <span className="flex-1 text-slate-600 text-xs truncate">{step.gate}</span>
                    <Badge variant="outline" className={`text-xs shrink-0 ${
                      step.status === "auto" ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"
                    }`}>{step.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Compliance */}
      {activeTab === "compliance" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" /> HIPAA
                <span className="ml-auto text-emerald-400 font-bold">{comp.hipaa?.overall}%</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ["Access Control",      comp.hipaa?.accessControl],
                ["Audit Controls",      comp.hipaa?.auditControls],
                ["Integrity Controls",  comp.hipaa?.integrityControls],
                ["Transmission Sec.",   comp.hipaa?.transmissionSecurity],
                ["Breach Notification", comp.hipaa?.breachNotification],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 flex-1">{label as string}</span>
                  <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${val}%` }} />
                  </div>
                  <span className="text-emerald-400 font-mono w-8 text-right">{val}%</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs pt-1">
                <span className="text-slate-400">BAA Executed</span>
                <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />
              </div>
              <p className="text-xs text-slate-500">Next audit: {comp.hipaa?.nextAuditDate}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-400" /> FDA / SaMD
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ["Classification",          comp.fda?.samdClassification],
                ["Pathway",                 comp.fda?.regulatoryPathway],
                ["Clinical Validation",     `${comp.fda?.clinicalValidation}%`],
                ["Adverse Events",          comp.fda?.adverseEvents ?? 0],
                ["Predeterminate CC",       comp.fda?.predetermineChangeControl],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                  <span className="text-slate-400">{label as string}</span>
                  <span className="text-slate-200 font-medium">{val}</span>
                </div>
              ))}
              <p className="text-xs text-slate-500">{comp.fda?.isoCompliance}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Pen Test",       value: comp.security?.penetrationTest, highlight: comp.security?.penetrationTest === "passed" },
                { label: "Last Pen Test",  value: comp.security?.lastPenTest },
                { label: "Critical Vulns", value: comp.security?.criticalVulns,   highlight: comp.security?.criticalVulns === 0 },
                { label: "High Vulns",     value: comp.security?.highVulns,       highlight: comp.security?.highVulns === 0 },
                { label: "Medium Vulns",   value: comp.security?.mediumVulns },
                { label: "SOC 2 Type II",  value: comp.security?.soc2Type2 },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex items-center justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                  <span className="text-slate-400">{label}</span>
                  <span className={`font-medium ${highlight ? "text-emerald-400" : "text-slate-200"}`}>{String(value ?? "—")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
