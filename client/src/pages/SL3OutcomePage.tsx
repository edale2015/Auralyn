import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];
const DISPOSITIONS = ["Home Care", "Urgent Care", "ED", "Prescription", "Watchful Waiting", "Telehealth Follow-up"];
const FOLLOWUP_STATUSES = ["pending", "improved", "worsened", "hospitalized", "no_show"];

const statusColors: Record<string, string> = {
  improved: "bg-green-100 text-green-700",
  worsened: "bg-orange-100 text-orange-700",
  hospitalized: "bg-red-100 text-red-700",
  pending: "bg-slate-100 text-slate-600",
  no_show: "bg-yellow-100 text-yellow-700",
};

const EMPTY_FORM = { caseId: "", complaint: "", engineDisposition: "", actualDisposition: "", patientReported: "", followupStatus: "pending", physicianNotes: "" };

export default function SL3OutcomePage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: statsData, isLoading: statsLoading } = useQuery({ queryKey: ["/api/sl3/outcomes/stats"] });
  const { data, isLoading } = useQuery({ queryKey: ["/api/sl3/outcomes"] });
  const outcomes: any[] = data?.outcomes ?? [];
  const stats: any = statsData ?? {};

  const addMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/sl3/outcomes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sl3/outcomes"] });
      qc.invalidateQueries({ queryKey: ["/api/sl3/outcomes/stats"] });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      toast({ title: "Outcome recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skill Layer 3 — Patient Outcome Feedback</h1>
          <p className="text-slate-500 text-sm mt-1">Capture real-world outcomes and close the learning loop</p>
        </div>
        <Button data-testid="button-add-outcome" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "+ Log Outcome"}
        </Button>
      </div>

      {/* Stats */}
      {!statsLoading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Outcomes", value: stats.total ?? 0, color: "bg-slate-50" },
            { label: "Improved", value: stats.improved ?? 0, color: "bg-green-50" },
            { label: "Hospitalized", value: stats.hospitalized ?? 0, color: "bg-red-50" },
            { label: "Feedback Triggered", value: stats.feedbackTriggered ?? 0, color: "bg-orange-50" },
            { label: "Mismatch Rate", value: `${stats.mismatchRate ?? "0.0"}%`, color: "bg-purple-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-3 border`}>
              <div className="text-xl font-bold text-slate-800" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">Log Patient Outcome</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Case ID</label>
              <Input data-testid="input-case-id" value={form.caseId} onChange={e => setForm(f => ({ ...f, caseId: e.target.value }))} placeholder="CASE-1234" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Complaint</label>
              <Select value={form.complaint} onValueChange={v => setForm(f => ({ ...f, complaint: v }))}>
                <SelectTrigger data-testid="select-complaint"><SelectValue placeholder="Select complaint" /></SelectTrigger>
                <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Engine Disposition</label>
              <Select value={form.engineDisposition} onValueChange={v => setForm(f => ({ ...f, engineDisposition: v }))}>
                <SelectTrigger data-testid="select-engine-disposition"><SelectValue placeholder="What engine recommended" /></SelectTrigger>
                <SelectContent>{DISPOSITIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Actual Disposition</label>
              <Select value={form.actualDisposition} onValueChange={v => setForm(f => ({ ...f, actualDisposition: v }))}>
                <SelectTrigger data-testid="select-actual-disposition"><SelectValue placeholder="What actually happened" /></SelectTrigger>
                <SelectContent>{DISPOSITIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Follow-up Status</label>
              <Select value={form.followupStatus} onValueChange={v => setForm(f => ({ ...f, followupStatus: v }))}>
                <SelectTrigger data-testid="select-followup-status"><SelectValue /></SelectTrigger>
                <SelectContent>{FOLLOWUP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Patient Reported</label>
              <Input data-testid="input-patient-reported" value={form.patientReported} onChange={e => setForm(f => ({ ...f, patientReported: e.target.value }))} placeholder="Patient's own description" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-600">Physician Notes</label>
              <Textarea data-testid="textarea-physician-notes" value={form.physicianNotes} onChange={e => setForm(f => ({ ...f, physicianNotes: e.target.value }))} rows={2} placeholder="Clinical notes..." />
            </div>
          </div>
          <Button data-testid="button-submit-outcome" onClick={() => addMutation.mutate(form)} disabled={addMutation.isPending || !form.caseId || !form.complaint || !form.engineDisposition || !form.actualDisposition}>
            {addMutation.isPending ? "Saving…" : "Save Outcome"}
          </Button>
        </div>
      )}

      {/* Outcomes table */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">Outcome Records</span>
          <span className="text-xs text-slate-400">{outcomes.length} records</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : outcomes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No outcomes logged yet. Click "+ Log Outcome" to start.</div>
        ) : (
          <div className="divide-y">
            {outcomes.map((o: any) => (
              <div key={o.id} data-testid={`row-outcome-${o.id}`} className="px-5 py-3 flex items-start gap-4 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 text-sm">{o.caseId}</span>
                    <Badge variant="outline" className="text-xs">{o.complaint}</Badge>
                    {o.feedbackLoopTriggered && <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Feedback Triggered</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Engine: <span className="font-medium">{o.engineDisposition}</span> → Actual: <span className="font-medium">{o.actualDisposition}</span>
                    {o.engineDisposition !== o.actualDisposition && <span className="ml-1 text-orange-600">⚠ Mismatch</span>}
                  </div>
                  {o.physicianNotes && <div className="text-xs text-slate-400 mt-0.5 truncate">{o.physicianNotes}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[o.followupStatus] ?? "bg-slate-100 text-slate-600"}`}>{o.followupStatus}</span>
                  <span className="text-xs text-slate-400">{new Date(o.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
