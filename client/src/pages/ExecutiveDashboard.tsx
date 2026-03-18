import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  BarChart3, TrendingUp, Shield, AlertTriangle, Users,
  Building2, RefreshCw, Microscope, Mail, Download,
  Bell, Activity, Target, CheckCircle, XCircle,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  good: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  watch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function StatCard({ icon: Icon, label, value, sub, color = "blue" }: any) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300",
    green: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-300",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-300",
    red: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-300",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendsPanel() {
  const [clinicId, setClinicId] = useState("clinicA");
  const { data: charts, isLoading } = useQuery({
    queryKey: ["/api/executive-db/charts", clinicId],
    queryFn: async () => {
      const res = await fetch(`/api/executive-db/charts/${clinicId}?limit=30`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      });
      return res.json();
    },
  });

  const chartData = Array.isArray(charts) ? charts : [];

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Clinic:</label>
        <Input data-testid="input-clinic-id" value={clinicId} onChange={e => setClinicId(e.target.value)} className="w-40" placeholder="clinicA" />
      </div>

      {chartData.length === 0 ? (
        <p className="text-muted-foreground">No snapshot data. Seed demo data first.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={BarChart3} label="Latest Cases" value={chartData[chartData.length - 1]?.totalCases ?? 0} color="blue" />
            <StatCard icon={Shield} label="Override Rate" value={`${chartData[chartData.length - 1]?.overrideRatePct ?? 0}%`} color="orange" />
            <StatCard icon={Target} label="Satisfaction" value={chartData[chartData.length - 1]?.avgSatisfaction ?? 0} color="green" />
            <StatCard icon={TrendingUp} label="Margin" value={`${chartData[chartData.length - 1]?.marginPct ?? 0}%`} color="purple" />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Throughput Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="totalCases" stroke="#3b82f6" name="Total Cases" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Override Rate Trend</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="overrideRatePct" stroke="#f59e0b" name="Override %" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Margin Trend</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="marginPct" fill="#8b5cf6" name="Margin %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Satisfaction Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[3.5, 5]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avgSatisfaction" stroke="#10b981" name="Satisfaction" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ComplaintDrilldownPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-db/drilldown/complaints/demo"],
  });
  const rows = Array.isArray(data) ? data : [];

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Complaint Drilldown</h3>
      <div className="space-y-3">
        {rows.map((row: any, i: number) => (
          <Card key={i} className={`border-l-4 ${row.status === "critical" ? "border-l-red-500" : row.status === "watch" ? "border-l-yellow-500" : "border-l-green-500"}`} data-testid={`complaint-drill-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.complaint?.replace(/_/g, " ")}</span>
                    <Badge className={STATUS_COLORS[row.status]}>{row.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4">
                    <span>Cases: {row.totalCases}</span>
                    <span>Escalation: {(row.escalationRate * 100).toFixed(1)}%</span>
                    <span>Override: {(row.overrideRate * 100).toFixed(1)}%</span>
                    <span>Satisfaction: {row.avgSatisfaction}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">{(row.avgConfidence * 100).toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Confidence</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PhysicianDrilldownPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-db/drilldown/physicians/demo"],
  });
  const rows = Array.isArray(data) ? data : [];

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Physician Performance</h3>
      <div className="space-y-3">
        {rows.map((row: any, i: number) => (
          <Card key={i} className={`border-l-4 ${row.status === "critical" ? "border-l-red-500" : row.status === "watch" ? "border-l-yellow-500" : "border-l-green-500"}`} data-testid={`physician-drill-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.physicianId}</span>
                    <Badge className={STATUS_COLORS[row.status]}>{row.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4">
                    <span>Cases: {row.totalCases}</span>
                    <span>Avg Review: {row.avgReviewSeconds}s</span>
                    <span>Override: {(row.overrideRate * 100).toFixed(1)}%</span>
                    <span>High Risk: {row.highRiskCases}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">{row.avgSatisfaction}</p>
                  <p className="text-xs text-muted-foreground">Satisfaction</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CrossClinicPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-db/cross-clinic/demo"],
  });
  const rows = Array.isArray(data) ? data : [];

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Cross-Clinic Comparison</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((row: any, i: number) => (
          <Card key={i} className={`border-l-4 ${row.status === "critical" ? "border-l-red-500" : row.status === "watch" ? "border-l-yellow-500" : "border-l-green-500"}`} data-testid={`clinic-compare-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-semibold">{row.clinicId}</span>
                <Badge className={STATUS_COLORS[row.status]}>{row.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Total Cases:</span> <span className="font-medium">{row.totalCases}</span></div>
                <div><span className="text-muted-foreground">Override:</span> <span className="font-medium">{(row.overrideRate * 100).toFixed(1)}%</span></div>
                <div><span className="text-muted-foreground">Satisfaction:</span> <span className="font-medium">{row.avgSatisfaction}</span></div>
                <div><span className="text-muted-foreground">Margin:</span> <span className="font-medium">{row.marginPct}%</span></div>
                <div><span className="text-muted-foreground">Escalation:</span> <span className="font-medium">{(row.escalationRate * 100).toFixed(1)}%</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AlertCenterPanel() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["/api/executive-db/alerts"] });
  const alerts = Array.isArray(data) ? data : [];

  const [newAlert, setNewAlert] = useState({ type: "clinic", entityId: "", severity: "watch", message: "" });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/executive-db/alerts", newAlert),
    onSuccess: () => {
      toast({ title: "Alert created" });
      setNewAlert({ type: "clinic", entityId: "", severity: "watch", message: "" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-5 w-5" /> Alert Center ({alerts.length})</h3>

      <Card>
        <CardHeader><CardTitle className="text-sm">Create Alert</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select data-testid="select-alert-type" className="border rounded px-3 py-2 text-sm" value={newAlert.type} onChange={e => setNewAlert(p => ({ ...p, type: e.target.value }))}>
              <option value="complaint">Complaint</option>
              <option value="physician">Physician</option>
              <option value="clinic">Clinic</option>
            </select>
            <Input data-testid="input-alert-entity" value={newAlert.entityId} onChange={e => setNewAlert(p => ({ ...p, entityId: e.target.value }))} placeholder="Entity ID" />
            <select data-testid="select-alert-severity" className="border rounded px-3 py-2 text-sm" value={newAlert.severity} onChange={e => setNewAlert(p => ({ ...p, severity: e.target.value }))}>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
            </select>
            <Input data-testid="input-alert-message" value={newAlert.message} onChange={e => setNewAlert(p => ({ ...p, message: e.target.value }))} placeholder="Alert message" />
          </div>
          <Button data-testid="button-create-alert" onClick={() => createMut.mutate()} disabled={createMut.isPending || !newAlert.entityId || !newAlert.message} className="w-full">
            <Bell className="h-4 w-4 mr-2" /> Create Alert
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {alerts.map((alert: any, i: number) => (
          <Card key={i} className={`border-l-4 ${alert.severity === "critical" ? "border-l-red-500" : "border-l-yellow-500"}`} data-testid={`alert-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={alert.severity === "critical" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>{alert.severity}</Badge>
                    <Badge variant="outline">{alert.type}</Badge>
                    <span className="font-medium">{alert.entityId}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(alert.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && <p className="text-muted-foreground">No alerts. Seed demo data to populate.</p>}
      </div>
    </div>
  );
}

function EmailPreviewPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/executive-db/email/demo"] });
  const email = data as any;

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-5 w-5" /> Weekly Executive Email Preview</h3>
      {email ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div><span className="text-sm font-medium text-muted-foreground">To:</span> <span className="ml-2" data-testid="text-email-to">{email.to}</span></div>
            <div><span className="text-sm font-medium text-muted-foreground">Subject:</span> <span className="ml-2 font-semibold" data-testid="text-email-subject">{email.subject}</span></div>
            <div className="border-t pt-3">
              <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 rounded p-4" data-testid="text-email-body">{email.body}</pre>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">No email preview available.</p>
      )}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/executive-db/seed"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Demo data seeded", description: `${data.snapshotCount ?? 0} snapshots, ${data.alertCount ?? 0} alerts` });
      qc.invalidateQueries();
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-executive-title">
            <Building2 className="h-8 w-8 text-blue-500" />
            Executive Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Board-Level Analytics, Drilldowns, Alerts, and Cross-Clinic Insights</p>
        </div>
        <Button data-testid="button-seed-executive" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
          {seedMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Seeding...</> : <><Microscope className="h-4 w-4 mr-2" /> Seed Demo Data</>}
        </Button>
      </div>

      <Tabs defaultValue="trends">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="complaints" data-testid="tab-complaints">Complaints</TabsTrigger>
          <TabsTrigger value="physicians" data-testid="tab-physicians">Physicians</TabsTrigger>
          <TabsTrigger value="cross-clinic" data-testid="tab-cross-clinic">Cross-Clinic</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email">Email Preview</TabsTrigger>
          <TabsTrigger value="export" data-testid="tab-export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="trends"><TrendsPanel /></TabsContent>
        <TabsContent value="complaints"><ComplaintDrilldownPanel /></TabsContent>
        <TabsContent value="physicians"><PhysicianDrilldownPanel /></TabsContent>
        <TabsContent value="cross-clinic"><CrossClinicPanel /></TabsContent>
        <TabsContent value="alerts"><AlertCenterPanel /></TabsContent>
        <TabsContent value="email"><EmailPreviewPanel /></TabsContent>
        <TabsContent value="export"><ExportPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function ExportPanel() {
  const { toast } = useToast();

  const exportCsv = async () => {
    try {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch("/api/executive-db/export/csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rows: [
            { clinicId: "clinicA", totalCases: 3200, overrideRate: 0.11, avgSatisfaction: 4.56, marginPct: 41.2 },
            { clinicId: "clinicB", totalCases: 2100, overrideRate: 0.07, avgSatisfaction: 4.68, marginPct: 46.5 },
            { clinicId: "clinicC", totalCases: 1400, overrideRate: 0.18, avgSatisfaction: 4.02, marginPct: 22.4 },
          ],
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "executive-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV downloaded" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Download className="h-5 w-5" /> Data Export</h3>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">Export executive data as CSV for offline analysis, board presentations, or integration with other tools.</p>
          <Button data-testid="button-export-csv" onClick={exportCsv} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Download CSV Export
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
