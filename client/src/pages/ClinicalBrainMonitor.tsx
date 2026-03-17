import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Activity, Brain, Play, ArrowDown, Clock, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function LayerArchitectureTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/layer-brain/layers"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading architecture...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">The 12-layer clinical AI neural stack — all flow passes through the Clinical Brain orchestrator.</p>
      <div className="space-y-1" data-testid="layer-list">
        {data?.layers?.map((layer: any, i: number) => (
          <div key={layer.id}>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors" data-testid={`layer-${layer.id}`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {layer.id}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{layer.name} Layer</div>
                <div className="text-xs text-muted-foreground">{layer.description}</div>
              </div>
              <Badge variant={layer.status === "active" ? "default" : "secondary"} className="text-xs">
                {layer.status}
              </Badge>
            </div>
            {i < (data?.layers?.length || 0) - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealthTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/layer-brain/health"], refetchInterval: 5000 });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Checking health...</div>;

  const statusIcon = (s: string) => {
    if (s === "healthy") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (s === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const statusColor = (s: string) => {
    if (s === "healthy") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (s === "warning") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Badge className={`text-lg px-3 py-1 ${statusColor(data?.overallStatus)}`} data-testid="badge-overall-health">
              {data?.overallStatus?.toUpperCase()}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">Overall</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600" data-testid="text-healthy-count">{data?.healthy}</div>
            <div className="text-xs text-muted-foreground">Healthy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{data?.warning}</div>
            <div className="text-xs text-muted-foreground">Warning</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600">{data?.down}</div>
            <div className="text-xs text-muted-foreground">Down</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold font-mono">{data?.avgLatency}ms</div>
            <div className="text-xs text-muted-foreground">Avg Latency</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Service Status</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="health-service-list">
            {data?.services?.map((s: any) => (
              <div key={s.name} className="flex items-center gap-3 p-2 rounded bg-muted/30" data-testid={`service-${s.name.replace(/\s+/g, "-").toLowerCase()}`}>
                {statusIcon(s.status)}
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <Badge variant="outline" className="text-xs">{s.category}</Badge>
                <span className="font-mono text-xs w-16 text-right">{s.latency}ms</span>
                <Badge className={`text-xs ${statusColor(s.status)}`}>{s.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BrainRunnerTab() {
  const [inputText, setInputText] = useState("I have a sore throat and fever");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/layer-brain/run", { text, source: "web" });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/layer-brain/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/layer-brain/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/layer-brain/cases"] });
    },
  });

  const safetyColor = (level: string) => {
    if (level === "emergency") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    if (level === "urgent") return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    if (level === "caution") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Describe symptoms..."
              data-testid="input-brain-text"
              onKeyDown={(e) => e.key === "Enter" && mutation.mutate(inputText)}
            />
            <Button onClick={() => mutation.mutate(inputText)} disabled={mutation.isPending} data-testid="button-brain-run">
              <Play className="h-4 w-4 mr-1" /> Run Brain
            </Button>
          </div>
        </CardContent>
      </Card>

      {mutation.isPending && <div className="text-center py-8 text-muted-foreground">Running through 12 layers...</div>}

      {result && (
        <div className="space-y-4" data-testid="brain-result">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-lg font-bold" data-testid="text-brain-diagnosis">{result.decision?.diagnosis}</div>
                <div className="text-xs text-muted-foreground">Diagnosis</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <Badge className={`text-sm px-2 py-1 ${safetyColor(result.safety?.level)}`} data-testid="badge-brain-disposition">
                  {result.decision?.disposition?.replace(/_/g, " ").toUpperCase()}
                </Badge>
                <div className="text-xs text-muted-foreground mt-1">Disposition</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold font-mono" data-testid="text-brain-confidence">
                  {(result.decision?.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Confidence</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold font-mono">{result.totalDurationMs}ms</div>
                <div className="text-xs text-muted-foreground">Total Duration</div>
              </CardContent>
            </Card>
          </div>

          {result.safety?.flag && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-bold text-red-600 dark:text-red-400">Safety Alert: {result.safety.level.toUpperCase()}</span>
                  {result.safety.action && <Badge variant="destructive">{result.safety.action}</Badge>}
                </div>
                {result.safety.reasons?.map((r: string, i: number) => (
                  <div key={i} className="text-sm text-red-600 dark:text-red-400">{r}</div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Layer Execution Trace</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1" data-testid="brain-trace">
                {result.trace?.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                    <span className="flex-1 text-sm capitalize font-medium">{t.layer}</span>
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{t.durationMs}ms</span>
                    <div className="w-20 bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(100, (t.durationMs / (result.totalDurationMs || 1)) * 100 * 3)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {result.diagnoses?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Differential Diagnoses</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2" data-testid="brain-differentials">
                  {result.reasoning?.differentials?.map((d: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <Badge variant={i === 0 ? "default" : "secondary"}>#{i + 1}</Badge>
                      <span className="flex-1 text-sm font-medium">{d.diagnosis}</span>
                      <span className="font-mono text-sm">{(d.probability * 100).toFixed(1)}%</span>
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${d.probability * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function EventFeedTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/layer-brain/events"], refetchInterval: 3000 });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading events...</div>;

  const typeColor: Record<string, string> = {
    reasoning: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    health: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    safety: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    decision: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    learning: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  };

  const events = data?.events || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="text-event-count">{events.length} events captured</p>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto" data-testid="event-feed">
        {events.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No events yet. Run the Clinical Brain to generate events.
          </div>
        )}
        {events.map((e: any, i: number) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded border bg-card" data-testid={`event-${i}`}>
            <Badge className={`text-xs shrink-0 ${typeColor[e.type] || ""}`}>{e.type}</Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{e.source}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {e.payload?.duration ? `${e.payload.duration}ms` : ""}
                {e.payload?.error ? ` Error: ${e.payload.error}` : ""}
                {e.payload?.level ? ` Level: ${e.payload.level}` : ""}
                {e.payload?.caseId ? ` Case: ${e.payload.caseId}` : ""}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(e.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClinicalBrainMonitor() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-brain-monitor-title">Clinical Brain Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          12-layer neural architecture, real-time system health, live reasoning, and event monitoring
        </p>
      </div>

      <Tabs defaultValue="architecture" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="architecture" data-testid="tab-architecture">
            <Layers className="h-4 w-4 mr-1" /> Architecture
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <Activity className="h-4 w-4 mr-1" /> Health
          </TabsTrigger>
          <TabsTrigger value="runner" data-testid="tab-runner">
            <Brain className="h-4 w-4 mr-1" /> Run Brain
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">
            <Clock className="h-4 w-4 mr-1" /> Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="architecture"><LayerArchitectureTab /></TabsContent>
        <TabsContent value="health"><SystemHealthTab /></TabsContent>
        <TabsContent value="runner"><BrainRunnerTab /></TabsContent>
        <TabsContent value="events"><EventFeedTab /></TabsContent>
      </Tabs>
    </div>
  );
}
