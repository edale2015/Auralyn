import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity, Bed, Users, Heart, Bot, RefreshCw, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Stethoscope
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-200",
  medium:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  low:      "bg-blue-100 text-blue-800 border-blue-200",
  info:     "bg-gray-100 text-gray-700 border-gray-200",
};

const RISK_COLORS: Record<string, string> = {
  VERY_HIGH: "bg-red-100 text-red-700",
  HIGH:      "bg-orange-100 text-orange-700",
  MEDIUM:    "bg-yellow-100 text-yellow-700",
  LOW:       "bg-green-100 text-green-700",
};

function OccupancyBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 95 ? "bg-red-500" : pct >= 85 ? "bg-orange-400" : pct >= 70 ? "bg-yellow-400" : "bg-emerald-500";
  return (
    <div className="space-y-1" data-testid={`occupancy-${label}`}>
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded h-2">
        <div className={`h-full rounded transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function HospitalDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: status, isLoading: statusLoading } = useQuery<any>({ queryKey: ["/api/hospital/status"] });
  const { data: beds }                              = useQuery<any>({ queryKey: ["/api/hospital/beds/capacity"] });
  const { data: staffing }                          = useQuery<any>({ queryKey: ["/api/hospital/staffing"] });
  const { data: schedule }                          = useQuery<any>({ queryKey: ["/api/hospital/schedule"] });
  const { data: population }                        = useQuery<any>({ queryKey: ["/api/hospital/population"] });
  const { data: agentLog }                          = useQuery<any[]>({ queryKey: ["/api/hospital/agent/log"] });
  const { data: agentStats }                        = useQuery<any>({ queryKey: ["/api/hospital/agent/stats"] });

  const agentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hospital/agent/run"),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["/api/hospital"] });
      toast({ title: "Agent run complete", description: "Hospital intelligence scan finished." });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/hospital/agent/resolve/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["/api/hospital/agent/log"] }),
  });

  if (statusLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading hospital data…</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-primary" /> Autonomous Hospital Layer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time operational intelligence · NYC Urgent Care</p>
        </div>
        <Button
          data-testid="button-run-agent"
          onClick={() => agentMutation.mutate()}
          disabled={agentMutation.isPending}
          className="flex items-center gap-2"
        >
          <Bot className="h-4 w-4" />
          {agentMutation.isPending ? "Scanning…" : "Run Agent"}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Bed,          label: "Occupancy",      value: status?.capacity ? `${Math.round(status.capacity.occupancyRate * 100)}%` : "—",      sub: `${status?.capacity?.occupied ?? 0}/${status?.capacity?.total ?? 0} beds` },
          { icon: Users,        label: "Active Staff",   value: status?.staffing?.activeStaff ?? "—",   sub: `${status?.staffing?.deficit ?? 0} deficit` },
          { icon: Clock,        label: "Appts Today",    value: status?.scheduling?.total ?? "—",        sub: `${status?.scheduling?.urgentQueued ?? 0} urgent` },
          { icon: Heart,        label: "High-Risk Pts",  value: status?.population?.highRisk ?? "—",    sub: `of ${status?.population?.totalPatients ?? 0} total` },
        ].map(({ icon: Icon, label, value, sub }) => (
          <Card key={label} data-testid={`kpi-${label.replace(/\s/g, "-").toLowerCase()}`}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview"    data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="beds"        data-testid="tab-beds">Beds</TabsTrigger>
          <TabsTrigger value="staffing"    data-testid="tab-staffing">Staffing</TabsTrigger>
          <TabsTrigger value="population"  data-testid="tab-population">Population</TabsTrigger>
          <TabsTrigger value="agent"       data-testid="tab-agent">Agent</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bed Occupancy by Unit</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {beds?.byUnit?.map((r: any) => (
                  <OccupancyBar key={r.unit} label={r.unit} rate={r.occupancyRate} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Appointments</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {(schedule ?? []).filter((a: any) => a.status === "SCHEDULED").slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <div>
                      <span className="font-medium">{a.patientName}</span>
                      <span className="text-muted-foreground ml-1">· {a.type}</span>
                    </div>
                    <Badge variant="outline" className={`text-xs ${a.priority <= 2 ? "border-red-400 text-red-700" : ""}`} data-testid={`badge-priority-${a.id}`}>
                      P{a.priority}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Staffing alerts */}
          {staffing?.alerts?.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Staffing Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {staffing.alerts.map((a: any, i: number) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded border text-xs ${PRIORITY_COLORS[a.severity] ?? PRIORITY_COLORS.info}`} data-testid={`staffing-alert-${i}`}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{a.message}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Beds ── */}
        <TabsContent value="beds" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {beds?.byUnit?.map((r: any) => (
              <Card key={r.unit} data-testid={`bed-unit-${r.unit}`}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{r.unit}</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Occupied</span><span className="font-medium">{r.occupied}/{r.total}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-medium text-emerald-600">{r.available}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Critical</span><span className="font-medium text-red-600">{r.critical}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pred. discharge</span><span>{r.predictedDischarges}</span></div>
                  <Progress value={r.occupancyRate * 100} className="h-1.5 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Staffing ── */}
        <TabsContent value="staffing" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Shift Demand</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                {staffing?.demand?.map((d: any) => (
                  <div key={d.unit} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`demand-${d.unit}`}>
                    <span className="font-medium">{d.unit}</span>
                    <div className="flex gap-3 text-right">
                      <span className="text-muted-foreground">{d.currentStaff}/{d.requiredStaff} nurses</span>
                      {d.deficit > 0 && <Badge variant="outline" className="text-red-700 border-red-400 text-xs">-{d.deficit}</Badge>}
                      {d.deficit === 0 && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Active Staff Roster</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                {staffing?.demand && staffing.patientCounts && Object.entries(staffing.patientCounts).map(([unit, count]: any) => (
                  <div key={unit} className="flex justify-between py-0.5">
                    <span className="font-medium">{unit}</span>
                    <span className="text-muted-foreground">{count} patients</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Population Health ── */}
        <TabsContent value="population" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Risk Stratification</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {population?.byRiskTier && Object.entries(population.byRiskTier).map(([tier, count]: any) => (
                  <div key={tier} className="flex items-center justify-between" data-testid={`risk-tier-${tier}`}>
                    <Badge variant="outline" className={`${RISK_COLORS[tier]} text-xs`}>{tier}</Badge>
                    <div className="flex items-center gap-2">
                      <div className="w-28 bg-muted rounded h-2 overflow-hidden">
                        <div className="h-full bg-primary rounded" style={{ width: `${(count / population.totalPatients) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 text-xs text-muted-foreground">
                  Avg readmission risk: <span className="font-medium">{population?.avgReadmissionRisk ? `${(population.avgReadmissionRisk * 100).toFixed(1)}%` : "—"}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top Chronic Conditions</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                {population?.topConditions?.map((c: any) => (
                  <div key={c.condition} className="flex items-center justify-between" data-testid={`condition-${c.condition}`}>
                    <span className="font-medium">{c.condition}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded h-2 overflow-hidden">
                        <div className="h-full bg-blue-400 rounded" style={{ width: `${(c.count / population.totalPatients) * 100}%` }} />
                      </div>
                      <span className="text-muted-foreground w-4 text-right">{c.count}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 text-muted-foreground">
                  Preventive care gap: <span className="font-medium">{population?.preventiveCareGapRate ? `${(population.preventiveCareGapRate * 100).toFixed(0)}%` : "—"}</span> of patients
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Agent Log ── */}
        <TabsContent value="agent" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {agentStats?.totalRuns ?? 0} runs · {agentStats?.unresolvedCritical ?? 0} unresolved critical
            </div>
            <Button variant="outline" size="sm" data-testid="button-refresh-agent" onClick={() => qc.invalidateQueries({ queryKey: ["/api/hospital/agent/log"] })}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(agentLog ?? []).map((action: any) => (
              <div
                key={action.id}
                data-testid={`agent-action-${action.id}`}
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${PRIORITY_COLORS[action.priority] ?? PRIORITY_COLORS.info} ${action.resolved ? "opacity-50" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{action.type}</Badge>
                    {action.unit && <span className="text-xs text-muted-foreground">{action.unit}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(action.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs leading-snug">{action.message}</p>
                </div>
                {!action.resolved && (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`button-resolve-${action.id}`}
                    className="h-6 px-2 text-xs"
                    onClick={() => resolveMutation.mutate(action.id)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                  </Button>
                )}
              </div>
            ))}
            {(!agentLog || agentLog.length === 0) && (
              <div className="text-center text-muted-foreground text-sm py-8">
                No actions yet — click "Run Agent" to start monitoring
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
