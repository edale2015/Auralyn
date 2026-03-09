import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Star, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMPLAINTS = [
  "cough", "sore_throat", "dysuria", "headache", "chest_pain", "abdominal_pain",
  "back_pain", "joint_pain", "rash", "dizziness", "shortness_of_breath", "fever",
  "nausea_vomiting", "diarrhea", "ear_pain", "sinus_pressure", "eye_pain",
  "palpitations", "fatigue", "anxiety", "depression", "insomnia", "urinary_retention",
  "hematuria", "flank_pain", "vaginal_bleeding", "pelvic_pain", "testicular_pain",
  "seizure", "syncope", "confusion", "weakness_numbness", "vision_loss", "red_eye",
  "epistaxis", "nasal_congestion", "wheezing", "hemoptysis", "chest_tightness",
  "constipation", "dysphagia", "jaundice", "gi_bleeding", "laceration",
  "fracture_dislocation", "head_injury", "sprain_injury", "cellulitis",
  "allergic_reaction", "overdose_intoxication", "poisoning_exposure", "withdrawal",
  "agitation_psychosis", "suicidal_ideation", "hyperglycemia", "hypoglycemia",
  "thyroid_symptoms", "flu_like", "animal_bite", "heat_illness",
  "hypothermia_cold_exposure", "uti_symptoms", "sti_exposure", "generalized_weakness",
  "nausea_malaise", "leg_swelling", "pancreatitis_like", "dental_pain",
  "pelvic_pain_ovarian_torsion", "prostatitis",
];

const DISPOSITIONS = ["ED_IMMEDIATE", "ED_URGENT", "URGENT_CARE", "OFFICE_VISIT", "HOME_CARE", "TELEHEALTH"];
const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"];

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
  const counts = countsData?.counts || {};
  const totalGolds = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-4" data-testid="page-gold-review-workbench">
      <div className="flex items-center gap-3 flex-wrap">
        <Star className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Gold Review Workbench</h2>
        <Badge variant="secondary" data-testid="badge-total-golds">{totalGolds} total</Badge>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterComplaint} onValueChange={setFilterComplaint}>
          <SelectTrigger className="w-56" data-testid="select-filter-complaint">
            <SelectValue placeholder="Filter by complaint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All complaints</SelectItem>
            {COMPLAINTS.map((c) => (
              <SelectItem key={c} value={c}>
                {c} {counts[c] ? `(${counts[c]})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setShowForm(!showForm)} data-testid="button-toggle-form">
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? "Hide Form" : "New Gold Review"}
        </Button>
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
                  <SelectTrigger data-testid="input-complaint">
                    <SelectValue placeholder="Select complaint" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLAINTS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Disposition *</Label>
                <Select value={form.disposition} onValueChange={(v) => setForm({ ...form, disposition: v })}>
                  <SelectTrigger data-testid="input-disposition">
                    <SelectValue placeholder="Select disposition" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Confidence</Label>
                <Select value={form.confidence} onValueChange={(v) => setForm({ ...form, confidence: v })}>
                  <SelectTrigger data-testid="input-confidence">
                    <SelectValue placeholder="Select confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIDENCE_LEVELS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
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

            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.complaintId || !form.disposition || createMutation.isPending}
              data-testid="button-submit-review"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create Gold Review
            </Button>
          </CardContent>
        </Card>
      )}

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
                        <Badge variant="outline" className="text-xs">{r.disposition}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.topDiagnosis || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.confidence || "-"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate">{r.redFlags?.join(", ") || "-"}</TableCell>
                      <TableCell className="text-xs">{r.createdBy}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(r.reviewId)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${r.reviewId}`}
                        >
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
    </div>
  );
}
