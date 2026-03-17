import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Building, CreditCard, Stethoscope, BarChart3, CheckCircle, Clock,
  AlertTriangle, DollarSign, Users, TrendingUp, Send, Shield, Brain,
  Activity, Layers,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function OverviewTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/auralyn/overview"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading platform overview...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Building className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-3xl font-bold" data-testid="text-total-tenants">{data?.tenants?.totalTenants || 0}</div>
            <div className="text-xs text-muted-foreground">Total Clinics</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <div className="text-3xl font-bold text-green-600" data-testid="text-mrr">${data?.revenue?.mrr || 0}</div>
            <div className="text-xs text-muted-foreground">MRR</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <div className="text-3xl font-bold text-blue-600" data-testid="text-arr">${(data?.revenue?.arr || 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">ARR</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <div className="text-3xl font-bold">{data?.tenants?.totalCases || 0}</div>
            <div className="text-xs text-muted-foreground">Total Cases</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Tenant Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data?.tenants?.byPlan || {}).map(([plan, count]: [string, any]) => (
                <div key={plan} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <Badge variant={plan === "enterprise" ? "default" : "secondary"} className="capitalize">{plan}</Badge>
                  <span className="text-sm font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Platform Capabilities</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="capability-list">
              {data?.capabilities?.map((c: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  <CheckCircle className="h-2 w-2 mr-1 text-green-500" />{c}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Deployment Status</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span>Phase: <strong>{data?.deployment?.phase}</strong></span>
            <span>Hosting: <strong>{data?.deployment?.hosting}</strong></span>
            <span>Status: <Badge variant="default" className="text-xs" data-testid="text-deploy-status">{data?.deployment?.status}</Badge></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TenantsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/auralyn/tenants"] });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auralyn/tenants", { name, email, plan: "basic" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auralyn/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auralyn/overview"] });
      setShowForm(false);
      setName("");
      setEmail("");
    },
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading tenants...</div>;

  const planColor: Record<string, string> = {
    basic: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    pro: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    enterprise: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{data?.tenants?.length || 0} Clinics Registered</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-tenant">
          <Building className="h-3 w-3 mr-1" /> Add Clinic
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Input placeholder="Clinic Name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-tenant-name" />
            <Input placeholder="Contact Email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-tenant-email" />
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name || !email} data-testid="button-create-tenant">
              Create Clinic
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3" data-testid="tenant-list">
        {data?.tenants?.map((t: any, i: number) => (
          <Card key={t.id} data-testid={`tenant-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm">{t.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.contactEmail}</span>
                </div>
                <div className="flex gap-2">
                  <Badge className={planColor[t.plan] || ""}>{t.plan.toUpperCase()}</Badge>
                  <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Cases: {t.casesUsed}/{t.maxCases}</span>
                <span>Features: {t.features?.length || 0}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, (t.casesUsed / t.maxCases) * 100)}%` }}></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BillingTab() {
  const { data: summary, isLoading: loadingSummary } = useQuery<any>({ queryKey: ["/api/auralyn/billing/summary"] });
  const { data: plansData, isLoading: loadingPlans } = useQuery<any>({ queryKey: ["/api/auralyn/billing/plans"] });
  const { data: invoicesData } = useQuery<any>({ queryKey: ["/api/auralyn/billing/invoices"] });

  if (loadingSummary || loadingPlans) return <div className="text-center py-12 text-muted-foreground">Loading billing...</div>;

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600" data-testid="text-billing-mrr">${summary?.mrr || 0}</div>
            <div className="text-xs text-muted-foreground">Monthly Revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{summary?.activeSubscriptions || 0}</div>
            <div className="text-xs text-muted-foreground">Active Subscriptions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600">${summary?.revenue || 0}</div>
            <div className="text-xs text-muted-foreground">Total Collected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{summary?.pendingInvoices || 0}</div>
            <div className="text-xs text-muted-foreground">Pending Invoices</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Pricing Plans</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4" data-testid="pricing-plans">
            {plansData?.map((plan: any, i: number) => (
              <div key={i} className="border rounded-lg p-4 space-y-3" data-testid={`plan-${plan.name.toLowerCase()}`}>
                <div className="text-center">
                  <h4 className="font-bold text-lg">{plan.name}</h4>
                  <div className="text-2xl font-bold text-primary">${plan.price}<span className="text-xs text-muted-foreground">/mo</span></div>
                  <div className="text-xs text-muted-foreground">{plan.maxCases.toLocaleString()} cases/mo</div>
                </div>
                <div className="space-y-1">
                  {plan.features.map((f: string, j: number) => (
                    <div key={j} className="text-xs flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Invoices</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="invoice-list">
            {invoicesData?.invoices?.map((inv: any, i: number) => (
              <div key={inv.id || i} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{inv.description}</span>
                <span className="text-sm font-mono font-bold">${inv.amount}</span>
                <Badge className={`text-xs ${statusColor[inv.status] || ""}`}>{inv.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ClinicalAssistantTab() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<any>(null);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auralyn/clinical/run", { text: input });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Stethoscope className="h-4 w-4" /> Clinical Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter patient symptoms... (e.g. 'sore throat, fever for 3 days, difficulty swallowing')"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            data-testid="input-symptoms"
          />
          <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending || !input.trim()} className="w-full" data-testid="button-run-clinical">
            <Send className="h-4 w-4 mr-2" /> {runMutation.isPending ? "Analyzing..." : "Run Clinical Brain"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="border-primary/30">
              <CardContent className="pt-4 text-center">
                <Brain className="h-5 w-5 mx-auto text-primary mb-1" />
                <div className="text-lg font-bold" data-testid="text-diagnosis">{result.decision?.diagnosis || "N/A"}</div>
                <div className="text-xs text-muted-foreground">Primary Diagnosis</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <Shield className="h-5 w-5 mx-auto mb-1" />
                <div className="text-lg font-bold" data-testid="text-disposition">{result.decision?.disposition || "N/A"}</div>
                <div className="text-xs text-muted-foreground">Disposition</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <BarChart3 className="h-5 w-5 mx-auto mb-1" />
                <div className="text-lg font-bold" data-testid="text-confidence">
                  {result.decision?.confidence ? `${(result.decision.confidence * 100).toFixed(0)}%` : "N/A"}
                </div>
                <div className="text-xs text-muted-foreground">Confidence</div>
              </CardContent>
            </Card>
          </div>

          {result.safety?.alerts?.length > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader><CardTitle className="text-sm text-red-600">Safety Alerts</CardTitle></CardHeader>
              <CardContent>
                {result.safety.alerts.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle className="h-3 w-3" />{a.rule} — {a.action}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.diagnoses?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Differential Diagnosis</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2" data-testid="differential-list">
                  {result.diagnoses.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <span className="text-sm font-medium">{d.diagnosis}</span>
                      <Badge variant="outline">{(d.probability * 100).toFixed(1)}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.trace?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Execution Trace</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1" data-testid="trace-list">
                  {result.trace.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <Badge variant="outline" className="font-mono w-24 text-center">{t.layer}</Badge>
                      <div className="flex-1 h-1.5 bg-muted rounded-full">
                        <div className="h-1.5 bg-primary rounded-full" style={{ width: `${Math.min(100, (t.durationMs / (result.totalDurationMs || 1)) * 100 * result.trace.length)}%` }}></div>
                      </div>
                      <span className="font-mono text-muted-foreground w-12 text-right">{t.durationMs}ms</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-2 text-right">
                  Total: {result.totalDurationMs}ms
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuralynDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-auralyn-title">Auralyn Clinical Intelligence Platform</h1>
        <p className="text-sm text-muted-foreground mt-1">
          SaaS management — tenants, billing, clinical assistant, and platform overview
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-1" /> Overview
          </TabsTrigger>
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Building className="h-4 w-4 mr-1" /> Clinics
          </TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing">
            <CreditCard className="h-4 w-4 mr-1" /> Billing
          </TabsTrigger>
          <TabsTrigger value="clinical" data-testid="tab-clinical">
            <Stethoscope className="h-4 w-4 mr-1" /> Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="tenants"><TenantsTab /></TabsContent>
        <TabsContent value="billing"><BillingTab /></TabsContent>
        <TabsContent value="clinical"><ClinicalAssistantTab /></TabsContent>
      </Tabs>
    </div>
  );
}
