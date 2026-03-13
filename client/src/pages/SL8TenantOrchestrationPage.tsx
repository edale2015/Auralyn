import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Activity, Cpu, ToggleLeft, ToggleRight, Trash2, Plus } from "lucide-react";

const PLANS = ["starter", "professional", "enterprise"];
const STATUSES = ["trial", "active", "suspended", "offboarding"];
const ALL_COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];
const ALL_CHANNELS = ["whatsapp", "sms", "telegram", "web"];

const planColors: Record<string, string> = {
  starter: "bg-slate-100 text-slate-700",
  professional: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
  offboarding: "bg-orange-100 text-orange-700",
};

const EMPTY_FORM = { siteId: "", name: "", plan: "starter", adminEmail: "", region: "us-east-1", status: "trial" };

export default function SL8TenantOrchestrationPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["/api/sl8/tenants"] });
  const tenants: any[] = data?.tenants ?? [];
  const summary: any = data?.summary ?? {};

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/sl8/tenants", body),
    onSuccess: async (res: any) => {
      const t = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/sl8/tenants"] });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      toast({ title: `Tenant "${t.name}" created` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => apiRequest("PATCH", `/api/sl8/tenants/${id}`, patch),
    onSuccess: async (res: any) => {
      const updated = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/sl8/tenants"] });
      setSelectedTenant(updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sl8/tenants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sl8/tenants"] });
      setSelectedTenant(null);
      toast({ title: "Tenant deleted" });
    },
  });

  function toggleFeature(tenant: any, feature: string) {
    const features: string[] = tenant.config.features ?? [];
    const updated = features.includes(feature) ? features.filter((f: string) => f !== feature) : [...features, feature];
    patchMutation.mutate({ id: tenant.id, patch: { config: { ...tenant.config, features: updated } } });
  }

  function toggleComplaint(tenant: any, complaint: string) {
    const complaints: string[] = tenant.config.allowedComplaints ?? [];
    const updated = complaints.includes(complaint) ? complaints.filter((c: string) => c !== complaint) : [...complaints, complaint];
    patchMutation.mutate({ id: tenant.id, patch: { config: { ...tenant.config, allowedComplaints: updated } } });
  }

  const allFeatures: string[] = summary.allFeatures ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skill Layer 8 — Multi-Tenant Orchestration</h1>
          <p className="text-slate-500 text-sm mt-1">Manage tenant provisioning, feature flags, and per-site configuration</p>
        </div>
        <Button data-testid="button-new-tenant" onClick={() => setShowCreate(v => !v)}>
          <Plus className="h-4 w-4 mr-1" /> {showCreate ? "Cancel" : "New Tenant"}
        </Button>
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Tenants", value: summary.total, icon: Building2, color: "bg-slate-50" },
            { label: "Active", value: summary.active, icon: Activity, color: "bg-green-50" },
            { label: "Trial", value: summary.trial, icon: Cpu, color: "bg-yellow-50" },
            { label: "Enterprise", value: summary.byPlan?.enterprise ?? 0, icon: Users, color: "bg-purple-50" },
            { label: "Cases This Month", value: summary.totalCasesThisMonth?.toLocaleString(), icon: Activity, color: "bg-blue-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-3 border flex items-center gap-2`}>
              <s.icon className="h-5 w-5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-lg font-bold text-slate-800" data-testid={`stat-tenant-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">New Tenant</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Site ID</label>
              <Input data-testid="input-site-id" value={form.siteId} onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))} placeholder="site_clinic_a" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Clinic Name</label>
              <Input data-testid="input-tenant-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Westside Family Clinic" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Admin Email</label>
              <Input data-testid="input-admin-email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@clinic.com" type="email" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Plan</label>
              <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
                <SelectTrigger data-testid="select-tenant-plan"><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Initial Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-tenant-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Region</label>
              <Select value={form.region} onValueChange={v => setForm(f => ({ ...f, region: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["us-east-1", "us-west-2", "us-central-1", "eu-west-1", "ap-southeast-1"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button data-testid="button-create-tenant" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.siteId || !form.name || !form.adminEmail}>
            {createMutation.isPending ? "Creating…" : "Create Tenant"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tenant list */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="font-semibold text-slate-700 text-sm px-1">Tenants ({tenants.length})</h2>
          {isLoading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
          ) : (
            tenants.map((t: any) => (
              <button key={t.id} data-testid={`card-tenant-${t.id}`} onClick={() => setSelectedTenant(t)} className={`w-full text-left rounded-xl border p-4 transition-all hover:shadow-md ${selectedTenant?.id === t.id ? "border-blue-500 bg-blue-50" : "bg-white hover:bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.siteId} · {t.region}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge className={`text-xs border-0 ${planColors[t.plan]}`}>{t.plan}</Badge>
                    <Badge className={`text-xs border-0 ${statusColors[t.status]}`}>{t.status}</Badge>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {t.casesThisMonth.toLocaleString()} cases this month · {t.config.features?.length ?? 0} features
                </div>
              </button>
            ))
          )}
        </div>

        {/* Tenant detail panel */}
        <div className="lg:col-span-2">
          {!selectedTenant ? (
            <div className="rounded-2xl border bg-white p-10 text-center text-slate-400 text-sm shadow-sm">
              Select a tenant to configure features and settings
            </div>
          ) : (
            <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{selectedTenant.name}</div>
                  <div className="text-xs text-slate-500">{selectedTenant.siteId} · {selectedTenant.adminEmail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedTenant.status} onValueChange={v => patchMutation.mutate({ id: selectedTenant.id, patch: { status: v } })}>
                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <button data-testid={`button-delete-tenant-${selectedTenant.id}`} onClick={() => deleteMutation.mutate(selectedTenant.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Limits */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Max Cases/Mo", value: selectedTenant.config.maxCasesPerMonth },
                    { label: "Max Physicians", value: selectedTenant.config.maxPhysicians },
                    { label: "Retention (days)", value: selectedTenant.config.retentionDays },
                    { label: "Max Cost/Case", value: `$${selectedTenant.config.maxCostPerCase}` },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 border">
                      <div className="font-bold text-slate-700">{s.value}</div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Feature toggles */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Feature Flags</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {allFeatures.map((feature: string) => {
                      const enabled = selectedTenant.config.features?.includes(feature);
                      return (
                        <button key={feature} data-testid={`toggle-feature-${feature}`} onClick={() => toggleFeature(selectedTenant, feature)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${enabled ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                          {enabled ? <ToggleRight className="h-3.5 w-3.5 flex-shrink-0" /> : <ToggleLeft className="h-3.5 w-3.5 flex-shrink-0" />}
                          {feature.replace(/_/g, " ")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Complaint access */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Allowed Complaints</h3>
                  <div className="flex flex-wrap gap-2">
                    {ALL_COMPLAINTS.map(c => {
                      const enabled = selectedTenant.config.allowedComplaints?.includes(c);
                      return (
                        <button key={c} data-testid={`toggle-complaint-${c}`} onClick={() => toggleComplaint(selectedTenant, c)} className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${enabled ? "bg-green-50 border-green-300 text-green-700" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Branding */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Branding</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Clinic Display Name</label>
                      <Input defaultValue={selectedTenant.config.branding?.clinicName ?? ""} onBlur={e => patchMutation.mutate({ id: selectedTenant.id, patch: { config: { ...selectedTenant.config, branding: { ...selectedTenant.config.branding, clinicName: e.target.value } } } })} className="text-sm h-8" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Primary Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" defaultValue={selectedTenant.config.branding?.primaryColor ?? "#2563eb"} onBlur={e => patchMutation.mutate({ id: selectedTenant.id, patch: { config: { ...selectedTenant.config, branding: { ...selectedTenant.config.branding, primaryColor: e.target.value } } } })} className="h-8 w-12 rounded cursor-pointer border border-slate-200" />
                        <span className="text-xs text-slate-500">{selectedTenant.config.branding?.primaryColor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
