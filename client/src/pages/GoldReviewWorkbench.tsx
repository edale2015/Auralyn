import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Star, Trash2, Plus, BarChart2, List, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";

const COMPLAINTS = [
  // ENT
  "sore_throat", "ear_pain", "sinus_pressure", "hoarseness", "epistaxis",
  "nasal_congestion", "tinnitus", "hearing_loss", "stridor", "neck_mass",
  "peritonsillar_abscess", "foreign_body_ear", "foreign_body_nose", "vertigo",
  // Pulmonary
  "cough", "shortness_of_breath", "wheezing", "asthma_exacerbation",
  "copd_exacerbation", "pneumonia", "bronchitis", "hemoptysis", "pleurisy",
  "hypoxia", "sleep_disordered_breathing",
  // Cardiac
  "chest_pain", "palpitations", "syncope", "atrial_fibrillation",
  "hypertensive_urgency", "decompensated_heart_failure", "leg_swelling", "bradycardia",
  // GI
  "abdominal_pain", "nausea_vomiting", "diarrhea", "constipation", "dysphagia",
  "jaundice", "gi_bleeding", "rectal_bleeding", "appendicitis_like",
  "cholecystitis_like", "pancreatitis_like", "bowel_obstruction", "gerd_esophageal",
  // GU / Renal
  "uti", "hematuria", "flank_pain", "urinary_retention", "testicular_pain",
  "vaginal_bleeding", "pelvic_pain", "pelvic_pain_ovarian_torsion", "sti_exposure",
  "ectopic_pregnancy_concern", "urinary_incontinence", "prostatitis",
  // Neurology
  "headache", "headache_thunderclap", "dizziness", "weakness_numbness", "confusion",
  "seizure", "stroke_like", "vision_loss", "facial_droop", "tremor", "ataxia",
  "meningitis_concern", "diplopia",
  // MSK
  "back_pain", "joint_pain", "shoulder_pain", "knee_pain", "ankle_sprain",
  "neck_pain", "hip_pain", "fracture_dislocation", "gout_flare",
  "muscle_weakness", "compartment_syndrome_concern", "wrist_pain",
  // Dermatology
  "rash", "cellulitis", "abscess_skin", "urticaria", "shingles", "burns",
  "wound_infection", "laceration", "insect_bite_reaction", "pressure_ulcer",
  // Psychiatric / Behavioral
  "anxiety", "depression", "suicidal_ideation", "agitation_psychosis", "panic_attack",
  "substance_intoxication", "withdrawal",
  // Endocrine / Metabolic
  "hyperglycemia", "hypoglycemia", "thyroid_symptoms", "adrenal_crisis",
  "metabolic_derangement",
  // Infections / Systemic
  "fever", "flu_like", "sepsis_concern", "covid_like", "mononucleosis",
  "lyme_concern", "animal_bite",
  // Trauma / Environmental
  "head_injury", "facial_trauma", "eye_pain", "eye_trauma", "pelvic_fracture",
  "penetrating_wound", "overdose_intoxication", "poisoning_exposure",
  "heat_illness", "hypothermia_cold_exposure", "allergic_reaction",
  // Ophthalmology
  "red_eye", "acute_glaucoma",
  // OB / GYN
  "pregnancy_complication", "postpartum_complication",
  // General
  "fatigue", "generalized_weakness", "insomnia", "dental_pain",
  "foreign_body_ingestion", "cancer_related_symptom",
].sort();

const DISPOSITIONS = ["ED_IMMEDIATE", "ED_URGENT", "URGENT_CARE", "OFFICE_VISIT", "HOME_CARE", "TELEHEALTH"];
const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"];

const DISPOSITION_COLORS: Record<string, string> = {
  ED_IMMEDIATE: "#ef4444",
  ED_URGENT: "#f97316",
  URGENT_CARE: "#eab308",
  OFFICE_VISIT: "#22c55e",
  HOME_CARE: "#3b82f6",
  TELEHEALTH: "#8b5cf6",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: "#22c55e",
  MEDIUM: "#eab308",
  LOW: "#ef4444",
};

type GoldReview = {
  reviewId: string;
  complaintId: string;
  caseId?: string;
  disposition: string;
  topDiagnosis: string;
  mustAskNext: string[];
  optionalAskNext: string[];
  enoughInfoNow: boolean;
  tests: string[];
  medsConsidered: string[];
  medsAvoid: string[];
  redFlags: string[];
  confidence: string;
  rationale: string;
  createdBy: string;
  createdAt: string;
};

const emptyForm = {
  complaintId: "",
  caseId: "",
  disposition: "",
  topDiagnosis: "",
  mustAskNext: "",
  optionalAskNext: "",
  enoughInfoNow: false,
  tests: "",
  medsConsidered: "",
  medsAvoid: "",
  redFlags: "",
  confidence: "",
  rationale: "",
};

export default function GoldReviewWorkbench() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filterComplaint, setFilterComplaint] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const queryComplaint = filterComplaint === "all" ? "" : filterComplaint;
  const queryKey = queryComplaint
    ? ["/api/goldReviews", `?complaintId=${queryComplaint}`]
    : ["/api/goldReviews"];

  const { data, isLoading } = useQuery<{ count: number; reviews: GoldReview[] }>({
    queryKey,
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: countsData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["/api/goldReviews/counts"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: allData } = useQuery<{ count: number; reviews: GoldReview[] }>({
    queryKey: ["/api/goldReviews"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        complaintId: form.complaintId,
        caseId: form.caseId || undefined,
        disposition: form.disposition,
        topDiagnosis: form.topDiagnosis,
        mustAskNext: form.mustAskNext ? form.mustAskNext.split(",").map((s) => s.trim()).filter(Boolean) : [],
        optionalAskNext: form.optionalAskNext ? form.optionalAskNext.split(",").map((s) => s.trim()).filter(Boolean) : [],
        enoughInfoNow: form.enoughInfoNow,
        tests: form.tests ? form.tests.split(",").map((s) => s.trim()).filter(Boolean) : [],
        medsConsidered: form.medsConsidered ? form.medsConsidered.split(",").map((s) => s.trim()).filter(Boolean) : [],
        medsAvoid: form.medsAvoid ? form.medsAvoid.split(",").map((s) => s.trim()).filter(Boolean) : [],
        redFlags: form.redFlags ? form.redFlags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        confidence: form.confidence,
        rationale: form.rationale,
        createdBy: user?.email || user?.userId || "unknown",
      };
      return apiRequest("POST", "/api/goldReviews", payload);
    },
    onSuccess: () => {
      toast({ title: "Gold review created" });
      setForm(emptyForm);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/goldReviews"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/goldReviews/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Gold review deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/goldReviews"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  const reviews = data?.reviews || [];
  const allReviews = allData?.reviews || [];
  const counts = countsData?.counts || {};
  const totalGolds = Object.values(counts).reduce((a, b) => a + b, 0);

  const dispositionData = useMemo(() => {
    const freq: Record<string, number> = {};
    allReviews.forEach((r) => { freq[r.disposition] = (freq[r.disposition] || 0) + 1; });
    return Object.entries(freq).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [allReviews]);

  const confidenceData = useMemo(() => {
    const freq: Record<string, number> = {};
    allReviews.forEach((r) => { const key = r.confidence || "UNKNOWN"; freq[key] = (freq[key] || 0) + 1; });
    return Object.entries(freq).map(([name, value]) => ({ name, value }));
  }, [allReviews]);

  const topDiagnosesData = useMemo(() => {
    const freq: Record<string, number> = {};
    allReviews.forEach((r) => { if (r.topDiagnosis) freq[r.topDiagnosis] = (freq[r.topDiagnosis] || 0) + 1; });
    return Object.entries(freq).map(([dx, count]) => ({ dx, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [allReviews]);

  const complaintsBarData = useMemo(() => {
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [counts]);

  return (
    <div className="p-6 space-y-4" data-testid="page-gold-review-workbench">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Star className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Gold Review Workbench</h2>
          <Badge variant="secondary" data-testid="badge-total-golds">{totalGolds} total</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = filterComplaint !== "all"
                ? `/api/goldReviews/export?format=csv&complaintId=${filterComplaint}`
                : "/api/goldReviews/export?format=csv";
              window.open(url, "_blank");
            }}
            data-testid="button-export-csv"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = filterComplaint !== "all"
                ? `/api/goldReviews/export?format=json&complaintId=${filterComplaint}`
                : "/api/goldReviews/export?format=json";
              window.open(url, "_blank");
            }}
            data-testid="button-export-json"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export JSON
          </Button>
          <Button onClick={() => setShowForm(!showForm)} data-testid="button-toggle-form">
            <Plus className="w-4 h-4 mr-2" />
            {showForm ? "Hide Form" : "New Gold Review"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New Gold Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Complaint *</Label>
                <Select value={form.complaintId} onValueChange={(v) => setForm({ ...form, complaintId: v })}>
                  <SelectTrigger data-testid="input-complaint"><SelectValue placeholder="Select complaint" /></SelectTrigger>
                  <SelectContent>{COMPLAINTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Disposition *</Label>
                <Select value={form.disposition} onValueChange={(v) => setForm({ ...form, disposition: v })}>
                  <SelectTrigger data-testid="input-disposition"><SelectValue placeholder="Select disposition" /></SelectTrigger>
                  <SelectContent>{DISPOSITIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Confidence</Label>
                <Select value={form.confidence} onValueChange={(v) => setForm({ ...form, confidence: v })}>
                  <SelectTrigger data-testid="input-confidence"><SelectValue placeholder="Select confidence" /></SelectTrigger>
                  <SelectContent>{CONFIDENCE_LEVELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Case ID (optional)</Label>
                <Input value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} placeholder="e.g. case_abc123" data-testid="input-case-id" />
              </div>
              <div className="space-y-1">
                <Label>Top Diagnosis</Label>
                <Input value={form.topDiagnosis} onChange={(e) => setForm({ ...form, topDiagnosis: e.target.value })} placeholder="e.g. pharyngitis" data-testid="input-top-diagnosis" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Must Ask Next (comma-separated)</Label>
                <Input value={form.mustAskNext} onChange={(e) => setForm({ ...form, mustAskNext: e.target.value })} placeholder="Q_FEVER, Q_COUGH_DURATION" data-testid="input-must-ask" />
              </div>
              <div className="space-y-1">
                <Label>Optional Ask Next (comma-separated)</Label>
                <Input value={form.optionalAskNext} onChange={(e) => setForm({ ...form, optionalAskNext: e.target.value })} placeholder="Q_SMOKING, Q_TRAVEL" data-testid="input-optional-ask" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enoughInfoNow} onCheckedChange={(v) => setForm({ ...form, enoughInfoNow: v })} data-testid="switch-enough-info" />
              <Label>Enough info now?</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Tests (comma-separated)</Label>
                <Input value={form.tests} onChange={(e) => setForm({ ...form, tests: e.target.value })} placeholder="CBC, CMP, UA" data-testid="input-tests" />
              </div>
              <div className="space-y-1">
                <Label>Meds Considered (comma-separated)</Label>
                <Input value={form.medsConsidered} onChange={(e) => setForm({ ...form, medsConsidered: e.target.value })} placeholder="ibuprofen, amoxicillin" data-testid="input-meds-considered" />
              </div>
              <div className="space-y-1">
                <Label>Meds Avoid (comma-separated)</Label>
                <Input value={form.medsAvoid} onChange={(e) => setForm({ ...form, medsAvoid: e.target.value })} placeholder="aspirin" data-testid="input-meds-avoid" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Red Flags (comma-separated)</Label>
              <Input value={form.redFlags} onChange={(e) => setForm({ ...form, redFlags: e.target.value })} placeholder="RF_SEVERE_RESP_DISTRESS, RF_STRIDOR" data-testid="input-red-flags" />
            </div>
            <div className="space-y-1">
              <Label>Rationale</Label>
              <Textarea value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} placeholder="Clinical reasoning for this gold standard..." data-testid="input-rationale" />
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={!form.complaintId || !form.disposition || createMutation.isPending} data-testid="button-submit-review">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create Gold Review
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse" className="gap-1.5 text-xs">
            <List className="w-3.5 h-3.5" /> Browse
          </TabsTrigger>
          <TabsTrigger value="visualize" className="gap-1.5 text-xs" data-testid="tab-visualize">
            <BarChart2 className="w-3.5 h-3.5" /> Visualize
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-3 pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterComplaint} onValueChange={setFilterComplaint}>
              <SelectTrigger className="w-56" data-testid="select-filter-complaint">
                <SelectValue placeholder="Filter by complaint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All complaints</SelectItem>
                {COMPLAINTS.map((c) => (
                  <SelectItem key={c} value={c}>{c} {counts[c] ? `(${counts[c]})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12" data-testid="status-loading">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No gold reviews found.</p>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gold Reviews ({reviews.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Complaint</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Top Dx</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Red Flags</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviews.map((r) => (
                        <TableRow key={r.reviewId} data-testid={`gold-row-${r.reviewId}`}>
                          <TableCell className="text-xs font-mono">{r.complaintId}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{ borderColor: DISPOSITION_COLORS[r.disposition], color: DISPOSITION_COLORS[r.disposition] }}
                            >
                              {r.disposition}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{r.topDiagnosis || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{r.confidence || "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.redFlags?.join(", ") || "-"}</TableCell>
                          <TableCell className="text-xs">{r.createdBy}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(r.reviewId)} disabled={deleteMutation.isPending} data-testid={`button-delete-${r.reviewId}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="visualize" className="space-y-4 pt-4" data-testid="tab-content-visualize">
          {allReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data to visualize yet. Create gold reviews to see charts.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Disposition Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dispositionData} layout="vertical" barCategoryGap="20%">
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                        <RechartsTooltip />
                        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]}>
                          {dispositionData.map((entry) => (
                            <Cell key={entry.name} fill={DISPOSITION_COLORS[entry.name] || "#94a3b8"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Confidence Level Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={confidenceData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="45%"
                          outerRadius={75}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {confidenceData.map((entry) => (
                            <Cell key={entry.name} fill={CONFIDENCE_COLORS[entry.name] || "#94a3b8"} />
                          ))}
                        </Pie>
                        <Legend />
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Reviews by Complaint (Top 12)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={complaintsBarData} barCategoryGap="25%">
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" name="Reviews" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top Diagnoses (Frequency Table)</CardTitle>
                </CardHeader>
                <CardContent>
                  {topDiagnosesData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No diagnosis data recorded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Diagnosis</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topDiagnosesData.map((row, i) => (
                          <TableRow key={row.dx} data-testid={`dx-row-${i}`}>
                            <TableCell className="text-xs text-muted-foreground font-medium">{i + 1}</TableCell>
                            <TableCell className="text-sm font-medium">{row.dx}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{row.count}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                              {allReviews.length > 0 ? `${((row.count / allReviews.length) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
