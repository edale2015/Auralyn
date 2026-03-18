import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, Play, FileText, Shield, Activity } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SimQuestion {
  id: string;
  prompt: string;
  type: string;
  priority: number;
  required?: boolean;
}

interface PackOption {
  id: string;
  title: string;
  system: string;
  likelyDisposition: string;
}

export default function PackSimulatorPage() {
  const [selectedPack, setSelectedPack] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [simResult, setSimResult] = useState<any>(null);

  const packsQuery = useQuery<{ packs: PackOption[] }>({
    queryKey: ["/api/pack-simulator/available-packs"],
  });

  const questionsQuery = useQuery<{ questions: SimQuestion[]; title: string; system: string; redFlags: string[] }>({
    queryKey: ["/api/pack-simulator/questions", selectedPack],
    enabled: !!selectedPack,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/pack-simulator/questions", { symptomPackId: selectedPack });
      return res.json();
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pack-simulator/run", {
        symptomPackId: selectedPack,
        answers,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSimResult(data);
    },
  });

  function handleAnswer(qId: string, value: string) {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  }

  function handleSelectPack(packId: string) {
    setSelectedPack(packId);
    setAnswers({});
    setSimResult(null);
  }

  const packs = packsQuery.data?.packs || [];
  const questions = questionsQuery.data?.questions || [];
  const redFlags = questionsQuery.data?.redFlags || [];

  return (
    <div className="space-y-6" data-testid="pack-simulator-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="simulator-title">Pack Simulator</h1>
        <p className="text-muted-foreground">Test complaint packs with sample answers to see escalation, review, and plan output</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Complaint Pack</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedPack} onValueChange={handleSelectPack}>
                <SelectTrigger data-testid="pack-select">
                  <SelectValue placeholder="Choose a symptom pack..." />
                </SelectTrigger>
                <SelectContent>
                  {packs.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} ({p.system})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedPack && questions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Questions ({questions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {questions.map(q => (
                  <div key={q.id} className="space-y-1" data-testid={`question-${q.id}`}>
                    <label className="text-sm font-medium flex items-center gap-2">
                      {q.prompt}
                      {q.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                      {redFlags.includes(q.id) && (
                        <Badge variant="destructive" className="text-xs">Red Flag</Badge>
                      )}
                    </label>
                    {q.type === "yes_no" ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={answers[q.id] === "yes" ? "default" : "outline"}
                          onClick={() => handleAnswer(q.id, "yes")}
                          data-testid={`answer-${q.id}-yes`}
                        >
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant={answers[q.id] === "no" ? "default" : "outline"}
                          onClick={() => handleAnswer(q.id, "no")}
                          data-testid={`answer-${q.id}-no`}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Input
                        value={answers[q.id] || ""}
                        onChange={e => handleAnswer(q.id, e.target.value)}
                        placeholder={q.type === "number" ? "Enter number" : q.type === "duration" ? "e.g. 3 days" : "Enter value"}
                        data-testid={`answer-${q.id}-input`}
                      />
                    )}
                  </div>
                ))}

                <Button
                  className="w-full mt-4"
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  data-testid="run-simulation-btn"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {runMutation.isPending ? "Running..." : "Run Simulation"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {simResult && (
            <Tabs defaultValue="summary" data-testid="sim-results">
              <TabsList className="w-full">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
                <TabsTrigger value="algorithms">Algorithms</TabsTrigger>
                <TabsTrigger value="plan">Plan</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Simulation Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">Escalate</span>
                        <div data-testid="summary-escalate">
                          {simResult.summary.escalate ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" /> YES
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" /> No
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">Review</span>
                        <div data-testid="summary-review">
                          {simResult.summary.review ? (
                            <Badge variant="default" className="flex items-center gap-1 w-fit">
                              <Shield className="h-3 w-3" /> YES
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" /> No
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">Disposition</span>
                        <Badge variant="outline" data-testid="summary-disposition">
                          {simResult.summary.disposition}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">Risk Delta</span>
                        <Badge variant={simResult.summary.riskDelta > 0 ? "destructive" : "secondary"} data-testid="summary-risk-delta">
                          {simResult.summary.riskDelta > 0 ? "+" : ""}{simResult.summary.riskDelta}
                        </Badge>
                      </div>
                    </div>

                    {simResult.summary.redFlagsTriggered.length > 0 && (
                      <div>
                        <span className="text-sm font-medium">Red Flags Triggered:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {simResult.summary.redFlagsTriggered.map((f: string) => (
                            <Badge key={f} variant="destructive" className="text-xs">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {simResult.summary.escalateReasons.length > 0 && (
                      <div>
                        <span className="text-sm font-medium">Escalation Reasons:</span>
                        <ul className="list-disc pl-4 text-sm mt-1">
                          {simResult.summary.escalateReasons.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {simResult.summary.reviewReasons.length > 0 && (
                      <div>
                        <span className="text-sm font-medium">Review Reasons:</span>
                        <ul className="list-disc pl-4 text-sm mt-1">
                          {simResult.summary.reviewReasons.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="evaluation">
                <Card>
                  <CardContent className="pt-6">
                    <pre className="text-xs whitespace-pre-wrap bg-muted p-4 rounded-lg" data-testid="evaluation-json">
                      {JSON.stringify(simResult.evaluation, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="modifiers">
                <Card>
                  <CardContent className="pt-6">
                    <pre className="text-xs whitespace-pre-wrap bg-muted p-4 rounded-lg" data-testid="modifiers-json">
                      {JSON.stringify(simResult.modifiers, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="algorithms">
                <Card>
                  <CardContent className="pt-6">
                    {simResult.triggeredAlgorithms.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No algorithms triggered</p>
                    ) : (
                      <pre className="text-xs whitespace-pre-wrap bg-muted p-4 rounded-lg" data-testid="algorithms-json">
                        {JSON.stringify(simResult.triggeredAlgorithms, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="plan">
                <Card>
                  <CardContent className="pt-6">
                    {simResult.plan ? (
                      <div className="space-y-3" data-testid="plan-details">
                        <div>
                          <span className="text-sm font-medium">Diagnosis:</span>
                          <p className="text-sm">{simResult.plan.diagnosisLabel}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Summary:</span>
                          <p className="text-sm">{simResult.plan.summary}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Patient Message:</span>
                          <p className="text-sm italic">{simResult.plan.patientMessage}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No plan template matched</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {!simResult && selectedPack && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                Answer the questions and click "Run Simulation" to see results
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
