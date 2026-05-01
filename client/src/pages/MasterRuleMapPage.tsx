import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import {
  Map, AlertTriangle, CheckCircle2, RefreshCw, Download,
  ShieldCheck, FileBarChart2, Search, ChevronRight, Loader2,
  ClipboardList, Pill, HelpCircle, Stethoscope, Activity,
  ListTree, Play, ChevronDown, ChevronUp, ArrowRight,
  Zap, Filter, BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function scoreBadge(score: number) {
  if (score >= 80) return <Badge className="bg-green-600 text-white" data-testid="badge-score-green">{score}%</Badge>;
  if (score >= 40) return <Badge className="bg-yellow-500 text-white" data-testid="badge-score-yellow">{score}%</Badge>;
  return <Badge className="bg-red-600 text-white" data-testid="badge-score-red">{score}%</Badge>;
}

function severityBadge(sev: string) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-700 text-white",
    HIGH:     "bg-orange-500 text-white",
    MEDIUM:   "bg-yellow-500 text-white",
    LOW:      "bg-slate-400 text-white",
  };
  return <Badge className={map[sev] ?? "bg-slate-400 text-white"}>{sev}</Badge>;
}

function CoverageBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: any }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Complaints", value: data.total, icon: <ClipboardList className="h-5 w-5 text-blue-500" /> },
          { label: "Fully Complete",   value: data.fullyComplete, icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
          { label: "Avg Coverage",     value: `${data.avgScore}%`, icon: <Activity className="h-5 w-5 text-purple-500" /> },
          { label: "Systems",          value: data.systems?.length ?? 0, icon: <Stethoscope className="h-5 w-5 text-indigo-500" /> },
        ].map(stat => (
          <Card key={stat.label} data-testid={`stat-${stat.label.toLowerCase().replace(/ /g, "-")}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">{stat.icon}<span className="text-xs text-muted-foreground">{stat.label}</span></div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.systems ?? []).map((sys: any) => (
          <Card key={sys.system} data-testid={`system-card-${sys.system}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="font-semibold">{sys.system}</span>
                {scoreBadge(sys.avgScore)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CoverageBar score={sys.avgScore} />
              <div className="text-xs text-muted-foreground">
                {sys.completeCount} / {sys.totalComplaints} complaints fully covered
              </div>
              <div className="divide-y text-xs">
                {sys.complaints.slice(0, 5).map((c: any) => (
                  <div key={c.complaint_id} className="flex items-center justify-between py-1 gap-2" data-testid={`row-complaint-${c.complaint_id}`}>
                    <span className="truncate text-muted-foreground">{c.label}</span>
                    {scoreBadge(c.completeness_score)}
                  </div>
                ))}
                {sys.complaints.length > 5 && (
                  <div className="text-muted-foreground py-1">+{sys.complaints.length - 5} more…</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Drill-down tab ────────────────────────────────────────────────────────────
function DrillDownTab() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: summary } = useQuery<any>({ queryKey: ["/api/rule-map/summary"] });

  const allComplaints: any[] = (summary?.systems ?? []).flatMap((s: any) => s.complaints);
  const filtered = search
    ? allComplaints.filter(c =>
        c.complaint_id.toLowerCase().includes(search.toLowerCase()) ||
        c.label.toLowerCase().includes(search.toLowerCase())
      )
    : allComplaints;

  const { data: detail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/rule-map/complaint", selectedId],
    enabled: !!selectedId,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Complaint selector */}
      <div className="md:col-span-1 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-complaint"
            placeholder="Search complaints…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="border rounded-md overflow-y-auto max-h-[55vh] divide-y text-sm">
          {filtered.slice(0, 80).map((c: any) => (
            <button
              key={c.complaint_id}
              data-testid={`btn-complaint-${c.complaint_id}`}
              onClick={() => setSelectedId(c.complaint_id)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-muted transition-colors ${
                selectedId === c.complaint_id ? "bg-muted font-semibold" : ""
              }`}
            >
              <span className="truncate">{c.label}</span>
              <ChevronRight className="h-3 w-3 shrink-0 ml-1 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-muted-foreground text-center">No matches</div>
          )}
        </div>
      </div>

      {/* Rule chain detail */}
      <div className="md:col-span-2">
        {!selectedId && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Select a complaint to view its full rule chain
          </div>
        )}
        {selectedId && detailLoading && (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" />Loading…</div>
        )}
        {selectedId && detail && (
          <div className="space-y-3">
            {/* Coverage header */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold">{detail.coverage?.label}</div>
                    <div className="text-xs text-muted-foreground">{detail.coverage?.complaint_id} · {detail.coverage?.system}</div>
                  </div>
                  {scoreBadge(detail.coverage?.completeness_score)}
                </div>
                <CoverageBar score={detail.coverage?.completeness_score ?? 0} />
                <div className="grid grid-cols-5 mt-3 text-center text-xs gap-1">
                  {[
                    { label: "Red Flags",   val: detail.coverage?.red_flag_count,   icon: <AlertTriangle className="h-3 w-3 text-red-500 mx-auto" /> },
                    { label: "Diagnoses",   val: detail.coverage?.diagnosis_count,  icon: <Stethoscope className="h-3 w-3 text-blue-500 mx-auto" /> },
                    { label: "Treatments",  val: detail.coverage?.treatment_count,  icon: <Pill className="h-3 w-3 text-green-500 mx-auto" /> },
                    { label: "Questions",   val: detail.coverage?.question_count,   icon: <HelpCircle className="h-3 w-3 text-purple-500 mx-auto" /> },
                    { label: "Dispositions",val: detail.coverage?.disposition_count,icon: <FileBarChart2 className="h-3 w-3 text-indigo-500 mx-auto" /> },
                  ].map(item => (
                    <div key={item.label} className="border rounded p-2">
                      {item.icon}
                      <div className="font-bold text-sm mt-0.5">{item.val}</div>
                      <div className="text-muted-foreground">{item.label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Accordion type="multiple" className="space-y-2">
              {/* Red Flags */}
              <AccordionItem value="rf" className="border rounded-md">
                <AccordionTrigger className="px-4 py-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Red Flag Rules ({detail.redFlags?.length ?? 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  {(detail.redFlags ?? []).length === 0
                    ? <div className="text-red-500 text-sm">⚠ No red flags defined — coverage gap</div>
                    : <Table>
                        <TableHeader><TableRow>
                          <TableHead>Label</TableHead><TableHead>Severity</TableHead><TableHead>Action</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {detail.redFlags.map((r: any) => (
                            <TableRow key={r.rule_id} data-testid={`row-rf-${r.rule_id}`}>
                              <TableCell className="text-xs">{r.label}</TableCell>
                              <TableCell><Badge variant="outline">{r.severity}</Badge></TableCell>
                              <TableCell className="text-xs">{r.action}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  }
                </AccordionContent>
              </AccordionItem>

              {/* Diagnoses */}
              <AccordionItem value="dx" className="border rounded-md">
                <AccordionTrigger className="px-4 py-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-blue-500" />
                    Diagnoses ({detail.diagnoses?.length ?? 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  {(detail.diagnoses ?? []).length === 0
                    ? <div className="text-orange-500 text-sm">⚠ No diagnoses — clinical brain is blind</div>
                    : <Table>
                        <TableHeader><TableRow>
                          <TableHead>Diagnosis</TableHead><TableHead>ICD</TableHead>
                          <TableHead>Can't-Miss</TableHead><TableHead>Prior</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {detail.diagnoses.map((d: any) => (
                            <TableRow key={d.rule_id} data-testid={`row-dx-${d.rule_id}`}>
                              <TableCell className="text-xs">{d.diagnosis_label}</TableCell>
                              <TableCell className="text-xs font-mono">{d.icd_code}</TableCell>
                              <TableCell>{d.cannot_miss ? <Badge className="bg-red-100 text-red-700">✓</Badge> : "–"}</TableCell>
                              <TableCell className="text-xs">{((d.base_probability ?? 0) * 100).toFixed(0)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  }
                </AccordionContent>
              </AccordionItem>

              {/* Treatments */}
              <AccordionItem value="tx" className="border rounded-md">
                <AccordionTrigger className="px-4 py-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-green-500" />
                    Treatments ({detail.treatments?.length ?? 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  {(detail.treatments ?? []).length === 0
                    ? <div className="text-yellow-600 text-sm">⚠ No treatment rules — prescribing brain is empty</div>
                    : <Table>
                        <TableHeader><TableRow>
                          <TableHead>Medication</TableHead><TableHead>Group</TableHead>
                          <TableHead>1st Line</TableHead><TableHead>Route</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {detail.treatments.map((t: any) => (
                            <TableRow key={t.rule_id} data-testid={`row-tx-${t.rule_id}`}>
                              <TableCell className="text-xs font-medium">{t.medication_name}</TableCell>
                              <TableCell className="text-xs">{t.medication_group}</TableCell>
                              <TableCell>{t.is_first_line ? <Badge className="bg-green-100 text-green-700">✓</Badge> : "–"}</TableCell>
                              <TableCell className="text-xs">{t.route}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  }
                </AccordionContent>
              </AccordionItem>

              {/* Questions */}
              <AccordionItem value="q" className="border rounded-md">
                <AccordionTrigger className="px-4 py-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-purple-500" />
                    Intake Questions ({detail.questions?.length ?? 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="space-y-1 text-xs">
                    {(detail.questions ?? []).map((q: any) => (
                      <div key={q.question_id} className="flex items-start gap-2 py-1 border-b last:border-0" data-testid={`row-q-${q.question_id}`}>
                        <Badge variant="outline" className="shrink-0">{q.type}</Badge>
                        <span>{q.prompt}</span>
                        {q.required && <Badge className="shrink-0 bg-blue-100 text-blue-700">Required</Badge>}
                      </div>
                    ))}
                    {(detail.questions ?? []).length === 0 && (
                      <div className="text-yellow-600">⚠ No intake questions — intake will be generic</div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Dispositions */}
              <AccordionItem value="dp" className="border rounded-md">
                <AccordionTrigger className="px-4 py-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <FileBarChart2 className="h-4 w-4 text-indigo-500" />
                    Disposition Rules ({detail.dispositions?.length ?? 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="space-y-1 text-xs">
                    {(detail.dispositions ?? []).map((d: any) => (
                      <div key={d.rule_id} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`row-dp-${d.rule_id}`}>
                        <span className="font-mono text-muted-foreground">{d.when_expr}</span>
                        <Badge variant="outline">{d.disposition_level}</Badge>
                      </div>
                    ))}
                    {(detail.dispositions ?? []).length === 0 && (
                      <div className="text-yellow-600">⚠ No disposition rules — falling back to defaults</div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────
function GapsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/rule-map/gaps"] });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" />Loading gaps…</div>;

  const gaps: any[] = data?.gaps ?? [];

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">{data?.count ?? 0} complaints below 80% coverage</div>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead>System</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>RF</TableHead>
              <TableHead>Dx</TableHead>
              <TableHead>Tx</TableHead>
              <TableHead>Qs</TableHead>
              <TableHead>Dp</TableHead>
              <TableHead>Gaps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.map((g: any) => {
              const flags = g.gap_flags ?? {};
              const gapList = Object.entries(flags)
                .filter(([, v]) => v === true)
                .map(([k]) => k.replace("missing_", "").replace("_", " "));
              return (
                <TableRow key={g.complaint_id} data-testid={`row-gap-${g.complaint_id}`}>
                  <TableCell className="text-xs font-medium">{g.label}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{g.system}</Badge></TableCell>
                  <TableCell>{scoreBadge(g.completeness_score)}</TableCell>
                  <TableCell className="text-center text-xs">{g.red_flag_count}</TableCell>
                  <TableCell className="text-center text-xs">{g.diagnosis_count}</TableCell>
                  <TableCell className="text-center text-xs">{g.treatment_count}</TableCell>
                  <TableCell className="text-center text-xs">{g.question_count}</TableCell>
                  <TableCell className="text-center text-xs">{g.disposition_count}</TableCell>
                  <TableCell className="text-xs text-red-500">{gapList.join(", ")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Validator tab ─────────────────────────────────────────────────────────────
function ValidatorTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const validate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rule-map/validate"),
    onSuccess: () => {
      toast({ title: "Validation complete", description: "Results written to VALIDATION_REPORT sheet tab." });
      qc.invalidateQueries({ queryKey: ["/api/rule-map/validate-result"] });
    },
  });

  const exportMap = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rule-map/export-to-sheets"),
    onSuccess: () => toast({ title: "Exported", description: "MASTER_RULE_MAP tab updated in Google Sheets." }),
  });

  const processFeedback = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rlhf/process-feedback"),
    onSuccess: (data: any) => {
      toast({
        title: "RLHF batch complete",
        description: `Processed ${data.processedCases} cases · ${data.reinforced} reinforced · ${data.penalized} penalized`,
      });
    },
  });

  const { data: rlhfStatus } = useQuery<any>({ queryKey: ["/api/rlhf/learning-status"] });

  const [validateResult, setValidateResult] = useState<any>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Auto-Validator */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />Auto-Validator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scans all complaints for coverage gaps and writes results to the VALIDATION_REPORT Google Sheet tab.
            </p>
            <Button
              data-testid="button-run-validator"
              onClick={() => validate.mutateAsync(undefined).then(d => setValidateResult(d))}
              disabled={validate.isPending}
              className="w-full"
            >
              {validate.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Run Validator
            </Button>
          </CardContent>
        </Card>

        {/* Sheet Exporter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Download className="h-4 w-4 text-green-500" />Sheet Exporter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Refreshes the MASTER_RULE_MAP tab in Google Sheets with all 89 complaint coverage rows.
            </p>
            <Button
              data-testid="button-export-sheets"
              onClick={() => exportMap.mutate()}
              disabled={exportMap.isPending}
              variant="outline"
              className="w-full"
            >
              {exportMap.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Export to Sheets
            </Button>
          </CardContent>
        </Card>

        {/* RLHF */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-purple-500" />RLHF Auto-Learner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Processes physician override events and reinforces/penalizes rule weights automatically.
            </p>
            <div className="flex gap-2 text-xs">
              <div className="border rounded p-2 flex-1 text-center">
                <div className="font-bold text-purple-600">{rlhfStatus?.totalWeightEvents ?? "–"}</div>
                <div className="text-muted-foreground">Weight events</div>
              </div>
              <div className="border rounded p-2 flex-1 text-center">
                <div className="font-bold text-blue-600">{rlhfStatus?.totalLearningEvents ?? "–"}</div>
                <div className="text-muted-foreground">Learning events</div>
              </div>
            </div>
            <Button
              data-testid="button-process-feedback"
              onClick={() => processFeedback.mutate()}
              disabled={processFeedback.isPending}
              variant="outline"
              className="w-full"
            >
              {processFeedback.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Process Feedback
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RLHF avg probability */}
      {rlhfStatus?.avgProbabilityBySystem?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avg Diagnosis Probability by System (RLHF-tuned)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {rlhfStatus.avgProbabilityBySystem.slice(0, 12).map((row: any) => (
                <div key={row.system} className="border rounded p-2 flex items-center justify-between" data-testid={`rlhf-sys-${row.system}`}>
                  <span className="font-mono text-muted-foreground">{row.system}</span>
                  <Badge variant="outline">{(row.avg_prob * 100).toFixed(1)}%</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation results */}
      {validateResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Validation Report — {new Date(validateResult.validatedAt).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-3 text-xs text-center">
              {[
                { label: "CRITICAL", val: validateResult.criticalCount, cls: "bg-red-100 text-red-700" },
                { label: "HIGH",     val: validateResult.highCount,     cls: "bg-orange-100 text-orange-700" },
                { label: "MEDIUM",   val: validateResult.mediumCount,   cls: "bg-yellow-100 text-yellow-700" },
                { label: "LOW",      val: validateResult.lowCount,      cls: "bg-slate-100 text-slate-600" },
              ].map(s => (
                <div key={s.label} className={`rounded p-2 ${s.cls}`}>
                  <div className="text-xl font-bold">{s.val}</div>
                  <div>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(validateResult.issues ?? []).slice(0, 50).map((issue: any, i: number) => (
                    <TableRow key={i} data-testid={`row-issue-${i}`}>
                      <TableCell className="text-xs">{issue.complaint_id}</TableCell>
                      <TableCell className="text-xs">{issue.rule_type}</TableCell>
                      <TableCell>{severityBadge(issue.severity)}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{issue.issue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ZIP download */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4 text-slate-500" />Full Codebase Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Downloads the complete Auralyn codebase as a ZIP archive (excludes node_modules, .git, dist).
          </p>
          <a href="/api/export/codebase-zip" download>
            <Button data-testid="button-download-zip" variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />Download Auralyn.zip
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Rules Catalog tab ─────────────────────────────────────────────────────────
const RULE_TYPES = ["red_flag","diagnosis","cluster_scoring","medication","disposition","modifier","question","workup","plan"];
const SAFETY_LEVELS = ["CRITICAL","HIGH","MODERATE","LOW"];

function safetyBadge(level: string) {
  const map: Record<string,string> = {
    CRITICAL: "bg-red-700 text-white",
    HIGH:     "bg-orange-500 text-white",
    MODERATE: "bg-yellow-500 text-white",
    LOW:      "bg-slate-400 text-white",
  };
  return <Badge className={`text-xs ${map[level] ?? "bg-slate-400 text-white"}`}>{level}</Badge>;
}
function ruleTypeBadge(t: string) {
  const map: Record<string,string> = {
    red_flag:       "bg-red-100 text-red-700 border-red-200",
    diagnosis:      "bg-blue-100 text-blue-700 border-blue-200",
    cluster_scoring:"bg-purple-100 text-purple-700 border-purple-200",
    medication:     "bg-green-100 text-green-700 border-green-200",
    disposition:    "bg-indigo-100 text-indigo-700 border-indigo-200",
    modifier:       "bg-amber-100 text-amber-700 border-amber-200",
    question:       "bg-cyan-100 text-cyan-700 border-cyan-200",
    workup:         "bg-pink-100 text-pink-700 border-pink-200",
    plan:           "bg-teal-100 text-teal-700 border-teal-200",
  };
  return <Badge variant="outline" className={`text-xs font-mono ${map[t] ?? ""}`}>{t.replace("_"," ")}</Badge>;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

function RulesTab() {
  const { toast } = useToast();
  const [filterType,     setFilterType]     = useState<string>("all");
  const [filterSafety,   setFilterSafety]   = useState<string>("all");
  const [filterComplaint,setFilterComplaint] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    limit: "40",
    ...(filterType !== "all" && { rule_type: filterType }),
    ...(filterSafety !== "all" && { safety_level: filterSafety }),
    ...(filterComplaint && { complaint_id: filterComplaint }),
  });

  const { data: statsData } = useQuery<any>({
    queryKey: ["/api/master-rules/stats"],
    queryFn: async () => {
      const r = await fetch("/api/master-rules/stats", { credentials: "include", headers: authHeaders() });
      return r.json();
    },
  });
  const { data: listData, isLoading } = useQuery<any>({
    queryKey: ["/api/master-rules", filterType, filterSafety, filterComplaint, page],
    queryFn: async () => {
      const r = await fetch(`/api/master-rules?${params}`, { credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders() } });
      return r.json();
    },
  });

  const exportRules = useMutation({
    mutationFn: () => fetch("/api/master-rules/export-to-sheets", {
      method: "POST", credentials: "include", headers: authHeaders(),
    }),
    onSuccess: () => toast({ title: "Exported", description: "MASTER_RULE_MAP tab updated with 27-column structure." }),
  });

  const stats = statsData?.stats;
  const rules: any[] = listData?.rules ?? [];
  const total = listData?.total ?? 0;
  const totalPages = Math.ceil(total / 40);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 text-xs">
          {[
            { label: "Total",     val: stats.total,          cls: "text-slate-700" },
            { label: "Critical",  val: stats.critical,        cls: "text-red-600 font-bold" },
            { label: "Red Flags", val: stats.red_flags,       cls: "text-red-500" },
            { label: "Diagnoses", val: stats.diagnoses,       cls: "text-blue-600" },
            { label: "Meds",      val: stats.medications,     cls: "text-green-600" },
            { label: "Disp",      val: stats.dispositions,    cls: "text-indigo-600" },
            { label: "Modifiers", val: stats.modifiers,       cls: "text-amber-600" },
            { label: "Clusters",  val: stats.cluster_scoring, cls: "text-purple-600" },
          ].map(s => (
            <div key={s.label} className="border rounded p-2 text-center">
              <div className={`text-lg font-bold ${s.cls}`}>{s.val}</div>
              <div className="text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
          <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-rule-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSafety} onValueChange={v => { setFilterSafety(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-safety-level">
            <SelectValue placeholder="All safety" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All safety</SelectItem>
            {SAFETY_LEVELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          data-testid="input-filter-complaint"
          placeholder="Filter by complaint_id…"
          className="h-8 text-xs w-44"
          value={filterComplaint}
          onChange={e => { setFilterComplaint(e.target.value); setPage(1); }}
        />
        <span className="text-xs text-muted-foreground ml-auto">{total} rules</span>
        <Button
          data-testid="button-export-master-rules"
          size="sm" variant="outline"
          onClick={() => exportRules.mutate()}
          disabled={exportRules.isPending}
        >
          {exportRules.isPending ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Download className="h-3 w-3 mr-1" />}
          Export 27-col Sheet
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rule table */}
        <div className="md:col-span-2 border rounded-md overflow-hidden">
          {isLoading
            ? <div className="p-4 flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" />Loading rules…</div>
            : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-32">Rule ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>P</TableHead>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Safety</TableHead>
                    <TableHead>Flow</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r: any) => (
                    <TableRow
                      key={r.rule_id}
                      className={`cursor-pointer hover:bg-muted text-xs ${selected?.rule_id === r.rule_id ? "bg-muted" : ""}`}
                      onClick={() => setSelected(r)}
                      data-testid={`row-rule-${r.rule_id}`}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.rule_id.slice(0,14)}</TableCell>
                      <TableCell className="max-w-[160px] truncate font-medium">{r.rule_name}</TableCell>
                      <TableCell>{ruleTypeBadge(r.rule_type)}</TableCell>
                      <TableCell className="text-center">{r.priority}</TableCell>
                      <TableCell className="font-mono text-xs">{r.complaint_id === "ALL" ? <span className="text-muted-foreground">ALL</span> : r.complaint_id}</TableCell>
                      <TableCell>{safetyBadge(r.safety_level)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.source_tab?.split(" ")[0]} <ArrowRight className="h-3 w-3 inline" /> {(r.target_tabs ?? [])[0]?.split(" ")[0]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-2 border-t text-xs">
              <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Prev</Button>
              <span>{page} / {totalPages}</span>
              <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}>Next →</Button>
            </div>
          )}
        </div>

        {/* Rule detail panel */}
        <div className="border rounded-md overflow-y-auto max-h-[65vh]">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
              <div><BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />Click a rule to see all 27 fields</div>
            </div>
          ) : (
            <div className="p-3 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-sm">{selected.rule_name}</div>
                  <div className="font-mono text-muted-foreground">{selected.rule_id}</div>
                </div>
                {safetyBadge(selected.safety_level)}
              </div>
              <div className="flex flex-wrap gap-1">
                {ruleTypeBadge(selected.rule_type)}
                <Badge variant="outline">P{selected.priority}</Badge>
                <Badge variant="outline">{selected.version}</Badge>
              </div>
              {[
                ["Complaint", selected.complaint_id],
                ["Cluster", selected.cluster_id],
                ["Diagnosis", selected.diagnosis_id],
                ["Logic type", selected.logic_type],
                ["Source tab", selected.source_tab],
                ["Target tabs", (selected.target_tabs ?? []).join(", ")],
                ["Disposition impact", selected.disposition_impact],
                ["Medication impact", selected.medication_impact],
                ["Workup impact", selected.workup_impact],
                ["Confidence weight", selected.confidence_weight],
                ["Owner", selected.owner],
                ["Last updated", selected.last_updated ? new Date(selected.last_updated).toLocaleDateString() : "—"],
              ].map(([label, val]) => val ? (
                <div key={String(label)} className="flex gap-1">
                  <span className="text-muted-foreground w-32 shrink-0">{label}:</span>
                  <span className="font-medium break-all">{String(val)}</span>
                </div>
              ) : null)}
              {selected.logic_description && (
                <div className="border-t pt-2">
                  <div className="text-muted-foreground mb-1">Logic:</div>
                  <div className="bg-muted/50 rounded p-2 font-mono text-xs whitespace-pre-wrap">{selected.logic_description}</div>
                </div>
              )}
              {selected.notes && (
                <div className="border-t pt-2 text-muted-foreground italic">{selected.notes}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Simulator tab ─────────────────────────────────────────────────────
const STEP_COLORS: Record<number, string> = {
  1: "border-l-slate-400",  2: "border-l-amber-400",
  3: "border-l-cyan-400",   4: "border-l-cyan-300",
  5: "border-l-red-500",    6: "border-l-purple-500",
  7: "border-l-blue-500",   8: "border-l-indigo-500",
  9: "border-l-teal-500",   10: "border-l-green-500",
  11: "border-l-green-400", 12: "border-l-emerald-500",
  13: "border-l-slate-600",
};

function PipelineTab() {
  const { toast } = useToast();
  const [complaintId, setComplaintId] = useState("chest_pain");
  const [inputsJson, setInputsJson] = useState(`{"O2_sat": 89, "fever": "yes", "diaphoresis": "yes"}`);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([5, 7, 8]));

  const pipelineQuery = useQuery<any>({
    queryKey: ["/api/master-rules/pipeline", complaintId],
    queryFn: async () => {
      const r = await fetch(`/api/master-rules/pipeline/${encodeURIComponent(complaintId)}`, { credentials: "include", headers: authHeaders() });
      return r.json();
    },
    enabled: !!complaintId,
  });

  const dryRun = useMutation({
    mutationFn: async (vars: { complaint_id: string; inputs: any }) => {
      const res = await fetch("/api/master-rules/dry-run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(vars),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      if (data.hardStop) toast({ title: "Hard Stop!", description: data.hardStopReason ?? "", variant: "destructive" });
    },
    onError: () => toast({ title: "Dry-run failed", variant: "destructive" }),
  });

  function handleRun() {
    try {
      const parsed = JSON.parse(inputsJson);
      setJsonError(null);
      dryRun.mutate({ complaint_id: complaintId, inputs: parsed });
    } catch {
      setJsonError("Invalid JSON — check your inputs object");
    }
  }

  function toggleExpand(step: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(step) ? n.delete(step) : n.add(step); return n; });
  }

  const pipeline = pipelineQuery.data?.pipeline ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {/* Left: pipeline structure for complaint */}
      <div className="md:col-span-2 space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListTree className="h-4 w-4 text-indigo-500" />13-Step Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex gap-2">
              <Input
                data-testid="input-pipeline-complaint"
                value={complaintId}
                onChange={e => setComplaintId(e.target.value)}
                placeholder="complaint_id"
                className="h-7 text-xs"
              />
            </div>
            {pipelineQuery.isLoading
              ? <div className="flex items-center gap-1 text-muted-foreground"><Loader2 className="animate-spin h-3 w-3" />Loading…</div>
              : (
                <div className="space-y-1">
                  {/* Step 1 */}
                  <div className={`border-l-4 border-l-slate-400 pl-2 py-1 rounded-r`}>
                    <div className="font-semibold">Step 1 — Complaint Identification</div>
                    <div className="text-muted-foreground">complaint_id: {complaintId}</div>
                  </div>
                  {pipeline.map((step: any) => (
                    <div key={step.ruleType} className={`border-l-4 ${STEP_COLORS[step.step] ?? "border-l-slate-300"} pl-2 py-1 rounded-r`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Step {step.step} — {step.stepName}</span>
                        <Badge variant="outline" className="text-xs">{step.count}</Badge>
                      </div>
                      <div className="text-muted-foreground">{step.ruleType.replace("_"," ")}</div>
                    </div>
                  ))}
                  <div className={`border-l-4 border-l-slate-600 pl-2 py-1 rounded-r`}>
                    <div className="font-semibold">Step 13 — Audit Trail</div>
                    <div className="text-muted-foreground">immutable log</div>
                  </div>
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Dry-run input */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4 text-green-500" />Dry-Run Simulator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground">Patient inputs as JSON:</div>
            <Textarea
              data-testid="input-dry-run-json"
              value={inputsJson}
              onChange={e => setInputsJson(e.target.value)}
              rows={6}
              className="text-xs font-mono"
              placeholder='{"O2_sat": 89, "fever": "yes"}'
            />
            {jsonError && <div className="text-red-500 text-xs">{jsonError}</div>}
            <Button
              data-testid="button-dry-run"
              onClick={handleRun}
              disabled={dryRun.isPending}
              className="w-full"
              size="sm"
            >
              {dryRun.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Execute Pipeline
            </Button>
            <div className="text-xs text-muted-foreground border rounded p-2 space-y-1 font-mono">
              <div className="font-semibold text-foreground">Example inputs:</div>
              <div>O2_sat: 89 → triggers hypoxia red flag</div>
              <div>fever: "yes" → scores pneumonia cluster</div>
              <div>diaphoresis: "yes" → ACS flag</div>
              <div>pregnancy_confirmed: true → blocks meds</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: execution trace */}
      <div className="md:col-span-3">
        {!result && !dryRun.isPending && (
          <div className="h-full flex items-center justify-center border rounded-lg text-muted-foreground text-sm p-8 text-center">
            <div>
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
              Enter patient inputs and click Execute Pipeline to see which rules fire at each step.
            </div>
          </div>
        )}
        {dryRun.isPending && (
          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
            <Loader2 className="animate-spin h-5 w-5" />Executing 13-step pipeline…
          </div>
        )}
        {result && (
          <div className="space-y-3">
            {/* Summary banner */}
            <Card className={result.hardStop ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-green-500 bg-green-50 dark:bg-green-950"}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.hardStop
                      ? <AlertTriangle className="h-5 w-5 text-red-500" />
                      : <CheckCircle2 className="h-5 w-5 text-green-500" />
                    }
                    <div>
                      <div className="font-bold text-sm">
                        {result.hardStop ? `HARD STOP — ${result.hardStopReason}` : "Pipeline Complete"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.totalRulesFired} rules fired · Disposition: {result.finalDisposition}
                      </div>
                    </div>
                  </div>
                  <Badge className={result.hardStop ? "bg-red-600 text-white" : "bg-green-600 text-white"}>
                    {result.finalDisposition}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Step-by-step trace */}
            <div className="space-y-2">
              {(result.steps ?? []).map((step: any) => {
                const isExpanded = expanded.has(step.step);
                const hasRules   = step.rulesFired?.length > 0;
                return (
                  <div
                    key={step.step}
                    className={`border-l-4 ${STEP_COLORS[step.step] ?? "border-l-slate-300"} border rounded-r-md overflow-hidden`}
                    data-testid={`step-${step.step}`}
                  >
                    <button
                      className="w-full text-left p-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpand(step.step)}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold w-6 text-center text-muted-foreground">{step.step}</span>
                        <span className="font-semibold">{step.name}</span>
                        {step.redFlagHit && <Badge className="bg-red-600 text-white text-xs py-0">⚠ Red Flag</Badge>}
                        {hasRules && <Badge variant="outline" className="text-xs py-0">{step.rulesFired.length} fired</Badge>}
                        {step.rulesEvaluated > 0 && !hasRules && <span className="text-muted-foreground">({step.rulesEvaluated} evaluated, 0 fired)</span>}
                      </div>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-2 border-t bg-muted/20 text-xs space-y-2">
                        <div className="text-muted-foreground pt-1">{step.summary}</div>
                        {step.rulesFired?.length > 0 && (
                          <div className="space-y-1">
                            {step.rulesFired.map((r: any) => (
                              <div key={r.rule_id} className="border rounded p-2 bg-background" data-testid={`fired-${r.rule_id}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{r.rule_name}</span>
                                  {safetyBadge(r.safety_level)}
                                </div>
                                <div className="text-muted-foreground font-mono">{r.rule_id}</div>
                                {r.disposition_impact && (
                                  <div className="text-indigo-600 font-semibold">→ {r.disposition_impact}</div>
                                )}
                                {r.outputs && (
                                  <div className="font-mono bg-muted/50 rounded px-1 py-0.5 text-xs mt-1">
                                    {JSON.stringify(r.outputs)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {Object.keys(step.outputs ?? {}).length > 0 && (
                          <div className="font-mono bg-muted/50 rounded px-2 py-1">
                            {JSON.stringify(step.outputs)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MasterRuleMapPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: summary, isLoading } = useQuery<any>({
    queryKey: ["/api/rule-map/summary"],
  });

  const refresh = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rule-map/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rule-map/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/rule-map/gaps"] });
      toast({ title: "Rule map refreshed" });
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Map className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="heading-rule-map">Master Rule Map</h1>
            <p className="text-sm text-muted-foreground">Complete clinical rule coverage across all 89 complaints · 30 systems</p>
          </div>
        </div>
        <Button
          data-testid="button-refresh-map"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending
            ? <Loader2 className="animate-spin h-4 w-4 mr-2" />
            : <RefreshCw className="h-4 w-4 mr-2" />
          }
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="rules">
        <TabsList data-testid="tabs-rule-map" className="flex-wrap h-auto gap-1">
          <TabsTrigger value="rules"     data-testid="tab-rules">Rule Catalog</TabsTrigger>
          <TabsTrigger value="pipeline"  data-testid="tab-pipeline">Pipeline Simulator</TabsTrigger>
          <TabsTrigger value="overview"  data-testid="tab-overview">Coverage Overview</TabsTrigger>
          <TabsTrigger value="drilldown" data-testid="tab-drilldown">Drill-down</TabsTrigger>
          <TabsTrigger value="gaps"      data-testid="tab-gaps">Gaps</TabsTrigger>
          <TabsTrigger value="tools"     data-testid="tab-tools">Tools & RLHF</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <RulesTab />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineTab />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          {isLoading
            ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" />Loading…</div>
            : <OverviewTab data={summary} />
          }
        </TabsContent>

        <TabsContent value="drilldown" className="mt-4">
          <DrillDownTab />
        </TabsContent>

        <TabsContent value="gaps" className="mt-4">
          <GapsTab />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <ValidatorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
