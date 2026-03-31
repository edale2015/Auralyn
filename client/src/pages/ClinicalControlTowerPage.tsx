import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Database, Loader2, ChevronDown, ChevronUp,
  Brain, HelpCircle, FlipHorizontal, Target, Stethoscope, Zap
} from "lucide-react";
import DecisionTreeViz from "@/components/tower/DecisionTreeViz";
import ScoringConsole from "@/components/tower/ScoringConsole";
import AdaptiveQuestioningPanel from "@/components/tower/AdaptiveQuestioningPanel";
import CounterfactualPanel from "@/components/tower/CounterfactualPanel";
import WorkupOptimizer from "@/components/tower/WorkupOptimizer";

const SAMPLE_INPUTS = {
  strep: {
    label: "Strep Throat (ENT)",
    complaintId: "sore_throat",
    symptoms: ["sore_throat", "fever", "tonsillar_exudate", "no_cough"],
    answers: { fever: true, sore_throat: true, age: 24, tonsillar_exudate: true, no_cough: true },
  },
  flu: {
    label: "Influenza",
    complaintId: "flu",
    symptoms: ["fever", "cough", "myalgia", "sudden_onset"],
    answers: { fever: true, cough: true, myalgia: true, sudden_onset: true, age: 35 },
  },
  chest_pain: {
    label: "Chest Pain",
    complaintId: "chest_pain",
    symptoms: ["chest_pain", "dyspnea", "sweats"],
    answers: { chest_pain: true, dyspnea: true, sweats: true, age: 55 },
  },
};

export default function ClinicalControlTowerPage() {
  const { toast } = useToast();

  const [complaintId, setComplaintId] = useState("sore_throat");
  const [symptomsText, setSymptomsText] = useState('["sore_throat","fever","tonsillar_exudate","no_cough"]');
  const [answersText, setAnswersText] = useState('{"fever":true,"sore_throat":true,"age":24,"tonsillar_exudate":true,"no_cough":true}');
  const [budget, setBudget] = useState("1000");
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      let symptoms: string[] = [];
      let answers: Record<string, unknown> = {};
      try { symptoms = JSON.parse(symptomsText); } catch { throw new Error("Symptoms JSON invalid"); }
      try { answers = JSON.parse(answersText); } catch { throw new Error("Answers JSON invalid"); }
      const res = await apiRequest("POST", "/api/control/analyze", {
        complaintId,
        symptoms,
        answers,
        answeredQuestions: answeredKeys,
        workupBudget: Number(budget),
      });
      return res.json();
    },
    onError: (e: Error) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/control/seed", {}); return r.json(); },
    onSuccess: (d: any) => toast({ title: "KB seeded", description: `${d.seeded} rows inserted` }),
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const result = analyzeMutation.data as any;

  function loadSample(key: keyof typeof SAMPLE_INPUTS) {
    const s = SAMPLE_INPUTS[key];
    setComplaintId(s.complaintId);
    setSymptomsText(JSON.stringify(s.symptoms));
    setAnswersText(JSON.stringify(s.answers));
    setAnsweredKeys([]);
  }

  function handleMarkAnswered(key: string) {
    setAnsweredKeys(prev => [...new Set([...prev, key])]);
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">CCT Decision Engine</h1>
            <p className="text-xs text-muted-foreground">KB-Driven Clinical Control Tower</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Database className="h-3 w-3" />
              {result.engineSource}
              {result.featureModelRows != null && ` · ${result.featureModelRows} features`}
              {result.uniqueRules != null && ` · ${result.uniqueRules} rules`}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed"
          >
            {seedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Seed KB
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden gap-0">

        {/* LEFT: Case input */}
        <div className="w-64 shrink-0 border-r bg-card flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Case Input</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {/* Sample buttons */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Load sample</p>
                <div className="flex flex-col gap-1">
                  {(Object.keys(SAMPLE_INPUTS) as (keyof typeof SAMPLE_INPUTS)[]).map(k => (
                    <Button
                      key={k}
                      size="sm"
                      variant="ghost"
                      className="justify-start h-7 text-xs px-2"
                      onClick={() => loadSample(k)}
                      data-testid={`button-sample-${k}`}
                    >
                      <Stethoscope className="h-3 w-3 mr-1.5 shrink-0" />
                      {SAMPLE_INPUTS[k].label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <Label className="text-xs">Complaint ID</Label>
                <Input
                  value={complaintId}
                  onChange={e => setComplaintId(e.target.value)}
                  placeholder="e.g. sore_throat"
                  className="h-7 text-xs"
                  data-testid="input-complaint-id"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Symptoms (JSON array)</Label>
                <Textarea
                  value={symptomsText}
                  onChange={e => setSymptomsText(e.target.value)}
                  rows={4}
                  className="text-xs font-mono resize-none"
                  data-testid="input-symptoms"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Answers (JSON object)</Label>
                <Textarea
                  value={answersText}
                  onChange={e => setAnswersText(e.target.value)}
                  rows={5}
                  className="text-xs font-mono resize-none"
                  data-testid="input-answers"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Workup Budget ($)</Label>
                <Input
                  type="number"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-budget"
                />
              </div>

              <Button
                className="w-full h-8 text-sm"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                data-testid="button-analyze"
              >
                {analyzeMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Play className="h-4 w-4 mr-1" />}
                Analyze
              </Button>

              {analyzeMutation.isError && (
                <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
                  {(analyzeMutation.error as Error).message}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER: Decision Tree */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="px-4 py-2 border-b bg-card shrink-0 flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision Tree</p>
            {analyzeMutation.isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
            )}
          </div>
          <div className="flex-1 overflow-hidden p-3">
            {result?.tree ? (
              <DecisionTreeViz
                tree={result.tree}
                engineSource={result.engineSource}
                featureModelRows={result.featureModelRows}
                uniqueRules={result.uniqueRules}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <Brain className="h-12 w-12 opacity-20" />
                <p className="text-sm">Run an analysis to see the decision tree</p>
                <p className="text-xs opacity-60">All reasoning is traced from KB feature models</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Tabbed panels */}
        <div className="w-96 shrink-0 border-l flex flex-col overflow-hidden">
          <Tabs defaultValue="scoring" className="flex flex-col h-full">
            <div className="border-b bg-card px-2 pt-2 shrink-0">
              <TabsList className="grid grid-cols-4 h-8 w-full">
                <TabsTrigger value="scoring" className="text-xs gap-1" data-testid="tab-scoring">
                  <Brain className="h-3 w-3" />Scores
                </TabsTrigger>
                <TabsTrigger value="questions" className="text-xs gap-1" data-testid="tab-questions">
                  <HelpCircle className="h-3 w-3" />Qx
                </TabsTrigger>
                <TabsTrigger value="counterfactuals" className="text-xs gap-1" data-testid="tab-counterfactuals">
                  <FlipHorizontal className="h-3 w-3" />CFx
                </TabsTrigger>
                <TabsTrigger value="workup" className="text-xs gap-1" data-testid="tab-workup">
                  <Target className="h-3 w-3" />Wkup
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3">
                <TabsContent value="scoring" className="mt-0">
                  {result?.scoring ? (
                    <ScoringConsole data={result.scoring} />
                  ) : (
                    <EmptyState icon={Brain} message="Run analysis to see scoring" />
                  )}
                </TabsContent>

                <TabsContent value="questions" className="mt-0">
                  {result?.questions ? (
                    <AdaptiveQuestioningPanel
                      questions={result.questions}
                      answeredKeys={answeredKeys}
                      onMarkAnswered={handleMarkAnswered}
                    />
                  ) : (
                    <EmptyState icon={HelpCircle} message="Run analysis to see adaptive questions" />
                  )}
                </TabsContent>

                <TabsContent value="counterfactuals" className="mt-0">
                  {result?.counterfactuals ? (
                    <CounterfactualPanel counterfactuals={result.counterfactuals} />
                  ) : (
                    <EmptyState icon={FlipHorizontal} message="Run analysis to see counterfactuals" />
                  )}
                </TabsContent>

                <TabsContent value="workup" className="mt-0">
                  {result?.workup ? (
                    <WorkupOptimizer workup={result.workup} />
                  ) : (
                    <EmptyState icon={Target} message="Run analysis to see workup optimizer" />
                  )}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Bottom: Raw JSON toggle */}
      {result && (
        <div className="border-t bg-card shrink-0">
          <button
            className="flex items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground w-full transition-colors"
            onClick={() => setShowRaw(v => !v)}
            data-testid="button-toggle-raw"
          >
            {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Raw trace JSON
            <Badge variant="outline" className="ml-1 text-xs py-0">
              {result.uniqueRules ?? 0} rules
            </Badge>
          </button>
          {showRaw && (
            <ScrollArea className="h-40 border-t">
              <pre className="p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
      <Icon className="h-8 w-8 opacity-30" />
      <p className="text-sm text-center">{message}</p>
    </div>
  );
}
