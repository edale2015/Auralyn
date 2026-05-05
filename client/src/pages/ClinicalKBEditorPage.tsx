import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight, ChevronDown, Search, Plus, Pencil, Trash2,
  FlaskConical, Pill, Stethoscope, AlertTriangle, HelpCircle,
  Sliders, ClipboardList, BookOpen, RefreshCw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplaintRow {
  complaint_id: string;
  system: string;
  dx_count: string;
  workup_count: string;
  med_count: string;
  disp_count: string;
  q_count: string;
  mod_count: string;
  rf_count: string;
  score_count: string;
  total: string;
}

interface Rule {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  priority: number;
  complaint_id: string;
  cluster_id: string | null;
  diagnosis_id: string | null;
  logic_description: string | null;
  logic_type: string;
  source_tab: string | null;
  disposition_impact: string | null;
  medication_impact: string | null;
  workup_impact: string | null;
  safety_level: string;
  notes: string | null;
  active: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: "all",             label: "All Rules",        icon: BookOpen,      color: "bg-slate-100 text-slate-700" },
  { value: "diagnosis",       label: "Differentials",    icon: Stethoscope,   color: "bg-blue-100 text-blue-700" },
  { value: "workup",          label: "Workups",          icon: FlaskConical,  color: "bg-purple-100 text-purple-700" },
  { value: "medication",      label: "Medications",      icon: Pill,          color: "bg-green-100 text-green-700" },
  { value: "disposition",     label: "Dispositions",     icon: ClipboardList, color: "bg-orange-100 text-orange-700" },
  { value: "question",        label: "Questions",        icon: HelpCircle,    color: "bg-cyan-100 text-cyan-700" },
  { value: "modifier",        label: "Modifiers",        icon: Sliders,       color: "bg-pink-100 text-pink-700" },
  { value: "red_flag",        label: "Red Flags",        icon: AlertTriangle, color: "bg-red-100 text-red-700" },
  { value: "cluster_scoring", label: "Scoring",          icon: RefreshCw,     color: "bg-yellow-100 text-yellow-700" },
];

const SAFETY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-orange-500 text-white",
  MODERATE: "bg-yellow-500 text-black",
  LOW:      "bg-green-500 text-white",
};

const SYSTEM_ORDER = [
  "Cardiology","Pulmonology","Gastroenterology","ENT","Neurology",
  "Musculoskeletal","Dermatology","Endocrinology","UroGyn","Gynecology",
  "Infectious Disease","Psychiatry","Pediatrics","Ophthalmology","Hematology",
  "Toxicology","Trauma","Allergy","Sexual Health","Dental","General","Other",
];

const EMPTY_RULE: Partial<Rule> = {
  rule_name: "", rule_type: "diagnosis", complaint_id: "",
  safety_level: "MODERATE", priority: 5, logic_type: "boolean",
  logic_description: "", workup_impact: "", medication_impact: "",
  disposition_impact: "", notes: "",
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}`, "x-review-token": token } : {};
}

async function authFetch(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers as any) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClinicalKBEditorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expandedSystems, setExpandedSystems]     = useState<Set<string>>(new Set(["Cardiology"]));
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem]       = useState<string>("Cardiology");
  const [activeTab, setActiveTab]                 = useState("all");
  const [search, setSearch]                       = useState("");
  const [page, setPage]                           = useState(1);
  const [editRule, setEditRule]                   = useState<Partial<Rule> | null>(null);
  const [isNew, setIsNew]                         = useState(false);
  const [sidebarSearch, setSidebarSearch]         = useState("");

  // ── Queries ──

  const { data: complaintsData, isLoading: loadingComplaints } = useQuery({
    queryKey: ["/api/kb-editor/complaints"],
    queryFn: () => authFetch("/api/kb-editor/complaints"),
  });

  const complaints: ComplaintRow[] = complaintsData?.complaints ?? [];

  const bySystem = useMemo(() => {
    const map: Record<string, ComplaintRow[]> = {};
    for (const c of complaints) {
      if (!map[c.system]) map[c.system] = [];
      map[c.system].push(c);
    }
    return map;
  }, [complaints]);

  const { data: rulesData, isLoading: loadingRules } = useQuery({
    queryKey: ["/api/kb-editor/rules", selectedComplaint, activeTab, page, search],
    queryFn: () => authFetch(
      `/api/kb-editor/rules?complaint_id=${selectedComplaint ?? ""}&rule_type=${activeTab === "all" ? "" : activeTab}&page=${page}&limit=50&search=${encodeURIComponent(search)}`
    ),
    enabled: !!selectedComplaint,
  });

  const rules: Rule[]  = rulesData?.rules ?? [];
  const totalRules     = rulesData?.total ?? 0;
  const totalPages     = Math.max(1, Math.ceil(totalRules / 50));

  // ── Mutations ──

  const saveRule = useMutation({
    mutationFn: async (data: Partial<Rule>) => {
      if (isNew) {
        return authFetch("/api/kb-editor/rules", { method: "POST", body: JSON.stringify(data) });
      } else {
        return authFetch(`/api/kb-editor/rules/${data.rule_id}`, { method: "PATCH", body: JSON.stringify(data) });
      }
    },
    onSuccess: () => {
      toast({ title: isNew ? "Rule created" : "Rule updated" });
      setEditRule(null);
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/rules"] });
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/complaints"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: (rule_id: string) =>
      authFetch(`/api/kb-editor/rules/${rule_id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Rule removed" });
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/rules"] });
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/complaints"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ──

  function openEdit(rule: Rule) { setIsNew(false); setEditRule({ ...rule }); }
  function openNew() {
    setIsNew(true);
    setEditRule({ ...EMPTY_RULE, complaint_id: selectedComplaint ?? "", rule_type: activeTab === "all" ? "diagnosis" : activeTab });
  }
  function toggleSystem(sys: string) {
    setExpandedSystems((prev) => {
      const next = new Set(prev);
      if (next.has(sys)) next.delete(sys); else next.add(sys);
      return next;
    });
    setSelectedSystem(sys);
  }
  function selectComplaint(id: string) {
    setSelectedComplaint(id);
    setActiveTab("all");
    setPage(1);
    setSearch("");
  }

  const selectedComplaintData = complaints.find((c) => c.complaint_id === selectedComplaint);

  const filteredSystems = SYSTEM_ORDER.filter((s) => bySystem[s]?.length > 0);

  function countBadge(c: ComplaintRow, type: string): number {
    const map: Record<string, string> = { diagnosis: "dx_count", workup: "workup_count", medication: "med_count", disposition: "disp_count", question: "q_count", modifier: "mod_count", red_flag: "rf_count", cluster_scoring: "score_count" };
    return parseInt((c as any)[map[type]] ?? "0");
  }

  // ── Render ──

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Left Sidebar: Systems + Complaints ── */}
      <div className="w-72 border-r flex flex-col flex-shrink-0 bg-muted/30">
        <div className="p-3 border-b">
          <h2 className="font-semibold text-sm mb-2">Clinical KB Editor</h2>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              data-testid="input-sidebar-search"
              placeholder="Search complaints…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingComplaints ? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="py-1">
              {filteredSystems.map((sys) => {
                const sysComplaints = (bySystem[sys] ?? []).filter((c) =>
                  !sidebarSearch || c.complaint_id.includes(sidebarSearch.toLowerCase().replace(/\s+/g, "_"))
                );
                if (sysComplaints.length === 0 && sidebarSearch) return null;
                const isOpen = expandedSystems.has(sys);
                return (
                  <div key={sys}>
                    <button
                      data-testid={`btn-system-${sys}`}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors text-left"
                      onClick={() => toggleSystem(sys)}
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="flex-1">{sys}</span>
                      <span className="text-muted-foreground font-normal">{sysComplaints.length}</span>
                    </button>
                    {isOpen && sysComplaints.map((c) => (
                      <button
                        key={c.complaint_id}
                        data-testid={`btn-complaint-${c.complaint_id}`}
                        onClick={() => selectComplaint(c.complaint_id)}
                        className={`w-full text-left px-6 py-1 text-xs hover:bg-muted transition-colors flex items-center justify-between ${selectedComplaint === c.complaint_id ? "bg-primary/10 text-primary font-medium" : ""}`}
                      >
                        <span className="truncate max-w-[150px]">{c.complaint_id.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground text-[10px]">{c.total}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t text-[10px] text-muted-foreground text-center">
          {complaints.length} complaints · {complaints.reduce((a, c) => a + parseInt(c.total), 0).toLocaleString()} rules
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedComplaint ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a complaint from the left sidebar</p>
              <p className="text-xs mt-1">Browse by system to find any complaint and edit its full clinical pipeline</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div>
                <h1 className="text-base font-semibold capitalize">{selectedComplaint.replace(/_/g, " ")}</h1>
                <p className="text-xs text-muted-foreground">{selectedSystem} · {selectedComplaintData?.total ?? 0} total rules</p>
              </div>
              <div className="flex gap-1.5 flex-wrap ml-2">
                {[
                  { label: "Dx", val: selectedComplaintData?.dx_count },
                  { label: "Workup", val: selectedComplaintData?.workup_count },
                  { label: "Meds", val: selectedComplaintData?.med_count },
                  { label: "Disp", val: selectedComplaintData?.disp_count },
                  { label: "Qs", val: selectedComplaintData?.q_count },
                  { label: "Mod", val: selectedComplaintData?.mod_count },
                  { label: "RF", val: selectedComplaintData?.rf_count },
                ].map(({ label, val }) => (
                  parseInt(val ?? "0") > 0 && (
                    <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0">
                      {label}: {val}
                    </Badge>
                  )
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    data-testid="input-rule-search"
                    placeholder="Search rules…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-7 h-8 text-xs w-48"
                  />
                </div>
                <Button data-testid="btn-add-rule" size="sm" onClick={openNew} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Rule
                </Button>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="border-b flex gap-0 overflow-x-auto flex-shrink-0">
              {RULE_TYPES.map(({ value, label, icon: Icon }) => {
                const cnt = value === "all"
                  ? parseInt(selectedComplaintData?.total ?? "0")
                  : countBadge(selectedComplaintData!, value);
                return (
                  <button
                    key={value}
                    data-testid={`tab-${value}`}
                    onClick={() => { setActiveTab(value); setPage(1); }}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors ${activeTab === value ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {cnt > 0 && <span className="ml-0.5 text-[10px] text-muted-foreground">({cnt})</span>}
                  </button>
                );
              })}
            </div>

            {/* Rules Table */}
            <ScrollArea className="flex-1">
              {loadingRules ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Loading rules…</div>
              ) : rules.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No rules found.{" "}
                  <button onClick={openNew} className="text-primary underline">Add one?</button>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rule Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Safety</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-64">Key Content</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Source</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule, i) => {
                      const keyContent =
                        rule.workup_impact      ? rule.workup_impact.slice(0, 120) :
                        rule.medication_impact  ? rule.medication_impact.slice(0, 120) :
                        rule.disposition_impact ? rule.disposition_impact.slice(0, 120) :
                        rule.logic_description  ? rule.logic_description.slice(0, 120) :
                        rule.notes              ? rule.notes.slice(0, 120) : "—";

                      const typeInfo = RULE_TYPES.find((t) => t.value === rule.rule_type);

                      return (
                        <tr
                          key={rule.rule_id}
                          data-testid={`row-rule-${rule.rule_id}`}
                          className="border-b hover:bg-muted/40 transition-colors"
                        >
                          <td className="px-3 py-2 text-muted-foreground">{(page - 1) * 50 + i + 1}</td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <div className="font-medium truncate" title={rule.rule_name}>{rule.rule_name}</div>
                            {rule.diagnosis_id && <div className="text-muted-foreground text-[10px] truncate">{rule.diagnosis_id}</div>}
                          </td>
                          <td className="px-3 py-2">
                            {typeInfo && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.color}`}>
                                <typeInfo.icon className="h-2.5 w-2.5" />
                                {typeInfo.label}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SAFETY_COLORS[rule.safety_level] ?? "bg-gray-100"}`}>
                              {rule.safety_level}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[260px]">
                            <div className="text-muted-foreground leading-relaxed line-clamp-2" title={keyContent}>{keyContent}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[10px] text-muted-foreground truncate block max-w-[90px]" title={rule.source_tab ?? ""}>
                              {rule.source_tab?.replace("_Diagnosis_Master", "").replace("GLOBAL_", "").slice(0, 16) ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button data-testid={`btn-edit-${rule.rule_id}`} size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(rule)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button data-testid={`btn-delete-${rule.rule_id}`} size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${rule.rule_name}"?`)) deleteRule.mutate(rule.rule_id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0">
                <span className="text-muted-foreground">{totalRules} rules · Page {page}/{totalPages}</span>
                <div className="flex gap-1 ml-auto">
                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edit / Add Rule Modal ── */}
      <Dialog open={!!editRule} onOpenChange={(o) => { if (!o) setEditRule(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add New Rule" : "Edit Rule"}</DialogTitle>
          </DialogHeader>

          {editRule && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Rule Name *</Label>
                  <Input
                    data-testid="input-rule-name"
                    value={editRule.rule_name ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, rule_name: e.target.value })}
                    placeholder="e.g. Pneumonia — CAP"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Rule Type *</Label>
                  <Select value={editRule.rule_type ?? "diagnosis"} onValueChange={(v) => setEditRule({ ...editRule, rule_type: v })}>
                    <SelectTrigger data-testid="select-rule-type" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_TYPES.filter(t => t.value !== "all").map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Safety Level</Label>
                  <Select value={editRule.safety_level ?? "MODERATE"} onValueChange={(v) => setEditRule({ ...editRule, safety_level: v })}>
                    <SelectTrigger data-testid="select-safety-level" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["CRITICAL","HIGH","MODERATE","LOW"].map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Complaint ID *</Label>
                  <Input
                    data-testid="input-complaint-id"
                    value={editRule.complaint_id ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, complaint_id: e.target.value })}
                    placeholder="e.g. chest_pain"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Priority (1=highest)</Label>
                  <Input
                    data-testid="input-priority"
                    type="number" min={1} max={10}
                    value={editRule.priority ?? 5}
                    onChange={(e) => setEditRule({ ...editRule, priority: parseInt(e.target.value) || 5 })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Diagnosis ID / ICD ref</Label>
                  <Input
                    data-testid="input-diagnosis-id"
                    value={editRule.diagnosis_id ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, diagnosis_id: e.target.value || null })}
                    placeholder="e.g. GAS_GERDCL_01"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Cluster ID</Label>
                  <Input
                    data-testid="input-cluster-id"
                    value={editRule.cluster_id ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, cluster_id: e.target.value || null })}
                    placeholder="e.g. gerd_cluster"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Diagnostic Criteria / Logic</Label>
                <Textarea
                  data-testid="textarea-logic"
                  value={editRule.logic_description ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, logic_description: e.target.value || null })}
                  placeholder="Describe when this rule fires…"
                  className="mt-1 text-xs"
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Workup Orders (labs + imaging)</Label>
                <Textarea
                  data-testid="textarea-workup"
                  value={editRule.workup_impact ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, workup_impact: e.target.value || null })}
                  placeholder="e.g. CXR | CBC | BMP | Procalcitonin"
                  className="mt-1 text-xs"
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Medication / Treatment Plan</Label>
                <Textarea
                  data-testid="textarea-medication"
                  value={editRule.medication_impact ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, medication_impact: e.target.value || null })}
                  placeholder="e.g. Amoxicillin 500mg TID x5d | Alternatives: Doxycycline"
                  className="mt-1 text-xs"
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Disposition / ER Criteria</Label>
                <Textarea
                  data-testid="textarea-disposition"
                  value={editRule.disposition_impact ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, disposition_impact: e.target.value || null })}
                  placeholder="e.g. ER if O2 sat <92% or HR >120"
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <div>
                <Label className="text-xs">Notes / Clinical Pearls</Label>
                <Textarea
                  data-testid="textarea-notes"
                  value={editRule.notes ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, notes: e.target.value || null })}
                  placeholder="Additional context, alternatives, pediatric variants…"
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRule(null)}>Cancel</Button>
            <Button
              data-testid="btn-save-rule"
              onClick={() => editRule && saveRule.mutate(editRule)}
              disabled={saveRule.isPending}
            >
              {saveRule.isPending ? "Saving…" : isNew ? "Create Rule" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
