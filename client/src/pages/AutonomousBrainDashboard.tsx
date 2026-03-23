import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Zap, Brain, Activity, Shield, Cpu, Eye, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw, Play, FlaskConical
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMPLAINTS_OPTIONS = [
  "ear_pain", "sore_throat", "cough", "chest_pain", "fever",
  "headache", "breathlessness", "dizziness",
];

type SystemHealth = "healthy" | "degraded" | "critical";

function HealthBadge({ health }: { health: SystemHealth }) {
  const map: Record<SystemHealth, { color: string; icon: typeof CheckCircle2 }> = {
    healthy: { color: "bg-green-100 text-green-800", icon: CheckCircle2 },
    degraded: { color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
    critical: { color: "bg-red-100 text-red-800", icon: XCircle },
  };
  const { color, icon: Icon } = map[health];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}
      data-testid="system-health-badge">
      <Icon className="w-3.5 h-3.5" /> {health.toUpperCase()}
    </span>
  );
}

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium text-gray-600">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export default function AutonomousBrainDashboard() {
  const { toast } = useToast();
  const [selectedComplaints, setSelectedComplaints] = useState<string[]>(["ear_pain"]);
  const [simResult, setSimResult] = useState<any>(null);
  const [visionTool, setVisionTool] = useState<string>("otoscope");
  const [visionResult, setVisionResult] = useState<any>(null);

  const { data: brainData, isLoading: brainLoading, refetch: refetchBrain } = useQuery({
    queryKey: ["/api/autonomous/brain"],
    refetchInterval: 15000,
  });

  const simulateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/autonomous/simulate", {
        patientId: `demo-${Date.now()}`,
        complaints: selectedComplaints,
        vitalSigns: { temperature: 38.2, heartRate: 92, oxygenSaturation: 98 },
        riskFactors: [],
      }),
    onSuccess: (data: any) => {
      setSimResult(data.result);
      toast({ title: "Simulation complete", description: `Triage: ${data.result?.triage}` });
    },
    onError: () => toast({ title: "Simulation failed", variant: "destructive" }),
  });

  const visionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/autonomous/vision/analyze", { tool: visionTool }),
    onSuccess: (data: any) => {
      setVisionResult(data.result);
    },
    onError: () => toast({ title: "Vision analysis failed", variant: "destructive" }),
  });

  const brain = (brainData as any)?.state;

  function toggleComplaint(c: string) {
    setSelectedComplaints(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autonomous Brain</h1>
            <p className="text-sm text-gray-500">Unified clinical + robotic + infrastructure intelligence</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchBrain()} data-testid="button-refresh-brain">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {brainLoading && (
        <div className="text-center py-8 text-gray-400">Loading global brain state…</div>
      )}

      {brain && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-3" data-testid="card-brain-header">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-6 items-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">System Health</p>
                  <HealthBadge health={brain.systemHealth} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Recommended Action</p>
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded" data-testid="text-recommended-decision">
                    {brain.recommendedDecision}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Confidence</p>
                  <span className="text-lg font-bold text-gray-800" data-testid="text-brain-confidence">
                    {Math.round(brain.confidence * 100)}%
                  </span>
                </div>
                {brain.dominantAlert && (
                  <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-yellow-800" data-testid="text-dominant-alert">
                      {brain.dominantAlert}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-clinical-snapshot">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" /> Clinical
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-blue-700" data-testid="text-active-patients">
                    {brain.snapshot.clinical?.activePatients}
                  </div>
                  <div className="text-xs text-blue-500">Active Patients</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-orange-700" data-testid="text-triage-queue">
                    {brain.snapshot.clinical?.triageQueue}
                  </div>
                  <div className="text-xs text-orange-500">Triage Queue</div>
                </div>
              </div>
              <ScoreBar label="Avg Risk Score" value={brain.snapshot.clinical?.avgRiskScore ?? 0} />
            </CardContent>
          </Card>

          <Card data-testid="card-robotics-snapshot">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-600" /> Robotics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-col gap-1">
                {Object.entries(brain.snapshot.robotics?.pose ?? {}).map(([axis, val]) => (
                  <div key={axis} className="flex justify-between">
                    <span className="text-gray-500 uppercase text-xs">{axis}</span>
                    <span className="font-mono font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-gray-500">E-STOP</span>
                <Badge variant={brain.snapshot.robotics?.estopActive ? "destructive" : "outline"}
                  data-testid="badge-estop-status">
                  {brain.snapshot.robotics?.estopActive ? "ACTIVE" : "Clear"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-infra-snapshot">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-gray-600" /> Infrastructure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScoreBar label="CPU" value={brain.snapshot.infra?.cpuUsage ?? 0} />
              <ScoreBar label="Memory" value={brain.snapshot.infra?.memUsage ?? 0} />
              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                <div className="bg-gray-50 rounded p-2">
                  <div className="font-bold text-gray-800" data-testid="text-req-per-min">
                    {brain.snapshot.infra?.requestsPerMin}
                  </div>
                  <div className="text-gray-400">req/min</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="font-bold text-gray-800" data-testid="text-error-rate">
                    {((brain.snapshot.infra?.errorRate ?? 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-gray-400">error rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card data-testid="card-simulation">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-teal-600" /> Clinical Simulation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Select complaints</p>
              <div className="flex flex-wrap gap-2">
                {COMPLAINTS_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleComplaint(c)}
                    data-testid={`toggle-complaint-${c}`}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedComplaints.includes(c)
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-teal-400"
                    }`}
                  >
                    {c.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => simulateMutation.mutate()}
              disabled={simulateMutation.isPending || selectedComplaints.length === 0}
              data-testid="button-run-simulation"
            >
              <Play className="w-4 h-4 mr-2" />
              {simulateMutation.isPending ? "Simulating…" : "Run Simulation"}
            </Button>

            {simResult && (
              <div className="space-y-3 border rounded-xl p-3 bg-gray-50" data-testid="simulation-result">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Triage Level</span>
                  <Badge variant={simResult.triage === "immediate" ? "destructive" : "outline"}
                    data-testid="badge-triage-level">
                    {simResult.triage?.toUpperCase()}
                  </Badge>
                </div>
                <ScoreBar label="Risk Score" value={simResult.riskScore} />
                <div>
                  <p className="text-xs text-gray-500 mb-1">Recommended Actions</p>
                  <div className="flex flex-wrap gap-1">
                    {simResult.recommendedActions?.map((a: string) => (
                      <span key={a} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                </div>
                {simResult.roboticActionsTriggered?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Robotic Actions Triggered</p>
                    <div className="flex flex-wrap gap-1">
                      {simResult.roboticActionsTriggered.map((a: string) => (
                        <span key={a} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <Shield className="w-3.5 h-3.5 text-green-600" />
                  <span className={simResult.guardrailsPassed ? "text-green-700" : "text-red-700"}>
                    Guardrails {simResult.guardrailsPassed ? "passed" : "blocked"}
                  </span>
                </div>
                {simResult.guardrailWarnings?.length > 0 && (
                  <ul className="text-xs text-yellow-700 space-y-0.5">
                    {simResult.guardrailWarnings.map((w: string, i: number) => (
                      <li key={i} className="flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-vision">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" /> Robotic Vision Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Tool</p>
              <Select value={visionTool} onValueChange={setVisionTool}>
                <SelectTrigger data-testid="select-vision-tool">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="otoscope">Otoscope</SelectItem>
                  <SelectItem value="oral_camera">Oral Camera</SelectItem>
                  <SelectItem value="ekg_camera">EKG Camera</SelectItem>
                  <SelectItem value="stethoscope">Stethoscope</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              variant="outline"
              onClick={() => visionMutation.mutate()}
              disabled={visionMutation.isPending}
              data-testid="button-analyze-vision"
            >
              <Eye className="w-4 h-4 mr-2" />
              {visionMutation.isPending ? "Analyzing…" : "Analyze Frame"}
            </Button>

            {visionResult && (
              <div className="space-y-3 border rounded-xl p-3 bg-gray-50" data-testid="vision-result">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Detected</span>
                  <span className="text-sm font-semibold text-indigo-700" data-testid="text-detected-target">
                    {visionResult.detected}
                  </span>
                </div>
                <ScoreBar label="Confidence" value={visionResult.confidence} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Safe to Approach</span>
                  <Badge variant={visionResult.safeToApproach ? "outline" : "destructive"}
                    data-testid="badge-safe-approach">
                    {visionResult.safeToApproach ? "Yes" : "No"}
                  </Badge>
                </div>
                {visionResult.recommendedAction && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Recommended Action</p>
                    <code className="text-xs bg-gray-100 rounded px-2 py-1 block" data-testid="text-vision-action">
                      {visionResult.recommendedAction}
                    </code>
                  </div>
                )}
                {visionResult.landmarks?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Landmarks</p>
                    <div className="space-y-1">
                      {visionResult.landmarks.map((lm: any, i: number) => (
                        <div key={i} className="text-xs flex justify-between bg-white rounded px-2 py-1">
                          <span className="font-medium">{lm.name}</span>
                          <span className="text-gray-400 font-mono">({lm.x}, {lm.y})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
