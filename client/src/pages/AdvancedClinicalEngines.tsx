import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Brain, Activity, Shield, Users, TrendingUp, ArrowRight } from "lucide-react";

function DriftDetectorTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/clinical-drift"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Analyzing drift...</div>;
  if (!data) return null;

  const sevColor: Record<string, string> = {
    none: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data.totalCases}</div>
            <div className="text-xs text-muted-foreground">Cases Compared</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Badge className={`text-lg px-3 py-1 ${sevColor[data.severity]}`} data-testid="badge-drift-severity">
              {data.severity.toUpperCase()}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">Drift Severity</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-diag-change-rate">{(data.diagnosisChangeRate * 100).toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Diagnosis Change Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-disp-change-rate">{(data.dispositionChangeRate * 100).toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Disposition Change Rate</div>
          </CardContent>
        </Card>
      </div>

      {data.changedDiagnoses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Diagnosis Changes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1" data-testid="drift-diagnosis-changes">
              {data.changedDiagnoses.map((c: string, i: number) => (
                <div key={i} className="text-sm bg-muted/50 p-2 rounded flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  {c}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.changedDispositions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Disposition Changes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1" data-testid="drift-disposition-changes">
              {data.changedDispositions.map((c: string, i: number) => (
                <div key={i} className="text-sm bg-muted/50 p-2 rounded flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  {c}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UncertaintyNavigatorTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/uncertainty-navigator"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Computing optimal questions...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold font-mono" data-testid="text-current-entropy">{data.currentEntropy}</div>
            <div className="text-xs text-muted-foreground">Current Entropy</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="pt-4 text-center">
            <div className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-best-question">
              {data.bestQuestion?.text || "N/A"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Best Next Question</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold font-mono text-green-600 dark:text-green-400" data-testid="text-best-gain">
              {data.informationGain}
            </div>
            <div className="text-xs text-muted-foreground">Information Gain</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Question Rankings by Information Gain</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="uncertainty-rankings">
            {data.rankings?.map((q: any, i: number) => (
              <div key={q.questionId} className="flex items-center gap-3 p-2 rounded bg-muted/30" data-testid={`uncertainty-q-${i}`}>
                <Badge variant={i === 0 ? "default" : "secondary"}>#{i + 1}</Badge>
                <span className="flex-1 text-sm font-medium">{q.text}</span>
                <span className="font-mono text-sm text-green-600 dark:text-green-400 font-bold">{q.gain}</span>
                <div className="w-24 bg-muted rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(q.gain / (data.rankings[0]?.gain || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OutcomeLearningTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/outcome-learning"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading outcome data...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data.totalOutcomes}</div>
            <div className="text-xs text-muted-foreground">Outcomes Analyzed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-diag-accuracy">
              {(data.diagnosticAccuracy * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Diagnostic Accuracy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-disp-accuracy">
              {(data.dispositionAccuracy * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Disposition Accuracy</div>
          </CardContent>
        </Card>
      </div>

      {data.recommendations?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Learning Recommendations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="outcome-recommendations">
              {data.recommendations.map((r: string, i: number) => (
                <div key={i} className="text-sm p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                  {r}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Confusion Matrix</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-confusion-matrix">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Predicted</th>
                  <th className="p-2"><ArrowRight className="h-3 w-3 inline" /></th>
                  <th className="p-2">Actual</th>
                  <th className="p-2 text-right">Count</th>
                  <th className="p-2">Match</th>
                </tr>
              </thead>
              <tbody>
                {data.confusionMatrix?.map((c: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-medium">{c.predicted}</td>
                    <td className="p-2"><ArrowRight className="h-3 w-3 text-muted-foreground" /></td>
                    <td className="p-2 font-medium">{c.actual}</td>
                    <td className="p-2 text-right">{c.count}</td>
                    <td className="p-2">
                      <Badge variant={c.predicted === c.actual ? "default" : "destructive"} className="text-xs">
                        {c.predicted === c.actual ? "CORRECT" : "MISMATCH"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RiskScoresTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/risk-scores/demo"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Computing risk scores...</div>;
  if (!data) return null;

  const scoreColor = (score: number, max: number) => {
    const pct = score / max;
    if (pct <= 0.3) return "text-green-600 dark:text-green-400";
    if (pct <= 0.6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="space-y-4" data-testid="risk-scores-list">
      {data.scores?.map((s: any, i: number) => (
        <Card key={i} data-testid={`risk-score-${i}`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{s.scoreName}</span>
              <span className={`text-3xl font-mono ${scoreColor(s.score, s.maxScore)}`}>
                {s.score} / {s.maxScore}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">{s.interpretation}</p>
            <p className="text-sm text-muted-foreground">{s.recommendation}</p>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  s.score / s.maxScore <= 0.3 ? "bg-green-500" : s.score / s.maxScore <= 0.6 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${(s.score / s.maxScore) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FederatedLearningTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/federated-learning"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Aggregating clinic data...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-fed-clinics">{data.totalClinics}</div>
            <div className="text-xs text-muted-foreground">Participating Clinics</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-fed-cases">{data.totalCases.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Cases</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data.topDiagnoses?.length}</div>
            <div className="text-xs text-muted-foreground">Diagnosis Types</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Clinic Contributions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="fed-clinic-list">
            {data.clinicContributions?.map((c: any) => (
              <div key={c.clinicId} className="flex items-center gap-3" data-testid={`fed-clinic-${c.clinicId}`}>
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{c.clinicName}</span>
                <span className="text-sm font-mono">{c.cases} cases</span>
                <Badge variant="outline">{c.share}%</Badge>
                <div className="w-20 bg-muted rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${c.share}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Global Diagnosis Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="fed-diagnosis-dist">
            {data.topDiagnoses?.map((d: any) => (
              <div key={d.diagnosis} className="flex items-center gap-3">
                <span className="text-sm font-medium w-40 truncate">{d.diagnosis}</span>
                <div className="flex-1 bg-muted rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: `${d.percentage}%` }} />
                </div>
                <span className="text-sm font-mono w-16 text-right">{d.count}</span>
                <Badge variant="secondary" className="text-xs w-14 justify-center">{d.percentage}%</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdvancedClinicalEngines() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-advanced-engines-title">Advanced Clinical Engines</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drift detection, uncertainty navigation, outcome learning, risk scoring, and federated learning
        </p>
      </div>

      <Tabs defaultValue="drift" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="drift" data-testid="tab-drift">
            <AlertTriangle className="h-4 w-4 mr-1" /> Drift
          </TabsTrigger>
          <TabsTrigger value="uncertainty" data-testid="tab-uncertainty">
            <Brain className="h-4 w-4 mr-1" /> Navigator
          </TabsTrigger>
          <TabsTrigger value="outcomes" data-testid="tab-outcomes">
            <TrendingUp className="h-4 w-4 mr-1" /> Outcomes
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">
            <Shield className="h-4 w-4 mr-1" /> Risk Scores
          </TabsTrigger>
          <TabsTrigger value="federated" data-testid="tab-federated">
            <Users className="h-4 w-4 mr-1" /> Federated
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drift"><DriftDetectorTab /></TabsContent>
        <TabsContent value="uncertainty"><UncertaintyNavigatorTab /></TabsContent>
        <TabsContent value="outcomes"><OutcomeLearningTab /></TabsContent>
        <TabsContent value="risk"><RiskScoresTab /></TabsContent>
        <TabsContent value="federated"><FederatedLearningTab /></TabsContent>
      </Tabs>
    </div>
  );
}
