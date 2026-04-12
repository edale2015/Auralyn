import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck, FlaskConical, DollarSign, RefreshCw,
  Activity, TrendingUp, Shield, Stethoscope, Building2,
  CheckCircle2, AlertTriangle, BarChart3,
} from "lucide-react";

function fmt(n: number, dec = 0) { return n.toLocaleString(undefined, { maximumFractionDigits: dec }); }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

// ─── SaMD Dossier ─────────────────────────────────────────────────────────────
function SaMDPanel() {
  const { toast } = useToast();
  const { data: dossier, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/samd/generate"],
    enabled:  false,
  });

  return (
    <div className="space-y-4">
      <Button data-testid="button-gen-dossier" onClick={() => refetch()} disabled={isLoading}>
        {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
        Generate FDA SaMD Dossier
      </Button>

      {dossier && (
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-muted/30 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Device:</span> <strong data-testid="text-device-name">{dossier.deviceName}</strong></div>
            <div><span className="text-muted-foreground">Class:</span> <Badge data-testid="badge-classification">{dossier.classification}</Badge></div>
            <div className="col-span-2"><span className="text-muted-foreground">Intended Use:</span> {dossier.intendedUse}</div>
            <div><span className="text-muted-foreground">FDA Ready:</span>
              {dossier.validation?.fdaReady
                ? <CheckCircle2 className="inline ml-1 h-4 w-4 text-green-500" />
                : <AlertTriangle className="inline ml-1 h-4 w-4 text-orange-500" />}
              <span className="ml-1" data-testid="text-fda-ready">{dossier.validation?.fdaReady ? "Yes" : "No"}</span>
            </div>
            <div><span className="text-muted-foreground">Chain Valid:</span>
              <span className="ml-1" data-testid="text-chain-valid">{dossier.audit?.chainValid ? "✓" : "✗"} ({dossier.audit?.chainLength} records)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Architecture</p>
              {Object.entries(dossier.systemArchitecture ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs" data-testid={`arch-${k}`}>
                  {v ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <AlertTriangle className="h-3 w-3 text-orange-500" />}
                  {k}
                </div>
              ))}
            </div>
            <div className="border rounded p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Risk Mitigations</p>
              {dossier.riskAnalysis?.mitigations?.map((m: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mt-1" data-testid={`mitigation-${i}`}>
                  <Shield className="h-3 w-3 shrink-0 mt-0.5 text-blue-500" />{m}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clinical Trial Simulator ─────────────────────────────────────────────────
function TrialPanel() {
  const { toast } = useToast();
  const [n, setN] = useState("50");
  const [result, setResult] = useState<any>(null);

  const { mutate: run, isPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/trial/run?n=${n}`).then((r) => r.json()),
    onSuccess: setResult,
    onError:   (err: any) => toast({ title: "Trial failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Patients (max 500)</label>
          <Input data-testid="input-trial-n" className="w-28" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <Button data-testid="button-run-trial" className="mt-4" onClick={() => run()} disabled={isPending}>
          {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
          Run Trial
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Patients", value: fmt(result.total),             id: "total" },
              { label: "ED Rate",        value: pct(result.edRate),            id: "ed-rate" },
              { label: "Home Rate",      value: pct(1 - result.edRate),        id: "home-rate" },
              { label: "Avg Confidence", value: pct(result.avgConfidence),     id: "confidence" },
            ].map(({ label, value, id }) => (
              <div key={id} className="border rounded p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold mt-1" data-testid={`text-trial-${id}`}>{value}</p>
              </div>
            ))}
          </div>

          {result.byComplaint && (
            <div className="border rounded p-3">
              <p className="text-xs font-medium mb-2">Breakdown by Complaint</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(result.byComplaint).map(([complaint, data]: any) => (
                  <div key={complaint} className="border rounded p-2 text-xs" data-testid={`complaint-${complaint}`}>
                    <p className="font-medium capitalize">{complaint}</p>
                    <p className="text-muted-foreground">n={data.count} | ED={pct(data.edRate)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payer ROI Engine ─────────────────────────────────────────────────────────
function ROIPanel() {
  const { toast } = useToast();
  const [n, setN] = useState("100");
  const [result, setResult] = useState<any>(null);

  const { mutate: run, isPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/roi/simulate?n=${n}`).then((r) => r.json()),
    onSuccess: setResult,
    onError:   (err: any) => toast({ title: "ROI simulation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Simulated Patients</label>
          <Input data-testid="input-roi-n" className="w-28" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <Button data-testid="button-run-roi" className="mt-4" onClick={() => run()} disabled={isPending}>
          {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
          Simulate ROI
        </Button>
      </div>

      {result?.roi && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Avoided ED Visits",       value: fmt(result.roi.avoidedEDVisits),               id: "avoided" },
            { label: "Total Savings",            value: `$${fmt(result.roi.totalSavings)}`,             id: "savings" },
            { label: "Avg Savings / Patient",    value: `$${fmt(result.roi.avgSavingsPerPatient, 0)}`,  id: "avg-savings" },
            { label: "Annualized (500 pt/day)",  value: `$${fmt(result.roi.annualizedSavings500)}`,     id: "annualized" },
            { label: "ED Cost / Visit",          value: `$${fmt(result.roi.edCostPerVisit)}`,           id: "ed-cost" },
            { label: "UC Cost / Visit",          value: `$${fmt(result.roi.urgentCareCostPerVisit)}`,   id: "uc-cost" },
          ].map(({ label, value, id }) => (
            <div key={id} className="border rounded p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-1" data-testid={`text-roi-${id}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payer Contract Engine ────────────────────────────────────────────────────
function PayerPanel() {
  const { toast } = useToast();
  const [volume, setVolume] = useState("1000");
  const [contract, setContract] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);

  const { mutate: simulate, isPending: simPending } = useMutation({
    mutationFn: () =>
      fetch(`/api/payer/simulate?volume=${volume}`).then((r) => r.json()),
    onSuccess: setContract,
    onError:   (err: any) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
  });

  const { mutate: negotiate, isPending: negPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/payer/negotiate", {
        avoidedEDVisits: contract?.annualRevenue ? Math.floor(contract.volume * 0.6) : 0,
        totalSavings:    contract?.annualRevenue ?? 0,
        accuracy:        0.92,
      }),
    onSuccess: setStrategy,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Annual Visit Volume</label>
          <Input data-testid="input-payer-volume" className="w-32" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </div>
        <Button data-testid="button-simulate-contract" className="mt-4" onClick={() => simulate()} disabled={simPending}>
          {simPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
          Simulate Contract
        </Button>
        {contract && (
          <Button data-testid="button-negotiate" variant="outline" className="mt-4" onClick={() => negotiate()} disabled={negPending}>
            <TrendingUp className="mr-2 h-4 w-4" /> Suggest Negotiation
          </Button>
        )}
      </div>

      {contract && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Base Rate / Visit",   value: `$${contract.baseRatePerVisit}`,   id: "base" },
            { label: "Bonus / Visit",       value: `$${contract.bonusPerVisit}`,       id: "bonus" },
            { label: "Total Rate / Visit",  value: `$${contract.totalRatePerVisit}`,   id: "total" },
            { label: "Annual Revenue",      value: `$${fmt(contract.annualRevenue)}`,  id: "revenue" },
            { label: "ED Diversion Bonus",  value: `$${fmt(contract.edDiversionBonus)}`,id:"diversion" },
            { label: "Projected ROI",       value: contract.projectedROI,              id: "roi" },
          ].map(({ label, value, id }) => (
            <div key={id} className="border rounded p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-base font-bold mt-1" data-testid={`text-payer-${id}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {strategy && (
        <div className="border rounded-lg p-4 bg-muted/30">
          <p className="font-medium text-sm flex items-center gap-2" data-testid="text-strategy">
            <TrendingUp className="h-4 w-4 text-primary" /> {strategy.strategy}
          </p>
          <Badge className="mt-1" variant="outline">Est. uplift: {strategy.estimatedUplift}</Badge>
          <ul className="mt-2 space-y-1">
            {strategy.levers?.map((l: string, i: number) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5" data-testid={`lever-${i}`}>
                <span>•</span>{l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Pilot Encounter Panel ────────────────────────────────────────────────────
function PilotPanel() {
  const { toast } = useToast();
  const [form, setForm] = useState({ patientId: "pilot-001", complaint: "cough", tempF: "99", hr: "78", spo2: "98" });
  const [result, setResult] = useState<any>(null);

  const { mutate: run, isPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/pilot/encounter", {
        ...form,
        vitals: { tempF: Number(form.tempF), hr: Number(form.hr), spo2: Number(form.spo2) },
      }),
    onSuccess: setResult,
    onError:   (err: any) => toast({ title: "Encounter failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(["patientId", "complaint", "tempF", "hr", "spo2"] as const).map((k) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground capitalize">{k}</label>
            <Input data-testid={`input-pilot-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <Button data-testid="button-run-encounter" onClick={() => run()} disabled={isPending} className="w-full">
        {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-2 h-4 w-4" />}
        Run Pilot Encounter
      </Button>

      {result && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <Badge data-testid="badge-encounter-status" className={result.status === "complete" ? "bg-green-600 text-white" : "bg-yellow-500 text-black"}>
              {result.status}
            </Badge>
            {result.clinical?.riskLevel && (
              <Badge variant="outline" data-testid="badge-risk">{result.clinical.riskLevel}</Badge>
            )}
          </div>
          <p className="text-sm" data-testid="text-encounter-diagnosis">
            Diagnosis: <strong>{result.clinical?.diagnosis ?? "—"}</strong>
          </p>
          <p className="text-sm" data-testid="text-encounter-disposition">
            Disposition: <strong>{result.clinical?.disposition ?? "—"}</strong>
          </p>
          {result.billing && (
            <p className="text-xs text-muted-foreground" data-testid="text-encounter-cpt">
              CPT: <span className="font-mono font-medium">{result.billing.code}</span> — {result.billing.level}
            </p>
          )}
          {result.ehr && (
            <p className="text-xs text-muted-foreground" data-testid="text-encounter-ehr">
              EHR: {result.ehr.success ? "✓ Submitted" : "✗ Failed"} ({result.ehr.system})
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClinicalOperationsCenter() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-ops-center">
          Clinical Operations Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          SaMD dossier · Clinical trial simulation · Payer ROI · Contract negotiation · Pilot encounters
        </p>
      </div>

      <Tabs defaultValue="dossier">
        <TabsList data-testid="tabs-ops-center">
          <TabsTrigger value="dossier"   data-testid="tab-dossier">FDA Dossier</TabsTrigger>
          <TabsTrigger value="trial"     data-testid="tab-trial">Trial Simulator</TabsTrigger>
          <TabsTrigger value="roi"       data-testid="tab-roi">Payer ROI</TabsTrigger>
          <TabsTrigger value="payer"     data-testid="tab-payer">Contract Engine</TabsTrigger>
          <TabsTrigger value="pilot"     data-testid="tab-pilot">Pilot Encounter</TabsTrigger>
        </TabsList>

        <TabsContent value="dossier">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck className="h-4 w-4" /> SaMD FDA Submission Dossier</CardTitle></CardHeader>
            <CardContent><SaMDPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Synthetic Clinical Trial Simulator</CardTitle></CardHeader>
            <CardContent><TrialPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Payer ROI Engine</CardTitle></CardHeader>
            <CardContent><ROIPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payer">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Payer Contract Engine</CardTitle></CardHeader>
            <CardContent><PayerPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilot">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Pilot Encounter Workflow</CardTitle></CardHeader>
            <CardContent><PilotPanel /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
