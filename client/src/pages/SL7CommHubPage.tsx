import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, CheckCircle2, XCircle, Clock } from "lucide-react";

const COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];
const DISPOSITIONS = ["Home Care", "Urgent Care", "ED", "Prescription", "Watchful Waiting", "Telehealth Follow-up"];
const CHANNELS = ["whatsapp", "sms", "telegram"];

const channelColors: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-700",
  sms: "bg-blue-100 text-blue-700",
  telegram: "bg-sky-100 text-sky-700",
};
const statusIcons: Record<string, any> = {
  delivered: CheckCircle2,
  sent: Send,
  failed: XCircle,
  pending: Clock,
};
const statusColors: Record<string, string> = {
  delivered: "text-green-600",
  sent: "text-blue-600",
  failed: "text-red-600",
  pending: "text-slate-400",
};

const EMPTY_FORM = { name: "", complaint: "", disposition: "", channel: "whatsapp", status: "draft", subject: "", body: "", variables: "" };

export default function SL7CommHubPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [activeTab, setActiveTab] = useState<"templates" | "delivery">("templates");
  const [filterChannel, setFilterChannel] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: templatesData, isLoading: tplLoading } = useQuery({
    queryKey: ["/api/sl7/templates", filterChannel],
  });
  const { data: deliveryData, isLoading: delLoading } = useQuery({ queryKey: ["/api/sl7/delivery-log"] });

  const templates: any[] = templatesData?.templates ?? [];
  const deliveryLog: any[] = deliveryData?.log ?? [];
  const deliveryStats: any = deliveryData?.stats ?? {};

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/sl7/templates", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sl7/templates"] });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      toast({ title: "Template created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sl7/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sl7/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/sl7/templates/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/sl7/templates"] }),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skill Layer 7 — Patient Communication Hub</h1>
          <p className="text-slate-500 text-sm mt-1">Manage message templates and monitor delivery across channels</p>
        </div>
        <Button data-testid="button-new-template" onClick={() => { setShowForm(v => !v); setEditId(null); }}>
          {showForm ? "Cancel" : "+ New Template"}
        </Button>
      </div>

      {/* Delivery stats */}
      {deliveryStats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Sent", value: deliveryStats.total, color: "bg-slate-50" },
            { label: "Delivered", value: deliveryStats.delivered, color: "bg-green-50" },
            { label: "Failed", value: deliveryStats.failed, color: "bg-red-50" },
            { label: "Delivery Rate", value: `${deliveryStats.deliveryRate}%`, color: "bg-blue-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-3 border`}>
              <div className="text-xl font-bold text-slate-800" data-testid={`stat-comm-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New template form */}
      {showForm && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">New Template</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Template Name</label>
              <Input data-testid="input-template-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. UTI Home Care Instructions" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Channel</label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger data-testid="select-template-channel"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Complaint</label>
              <Select value={form.complaint} onValueChange={v => setForm(f => ({ ...f, complaint: v }))}>
                <SelectTrigger data-testid="select-template-complaint"><SelectValue placeholder="Select complaint" /></SelectTrigger>
                <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Disposition</label>
              <Select value={form.disposition} onValueChange={v => setForm(f => ({ ...f, disposition: v }))}>
                <SelectTrigger data-testid="select-template-disposition"><SelectValue placeholder="Select disposition" /></SelectTrigger>
                <SelectContent>{DISPOSITIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Subject / Title</label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Message subject" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Variables (comma-separated)</label>
              <Input value={form.variables} onChange={e => setForm(f => ({ ...f, variables: e.target.value }))} placeholder="patientName, clinicName, medication" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-600">Body — use {"{{variableName}}"} for placeholders</label>
              <Textarea data-testid="textarea-template-body" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={4} placeholder="Hi {{patientName}}, your triage is complete..." />
            </div>
          </div>
          <Button data-testid="button-create-template" onClick={() => createMutation.mutate({ ...form, variables: form.variables.split(",").map(v => v.trim()).filter(Boolean) })} disabled={createMutation.isPending || !form.name || !form.body || !form.complaint || !form.disposition}>
            {createMutation.isPending ? "Saving…" : "Create Template"}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["templates", "delivery"] as const).map(tab => (
          <button key={tab} data-testid={`tab-${tab}`} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab === "templates" ? `Templates (${templates.length})` : `Delivery Log (${deliveryLog.length})`}
          </button>
        ))}
      </div>

      {activeTab === "templates" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-40" data-testid="select-filter-channel"><SelectValue placeholder="All channels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All channels</SelectItem>
                {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tplLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No templates found. Create one above.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((t: any) => (
                <div key={t.id} data-testid={`card-template-${t.id}`} className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{t.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${channelColors[t.channel]}`}>{t.channel}</span>
                        <Badge variant="outline" className="text-xs">{t.complaint}</Badge>
                        <Badge variant="outline" className="text-xs">{t.disposition}</Badge>
                      </div>
                    </div>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${t.status === "active" ? "bg-green-100 text-green-700" : t.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-yellow-100 text-yellow-700"}`}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{t.body}</p>
                  {t.variables?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.variables.map((v: string) => <span key={v} className="font-mono text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">{`{{${v}}}`}</span>)}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => updateStatusMutation.mutate({ id: t.id, status: t.status === "active" ? "archived" : "active" })}>
                      {t.status === "active" ? "Archive" : "Activate"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 hover:text-red-700" data-testid={`button-delete-template-${t.id}`} onClick={() => deleteMutation.mutate(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "delivery" && (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          {delLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading delivery log…</div>
          ) : (
            <div className="divide-y">
              {deliveryLog.map((entry: any) => {
                const Icon = statusIcons[entry.status] ?? Clock;
                return (
                  <div key={entry.id} data-testid={`row-delivery-${entry.id}`} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${statusColors[entry.status] ?? "text-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800 text-sm">{entry.caseId}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${channelColors[entry.channel]}`}>{entry.channel}</span>
                        <span className="text-xs text-slate-400">{entry.recipient}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Template: {entry.templateId}
                        {entry.errorMessage && <span className="ml-2 text-red-500">— {entry.errorMessage}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(entry.sentAt).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
