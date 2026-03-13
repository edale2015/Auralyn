import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield, Brain, Search, AlertTriangle, CheckCircle, XCircle, Zap,
  BarChart3, Clock, Beaker, Database, RefreshCw, Activity, TrendingUp
} from "lucide-react";

const COMPLAINTS = [
  "chest_pain","sore_throat","cough","abdominal_pain","fever",
  "uti","ear_pain","rash","sinus_pressure","headache","anxiety","back_pain","dizziness",
];

function dispositionBadge(d: string) {
  const map: Record<string, string> = {
    er_now: "bg-red-100 text-red-800 border-red-200",
    urgent_care: "bg-orange-100 text-orange-800 border-orange-200",
    routine: "bg-blue-100 text-blue-800 border-blue-200",
    home_care: "bg-green-100 text-green-800 border-green-200",
    need_more_info: "bg-yellow-100 text-yellow-800 border-yellow-200",
    uncertain: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return map[d] ?? "bg-gray-100 text-gray-700";
}

function dispositionLabel(d: string) {
  const map: Record<string, string> = {
    er_now: "🚨 ER NOW",
    urgent_care: "⚡ Urgent Care",
    routine: "📋 Routine",
    home_care: "🏠 Home Care",
    need_more_info: "❓ Need More Info",
    uncertain: "🤔 Uncertain",
  };
  return map[d] ?? d;
}

function ProbBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[180px]">{label.replace(/_/g," ")}</span>
        <span className="font-mono font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EvaluatorPanel() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("chest_pain");
  const [featuresText, setFeaturesText] = useState("pressure, radiates_left_arm, diaphoresis");
  const [age, setAge] = useState("52");
  const [sex, setSex] = useState("male");
  const [result, setResult] = useState<any>(null);

  const evalMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/hybrid/evaluate", body).then(r => r.json()),
    onSuccess: (data) => { setResult(data); },
    onError: () => toast({ title: "Evaluation failed", variant: "destructive" }),
  });

  const features = featuresText.split(",").map(s => s.trim()).filter(Boolean);

  function run() {
    evalMut.mutate({ complaint, features, age: parseInt(age) || undefined, sex: sex || undefined });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Patient Case Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Complaint</Label>
              <Select value={complaint} onValueChange={setComplaint}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-complaint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input className="h-8 text-xs" value={age} onChange={e => setAge(e.target.value)} data-testid="input-age" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sex</Label>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-sex"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Features (comma-separated)</Label>
            <Textarea
              className="text-xs h-16 resize-none"
              value={featuresText}
              onChange={e => setFeaturesText(e.target.value)}
              placeholder="e.g. fever, cough, shortness_of_breath"
              data-testid="textarea-features"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={run} disabled={evalMut.isPending} data-testid="button-evaluate">
              {evalMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Evaluating...</> : <><Zap className="h-3 w-3 mr-1" />Run Hybrid Evaluation</>}
            </Button>
            <span className="text-xs text-muted-foreground">{features.length} features</span>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge className={`text-sm px-3 py-1 font-semibold border ${dispositionBadge(result.disposition)}`}>
              {dispositionLabel(result.disposition)}
            </Badge>
            <span className="text-xs text-muted-foreground">Confidence: {Math.round(result.confidence * 100)}%</span>
            <span className="text-xs text-muted-foreground">Uncertainty: {result.layer3_probabilistic?.uncertaintyScore?.toFixed(2)}</span>
          </div>

          {result.need_more_info && result.next_question && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 text-sm">
                <strong>Next question to ask:</strong> {result.next_question}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Card className={`border-2 ${result.layer1_safety.override ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50"}`}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs font-semibold">
                  {result.layer1_safety.override
                    ? <><XCircle className="h-3 w-3 text-red-600" /><span className="text-red-700">Layer 1: SAFETY FLAG</span></>
                    : <><CheckCircle className="h-3 w-3 text-green-600" /><span className="text-green-700">Layer 1: Safe</span></>}
                </div>
                {result.layer1_safety.triggered_flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.layer1_safety.triggered_flags.map((f: string) => (
                      <Badge key={f} variant="destructive" className="text-xs px-1 py-0">{f.replace(/_/g," ")}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Search className="h-3 w-3" />Layer 2: Case Memory
                </div>
                <div className="text-sm font-semibold">{result.layer2_similarity_votes?.[0]?.diagnosis?.replace(/_/g," ") ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{result.layer2_similar_cases?.length ?? 0} similar cases</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Brain className="h-3 w-3" />Layer 3: Bayesian
                </div>
                <div className="text-sm font-semibold">{result.layer3_probabilistic?.topDiagnosis?.replace(/_/g," ") ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Entropy: {result.layer3_probabilistic?.uncertaintyScore?.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold">Ensemble Differential</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {(result.layer3_ensemble_differential ?? []).slice(0, 6).map((e: any) => (
                  <ProbBar key={e.diagnosis} label={e.diagnosis} value={e.combined_score} max={result.layer3_ensemble_differential[0]?.combined_score || 1} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold">Bayesian Probabilities</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {(result.layer3_probabilistic?.probabilities ?? []).slice(0, 6).map((p: any) => (
                  <ProbBar key={p.diagnosis} label={p.diagnosis} value={p.probability} />
                ))}
              </CardContent>
            </Card>
          </div>

          {result.layer4_explanation && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-3">
                <div className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                  <Brain className="h-3 w-3" />Layer 4: LLM Clinical Explanation
                </div>
                <p className="text-sm text-blue-900">{result.layer4_explanation}</p>
              </CardContent>
            </Card>
          )}

          {(result.layer2_similar_cases ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold">Top Similar Cases from Memory</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-1.5">
                  {result.layer2_similar_cases.slice(0, 5).map((c: any) => (
                    <div key={c.case_id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {c.adversarial && <Badge variant="destructive" className="text-xs px-1 py-0">ADV</Badge>}
                        <span className="font-medium">{c.top_diagnosis.replace(/_/g," ")}</span>
                        <span className="text-muted-foreground">({c.complaint.replace(/_/g," ")})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs border ${dispositionBadge(c.expected_disposition)}`}>{c.expected_disposition.replace(/_/g," ")}</Badge>
                        <span className="font-mono text-muted-foreground">{(c.similarity * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30">
            <CardContent className="p-3">
              <div className="text-xs font-semibold mb-1">Reasoning Path</div>
              <div className="space-y-0.5">
                {(result.reasoning_path ?? []).map((step: string, i: number) => (
                  <div key={i} className="text-xs font-mono text-muted-foreground">{i + 1}. {step}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AdversarialPanel() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const { data: advData } = useQuery({
    queryKey: ["/api/hybrid/adversarial"],
    queryFn: () => fetch("/api/hybrid/adversarial").then(r => r.json()),
  });

  const testMut = useMutation({
    mutationFn: (case_id: string) => apiRequest("POST", "/api/hybrid/adversarial/test", { case_id }).then(r => r.json()),
    onSuccess: (data) => {
      setTestResult(data);
      toast({ title: data.test_passed ? "✅ Test PASSED" : "❌ Test FAILED", variant: data.test_passed ? "default" : "destructive" });
    },
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Beaker className="h-4 w-4 text-orange-600" />Adversarial Case Library ({advData?.total ?? 0} traps)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            {(advData?.cases ?? []).map((c: any) => (
              <div key={c.case_id} className={`border rounded p-2.5 text-xs cursor-pointer transition-colors ${selectedId === c.case_id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => setSelectedId(c.case_id)} data-testid={`adv-case-${c.case_id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{c.case_id}</Badge>
                    <span className="font-medium text-orange-700">{c.complaint.replace(/_/g," ")}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{c.expected_differential[0].replace(/_/g," ")}</span>
                  </div>
                  <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">ER NOW</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.key_features.map((f: string) => <Badge key={f} variant="secondary" className="text-xs px-1 py-0">{f.replace(/_/g," ")}</Badge>)}
                </div>
                <div className="mt-1 text-muted-foreground italic">{c.age}y {c.sex}</div>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-700"
            onClick={() => testMut.mutate(selectedId)}
            disabled={testMut.isPending}
            data-testid="button-run-adversarial"
          >
            {testMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Testing...</> : <><Beaker className="h-3 w-3 mr-1" />Test Selected Case</>}
          </Button>
        </CardContent>
      </Card>

      {testResult && (
        <Card className={`border-2 ${testResult.test_passed ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              {testResult.test_passed
                ? <><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-800">Safety system correctly identified the trap</span></>
                : <><XCircle className="h-5 w-5 text-red-600" /><span className="text-red-800">⚠ System may have missed the critical diagnosis</span></>}
            </div>
            <div className="text-sm grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Expected:</span> <Badge className="bg-red-100 text-red-800 border-red-200">{testResult.expected_disposition}</Badge></div>
              <div><span className="text-muted-foreground">Got:</span> <Badge className={`border ${dispositionBadge(testResult.hybrid_result.disposition)}`}>{dispositionLabel(testResult.hybrid_result.disposition)}</Badge></div>
            </div>
            {testResult.hybrid_result.layer1_safety.override && (
              <Alert className="border-green-200 bg-green-100">
                <Shield className="h-4 w-4 text-green-700" />
                <AlertDescription className="text-green-800 text-xs">Safety layer triggered: {testResult.hybrid_result.layer1_safety.triggered_flags.join(", ")}</AlertDescription>
              </Alert>
            )}
            {testResult.hybrid_result.layer4_explanation && (
              <p className="text-xs text-muted-foreground italic">{testResult.hybrid_result.layer4_explanation}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CalibrationPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: report } = useQuery({
    queryKey: ["/api/hybrid/calibration/report"],
    queryFn: () => fetch("/api/hybrid/calibration/report").then(r => r.json()),
  });

  const { data: drift } = useQuery({
    queryKey: ["/api/hybrid/calibration/drift"],
    queryFn: () => fetch("/api/hybrid/calibration/drift").then(r => r.json()),
  });

  const [caseId, setCaseId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [predProb, setPredProb] = useState("0.75");
  const [actual, setActual] = useState("1");

  const recordMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/hybrid/calibration/record", body).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Calibration record saved" });
      qc.invalidateQueries({ queryKey: ["/api/hybrid/calibration/report"] });
    },
  });

  const gradeColor: Record<string, string> = {
    excellent: "text-green-700", good: "text-blue-700", fair: "text-orange-700", poor: "text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Brier Score Calibration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{report.brier_score.toFixed(3)}</span>
                  <span className={`text-sm font-semibold ${gradeColor[report.calibration_grade] ?? ""}`}>{report.calibration_grade.toUpperCase()}</span>
                </div>
                <div className="text-xs text-muted-foreground">Based on {report.total_records} records</div>
                <div className="text-xs space-y-0.5">
                  <div>Mean predicted: <span className="font-mono">{(report.mean_predicted * 100).toFixed(1)}%</span></div>
                  <div>Mean actual: <span className="font-mono">{(report.mean_actual * 100).toFixed(1)}%</span></div>
                </div>
                {(report.overconfident || report.underconfident) && (
                  <Alert className="border-orange-200 bg-orange-50 py-2">
                    <AlertTriangle className="h-3 w-3 text-orange-600" />
                    <AlertDescription className="text-orange-800 text-xs">{report.note}</AlertDescription>
                  </Alert>
                )}
              </>
            ) : <div className="text-xs text-muted-foreground">Loading...</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Drift Monitor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {drift?.alerts?.map((a: string, i: number) => (
              <Alert key={i} className="border-orange-200 bg-orange-50 py-1">
                <AlertDescription className="text-xs text-orange-800">{a}</AlertDescription>
              </Alert>
            ))}
            {drift?.current ? (
              <div className="text-xs space-y-0.5">
                <div>ER rate: <span className="font-mono font-semibold">{(drift.current.er_rate * 100).toFixed(1)}%</span> <span className="text-muted-foreground">({drift.trend_er_rate})</span></div>
                <div>Miss rate: <span className="font-mono font-semibold">{(drift.current.dangerous_miss_rate * 100).toFixed(2)}%</span></div>
                <div>Overrides: <span className="font-mono">{drift.current.override_count}</span></div>
              </div>
            ) : <div className="text-xs text-muted-foreground">No drift data yet. Record evaluations to track trends.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Record Calibration Outcome</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Case ID</Label>
            <Input className="h-8 text-xs" value={caseId} onChange={e => setCaseId(e.target.value)} placeholder="CASE_0001" data-testid="input-calib-caseid" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diagnosis</Label>
            <Input className="h-8 text-xs" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="pneumonia" data-testid="input-calib-diagnosis" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Predicted Probability (0–1)</Label>
            <Input className="h-8 text-xs" type="number" min="0" max="1" step="0.01" value={predProb} onChange={e => setPredProb(e.target.value)} data-testid="input-calib-prob" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Actual Outcome</Label>
            <Select value={actual} onValueChange={setActual}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-calib-outcome"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Diagnosis was correct</SelectItem>
                <SelectItem value="0">0 — Diagnosis was incorrect</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Button size="sm" onClick={() => recordMut.mutate({ caseId, diagnosis, predicted_prob: parseFloat(predProb), actual_outcome: parseInt(actual) })} disabled={recordMut.isPending || !caseId || !diagnosis} data-testid="button-record-calib">
              Record Outcome
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelinePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState("DEMO_001");
  const [day, setDay] = useState("1");
  const [symptom, setSymptom] = useState("cough");
  const [severity, setSeverity] = useState("mild");
  const [viewed, setViewed] = useState("");

  const addMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/hybrid/timeline/add", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Event added" }); qc.invalidateQueries({ queryKey: ["/api/hybrid/timeline", viewed] }); },
  });

  const { data: prog } = useQuery({
    queryKey: ["/api/hybrid/timeline", viewed],
    queryFn: () => viewed ? fetch(`/api/hybrid/timeline/${viewed}`).then(r => r.json()) : Promise.resolve(null),
    enabled: !!viewed,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Add Timeline Event</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Case ID</Label>
            <Input className="h-8 text-xs" value={caseId} onChange={e => setCaseId(e.target.value)} data-testid="input-timeline-caseid" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Day of Illness</Label>
            <Input className="h-8 text-xs" type="number" value={day} onChange={e => setDay(e.target.value)} data-testid="input-timeline-day" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Symptom</Label>
            <Input className="h-8 text-xs" value={symptom} onChange={e => setSymptom(e.target.value)} data-testid="input-timeline-symptom" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-timeline-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Button size="sm" onClick={() => addMut.mutate({ caseId, day: parseInt(day), symptom, severity })} disabled={addMut.isPending} data-testid="button-add-timeline">
              Add Event
            </Button>
            <Button size="sm" variant="outline" onClick={() => setViewed(caseId)} data-testid="button-view-timeline">
              View Progression
            </Button>
          </div>
        </CardContent>
      </Card>

      {prog && (
        <Card className={prog.riskFlag ? "border-orange-300 bg-orange-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {prog.riskFlag ? <AlertTriangle className="h-4 w-4 text-orange-600" /> : <Activity className="h-4 w-4 text-green-600" />}
              Timeline: {prog.caseId} ({prog.durationDays} days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {prog.riskFlag && (
              <Alert className="border-orange-200 bg-orange-100 py-2">
                <AlertDescription className="text-orange-800 text-xs font-medium">{prog.riskReason}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">{prog.progressionSignal}</p>
            <div className="space-y-1">
              {(prog.events ?? []).map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-xs border-l-2 border-primary/30 pl-2">
                  <span className="font-mono text-muted-foreground w-12">Day {e.day}</span>
                  <span className="font-medium">{e.symptom.replace(/_/g," ")}</span>
                  {e.severity && <Badge variant="outline" className="text-xs px-1 py-0">{e.severity}</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OverridePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["/api/hybrid/override/stats"],
    queryFn: () => fetch("/api/hybrid/override/stats").then(r => r.json()),
  });

  const [form, setForm] = useState({ caseId: "", complaint: "chest_pain", features: "", aiDisp: "home_care", aiDx: "", physDisp: "urgent_care", physDx: "", reason: "" });

  const overrideMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/hybrid/override", body).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: `Override recorded. Reward signal: ${data.override.reward > 0 ? "+" : ""}${data.override.reward}` });
      qc.invalidateQueries({ queryKey: ["/api/hybrid/override/stats"] });
    },
    onError: () => toast({ title: "Failed to record override", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Overrides</div>
              <div className="text-2xl font-bold">{stats.total_overrides}</div>
              <div className="text-xs text-muted-foreground mt-1">Avg reward: {stats.avg_reward}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 space-y-1">
              <div className="text-xs font-semibold">Common Patterns</div>
              <div className="text-xs text-muted-foreground">{stats.common_upgrade}</div>
              <div className="text-xs text-muted-foreground">{stats.common_downgrade}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {stats?.recent?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Recent Overrides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3">
            {stats.recent.map((o: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs border rounded px-2 py-1.5">
                <Badge variant="outline" className="text-xs">{o.caseId}</Badge>
                <span className="text-muted-foreground">{o.complaint.replace(/_/g," ")}</span>
                <Badge className={`border ${dispositionBadge(o.ai_disposition)}`}>{o.ai_disposition}</Badge>
                <span>→</span>
                <Badge className={`border ${dispositionBadge(o.physician_disposition)}`}>{o.physician_disposition}</Badge>
                <span className={`font-mono ml-auto ${o.reward >= 0 ? "text-green-600" : "text-red-600"}`}>{o.reward > 0 ? "+" : ""}{o.reward}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Record Physician Override</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {[["Case ID","caseId","text",""],["AI Top Diagnosis","aiDx","text",""],["Physician Diagnosis","physDx","text",""],["Override Reason","reason","text",""]].map(([label, key]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input className="h-8 text-xs" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} data-testid={`input-override-${key}`} />
            </div>
          ))}
          {[["Complaint","complaint",COMPLAINTS],["AI Disposition","aiDisp",["er_now","urgent_care","routine","home_care"]],["Physician Disposition","physDisp",["er_now","urgent_care","routine","home_care"]]].map(([label, key, opts]) => (
            <div key={key as string} className="space-y-1">
              <Label className="text-xs">{label as string}</Label>
              <Select value={(form as any)[key as string]} onValueChange={v => setForm(f => ({ ...f, [key as string]: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid={`select-override-${key}`}><SelectValue /></SelectTrigger>
                <SelectContent>{(opts as string[]).map(o => <SelectItem key={o} value={o}>{o.replace(/_/g," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          <div className="col-span-2">
            <Button size="sm" onClick={() => overrideMut.mutate({ caseId: form.caseId, complaint: form.complaint, features: [], ai_disposition: form.aiDisp, ai_top_diagnosis: form.aiDx, physician_disposition: form.physDisp, physician_diagnosis: form.physDx, override_reason: form.reason })} disabled={overrideMut.isPending || !form.caseId} data-testid="button-record-override">
              Record Override & Send Learning Signal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DatasetPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["/api/hybrid/dataset/stats"],
    queryFn: () => fetch("/api/hybrid/dataset/stats").then(r => r.json()),
  });

  const regenMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hybrid/dataset/regenerate", {}).then(r => r.json()),
    onSuccess: (d) => { toast({ title: `Regenerated ${d.generated} cases` }); qc.invalidateQueries({ queryKey: ["/api/hybrid/dataset/stats"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Cases</div>
            <div className="text-2xl font-bold">{stats?.total ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Adversarial Traps</div>
            <div className="text-2xl font-bold text-orange-600">{stats?.adversarial ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Complaints</div>
            <div className="text-2xl font-bold">{stats ? Object.keys(stats.byComplaint).length : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">By Complaint</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3 space-y-1">
              {Object.entries(stats.byComplaint ?? {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => (
                <ProbBar key={k} label={k} value={v} max={Math.max(...Object.values(stats.byComplaint ?? {}) as number[])} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">By Disposition</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              {Object.entries(stats.byDisposition ?? {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <Badge className={`border ${dispositionBadge(k)}`}>{k.replace(/_/g," ")}</Badge>
                  <span className="font-mono font-semibold">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Button size="sm" variant="outline" onClick={() => regenMut.mutate()} disabled={regenMut.isPending} data-testid="button-regen-dataset">
        {regenMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Regenerating...</> : <><Database className="h-3 w-3 mr-1" />Regenerate Dataset (300 + Adversarial)</>}
      </Button>
    </div>
  );
}

export default function HybridReasoningConsole() {
  const { data: engineStats } = useQuery({
    queryKey: ["/api/hybrid/stats"],
    queryFn: () => fetch("/api/hybrid/stats").then(r => r.json()),
  });

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Hybrid Clinical Reasoning Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          4-layer clinical AI: Safety Rules → Case Memory → Bayesian Inference → LLM Explanation
        </p>
      </div>

      {engineStats && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" />{engineStats.dataset_size} cases</Badge>
          <Badge variant="outline" className="gap-1"><Brain className="h-3 w-3" />{engineStats.probabilistic_trained ? "Bayesian trained" : "Not trained"}</Badge>
          <Badge variant="outline" className="gap-1 text-orange-700 border-orange-300"><Beaker className="h-3 w-3" />{engineStats.adversarial_cases} adversarial traps</Badge>
          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" />{engineStats.complaints_covered} complaints covered</Badge>
        </div>
      )}

      <Tabs defaultValue="evaluate">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg">
          <TabsTrigger value="evaluate" className="text-xs" data-testid="tab-hybrid-evaluate"><Zap className="h-3 w-3 mr-1" />Evaluate</TabsTrigger>
          <TabsTrigger value="adversarial" className="text-xs" data-testid="tab-hybrid-adversarial"><Beaker className="h-3 w-3 mr-1" />Adversarial</TabsTrigger>
          <TabsTrigger value="calibration" className="text-xs" data-testid="tab-hybrid-calibration"><BarChart3 className="h-3 w-3 mr-1" />Calibration</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs" data-testid="tab-hybrid-timeline"><Clock className="h-3 w-3 mr-1" />Timeline</TabsTrigger>
          <TabsTrigger value="overrides" className="text-xs" data-testid="tab-hybrid-overrides"><AlertTriangle className="h-3 w-3 mr-1" />Overrides</TabsTrigger>
          <TabsTrigger value="dataset" className="text-xs" data-testid="tab-hybrid-dataset"><Database className="h-3 w-3 mr-1" />Dataset</TabsTrigger>
        </TabsList>
        <TabsContent value="evaluate" className="mt-4"><EvaluatorPanel /></TabsContent>
        <TabsContent value="adversarial" className="mt-4"><AdversarialPanel /></TabsContent>
        <TabsContent value="calibration" className="mt-4"><CalibrationPanel /></TabsContent>
        <TabsContent value="timeline" className="mt-4"><TimelinePanel /></TabsContent>
        <TabsContent value="overrides" className="mt-4"><OverridePanel /></TabsContent>
        <TabsContent value="dataset" className="mt-4"><DatasetPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
