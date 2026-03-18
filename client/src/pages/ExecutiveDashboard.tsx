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
  Save, Bookmark, Database, Award, Eye, Trash2,
  FileText, Stethoscope, CheckSquare, Clock, User,
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

function SavedViewsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [viewName, setViewName] = useState("");
  const [viewFilters, setViewFilters] = useState({ clinicId: "clinicA", startDate: "", endDate: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-ops/saved-views"],
  });
  const views = Array.isArray(data) ? data : [];

  const saveMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/executive-ops/saved-views", {
      name: viewName,
      viewType: "executive",
      filters: {
        clinicId: viewFilters.clinicId || undefined,
        startDate: viewFilters.startDate || undefined,
        endDate: viewFilters.endDate || undefined,
      },
    }),
    onSuccess: () => {
      toast({ title: "View saved" });
      setViewName("");
      qc.invalidateQueries({ queryKey: ["/api/executive-ops/saved-views"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/executive-ops/saved-views/${id}`),
    onSuccess: () => {
      toast({ title: "View deleted" });
      qc.invalidateQueries({ queryKey: ["/api/executive-ops/saved-views"] });
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Bookmark className="h-5 w-5" /> Saved Dashboard Views</h3>
      <Card>
        <CardHeader><CardTitle className="text-sm">Save Current View</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input data-testid="input-view-name" value={viewName} onChange={e => setViewName(e.target.value)} placeholder="View name" />
            <Input data-testid="input-view-clinic" value={viewFilters.clinicId} onChange={e => setViewFilters(p => ({ ...p, clinicId: e.target.value }))} placeholder="Clinic ID" />
            <Input data-testid="input-view-start" type="date" value={viewFilters.startDate} onChange={e => setViewFilters(p => ({ ...p, startDate: e.target.value }))} />
            <Input data-testid="input-view-end" type="date" value={viewFilters.endDate} onChange={e => setViewFilters(p => ({ ...p, endDate: e.target.value }))} />
          </div>
          <Button data-testid="button-save-view" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !viewName} className="w-full">
            <Save className="h-4 w-4 mr-2" /> Save View
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {views.map((v: any, i: number) => (
          <Card key={v.id} data-testid={`saved-view-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">{v.name}</span>
                    <Badge variant="outline">{v.viewType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {v.filters && typeof v.filters === "object" ? Object.entries(v.filters).filter(([,val]) => val).map(([k, val]) => `${k}: ${val}`).join(" | ") : "No filters"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(v.id)} data-testid={`button-delete-view-${i}`}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {views.length === 0 && <p className="text-muted-foreground">No saved views yet.</p>}
      </div>
    </div>
  );
}

function AlertWorkflowPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-ops/alerts-workflow"],
  });
  const alerts = Array.isArray(data) ? data : [];

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/executive-ops/alerts-workflow/seed"),
    onSuccess: () => {
      toast({ title: "Workflow alerts seeded" });
      qc.invalidateQueries({ queryKey: ["/api/executive-ops/alerts-workflow"] });
    },
  });

  const ackMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/executive-ops/alerts-workflow/${id}/acknowledge`),
    onSuccess: () => {
      toast({ title: "Alert acknowledged" });
      qc.invalidateQueries({ queryKey: ["/api/executive-ops/alerts-workflow"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const unackCount = alerts.filter((a: any) => !a.acknowledged).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><CheckSquare className="h-5 w-5" /> Alert Workflow ({unackCount} unacknowledged)</h3>
        <Button variant="outline" size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending} data-testid="button-seed-workflow-alerts">
          <Microscope className="h-4 w-4 mr-2" /> Seed
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.map((alert: any, i: number) => (
          <Card key={alert.id} className={`border-l-4 ${alert.acknowledged ? "border-l-gray-300 opacity-60" : alert.severity === "critical" ? "border-l-red-500" : "border-l-yellow-500"}`} data-testid={`workflow-alert-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={alert.severity === "critical" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>{alert.severity}</Badge>
                    <Badge variant="outline">{alert.type}</Badge>
                    <span className="font-medium">{alert.entityId}</span>
                    {alert.acknowledged && <Badge className="bg-green-100 text-green-800">Acknowledged</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.acknowledged && (
                    <p className="text-xs text-muted-foreground mt-1">
                      By: {alert.acknowledgedBy} at {new Date(alert.acknowledgedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(alert.createdAt).toLocaleDateString()}</span>
                  {!alert.acknowledged && (
                    <Button variant="outline" size="sm" onClick={() => ackMut.mutate(alert.id)} data-testid={`button-ack-alert-${i}`}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Ack
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && <p className="text-muted-foreground">No workflow alerts. Seed demo data to populate.</p>}
      </div>
    </div>
  );
}

function WarehouseExportPanel() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-ops/warehouse-export"],
  });
  const bundle = data as any;

  const downloadCsv = async () => {
    try {
      const token = localStorage.getItem("app_auth_token");
      const res = await fetch("/api/executive-ops/warehouse-export/csv", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "warehouse-facts.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Warehouse CSV downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Database className="h-5 w-5" /> Warehouse-Ready Analytics</h3>
      <p className="text-sm text-muted-foreground">Star-schema export for BI tools (Snowflake, BigQuery, Redshift, or CSV)</p>

      <Button data-testid="button-warehouse-csv" onClick={downloadCsv} className="w-full">
        <Download className="h-4 w-4 mr-2" /> Download Facts CSV
      </Button>

      {bundle && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Fact Cases ({bundle.facts_cases?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(bundle.facts_cases || []).map((c: any, i: number) => (
                <div key={i} className="text-xs border rounded p-2" data-testid={`fact-case-${i}`}>
                  <div className="font-medium">{c.caseId} — {c.complaint}</div>
                  <div className="text-muted-foreground">Risk: {c.riskLevel} | Conf: {(c.confidence * 100).toFixed(0)}% | {c.physicianId}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Dim Clinics ({bundle.dim_clinics?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(bundle.dim_clinics || []).map((c: any, i: number) => (
                <div key={i} className="text-xs border rounded p-2" data-testid={`dim-clinic-${i}`}>
                  <div className="font-medium">{c.clinicId}</div>
                  <div className="text-muted-foreground">{c.clinicName}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Dim Physicians ({bundle.dim_physicians?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(bundle.dim_physicians || []).map((p: any, i: number) => (
                <div key={i} className="text-xs border rounded p-2" data-testid={`dim-physician-${i}`}>
                  <div className="font-medium">{p.physicianId}</div>
                  <div className="text-muted-foreground">{p.physicianName} — {p.clinicId}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function BenchmarksPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-ops/benchmarks/demo"],
  });
  const rows = Array.isArray(data) ? data : [];

  const BAND_COLORS: Record<string, string> = {
    top: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    middle: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    needs_attention: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Award className="h-5 w-5" /> Benchmarks by Clinic Type and Complaint</h3>

      <div className="space-y-3">
        {rows.map((row: any, i: number) => (
          <Card key={i} className={`border-l-4 ${row.band === "top" ? "border-l-green-500" : row.band === "needs_attention" ? "border-l-red-500" : "border-l-blue-500"}`} data-testid={`benchmark-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.clinicType?.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-medium">{row.complaint?.replace(/_/g, " ")}</span>
                    <Badge className={BAND_COLORS[row.band] || BAND_COLORS.middle}>{row.band?.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4">
                    <span>Accuracy: {row.accuracyPct}%</span>
                    <span>Override: {row.overrideRatePct}%</span>
                    <span>Escalation: {row.escalationRatePct}%</span>
                    <span>Satisfaction: {row.avgSatisfaction}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PhysicianCasesPanel() {
  const [physicianId, setPhysicianId] = useState("dr-johnson");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/executive-ops/physician-cases", physicianId],
    queryFn: async () => {
      const res = await fetch(`/api/executive-ops/physician-cases/${physicianId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      });
      return res.json();
    },
  });
  const cases = Array.isArray(data) ? data : [];

  const RISK_COLORS: Record<string, string> = {
    LOW: "bg-green-100 text-green-800",
    MODERATE: "bg-yellow-100 text-yellow-800",
    HIGH: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Stethoscope className="h-5 w-5" /> Physician Case Drilldown</h3>
      <div className="flex items-center gap-3">
        <Input data-testid="input-physician-cases-id" value={physicianId} onChange={e => setPhysicianId(e.target.value)} placeholder="Physician ID" className="w-48" />
        <Button variant="outline" onClick={() => refetch()} data-testid="button-load-cases">
          <Eye className="h-4 w-4 mr-2" /> Load Cases
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {cases.map((c: any, i: number) => (
            <Card key={i} className={`border-l-4 ${c.riskLevel === "HIGH" ? "border-l-red-500" : c.riskLevel === "MODERATE" ? "border-l-yellow-500" : "border-l-green-500"}`} data-testid={`physician-case-${i}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.patientName}</span>
                      <Badge className={RISK_COLORS[c.riskLevel] || ""}>{c.riskLevel}</Badge>
                      <Badge variant="outline">{c.caseId}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span>Complaint: {c.complaint}</span>
                      <span className="ml-4">Confidence: {(c.confidence * 100).toFixed(0)}%</span>
                      <span className="ml-4">Decision: {c.finalDecision}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {cases.length === 0 && <p className="text-muted-foreground">No cases found.</p>}
        </div>
      )}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const seedMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/executive-db/seed");
      await apiRequest("POST", "/api/executive-ops/alerts-workflow/seed");
    },
    onSuccess: () => {
      toast({ title: "Demo data seeded", description: "Snapshots, alerts, and workflow alerts created" });
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
          <p className="text-muted-foreground mt-1">Board-Level Analytics, Drilldowns, Alerts, Benchmarks, and Cross-Clinic Insights</p>
        </div>
        <Button data-testid="button-seed-executive" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
          {seedMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Seeding...</> : <><Microscope className="h-4 w-4 mr-2" /> Seed Demo Data</>}
        </Button>
      </div>

      <Tabs defaultValue="trends">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="complaints" data-testid="tab-complaints">Complaints</TabsTrigger>
          <TabsTrigger value="physicians" data-testid="tab-physicians">Physicians</TabsTrigger>
          <TabsTrigger value="cross-clinic" data-testid="tab-cross-clinic">Cross-Clinic</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts</TabsTrigger>
          <TabsTrigger value="alert-workflow" data-testid="tab-alert-workflow">Alert Workflow</TabsTrigger>
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="physician-cases" data-testid="tab-physician-cases">Cases</TabsTrigger>
          <TabsTrigger value="saved-views" data-testid="tab-saved-views">Saved Views</TabsTrigger>
          <TabsTrigger value="warehouse" data-testid="tab-warehouse">Warehouse</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email">Email Preview</TabsTrigger>
          <TabsTrigger value="export" data-testid="tab-export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="trends"><TrendsPanel /></TabsContent>
        <TabsContent value="complaints"><ComplaintDrilldownPanel /></TabsContent>
        <TabsContent value="physicians"><PhysicianDrilldownPanel /></TabsContent>
        <TabsContent value="cross-clinic"><CrossClinicPanel /></TabsContent>
        <TabsContent value="alerts"><AlertCenterPanel /></TabsContent>
        <TabsContent value="alert-workflow"><AlertWorkflowPanel /></TabsContent>
        <TabsContent value="benchmarks"><BenchmarksPanel /></TabsContent>
        <TabsContent value="physician-cases"><PhysicianCasesPanel /></TabsContent>
        <TabsContent value="saved-views"><SavedViewsPanel /></TabsContent>
        <TabsContent value="warehouse"><WarehouseExportPanel /></TabsContent>
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
