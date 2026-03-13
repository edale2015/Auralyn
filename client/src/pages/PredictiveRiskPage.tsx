import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, AlertTriangle, TrendingUp, Info, BarChart3 } from "lucide-react";

type RiskLevel = "low" | "moderate" | "high" | "critical";

interface RiskFactor {
  factor: string;
  present: boolean;
  weight: number;
  contribution: number;
}

interface RiskAssessment {
  admissionRisk: RiskLevel;
  deteriorationRisk: RiskLevel;
  readmissionRisk: RiskLevel;
  riskScore: number;
  maxScore: number;
  factors: RiskFactor[];
  activeFactors: string[];
  recommendedActions: string[];
  confidence: number;
}

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; border: string; badge: string }> = {
  low:      { bg: "bg-green-50",  text: "text-green-800",  border: "border-green-200", badge: "bg-green-100 text-green-800" },
  moderate: { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-800" },
  high:     { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200", badge: "bg-orange-100 text-orange-800" },
  critical: { bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200",    badge: "bg-red-100 text-red-800" },
};

const COMPLAINTS = ["sore_throat", "uti", "cough", "ear_pain", "fever", "chest_pain", "rash", "sinus_pressure", "abdominal_pain"];

function RiskMeter({ level }: { level: RiskLevel }) {
  const pct = { low: 12, moderate: 40, high: 70, critical: 95 }[level];
  const color = { low: "#22c55e", moderate: "#eab308", high: "#f97316", critical: "#ef4444" }[level];
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 60" className="w-24 h-14">
      <path d={`M 10 50 A ${r} ${r} 0 0 1 90 50`} fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      <path d={`M 10 50 A ${r} ${r} 0 0 1 90 50`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${circ / 2}`} strokeDashoffset={`${(circ / 2) * (1 - pct / 100)}`} />
      <text x="50" y="48" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>{level.toUpperCase()}</text>
    </svg>
  );
}

function FactorBar({ factor }: { factor: RiskFactor }) {
  const pct = factor.weight > 0 ? Math.round((factor.contribution / factor.weight) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 py-1.5 px-2 rounded-md ${factor.present ? "bg-orange-50" : "bg-muted/30"}`} data-testid={`factor-${factor.factor.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${factor.present ? "bg-orange-500" : "bg-gray-300"}`} />
      <span className="text-xs flex-1 text-left">{factor.factor}</span>
      <span className="text-xs font-mono text-muted-foreground w-10 text-right">{factor.weight.toFixed(2)}</span>
      <div className="w-20 bg-muted rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${factor.present ? "bg-orange-500" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PredictiveRiskPage() {
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState<RiskAssessment | null>(null);

  const { data: factorsData } = useQuery<{ admissionFactors: any[]; deteriorationFactors: any[] }>({
    queryKey: ["/api/predictive/risk-factors", complaint],
    enabled: !!complaint,
  });

  const riskMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/predictive/admission-risk", { complaint, symptoms }),
    onSuccess: (data: RiskAssessment) => setResult(data),
  });

  const overallRisk: RiskLevel = result
    ? ([result.admissionRisk, result.deteriorationRisk].includes("critical") ? "critical"
      : [result.admissionRisk, result.deteriorationRisk].includes("high") ? "high"
      : [result.admissionRisk, result.deteriorationRisk].includes("moderate") ? "moderate"
      : "low")
    : "low";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-red-600" />
          Predictive Risk Modeling
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-factor admission, deterioration, and readmission risk scoring per complaint
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Risk Calculator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Complaint</label>
              <Select onValueChange={v => { setComplaint(v); setResult(null); }} data-testid="select-risk-complaint">
                <SelectTrigger>
                  <SelectValue placeholder="Select complaint" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Presenting Symptoms & Clinical Notes</label>
              <Textarea
                data-testid="input-risk-symptoms"
                placeholder="Describe symptoms, history, vitals, medications…&#10;Include keywords like: fever, chest pain, shortness of breath, diabetes, age 70, male…"
                rows={6}
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => riskMutation.mutate()}
              disabled={!complaint || !symptoms.trim() || riskMutation.isPending}
              data-testid="button-compute-risk"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              {riskMutation.isPending ? "Computing…" : "Compute Risk"}
            </Button>

            {complaint && factorsData && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Risk factors for {complaint.replace(/_/g, " ")} ({factorsData.admissionFactors.length} admission, {factorsData.deteriorationFactors.length} deterioration)
                </p>
                <div className="flex flex-wrap gap-1">
                  {factorsData.admissionFactors.map((f: any) => (
                    <Badge key={f.key} variant="outline" className="text-xs">{f.label}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {result ? (
          <div className="space-y-4">
            <Card className={`border-2 ${RISK_COLORS[overallRisk].border} ${RISK_COLORS[overallRisk].bg}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Overall Risk</p>
                    <p className={`text-2xl font-bold capitalize ${RISK_COLORS[overallRisk].text}`} data-testid="text-overall-risk">
                      {overallRisk}
                    </p>
                  </div>
                  <RiskMeter level={overallRisk} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    { label: "Admission Risk", value: result.admissionRisk },
                    { label: "Deterioration Risk", value: result.deteriorationRisk },
                    { label: "Readmission Risk", value: result.readmissionRisk },
                  ].map(r => (
                    <div key={r.label} className={`rounded p-1.5 border ${RISK_COLORS[r.value].border} ${RISK_COLORS[r.value].bg}`}>
                      <p className={`font-bold capitalize ${RISK_COLORS[r.value].text}`} data-testid={`text-${r.label.toLowerCase().replace(/\s+/g, "-")}`}>{r.value}</p>
                      <p className="text-muted-foreground">{r.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold">Risk Score</p>
                  <div className="flex items-center gap-1">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Confidence {(result.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold" data-testid="text-risk-score">{result.riskScore}</div>
                  <div className="text-muted-foreground text-sm">/ {result.maxScore}</div>
                  <div className="flex-1 bg-muted rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${overallRisk === "critical" ? "bg-red-500" : overallRisk === "high" ? "bg-orange-500" : overallRisk === "moderate" ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${result.maxScore > 0 ? (result.riskScore / result.maxScore) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {result.activeFactors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Active factors: {result.activeFactors.length}</p>
                    <div className="flex flex-wrap gap-1">
                      {result.activeFactors.map(f => (
                        <Badge key={f} className="bg-orange-100 text-orange-800 text-xs" data-testid={`active-factor-${f.toLowerCase().replace(/\s+/g, "-")}`}>{f}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Recommended Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ul className="space-y-1.5">
                  {result.recommendedActions.map((action, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm" data-testid={`action-${i}`}>
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="border rounded-xl h-64 flex items-center justify-center text-muted-foreground bg-muted/30">
            <div className="text-center">
              <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Select a complaint, enter symptoms,<br />and compute risk</p>
            </div>
          </div>
        )}
      </div>

      {result && result.factors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Risk Factor Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {result.factors.map((f, i) => <FactorBar key={i} factor={f} />)}
            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t px-2">
              <span>Factor</span>
              <span>Weight → Contribution</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
