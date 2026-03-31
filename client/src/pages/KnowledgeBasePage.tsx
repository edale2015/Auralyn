import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Database, Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Copy,
  AlertTriangle, Pill, Activity, FileText, ClipboardCheck, TestTube,
  Stethoscope, Shield, BookOpen, ChevronRight, RefreshCw, Download,
} from "lucide-react";

type Tab = "complaints" | "questions" | "modifiers" | "redflags" | "workup" | "diagnosis" | "treatment" | "disposition" | "templates" | "golden" | "audit";

const TABS: { key: Tab; label: string; icon: any; endpoint: string }[] = [
  { key: "complaints", label: "Complaint Registry", icon: BookOpen, endpoint: "/api/kb/complaints" },
  { key: "questions", label: "Core Questions", icon: ClipboardCheck, endpoint: "/api/kb/questions" },
  { key: "modifiers", label: "Modifiers", icon: Activity, endpoint: "/api/kb/modifiers" },
  { key: "redflags", label: "Red Flags", icon: AlertTriangle, endpoint: "/api/kb/red-flags" },
  { key: "workup", label: "Workup Rules", icon: TestTube, endpoint: "/api/kb/workup" },
  { key: "diagnosis", label: "Diagnosis Rules", icon: Stethoscope, endpoint: "/api/kb/diagnosis" },
  { key: "treatment", label: "Treatment", icon: Pill, endpoint: "/api/kb/treatment" },
  { key: "disposition", label: "Disposition", icon: ChevronRight, endpoint: "/api/kb/disposition" },
  { key: "templates", label: "Plan Templates", icon: FileText, endpoint: "/api/kb/templates" },
  { key: "golden", label: "Golden Cases", icon: Shield, endpoint: "/api/kb/golden-cases" },
  { key: "audit", label: "Change Log", icon: Database, endpoint: "/api/kb/changes" },
];

function SeedBanner({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between mb-4">
      <span className="text-sm text-amber-800 dark:text-amber-200">Knowledge base is empty — seed with clinical data from existing CSV/TS sources.</span>
      <Button size="sm" onClick={onSeed} className="ml-4 bg-amber-600 hover:bg-amber-700 text-white">
        <RefreshCw className="h-4 w-4 mr-1" /> Seed Now
      </Button>
    </div>
  );
}

function StatusBadge({ active, enabled }: { active?: boolean; enabled?: boolean }) {
  const on = active ?? enabled ?? true;
  return <Badge variant={on ? "default" : "secondary"} className={on ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}>{on ? "Active" : "Inactive"}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = { HARD: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", SOFT: "bg-yellow-100 text-yellow-800" };
  return <Badge className={colors[severity] ?? ""}>{severity}</Badge>;
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = { ER_SEND: "bg-red-100 text-red-800", ESCALATE: "bg-orange-100 text-orange-800", URGENT: "bg-yellow-100 text-yellow-800" };
  return <Badge className={colors[action] ?? ""}>{action}</Badge>;
}

// ─── Generic CRUD dialog ─────────────────────────────────────────────────────
function EditDialog({ open, onClose, title, fields, initialValues, onSave, isLoading }: {
  open: boolean; onClose: () => void; title: string;
  fields: { key: string; label: string; type?: string; required?: boolean; options?: string[] }[];
  initialValues?: Record<string, any>; onSave: (vals: Record<string, any>) => void; isLoading?: boolean;
}) {
  const [vals, setVals] = useState<Record<string, any>>(initialValues ?? {});
  const set = (k: string, v: any) => setVals(p => ({ ...p, [k]: v }));
  const handleSave = () => onSave(vals);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          {fields.map(f => (
            <div key={f.key} className="grid gap-1">
              <label className="text-sm font-medium">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</label>
              {f.options ? (
                <Select value={String(vals[f.key] ?? "")} onValueChange={v => set(f.key, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea value={String(vals[f.key] ?? "")} onChange={e => set(f.key, e.target.value)} rows={3} />
              ) : f.type === "boolean" ? (
                <Select value={String(vals[f.key] ?? "true")} onValueChange={v => set(f.key, v === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type || "text"}
                  value={String(vals[f.key] ?? "")}
                  onChange={e => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Complaints Tab ──────────────────────────────────────────────────────────
function ComplaintsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/complaints", search],
    queryFn: async () => {
      const url = search ? `/api/kb/complaints?q=${encodeURIComponent(search)}` : "/api/kb/complaints";
      return (await apiRequest(url)).json();
    },
  });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      const { id, createdAt, updatedAt, ...body } = vals;
      if (editRow?.id) {
        return (await apiRequest(`/api/kb/complaints/${editRow.complaintId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
      }
      return (await apiRequest("/api/kb/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/complaints"] }); qc.invalidateQueries({ queryKey: ["/api/kb/stats"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (complaintId: string) => apiRequest(`/api/kb/complaints/${complaintId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/complaints"] }); toast({ title: "Deleted" }); },
  });

  const toggle = useMutation({
    mutationFn: ({ complaintId, enabled }: any) => apiRequest(`/api/kb/complaints/${complaintId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/complaints"] }),
  });

  const FIELDS = [
    { key: "complaintId", label: "Complaint ID", required: true },
    { key: "label", label: "Label", required: true },
    { key: "system", label: "System", options: ["ENT", "PULM", "CARD", "GI", "GU", "DERM", "MSK", "NEURO", "GENERAL"] },
    { key: "aliases", label: "Aliases (comma-separated)" },
    { key: "defaultCluster", label: "Default Cluster" },
    { key: "scoringModule", label: "Scoring Module" },
    { key: "engineType", label: "Engine Type", options: ["LEGACY", "STANDARD", "ADVANCED"] },
    { key: "enabled", label: "Enabled", type: "boolean" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search complaints..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setEditRow({}); setCreating(true); }} data-testid="button-add-complaint"><Plus className="h-4 w-4 mr-1" /> Add Complaint</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["ID","Label","System","Aliases","Engine","Status","Actions"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-complaint-${r.id}`}>
                  <td className="p-3 font-mono text-xs">{r.complaintId}</td>
                  <td className="p-3 font-medium">{r.label}</td>
                  <td className="p-3"><Badge variant="outline">{r.system}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{(r.aliases || []).slice(0, 3).join(", ")}{(r.aliases?.length || 0) > 3 ? "…" : ""}</td>
                  <td className="p-3 text-xs">{r.engineType}</td>
                  <td className="p-3"><StatusBadge enabled={r.enabled} /></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ complaintId: r.complaintId, enabled: !r.enabled })}>{r.enabled ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditRow(r)} data-testid={`button-edit-complaint-${r.id}`}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(r.complaintId)} data-testid={`button-delete-complaint-${r.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editRow !== null) && (
        <EditDialog open title={creating ? "Add Complaint" : "Edit Complaint"} fields={FIELDS} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Questions Tab ────────────────────────────────────────────────────────────
function QuestionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [complaintFilter, setComplaintFilter] = useState("");
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: complaints = [] } = useQuery<any[]>({ queryKey: ["/api/kb/complaints"] });
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/questions", complaintFilter],
    queryFn: async () => {
      const url = complaintFilter ? `/api/kb/questions?complaintId=${complaintFilter}` : "/api/kb/questions";
      return (await apiRequest(url)).json();
    },
  });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      if (editRow?.id && !creating) {
        return (await apiRequest(`/api/kb/questions/${editRow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
      }
      return (await apiRequest("/api/kb/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/questions"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/kb/questions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/questions"] }),
  });

  const FIELDS = [
    { key: "complaintId", label: "Complaint ID", required: true },
    { key: "questionId", label: "Question ID", required: true },
    { key: "prompt", label: "Question Text", type: "textarea", required: true },
    { key: "type", label: "Answer Type", options: ["yes_no", "yes_no_sometimes", "number", "text", "duration", "scale"] },
    { key: "required", label: "Required", type: "boolean" },
    { key: "priority", label: "Order / Priority", type: "number" },
    { key: "category", label: "Category" },
    { key: "askIf", label: "Ask If (condition)" },
    { key: "active", label: "Active", type: "boolean" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={complaintFilter} onValueChange={setComplaintFilter}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filter by complaint…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All complaints</SelectItem>
            {(complaints as any[]).map((c: any) => <SelectItem key={c.complaintId} value={c.complaintId}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditRow({ complaintId: complaintFilter }); setCreating(true); }}><Plus className="h-4 w-4 mr-1" /> Add Question</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Complaint","ID","Question","Type","Order","Required","Actions"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, 200).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-question-${r.id}`}>
                  <td className="p-3 font-mono text-xs">{r.complaintId}</td>
                  <td className="p-3 font-mono text-xs">{r.questionId}</td>
                  <td className="p-3 max-w-xs truncate">{r.prompt}</td>
                  <td className="p-3"><Badge variant="outline">{r.type}</Badge></td>
                  <td className="p-3">{r.priority}</td>
                  <td className="p-3">{r.required ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRow(r); setCreating(false); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && <div className="p-3 text-center text-sm text-muted-foreground">Showing 200 of {rows.length} — use filter to narrow results</div>}
        </div>
      )}
      {editRow !== null && (
        <EditDialog open title={creating ? "Add Question" : "Edit Question"} fields={FIELDS} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Modifiers Tab ────────────────────────────────────────────────────────────
function ModifiersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/kb/modifiers"] });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      if (editRow?.id && !creating) {
        return (await apiRequest(`/api/kb/modifiers/${editRow.modifierId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
      }
      return (await apiRequest("/api/kb/modifiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/modifiers"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (modifierId: string) => apiRequest(`/api/kb/modifiers/${modifierId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/modifiers"] }),
  });

  const FIELDS = [
    { key: "modifierId", label: "Modifier ID (unique key)", required: true },
    { key: "label", label: "Label", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "dispositionThresholdShift", label: "Disposition Threshold Shift (-0.5 to +0.5)", type: "number" },
    { key: "active", label: "Active", type: "boolean" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditRow({}); setCreating(true); }}><Plus className="h-4 w-4 mr-1" /> Add Modifier</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="grid gap-3">
          {(rows as any[]).map((r: any) => (
            <Card key={r.id} data-testid={`card-modifier-${r.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{r.label}</span>
                      <Badge variant="outline" className="font-mono text-xs">{r.modifierId}</Badge>
                      <StatusBadge active={r.active} />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{r.description}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {r.dispositionThresholdShift !== 0 && <Badge className={r.dispositionThresholdShift < 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>Disposition shift: {r.dispositionThresholdShift > 0 ? "+" : ""}{r.dispositionThresholdShift}</Badge>}
                      {r.addDiagnoses?.length > 0 && <Badge className="bg-blue-100 text-blue-800">+{r.addDiagnoses.length} diagnoses</Badge>}
                      {r.removeDiagnoses?.length > 0 && <Badge className="bg-orange-100 text-orange-800">−{r.removeDiagnoses.length} diagnoses</Badge>}
                      {r.medChanges?.avoid && <Badge className="bg-red-100 text-red-800">Avoid: {Array.isArray(r.medChanges.avoid) ? r.medChanges.avoid.join(", ") : r.medChanges.avoid}</Badge>}
                      {r.medChanges?.prefer && <Badge className="bg-green-100 text-green-800">Prefer: {r.medChanges.prefer}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditRow(r); setCreating(false); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(r.modifierId)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {editRow !== null && (
        <EditDialog open title={creating ? "Add Modifier" : "Edit Modifier"} fields={FIELDS} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Red Flags Tab ────────────────────────────────────────────────────────────
function RedFlagsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [complaintFilter, setComplaintFilter] = useState("");

  const { data: complaints = [] } = useQuery<any[]>({ queryKey: ["/api/kb/complaints"] });
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/red-flags", complaintFilter],
    queryFn: async () => {
      const url = complaintFilter ? `/api/kb/red-flags?complaintId=${complaintFilter}` : "/api/kb/red-flags";
      return (await apiRequest(url)).json();
    },
  });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      if (editRow?.id && !creating) {
        return (await apiRequest(`/api/kb/red-flags/${editRow.ruleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
      }
      return (await apiRequest("/api/kb/red-flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/red-flags"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (ruleId: string) => apiRequest(`/api/kb/red-flags/${ruleId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb/red-flags"] }),
  });

  const FIELDS = [
    { key: "ruleId", label: "Rule ID", required: true },
    { key: "complaintId", label: "Complaint ID", required: true },
    { key: "label", label: "Rule Label", required: true },
    { key: "triggerExpr", label: "Trigger Expression", type: "textarea", required: true },
    { key: "severity", label: "Severity", options: ["HARD", "SOFT"] },
    { key: "action", label: "Action", options: ["ER_SEND", "ESCALATE", "URGENT", "CALL_911"] },
    { key: "immediateActions", label: "Immediate Actions", type: "textarea" },
    { key: "rationale", label: "Rationale", type: "textarea" },
    { key: "active", label: "Active", type: "boolean" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={complaintFilter} onValueChange={setComplaintFilter}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filter by complaint…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            {(complaints as any[]).map((c: any) => <SelectItem key={c.complaintId} value={c.complaintId}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditRow({ complaintId: complaintFilter }); setCreating(true); }}><Plus className="h-4 w-4 mr-1" /> Add Red Flag Rule</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Complaint","Rule ID","Label","Severity","Action","Status","Actions"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {(rows as any[]).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-redflag-${r.id}`}>
                  <td className="p-3 font-mono text-xs">{r.complaintId}</td>
                  <td className="p-3 font-mono text-xs">{r.ruleId}</td>
                  <td className="p-3 font-medium">{r.label}</td>
                  <td className="p-3"><SeverityBadge severity={r.severity} /></td>
                  <td className="p-3"><ActionBadge action={r.action} /></td>
                  <td className="p-3"><StatusBadge active={r.active} /></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRow(r); setCreating(false); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(r.ruleId)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editRow !== null && (
        <EditDialog open title={creating ? "Add Red Flag Rule" : "Edit Red Flag Rule"} fields={FIELDS} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Generic table tab for simpler domains ────────────────────────────────────
function SimpleTableTab({ endpoint, title, columns, fields, idKey, editUrlFn, deleteUrlFn, newDefault }: {
  endpoint: string; title: string;
  columns: { key: string; label: string; render?: (v: any, row: any) => any }[];
  fields: any[]; idKey: string;
  editUrlFn: (row: any) => string; deleteUrlFn: (row: any) => string;
  newDefault?: Record<string, any>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: [endpoint] });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      if (editRow?.[idKey] && !creating) {
        return (await apiRequest(editUrlFn(editRow), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
      }
      return (await apiRequest(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); qc.invalidateQueries({ queryKey: ["/api/kb/stats"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (row: any) => apiRequest(deleteUrlFn(row), { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); toast({ title: "Deleted" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditRow(newDefault ?? {}); setCreating(true); }}><Plus className="h-4 w-4 mr-1" /> Add {title}</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{[...columns.map(c => c.label), "Actions"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {(rows as any[]).slice(0, 300).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  {columns.map(c => <td key={c.key} className="p-3 max-w-xs truncate">{c.render ? c.render(r[c.key], r) : String(r[c.key] ?? "")}</td>)}
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRow(r); setCreating(false); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(r)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(rows as any[]).length > 300 && <div className="p-3 text-center text-sm text-muted-foreground">Showing 300 of {(rows as any[]).length}</div>}
        </div>
      )}
      {editRow !== null && (
        <EditDialog open title={creating ? `Add ${title}` : `Edit ${title}`} fields={fields} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Golden Cases Tab ─────────────────────────────────────────────────────────
function GoldenCasesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editRow, setEditRow] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/golden-cases", statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      return (await apiRequest(`/api/kb/golden-cases?${params}`)).json();
    },
  });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      if (editRow?.id && !creating) {
        return (await apiRequest(`/api/kb/golden-cases/${editRow.caseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
      }
      return (await apiRequest("/api/kb/golden-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/golden-cases"] }); qc.invalidateQueries({ queryKey: ["/api/kb/stats"] }); setEditRow(null); setCreating(false); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (caseId: string) => apiRequest(`/api/kb/golden-cases/${caseId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/golden-cases"] }); toast({ title: "Deleted" }); },
  });

  const clone = useMutation({
    mutationFn: (caseId: string) => apiRequest(`/api/kb/golden-cases/${caseId}/clone`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb/golden-cases"] }); toast({ title: "Cloned" }); },
  });

  const STATUS_COLORS: Record<string, string> = { approved: "bg-green-100 text-green-800", draft: "bg-yellow-100 text-yellow-800", retired: "bg-gray-100 text-gray-600" };

  const GOLDEN_FIELDS = [
    { key: "caseId", label: "Case ID", required: true },
    { key: "complaint", label: "Complaint ID", required: true },
    { key: "title", label: "Title", required: true },
    { key: "expectedDiagnosis", label: "Expected Diagnosis", required: true },
    { key: "expectedDisposition", label: "Expected Disposition", options: ["er_now", "er_send", "urgent_care", "office_followup", "self_care", "telemed_now"] },
    { key: "status", label: "Status", options: ["draft", "approved", "retired"] },
    { key: "author", label: "Author / Owner" },
    { key: "explanation", label: "Rationale / Explanation", type: "textarea" },
    { key: "version", label: "Version", type: "number" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search cases…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditRow({}); setCreating(true); }} data-testid="button-add-golden"><Plus className="h-4 w-4 mr-1" /> Add Case</Button>
        <Button variant="outline" asChild>
          <a href="/api/kb/golden-cases-export" download="golden_cases.json"><Download className="h-4 w-4 mr-1" /> Export</a>
        </Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Case ID","Complaint","Title","Exp. Diagnosis","Exp. Disposition","Status","Author","Actions"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {(rows as any[]).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-golden-${r.id}`}>
                  <td className="p-3 font-mono text-xs">{r.caseId}</td>
                  <td className="p-3 text-xs">{r.complaint}</td>
                  <td className="p-3 font-medium max-w-[200px] truncate">{r.title}</td>
                  <td className="p-3 text-xs max-w-[150px] truncate">{r.expectedDiagnosis}</td>
                  <td className="p-3"><Badge variant="outline">{r.expectedDisposition}</Badge></td>
                  <td className="p-3"><Badge className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge></td>
                  <td className="p-3 text-xs">{r.author}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" title="Clone" onClick={() => clone.mutate(r.caseId)}><Copy className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditRow(r); setCreating(false); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(r.caseId)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editRow !== null && (
        <EditDialog open title={creating ? "Add Golden Case" : "Edit Golden Case"} fields={GOLDEN_FIELDS} initialValues={editRow}
          onSave={vals => save.mutate(vals)} isLoading={save.isPending} onClose={() => { setEditRow(null); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── Audit / Change Log Tab ───────────────────────────────────────────────────
function AuditTab() {
  const [domain, setDomain] = useState("");
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/changes", domain],
    queryFn: async () => (await apiRequest(domain ? `/api/kb/changes?domain=${domain}&limit=200` : "/api/kb/changes?limit=200")).json(),
  });

  const ACTION_COLORS: Record<string, string> = { create: "bg-green-100 text-green-800", update: "bg-blue-100 text-blue-800", delete: "bg-red-100 text-red-800", clone: "bg-purple-100 text-purple-800" };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Filter by domain…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All domains</SelectItem>
            {["complaint","question","modifier","red_flag_rule","workup_rule","diagnosis_rule","treatment_rule","disposition_rule","plan_template","golden_case"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading…</div> : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Time","Domain","Record ID","Action","Changed By","Rationale"].map(h => <th key={h} className="text-left p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {(rows as any[]).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="p-3"><Badge variant="outline">{r.domain}</Badge></td>
                  <td className="p-3 font-mono text-xs">{r.recordId}</td>
                  <td className="p-3"><Badge className={ACTION_COLORS[r.action] ?? ""}>{r.action}</Badge></td>
                  <td className="p-3 text-xs">{r.changedBy}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{r.rationale ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<Tab>("complaints");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery<any>({ queryKey: ["/api/kb/stats"] });

  const seed = useMutation({
    mutationFn: () => apiRequest("/api/kb/seed", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb"] }); toast({ title: "Seeded", description: "Knowledge base populated from existing data." }); },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const needsSeed = stats && stats.complaints === 0;

  return (
    <div className="flex h-full bg-background">
      {/* Left nav */}
      <div className="w-56 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-sm">Knowledge Base</span>
          </div>
          {stats && (
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>{stats.activeComplaints} complaints</span>
              <span>{stats.approvedGoldenCases} golden</span>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left mb-1 transition-colors ${activeTab === t.key ? "bg-blue-600 text-white" : "hover:bg-muted text-foreground"}`}
                data-testid={`nav-kb-${t.key}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {needsSeed && <SeedBanner onSeed={() => seed.mutate()} />}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{TABS.find(t => t.key === activeTab)?.label}</h1>
          <p className="text-sm text-muted-foreground">App-managed clinical knowledge — no code changes required</p>
        </div>

        {activeTab === "complaints" && <ComplaintsTab />}
        {activeTab === "questions" && <QuestionsTab />}
        {activeTab === "modifiers" && <ModifiersTab />}
        {activeTab === "redflags" && <RedFlagsTab />}

        {activeTab === "workup" && (
          <SimpleTableTab
            endpoint="/api/kb/workup" title="Workup Rule"
            columns={[
              { key: "complaintId", label: "Complaint" },
              { key: "testName", label: "Test" },
              { key: "testType", label: "Type", render: v => <Badge variant="outline">{v}</Badge> },
              { key: "priority", label: "Priority" },
              { key: "triggerExpr", label: "Trigger (truncated)", render: v => <span className="font-mono text-xs truncate max-w-[150px] inline-block">{String(v ?? "").slice(0, 40)}</span> },
              { key: "active", label: "Status", render: v => <StatusBadge active={v} /> },
            ]}
            fields={[
              { key: "ruleId", label: "Rule ID", required: true },
              { key: "complaintId", label: "Complaint ID", required: true },
              { key: "testName", label: "Test Name", required: true },
              { key: "testType", label: "Test Type", options: ["labs", "imaging", "EKG", "bedside", "monitoring"] },
              { key: "triggerExpr", label: "Trigger Expression", type: "textarea" },
              { key: "priority", label: "Priority", type: "number" },
              { key: "rationale", label: "Rationale", type: "textarea" },
              { key: "active", label: "Active", type: "boolean" },
            ]}
            idKey="ruleId" editUrlFn={r => `/api/kb/workup/${r.ruleId}`} deleteUrlFn={r => `/api/kb/workup/${r.ruleId}`}
          />
        )}

        {activeTab === "diagnosis" && (
          <SimpleTableTab
            endpoint="/api/kb/diagnosis" title="Diagnosis Rule"
            columns={[
              { key: "complaintId", label: "Complaint" },
              { key: "diagnosisLabel", label: "Diagnosis" },
              { key: "baseProbability", label: "Base Prob", render: v => `${(Number(v) * 100).toFixed(0)}%` },
              { key: "cannotMiss", label: "Cannot Miss", render: v => v ? <Badge className="bg-red-100 text-red-800">Yes</Badge> : null },
              { key: "active", label: "Status", render: v => <StatusBadge active={v} /> },
            ]}
            fields={[
              { key: "ruleId", label: "Rule ID", required: true },
              { key: "complaintId", label: "Complaint ID", required: true },
              { key: "diagnosisId", label: "Diagnosis ID", required: true },
              { key: "diagnosisLabel", label: "Diagnosis Label", required: true },
              { key: "icdCode", label: "ICD-10 Code" },
              { key: "baseProbability", label: "Base Probability (0-1)", type: "number" },
              { key: "basePoints", label: "Base Points", type: "number" },
              { key: "clusterPriority", label: "Cluster Priority", type: "number" },
              { key: "cannotMiss", label: "Cannot Miss", type: "boolean" },
              { key: "active", label: "Active", type: "boolean" },
            ]}
            idKey="ruleId" editUrlFn={r => `/api/kb/diagnosis/${r.ruleId}`} deleteUrlFn={r => `/api/kb/diagnosis/${r.ruleId}`}
          />
        )}

        {activeTab === "treatment" && (
          <SimpleTableTab
            endpoint="/api/kb/treatment" title="Treatment Rule"
            columns={[
              { key: "medicationName", label: "Medication" },
              { key: "medicationGroup", label: "Group" },
              { key: "isFirstLine", label: "First Line", render: v => v ? <Badge className="bg-green-100 text-green-800">1st Line</Badge> : <Badge variant="outline">Alt</Badge> },
              { key: "adultDose", label: "Adult Dose" },
              { key: "pregnancyCategory", label: "Pregnancy" },
              { key: "contraindications", label: "Contraindications", render: v => <span className="text-xs text-muted-foreground max-w-[120px] truncate inline-block">{String(v ?? "").slice(0, 40)}</span> },
              { key: "active", label: "Status", render: v => <StatusBadge active={v} /> },
            ]}
            fields={[
              { key: "ruleId", label: "Rule ID", required: true },
              { key: "medicationName", label: "Medication Name", required: true },
              { key: "medicationGroup", label: "Drug Group/Class" },
              { key: "complaintId", label: "Complaint ID (optional)" },
              { key: "diagnosisId", label: "Diagnosis ID (optional)" },
              { key: "isFirstLine", label: "First Line", type: "boolean" },
              { key: "adultDose", label: "Adult Dose" },
              { key: "adultMaxDose", label: "Adult Max Dose" },
              { key: "pediatricDose", label: "Pediatric Dose (weight-based)" },
              { key: "route", label: "Route", options: ["Oral", "IV", "IM", "Topical", "Inhaled", "Sublingual"] },
              { key: "renalAdjust", label: "Renal Dose Adjustment" },
              { key: "hepaticAdjust", label: "Hepatic Dose Adjustment" },
              { key: "pregnancyCategory", label: "Pregnancy Category" },
              { key: "contraindications", label: "Contraindications", type: "textarea" },
              { key: "keyInteractions", label: "Key Drug Interactions", type: "textarea" },
              { key: "commonSideEffects", label: "Common Side Effects" },
              { key: "notes", label: "Notes", type: "textarea" },
              { key: "active", label: "Active", type: "boolean" },
            ]}
            idKey="ruleId" editUrlFn={r => `/api/kb/treatment/${r.ruleId}`} deleteUrlFn={r => `/api/kb/treatment/${r.ruleId}`}
          />
        )}

        {activeTab === "disposition" && (
          <SimpleTableTab
            endpoint="/api/kb/disposition" title="Disposition Rule"
            columns={[
              { key: "complaintId", label: "Complaint" },
              { key: "ruleId", label: "Rule ID" },
              { key: "priority", label: "Priority" },
              { key: "dispositionLevel", label: "Disposition", render: v => <Badge variant="outline">{v}</Badge> },
              { key: "confidenceHint", label: "Confidence" },
              { key: "active", label: "Status", render: v => <StatusBadge active={v} /> },
            ]}
            fields={[
              { key: "ruleId", label: "Rule ID", required: true },
              { key: "complaintId", label: "Complaint ID", required: true },
              { key: "priority", label: "Priority (lower = first)", type: "number" },
              { key: "whenExpr", label: "When Expression", type: "textarea", required: true },
              { key: "dispositionLevel", label: "Disposition Level", options: ["er_now", "er_send", "urgent_care", "routine_urgent", "office_followup", "self_care", "telemed_now"] },
              { key: "rationaleTemplateId", label: "Rationale Template ID" },
              { key: "confidenceHint", label: "Confidence Hint", options: ["HIGH", "MODERATE", "LOW"] },
              { key: "active", label: "Active", type: "boolean" },
            ]}
            idKey="ruleId" editUrlFn={r => `/api/kb/disposition/${r.ruleId}`} deleteUrlFn={r => `/api/kb/disposition/${r.ruleId}`}
          />
        )}

        {activeTab === "templates" && (
          <SimpleTableTab
            endpoint="/api/kb/templates" title="Plan Template"
            columns={[
              { key: "templateKey", label: "Key" },
              { key: "diagnosisLabel", label: "Diagnosis" },
              { key: "defaultDisposition", label: "Disposition", render: v => <Badge variant="outline">{v}</Badge> },
              { key: "active", label: "Status", render: v => <StatusBadge active={v} /> },
            ]}
            fields={[
              { key: "templateKey", label: "Template Key", required: true },
              { key: "complaintId", label: "Complaint ID" },
              { key: "diagnosisLabel", label: "Diagnosis Label", required: true },
              { key: "defaultDisposition", label: "Default Disposition", options: ["er_now", "er_send", "urgent_care", "office_followup", "self_care", "telemed_now"] },
              { key: "summary", label: "Clinical Summary", type: "textarea" },
              { key: "patientMessage", label: "Patient Message", type: "textarea" },
              { key: "dischargeText", label: "Discharge Text", type: "textarea" },
              { key: "erPrecautions", label: "ER Precautions", type: "textarea" },
              { key: "medicationInstructions", label: "Medication Instructions", type: "textarea" },
              { key: "active", label: "Active", type: "boolean" },
            ]}
            idKey="templateKey" editUrlFn={r => `/api/kb/templates/${r.templateKey}`} deleteUrlFn={r => `/api/kb/templates/${r.templateKey}`}
          />
        )}

        {activeTab === "golden" && <GoldenCasesTab />}
        {activeTab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
