import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BriefingBanner, LivingEncounterTimeline } from "@/components/physician/BriefingBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, Activity, FileText, CheckCircle2, AlertTriangle,
  Plus, Play, ClipboardList, Send, ChevronRight, Stethoscope,
  ReceiptText, ShieldAlert, TrendingUp, Clock, Banknote
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Tenant {
  id: string; name: string; plan: string; status: string;
  casesUsed: number; maxCases: number; contactEmail: string; features: string[];
}

interface EncounterResult {
  diagnosis: string; disposition: string; confidence: number;
  icd10: string; cptCode: string; cptDescription: string;
  safetyLevel: "LOW" | "MEDIUM" | "HIGH"; reasoning: string; visitType: string;
}

interface Encounter {
  id: string; clinicId: string; patientId: string; patientName: string;
  complaint: string; symptoms: string;
  status: "ACTIVE" | "COMPLETED" | "BILLED";
  result?: EncounterResult; claim?: any; claimRef?: string;
  startedAt: string; completedAt?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  basic:      "bg-slate-700/60 text-slate-200",
  pro:        "bg-blue-700/60 text-blue-200",
  enterprise: "bg-violet-700/60 text-violet-200",
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "bg-yellow-700/60 text-yellow-200",
  COMPLETED: "bg-blue-700/60 text-blue-200",
  BILLED:    "bg-green-700/60 text-green-200",
};
const SAFETY_COLORS: Record<string, string> = {
  LOW:    "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH:   "text-red-400",
};
const DISPOSITION_COLORS: Record<string, string> = {
  ER:    "bg-red-700/60 text-red-200",
  home:  "bg-green-700/60 text-green-200",
  urgent:"bg-orange-700/60 text-orange-200",
};

const COMMON_COMPLAINTS = [
  "Sore throat", "Ear pain", "Chest pain", "Headache / Migraine",
  "Shortness of breath", "Fever / Flu", "UTI symptoms", "Rash / Allergic reaction",
  "Nausea / GI upset", "Stroke symptoms", "Sinusitis", "Anxiety / Panic",
];

function StatBox({ label, value, sub, icon: Icon, color = "text-white" }: {
  label: string; value: string | number; sub?: string; icon: any; color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/20 bg-black/20 px-3 py-2 flex items-center gap-3">
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <div>
        <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[9px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function LiveClinicPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [currentEncounter, setCurrentEncounter] = useState<Encounter | null>(null);
  const [step, setStep] = useState<"intake" | "result" | "claim">("intake");
  const [addClinicOpen, setAddClinicOpen] = useState(false);
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicEmail, setNewClinicEmail] = useState("");
  const [newClinicPlan, setNewClinicPlan] = useState("basic");

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: tenantsData } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ["/api/live-clinic/tenants"],
  });
  const tenants = tenantsData?.tenants ?? [];
  const selectedTenant = tenants.find((t) => t.id === selectedClinicId);

  const { data: dashData } = useQuery<{ stats: any; tenant: Tenant }>({
    queryKey: ["/api/live-clinic/dashboard", selectedClinicId],
    queryFn: () => fetch(`/api/live-clinic/dashboard/${selectedClinicId}`).then((r) => r.json()),
    enabled: !!selectedClinicId,
    refetchInterval: 5000,
  });

  const { data: encsData, refetch: refetchEncs } = useQuery<{ encounters: Encounter[] }>({
    queryKey: ["/api/live-clinic/encounters", selectedClinicId],
    queryFn: () =>
      fetch(`/api/live-clinic/encounters?clinicId=${encodeURIComponent(selectedClinicId)}`).then((r) => r.json()),
    enabled: !!selectedClinicId,
    refetchInterval: 5000,
  });
  const encounters = encsData?.encounters ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createClinicMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/live-clinic/tenant", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-clinic/tenants"] });
      setAddClinicOpen(false); setNewClinicName(""); setNewClinicEmail("");
      toast({ title: "Clinic created" });
    },
  });

  const startEncounterMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/live-clinic/encounter/start", body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setCurrentEncounter(data.encounter);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/live-clinic/encounters", selectedClinicId] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-clinic/dashboard", selectedClinicId] });
    },
  });

  const runEncounterMut = useMutation({
    mutationFn: (encId: string) =>
      apiRequest("POST", "/api/live-clinic/encounter/run", { encounterId: encId }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setCurrentEncounter(data.encounter);
    },
  });

  const generateClaimMut = useMutation({
    mutationFn: (encId: string) =>
      apiRequest("POST", "/api/live-clinic/billing/generate", { encounterId: encId }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setCurrentEncounter((prev) => prev ? { ...prev, claim: data.claim } : prev);
      setStep("claim");
    },
  });

  const submitClaimMut = useMutation({
    mutationFn: (encId: string) =>
      apiRequest("POST", "/api/live-clinic/billing/submit", { encounterId: encId }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setCurrentEncounter(data.encounter);
      queryClient.invalidateQueries({ queryKey: ["/api/live-clinic/encounters", selectedClinicId] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-clinic/dashboard", selectedClinicId] });
      toast({ title: "Claim submitted", description: `Ref: ${data.submission.clearinghouseRef}` });
      setPatientName(""); setPatientAge(""); setComplaint(""); setSymptoms("");
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleStartEncounter() {
    if (!selectedClinicId) return toast({ title: "Select a clinic first", variant: "destructive" });
    if (!complaint) return toast({ title: "Enter a complaint", variant: "destructive" });
    startEncounterMut.mutate({
      clinicId: selectedClinicId,
      patientName: patientName || "Anonymous",
      complaint,
      symptoms,
    });
  }

  async function handleRunAI() {
    if (!currentEncounter) return;
    await runEncounterMut.mutateAsync(currentEncounter.id);
  }

  async function handleGenerateClaim() {
    if (!currentEncounter) return;
    await generateClaimMut.mutateAsync(currentEncounter.id);
  }

  async function handleSubmitClaim() {
    if (!currentEncounter) return;
    await submitClaimMut.mutateAsync(currentEncounter.id);
  }

  function resetWizard() {
    setCurrentEncounter(null); setStep("intake");
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const stats = dashData?.stats;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="border-b border-border/30 bg-card/50 px-5 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold">Live Clinic Console</h1>
          <Badge className="ml-1 text-[9px] bg-primary/20 text-primary border-0">Multi-Tenant</Badge>
        </div>

        {/* Clinic selector */}
        <div className="flex items-center gap-2 ml-4">
          <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Active Clinic</Label>
          <Select value={selectedClinicId} onValueChange={(v) => { setSelectedClinicId(v); resetWizard(); }}>
            <SelectTrigger className="h-7 text-xs w-56" data-testid="select-clinic">
              <SelectValue placeholder="Select clinic…" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id} data-testid={`clinic-option-${t.id}`}>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-1 text-muted-foreground text-[10px]">({t.plan})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setAddClinicOpen((v) => !v)}
            data-testid="button-add-clinic"
          >
            <Plus className="h-3 w-3" /> New Clinic
          </Button>
        </div>

        {/* Tenant badge */}
        {selectedTenant && (
          <div className="ml-auto flex items-center gap-2">
            <Badge className={`text-[10px] ${PLAN_COLORS[selectedTenant.plan] ?? "bg-muted"}`}>
              {selectedTenant.plan.toUpperCase()}
            </Badge>
            <Badge className="text-[10px] bg-green-700/60 text-green-200">
              {selectedTenant.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {selectedTenant.casesUsed}/{selectedTenant.maxCases} cases
            </span>
          </div>
        )}
      </div>

      {/* ── New clinic form ────────────────────────────────────────────────── */}
      {addClinicOpen && (
        <div className="border-b border-border/30 bg-card/30 px-5 py-3 flex items-end gap-3 shrink-0">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Clinic Name</Label>
            <Input className="h-7 text-xs w-44" value={newClinicName}
              onChange={(e) => setNewClinicName(e.target.value)} placeholder="City ENT Center"
              data-testid="input-clinic-name" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Admin Email</Label>
            <Input className="h-7 text-xs w-44" value={newClinicEmail}
              onChange={(e) => setNewClinicEmail(e.target.value)} placeholder="admin@clinic.com"
              data-testid="input-clinic-email" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Plan</Label>
            <Select value={newClinicPlan} onValueChange={setNewClinicPlan}>
              <SelectTrigger className="h-7 text-xs w-28" data-testid="select-clinic-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-7 text-xs" data-testid="button-create-clinic"
            onClick={() => createClinicMut.mutate({ name: newClinicName, email: newClinicEmail, plan: newClinicPlan })}
            disabled={createClinicMut.isPending || !newClinicName || !newClinicEmail}>
            {createClinicMut.isPending ? "Creating…" : "Create Clinic"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddClinicOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      {stats && (
        <div className="border-b border-border/30 bg-card/30 px-5 py-2 grid grid-cols-6 gap-2 shrink-0">
          <StatBox label="Total Encounters" value={stats.totalEncounters} icon={Activity} color="text-blue-400" />
          <StatBox label="Active" value={stats.active} icon={Clock} color="text-yellow-400" />
          <StatBox label="Completed" value={stats.completed} icon={CheckCircle2} color="text-blue-400" />
          <StatBox label="Billed" value={stats.billed} icon={Banknote} color="text-green-400" />
          <StatBox label="ER Referrals" value={stats.erReferrals} icon={AlertTriangle} color="text-red-400" />
          <StatBox label="Cases Remaining" value={stats.casesRemaining} icon={TrendingUp} color="text-primary" />
        </div>
      )}

      {/* ── Main body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Encounter wizard ──────────────────────────────────────── */}
        <div className="w-[400px] shrink-0 border-r border-border/30 flex flex-col overflow-y-auto">

          {/* Step indicators */}
          <div className="flex items-center gap-0 px-4 py-2 border-b border-border/20 text-[10px]">
            {[
              { key: "intake", label: "1 · Intake" },
              { key: "result", label: "2 · AI Triage" },
              { key: "claim",  label: "3 · Billing" },
            ].map(({ key, label }, i, arr) => (
              <div key={key} className="flex items-center gap-0">
                <span className={`px-2 py-0.5 rounded ${step === key ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
            {currentEncounter && step !== "intake" && (
              <button onClick={resetWizard} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline">
                New encounter
              </button>
            )}
          </div>

          {/* ── STEP 1: Intake ─────────────────────────────────────────────── */}
          {step === "intake" && (
            <div className="p-4 space-y-3">
              <p className="text-[10px] text-muted-foreground">Start a new patient encounter. Select your clinic above first.</p>

              <div className="space-y-1">
                <Label className="text-xs">Patient Name <span className="text-muted-foreground">(optional)</span></Label>
                <Input className="h-8 text-xs" value={patientName} onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Jane Doe" data-testid="input-patient-name" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Patient Age</Label>
                <Input className="h-8 text-xs" type="number" value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)} placeholder="34"
                  data-testid="input-patient-age" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Chief Complaint <span className="text-red-400">*</span></Label>
                <Select value={complaint} onValueChange={setComplaint}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-complaint">
                    <SelectValue placeholder="Select complaint…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_COMPLAINTS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {complaint === "__custom__" && (
                  <Input className="h-8 text-xs mt-1" placeholder="Describe complaint…"
                    onChange={(e) => setComplaint(e.target.value)} data-testid="input-complaint-custom" />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Additional Symptoms / HPI</Label>
                <Textarea className="text-xs resize-none h-20" value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="e.g. Started 2 days ago, worsening, fever 101°F, no cough…"
                  data-testid="textarea-symptoms" />
              </div>

              <Button className="w-full h-8 text-xs gap-2" data-testid="button-start-encounter"
                onClick={handleStartEncounter} disabled={startEncounterMut.isPending || !selectedClinicId || !complaint}>
                <Play className="h-3.5 w-3.5" />
                {startEncounterMut.isPending ? "Starting…" : "Start Encounter"}
              </Button>
            </div>
          )}

          {/* ── STEP 2: AI Triage Result ────────────────────────────────────── */}
          {step === "result" && currentEncounter && (
            <div className="p-4 space-y-3">
              {/* Pre-encounter briefing banner — appears when dialogue intake is complete */}
              <BriefingBanner
                encounterId={currentEncounter.id}
                patientName={currentEncounter.patientName}
              />

              <div className="rounded-lg bg-card border border-border/30 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium">ENCOUNTER</p>
                <p className="text-xs font-semibold">{currentEncounter.id}</p>
                <p className="text-[10px] text-muted-foreground">{currentEncounter.patientName} · {currentEncounter.complaint}</p>
              </div>

              {!currentEncounter.result ? (
                <Button className="w-full h-8 text-xs gap-2" data-testid="button-run-ai"
                  onClick={handleRunAI} disabled={runEncounterMut.isPending}>
                  <Stethoscope className="h-3.5 w-3.5" />
                  {runEncounterMut.isPending ? "Running AI Triage…" : "Run AI Triage"}
                </Button>
              ) : (
                <div className="space-y-3">
                  {/* Diagnosis card */}
                  <div className="rounded-lg bg-card border border-border/30 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold">{currentEncounter.result.diagnosis}</p>
                      <Badge className={`${DISPOSITION_COLORS[currentEncounter.result.disposition] ?? "bg-muted"} text-[10px] shrink-0`}>
                        {currentEncounter.result.disposition.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[9px] text-muted-foreground">CONFIDENCE</p>
                        <p className="text-xs font-semibold">{(currentEncounter.result.confidence * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground">SAFETY</p>
                        <p className={`text-xs font-semibold ${SAFETY_COLORS[currentEncounter.result.safetyLevel]}`}>
                          {currentEncounter.result.safetyLevel}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">{currentEncounter.result.reasoning}</p>
                  </div>

                  {/* Payor optimization */}
                  <div className="rounded-lg bg-black/20 border border-border/20 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                      <ReceiptText className="h-3 w-3" /> Payor Optimization
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded bg-card/60 border border-border/20 p-2">
                        <p className="text-[9px] text-muted-foreground">CPT CODE</p>
                        <p className="text-sm font-bold text-green-400">{currentEncounter.result.cptCode}</p>
                        <p className="text-[9px] text-muted-foreground leading-tight">{currentEncounter.result.cptDescription}</p>
                      </div>
                      <div className="rounded bg-card/60 border border-border/20 p-2">
                        <p className="text-[9px] text-muted-foreground">ICD-10</p>
                        <p className="text-sm font-bold text-blue-400">{currentEncounter.result.icd10}</p>
                        <p className="text-[9px] text-muted-foreground leading-tight">{currentEncounter.result.diagnosis.slice(0, 28)}…</p>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full h-8 text-xs gap-2" data-testid="button-generate-claim"
                    onClick={handleGenerateClaim} disabled={generateClaimMut.isPending}>
                    <FileText className="h-3.5 w-3.5" />
                    {generateClaimMut.isPending ? "Generating…" : "Generate Claim"}
                  </Button>
                </div>
              )}

              {/* Post-visit patient update feed — auto-hides when empty */}
              <LivingEncounterTimeline encounterId={currentEncounter.id} />
            </div>
          )}

          {/* ── STEP 3: Claim ──────────────────────────────────────────────── */}
          {step === "claim" && currentEncounter?.claim && (
            <div className="p-4 space-y-3">
              <div className="rounded-lg bg-card border border-border/30 p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium">CLAIM DRAFT</p>
                <p className="text-xs font-bold">{currentEncounter.claim.claimId}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div><span className="text-muted-foreground">Patient: </span>{currentEncounter.claim.patientId}</div>
                  <div><span className="text-muted-foreground">DOS: </span>{currentEncounter.claim.dateOfService}</div>
                  <div><span className="text-muted-foreground">Diagnosis: </span>{currentEncounter.claim.diagnosis}</div>
                  <div><span className="text-muted-foreground">ICD-10: </span>{currentEncounter.claim.icd10}</div>
                  <div><span className="text-muted-foreground">CPT: </span>{currentEncounter.claim.procedure}</div>
                  <div><span className="text-muted-foreground">Status: </span>
                    <span className="text-yellow-400">{currentEncounter.claim.status}</span>
                  </div>
                </div>
              </div>

              {currentEncounter.status !== "BILLED" ? (
                <Button className="w-full h-8 text-xs gap-2 bg-green-700 hover:bg-green-600"
                  data-testid="button-submit-claim"
                  onClick={handleSubmitClaim} disabled={submitClaimMut.isPending}>
                  <Send className="h-3.5 w-3.5" />
                  {submitClaimMut.isPending ? "Submitting…" : "Submit to Clearinghouse"}
                </Button>
              ) : (
                <div className="rounded-lg bg-green-900/30 border border-green-700/30 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <p className="text-xs font-semibold text-green-400">Claim Submitted</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Clearinghouse Ref: {currentEncounter.claimRef}</p>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs mt-2"
                    data-testid="button-new-after-submit" onClick={resetWizard}>
                    Start New Encounter
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Encounter ledger ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border/20 px-4 py-2 flex items-center gap-2 shrink-0">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Encounter Ledger</p>
            {selectedTenant && (
              <span className="text-[10px] text-muted-foreground">— {selectedTenant.name}</span>
            )}
            <Badge className="ml-auto text-[9px] bg-muted/40">{encounters.length} encounters</Badge>
          </div>

          {encounters.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 p-6">
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">No encounters yet</p>
              <p className="text-xs opacity-60">
                {selectedClinicId
                  ? "Start an encounter in the wizard on the left"
                  : "Select a clinic to view its encounters"}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-background/95 border-b border-border/20">
                  <tr>
                    {["Encounter", "Patient", "Complaint", "Diagnosis", "CPT", "ICD-10", "Safety", "Disposition", "Status"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {encounters.map((enc, i) => (
                    <tr key={enc.id}
                      data-testid={`row-encounter-${enc.id}`}
                      className={`border-b border-border/10 hover:bg-muted/10 transition-colors ${i % 2 === 0 ? "" : "bg-card/20"}`}>
                      <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">{enc.id}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{enc.patientName}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate">{enc.complaint}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate">{enc.result?.diagnosis ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 font-mono text-green-400">{enc.result?.cptCode ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-blue-400">{enc.result?.icd10 ?? "—"}</td>
                      <td className="px-3 py-2">
                        {enc.result?.safetyLevel
                          ? <span className={`font-semibold ${SAFETY_COLORS[enc.result.safetyLevel]}`}>{enc.result.safetyLevel}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {enc.result?.disposition
                          ? <Badge className={`${DISPOSITION_COLORS[enc.result.disposition] ?? "bg-muted"} text-[9px]`}>{enc.result.disposition.toUpperCase()}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`${STATUS_COLORS[enc.status] ?? "bg-muted"} text-[9px]`}>{enc.status}</Badge>
                        {enc.claimRef && <p className="text-[9px] text-muted-foreground mt-0.5">{enc.claimRef}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Clinic roster ──────────────────────────────────────────────── */}
          <div className="border-t border-border/30 px-4 py-2 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold">Tenant Roster</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {tenants.map((t) => (
                <button key={t.id}
                  data-testid={`card-tenant-${t.id}`}
                  onClick={() => { setSelectedClinicId(t.id); resetWizard(); }}
                  className={`rounded-lg border px-3 py-2 text-left text-[10px] transition-all cursor-pointer ${
                    selectedClinicId === t.id
                      ? "border-primary bg-primary/10"
                      : "border-border/30 bg-card/30 hover:border-border/60"
                  }`}>
                  <p className="font-semibold truncate max-w-[120px]">{t.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge className={`${PLAN_COLORS[t.plan] ?? "bg-muted"} text-[8px] px-1`}>{t.plan}</Badge>
                    <span className="text-muted-foreground">{t.casesUsed}/{t.maxCases}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
