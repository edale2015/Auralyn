import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity, AlertTriangle, Brain, CheckCircle2, ChevronRight,
  ClipboardList, Cpu, FlaskConical, Heartbeat, RotateCcw, Stethoscope,
} from "lucide-react";

const SAMPLE_CRITICAL = {
  patient: {
    patientId: "P-CRITICAL-01",
    complaint: "chest pain and fever",
    symptoms: ["chest pain", "fever", "dyspnea"],
    riskFactors: ["CAD", "diabetes"],
    vitals: { hr: 126, spo2: 91, temp: 39.1, systolic: 88, diastolic: 54, rr: 30 },
    labs: { troponin: 0.12, lactate: 3.1, wbc: 18 },
    exam: { chestPain: true, dyspnea: true, cough: true, alteredMentalStatus: false },
    tests: { ecgStElevation: false, infiltrateOnCxr: true },
  },
};

const SAMPLE_ROUTINE = {
  patient: {
    patientId: "P-ROUTINE-02",
    complaint: "sore throat",
    symptoms: ["sore throat", "runny nose"],
    riskFactors: [],
    vitals: { hr: 78, spo2: 99, temp: 37.8, systolic: 122, diastolic: 76, rr: 16 },
    labs: { troponin: 0, lactate: 0.8, wbc: 10 },
    exam: { chestPain: false, dyspnea: false, cough: false, alteredMentalStatus: false },
    tests: { ecgStElevation: false, infiltrateOnCxr: false },
  },
};

type TelemetryEntry = {
  ts: number;
  risk?: number;
  urgency?: string;
  disagreement?: number;
  disposition?: string;
};
type TelemetryMap = Record<string, TelemetryEntry[]>;

function dispositionColor(d?: string) {
  if (!d) return "secondary";
  if (d === "icu" || d === "physician_required") return "destructive";
  if (d === "ed_or_admit") return "outline";
  return "secondary";
}

function riskDot(risk?: number) {
  if (risk === undefined) return "🟢";
  if (risk > 0.8) return "🔴";
  if (risk > 0.5) return "🟠";
  return "🟢";
}

function CouncilCard({ council }: { council: any }) {
  return (
    <Card data-testid={`council-card-${council.council}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          {council.council.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
          <Badge variant={council.consensus.risk >= 0.75 ? "destructive" : "secondary"} className="ml-auto text-xs">
            risk {council.consensus.risk.toFixed(2)}
          </Badge>
          <Badge variant="outline" className="text-xs">{council.consensus.urgency}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-4">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-mono">{(council.consensus.confidence * 100).toFixed(0)}%</span>
          <span className="text-muted-foreground ml-4">Disagreement</span>
          <span className="font-mono">{council.consensus.disagreement.toFixed(2)}</span>
        </div>

        {council.consensus.recommendation && (
          <div className="bg-muted/40 rounded px-3 py-2 text-xs font-mono">
            {council.consensus.recommendation}
          </div>
        )}

        {council.consensus.flags?.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {council.consensus.flags.map((f: string) => (
              <Badge key={f} variant={f === "critical" ? "destructive" : "outline"} className="text-xs">{f}</Badge>
            ))}
          </div>
        )}

        {council.finalDecision.recommendedTests?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <FlaskConical className="h-3 w-3" /> Recommended tests
            </p>
            <div className="flex gap-1 flex-wrap">
              {(council.finalDecision.recommendedTests as string[]).map((t: string) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {council.reasoningPaths?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ChevronRight className="h-3 w-3" /> Reasoning path
            </p>
            {council.reasoningPaths.slice(0, 2).map((p: any, i: number) => (
              <div key={i} className="text-xs font-mono text-muted-foreground">
                {p.path.join(" → ")} <span className="text-primary">({p.score.toFixed(2)})</span>
              </div>
            ))}
          </div>
        )}

        {council.debate?.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {council.debate.length} debate message{council.debate.length > 1 ? "s" : ""}
            </summary>
            <ul className="mt-1 space-y-0.5 ml-2">
              {council.debate.map((d: any, i: number) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground">{d.from}</span> → {d.to}: {d.critique}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: any }) {
  const fd = result.finalDecision;
  const mc = result.masterConsensus;
  const isEscalated = fd.disposition === "icu" || fd.disposition === "physician_required";

  return (
    <div className="space-y-4" data-testid="council-result-panel">
      {isEscalated && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="font-semibold">
            Escalation required — {fd.disposition.replace(/_/g, " ").toUpperCase()}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Master Council Decision
            <Badge variant={dispositionColor(fd.disposition)} className="ml-auto">
              {fd.disposition.replace(/_/g, " ")}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Action</p>
              <p className="font-mono text-xs">{fd.action}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Active councils</p>
              <p className="font-mono text-xs">{result.activeCouncils.join(", ")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Master risk</p>
              <p className="font-mono">{mc.risk.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Disagreement</p>
              <p className="font-mono">{mc.disagreement.toFixed(3)}</p>
            </div>
          </div>
          <div className="bg-muted/40 rounded px-3 py-2 text-xs">{fd.rationale}</div>

          {fd.recommendedTests?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Recommended tests</p>
              <div className="flex gap-1 flex-wrap">
                {fd.recommendedTests.map((t: string) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {fd.flags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {fd.flags.map((f: string) => (
                <Badge key={f} variant={f === "critical" ? "destructive" : "outline"} className="text-xs">{f}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {result.masterReasoningPaths?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Master Reasoning Paths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {result.masterReasoningPaths.map((p: any, i: number) => (
              <div key={i} className="text-xs font-mono text-muted-foreground">
                {p.path.join(" → ")} <span className="text-primary">(score {p.score.toFixed(2)})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.crossCouncilDebate?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" /> Cross-Council Debate ({result.crossCouncilDebate.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {result.crossCouncilDebate.map((d: any, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{d.from}</span> → {d.to}: {d.critique}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" /> Specialist Councils
        </h3>
        {result.specialistCouncils.map((c: any) => (
          <CouncilCard key={c.council} council={c} />
        ))}
      </div>
    </div>
  );
}

function TelemetryPanel({ telemetry }: { telemetry: TelemetryMap }) {
  const councils = Object.keys(telemetry);
  if (!councils.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No telemetry yet — run a case to generate data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {councils.map(council => (
        <Card key={council} data-testid={`telemetry-${council}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {council.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} Council
              <Badge variant="outline" className="ml-auto text-xs">{telemetry[council].length} runs</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 flex-wrap">
              {telemetry[council].slice(0, 20).map((e, idx) => (
                <span
                  key={idx}
                  title={`risk=${(e.risk ?? 0).toFixed(2)} | disagreement=${(e.disagreement ?? 0).toFixed(2)} | disposition=${e.disposition ?? "n/a"} | urgency=${e.urgency ?? "n/a"}`}
                  className="cursor-help text-base"
                  data-testid={`telemetry-dot-${council}-${idx}`}
                >
                  {riskDot(e.risk)}
                </span>
              ))}
            </div>
            {telemetry[council][0] && (
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <div>Latest risk: <span className="text-foreground font-mono">{(telemetry[council][0].risk ?? 0).toFixed(3)}</span></div>
                <div>Latest urgency: <span className="text-foreground">{telemetry[council][0].urgency ?? "n/a"}</span></div>
                {telemetry[council][0].disposition && (
                  <div>Disposition: <span className="text-foreground">{telemetry[council][0].disposition}</span></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function HierarchicalCouncilDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("runner");
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const telemetryQuery = useQuery<TelemetryMap>({
    queryKey: ["/api/council/graph/telemetry"],
    refetchInterval: 5000,
  });

  const runMutation = useMutation({
    mutationFn: (payload: object) =>
      apiRequest("POST", "/api/council/graph/run", payload).then(r => r.json()),
    onSuccess: (data) => {
      setLastResult(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/council/graph/telemetry"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Council run failed");
    },
  });

  function run(payload: object) {
    setError(null);
    runMutation.mutate(payload);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="hierarchical-council-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Hierarchical Council Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Graph-augmented multi-specialist clinical reasoning — Cardiology · Infectious Disease · ICU
          </p>
        </div>
        <Badge
          variant={telemetryQuery.isError ? "destructive" : "outline"}
          className="text-xs"
          data-testid="telemetry-status-badge"
        >
          {telemetryQuery.isFetching ? "Syncing…" : "Live"}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="council-tabs">
          <TabsTrigger value="runner" data-testid="tab-runner">Case Runner</TabsTrigger>
          <TabsTrigger value="telemetry" data-testid="tab-telemetry">Telemetry</TabsTrigger>
        </TabsList>

        <TabsContent value="runner" className="space-y-4 mt-4">
          <div className="flex gap-3 flex-wrap">
            <Button
              data-testid="btn-run-critical"
              onClick={() => run(SAMPLE_CRITICAL)}
              disabled={runMutation.isPending}
              variant="destructive"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Run Critical Case
            </Button>
            <Button
              data-testid="btn-run-routine"
              onClick={() => run(SAMPLE_ROUTINE)}
              disabled={runMutation.isPending}
              variant="outline"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Run Routine Case
            </Button>
            {lastResult && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="btn-clear-result"
                onClick={() => setLastResult(null)}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          {runMutation.isPending && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm" data-testid="running-indicator">
                <Brain className="h-6 w-6 mx-auto mb-2 animate-pulse text-primary" />
                Running specialist councils…
              </CardContent>
            </Card>
          )}

          {!runMutation.isPending && lastResult && (
            <ResultPanel result={lastResult} />
          )}

          {!runMutation.isPending && !lastResult && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm" data-testid="no-result-placeholder">
                <Stethoscope className="h-8 w-8 mx-auto mb-3 opacity-30" />
                Select a sample case to run the hierarchical council.
                <br />
                <span className="text-xs mt-1 block">
                  Critical case exercises Cardiology + ID + ICU sub-councils with cross-council debate.
                </span>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="telemetry" className="mt-4">
          {telemetryQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading telemetry…</div>
          ) : (
            <TelemetryPanel telemetry={telemetryQuery.data ?? {}} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
