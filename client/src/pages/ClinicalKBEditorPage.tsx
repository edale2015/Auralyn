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
  Sliders, ClipboardList, BookOpen, RefreshCw, CheckSquare,
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
  icd10: string | null;
  diagnostic_criteria: string | null;
  key_questions: string[] | null;
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
  { value: "dx_criteria",    label: "Dx Criteria",      icon: CheckSquare,   color: "bg-indigo-100 text-indigo-700" },
  { value: "diagnosis",      label: "Differentials",    icon: Stethoscope,   color: "bg-blue-100 text-blue-700" },
  { value: "workup",         label: "Workups",          icon: FlaskConical,  color: "bg-purple-100 text-purple-700" },
  { value: "medication",     label: "Medications",      icon: Pill,          color: "bg-green-100 text-green-700" },
  { value: "disposition",    label: "Dispositions",     icon: ClipboardList, color: "bg-orange-100 text-orange-700" },
  { value: "question",       label: "Questions",        icon: HelpCircle,    color: "bg-cyan-100 text-cyan-700" },
  { value: "modifier",       label: "Modifiers",        icon: Sliders,       color: "bg-pink-100 text-pink-700" },
  { value: "red_flag",       label: "Red Flags",        icon: AlertTriangle, color: "bg-red-100 text-red-700" },
  { value: "cluster_scoring",label: "Scoring",          icon: RefreshCw,     color: "bg-yellow-100 text-yellow-700" },
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
  "Toxicology","Trauma","Allergy","Sexual Health","Dental","Environmental","General","Other",
];

const EMPTY_RULE: Partial<Rule> = {
  rule_name: "", rule_type: "diagnosis", complaint_id: "",
  safety_level: "MODERATE", priority: 5, logic_type: "boolean",
  diagnostic_criteria: "", key_questions: [], icd10: "",
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

// ─── Dx Criteria Card ─────────────────────────────────────────────────────────

function DxCriteriaCard({ rule, onEdit }: { rule: Rule; onEdit: (r: Rule) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden mb-3">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid={`dx-card-${rule.rule_id}`}
      >
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${SAFETY_COLORS[rule.safety_level] ?? "bg-gray-100"}`}>
          {rule.safety_level}
        </span>
        <div className="flex-1">
          <span className="font-semibold text-sm">{rule.rule_name}</span>
          {rule.icd10 && <span className="ml-2 text-xs text-muted-foreground font-mono">ICD-10: {rule.icd10}</span>}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit(rule); }}>
          <Pencil className="h-3 w-3" />
        </Button>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>

      {open && (
        <div className="px-4 py-3 space-y-4 bg-white dark:bg-background">
          {rule.diagnostic_criteria ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Diagnostic Criteria</p>
              <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans border-l-4 border-blue-400 pl-3 py-1 bg-blue-50 dark:bg-blue-950/20 rounded-r">
                {rule.diagnostic_criteria}
              </pre>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic border-l-4 border-yellow-400 pl-3 py-1 bg-yellow-50 dark:bg-yellow-950/20 rounded-r">
              No diagnostic criteria entered yet. Click the pencil icon to add criteria for this diagnosis.
            </div>
          )}

          {rule.key_questions && rule.key_questions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Key Questions to Ask</p>
              <ol className="space-y-1.5">
                {rule.key_questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="font-bold text-blue-600 shrink-0">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 pt-1">
            {rule.workup_impact && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-600 mb-1">Workup Orders</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{rule.workup_impact}</p>
              </div>
            )}
            {rule.disposition_impact && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600 mb-1">Disposition</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{rule.disposition_impact}</p>
              </div>
            )}
            {rule.notes && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Clinical Pearls</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{rule.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClinicalKBEditorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expandedSystems, setExpandedSystems]     = useState<Set<string>>(new Set(["Cardiology"]));
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem]       = useState<string>("Cardiology");
  const [activeTab, setActiveTab]                 = useState("dx_criteria");
  const [search, setSearch]                       = useState("");
  const [page, setPage]                           = useState(1);
  const [editRule, setEditRule]                   = useState<Partial<Rule> | null>(null);
  const [isNew, setIsNew]                         = useState(false);
  const [sidebarSearch, setSidebarSearch]         = useState("");
  const [keyQText, setKeyQText]                   = useState("");

  // ── Queries ──

  const { data: complaintsData, isLoading: loadingComplaints } = useQuery<{ complaints: ComplaintRow[] }>({
    queryKey: ["/api/kb-editor/complaints"],
    queryFn: () => authFetch("/api/kb-editor/complaints"),
    staleTime: 60_000,
  });

  const complaints: ComplaintRow[] = complaintsData?.complaints ?? [];

  const bySystem = useMemo(() => {
    const m: Record<string, ComplaintRow[]> = {};
    complaints.forEach((c) => { (m[c.system] ??= []).push(c); });
    return m;
  }, [complaints]);

  const isDxCriteriaTab = activeTab === "dx_criteria";
  const apiRuleType = isDxCriteriaTab ? "diagnosis" : activeTab;

  const { data: rulesData, isLoading: loadingRules } = useQuery<{ rules: Rule[]; total: number; page: number }>({
    queryKey: ["/api/kb-editor/rules", selectedComplaint, apiRuleType, page, search],
    queryFn: () =>
      authFetch(
        `/api/kb-editor/rules?complaint_id=${selectedComplaint ?? ""}&rule_type=${apiRuleType === "all" ? "" : apiRuleType}&page=${page}&limit=50&search=${encodeURIComponent(search)}`
      ),
    enabled: !!selectedComplaint,
    staleTime: 30_000,
  });

  const rules: Rule[] = rulesData?.rules ?? [];
  const totalRules    = rulesData?.total ?? 0;
  const totalPages    = Math.ceil(totalRules / 50);

  // ── Mutations ──

  const saveRule = useMutation({
    mutationFn: async (r: Partial<Rule>) => {
      const payload = {
        ...r,
        key_questions: keyQText.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      if (isNew) return authFetch("/api/kb-editor/rules", { method: "POST", body: JSON.stringify(payload) });
      return authFetch(`/api/kb-editor/rules/${r.rule_id}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/rules"] });
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/complaints"] });
      setEditRule(null);
      toast({ title: isNew ? "Rule created" : "Rule saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: (rule_id: string) => authFetch(`/api/kb-editor/rules/${rule_id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb-editor/rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  // ── Helpers ──

  function openEdit(rule: Rule) {
    setIsNew(false);
    setEditRule({ ...rule });
    setKeyQText((rule.key_questions ?? []).join("\n"));
  }

  function openNew() {
    setIsNew(true);
    const rt = activeTab === "all" || activeTab === "dx_criteria" ? "diagnosis" : activeTab;
    setEditRule({ ...EMPTY_RULE, complaint_id: selectedComplaint ?? "", rule_type: rt });
    setKeyQText("");
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
    setActiveTab("dx_criteria");
    setPage(1);
    setSearch("");
  }

  const selectedComplaintData = complaints.find((c) => c.complaint_id === selectedComplaint);
  const filteredSystems = SYSTEM_ORDER.filter((s) => bySystem[s]?.length > 0);

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
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedComplaint ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Stethoscope className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a complaint from the left to view and edit its clinical rules.</p>
            <p className="text-xs opacity-60">Start with a system (e.g. Cardiology → chest pain)</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="flex-1">
                <h3 className="font-semibold capitalize">{selectedComplaint.replace(/_/g, " ")}</h3>
                <p className="text-xs text-muted-foreground">{selectedComplaintData?.system} · {totalRules} rules</p>
              </div>
              <Button data-testid="btn-add-rule" size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
              </Button>
            </div>

            {/* Tab bar */}
            <div className="border-b flex overflow-x-auto flex-shrink-0">
              {RULE_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  data-testid={`tab-${value}`}
                  onClick={() => { setActiveTab(value); setPage(1); }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors ${activeTab === value ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="px-4 py-2 border-b flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  data-testid="input-rule-search"
                  placeholder="Search rules…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-xs w-64"
                />
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              {loadingRules ? (
                <div className="p-6 text-xs text-muted-foreground">Loading rules…</div>
              ) : rules.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p className="text-sm">No rules found for this complaint in this category.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={openNew}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add First Rule
                  </Button>
                </div>
              ) : isDxCriteriaTab ? (
                /* ── Dx Criteria View ── */
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-semibold">Diagnostic Criteria — {selectedComplaint.replace(/_/g, " ")}</span>
                    <Badge variant="outline" className="text-[10px]">{rules.length} diagnoses</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Each card below shows the clinical criteria required to consider this diagnosis, plus the key questions to ask. Click any card to expand, or the pencil to edit.
                  </p>
                  {rules.map((rule) => (
                    <DxCriteriaCard key={rule.rule_id} rule={rule} onEdit={openEdit} />
                  ))}
                </div>
              ) : (
                /* ── Standard Table View ── */
                <>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium w-8">#</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Name</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium w-24">Type</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium w-20">Safety</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">Key Content</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium w-24">Source</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium w-16">Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule, i) => {
                        const typeInfo = RULE_TYPES.find((t) => t.value === rule.rule_type);
                        const keyContent = rule.diagnostic_criteria
                          ? rule.diagnostic_criteria.slice(0, 120)
                          : rule.logic_description
                          ? rule.logic_description.slice(0, 120)
                          : rule.workup_impact
                          ? rule.workup_impact.slice(0, 120)
                          : rule.medication_impact?.slice(0, 120) ?? "—";
                        return (
                          <tr
                            key={rule.rule_id}
                            data-testid={`row-rule-${rule.rule_id}`}
                            className="border-b hover:bg-muted/40 transition-colors"
                          >
                            <td className="px-3 py-2 text-muted-foreground">{(page - 1) * 50 + i + 1}</td>
                            <td className="px-3 py-2 max-w-[200px]">
                              <div className="font-medium truncate" title={rule.rule_name}>{rule.rule_name}</div>
                              {rule.icd10 && <div className="text-muted-foreground text-[10px] font-mono">{rule.icd10}</div>}
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
                              <span className="text-[10px] text-muted-foreground truncate block max-w-[90px]">
                                {rule.source_tab?.replace("_Diagnosis_Master","").replace("GLOBAL_","").slice(0,16) ?? "—"}
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

                  {totalPages > 1 && (
                    <div className="border-t px-4 py-2 flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{totalRules} rules · Page {page}/{totalPages}</span>
                      <div className="flex gap-1 ml-auto">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </ScrollArea>
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
                    placeholder="e.g. STEMI — Urgent Cardiac Cath"
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
                      {RULE_TYPES.filter(t => t.value !== "all" && t.value !== "dx_criteria").map((t) => (
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
                  <Label className="text-xs">ICD-10 Code</Label>
                  <Input
                    data-testid="input-icd10"
                    value={editRule.icd10 ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, icd10: e.target.value || null })}
                    placeholder="e.g. I21.9"
                    className="mt-1 font-mono"
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
                  <Label className="text-xs">Diagnosis ID / Cluster</Label>
                  <Input
                    data-testid="input-diagnosis-id"
                    value={editRule.diagnosis_id ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, diagnosis_id: e.target.value || null })}
                    placeholder="e.g. STEMI"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* ── Diagnostic Criteria — TOP for diagnosis rules ── */}
              {(editRule.rule_type === "diagnosis" || !editRule.rule_type) && (
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-950/10">
                  <Label className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                    Diagnostic Criteria — When does this diagnosis apply?
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">
                    List the specific clinical findings required (e.g. "ST elevation ≥1mm in ≥2 contiguous leads + ongoing chest pain despite nitrates")
                  </p>
                  <Textarea
                    data-testid="textarea-diagnostic-criteria"
                    value={editRule.diagnostic_criteria ?? ""}
                    onChange={(e) => setEditRule({ ...editRule, diagnostic_criteria: e.target.value || null })}
                    placeholder={"e.g.\n1. Chest pain despite maximum medical therapy\n2. ST elevation ≥1mm in ≥2 contiguous leads (or new LBBB)\n3. Hemodynamically unstable OR signs of heart failure\n4. Recent MI within 12 hours"}
                    className="mt-1 text-xs font-mono"
                    rows={5}
                  />
                </div>
              )}

              {/* ── Key Questions ── */}
              {(editRule.rule_type === "diagnosis" || !editRule.rule_type) && (
                <div className="border border-cyan-200 rounded-lg p-3 bg-cyan-50/50 dark:bg-cyan-950/10">
                  <Label className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                    Key Questions to Ask (one per line)
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">
                    The questions that must be answered to evaluate this diagnosis. Each line = one question.
                  </p>
                  <Textarea
                    data-testid="textarea-key-questions"
                    value={keyQText}
                    onChange={(e) => setKeyQText(e.target.value)}
                    placeholder={"Is chest pain ongoing despite nitrates?\nIs there ST elevation on EKG?\nIs the patient hemodynamically unstable?"}
                    className="mt-1 text-xs"
                    rows={5}
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">Workup Orders (labs + imaging)</Label>
                <Textarea
                  data-testid="textarea-workup"
                  value={editRule.workup_impact ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, workup_impact: e.target.value || null })}
                  placeholder="e.g. STAT EKG | Troponin I/T | BMP | CXR | Echocardiogram"
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
                  placeholder="e.g. Aspirin 325mg STAT | Heparin IV | Clopidogrel 600mg"
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
                  placeholder="e.g. IMMEDIATE: Activate cath lab. Goal door-to-balloon <90 min."
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <div>
                <Label className="text-xs">Clinical Pearls / Notes</Label>
                <Textarea
                  data-testid="textarea-notes"
                  value={editRule.notes ?? ""}
                  onChange={(e) => setEditRule({ ...editRule, notes: e.target.value || null })}
                  placeholder="Cannot-miss notes, scoring tools, pediatric variants, contraindications…"
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
