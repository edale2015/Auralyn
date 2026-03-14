import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bot, Wrench, ChevronDown, ChevronRight, Link, Play, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Task = {
  taskId: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: any;
  error?: string;
  toolCalls: { toolId: string; params: Record<string, unknown>; result?: unknown }[];
  createdAt: string;
  completedAt?: string;
};

type Tool = {
  id: string;
  name: string;
  description: string;
  category: string;
};

type LangChainTool = {
  name: string;
  description: string;
  input_schema: any;
};

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const durationMs = task.completedAt
    ? new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()
    : null;

  return (
    <Card data-testid={`task-${task.taskId}`} className="border">
      <CardContent className="pt-4">
        <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setExpanded(!expanded)}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{task.instruction}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono">{task.taskId}</span>
              {durationMs != null && <span>· {durationMs}ms</span>}
              {task.toolCalls.length > 0 && <span>· {task.toolCalls.length} tool call(s)</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={task.status === "completed" ? "default" : task.status === "failed" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {task.status}
            </Badge>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 border-t pt-3 space-y-3">
            {task.toolCalls.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Tool Calls</div>
                <div className="space-y-2">
                  {task.toolCalls.map((tc, i) => (
                    <div key={i} className="bg-muted/30 rounded-md p-2 text-xs">
                      <span className="font-mono font-semibold">{tc.toolId}</span>
                      <div className="text-muted-foreground mt-0.5">{JSON.stringify(tc.params).slice(0, 100)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {task.result && (
              <div>
                <div className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Result</div>
                <pre className="text-xs bg-muted/30 rounded-md p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(task.result, null, 2)}
                </pre>
              </div>
            )}
            {task.error && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">{task.error}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentOps() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [instruction, setInstruction] = useState("");

  const { data: tasksData, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ["/api/agentTasks"],
    refetchInterval: 5000,
  });

  const { data: toolsData } = useQuery<{ tools: Tool[] }>({
    queryKey: ["/api/agentTasks/tools"],
  });

  const { data: langchainToolsData } = useQuery<{ tools: LangChainTool[] }>({
    queryKey: ["/api/langchain/tools"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/agentTasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      if (!res.ok) throw new Error("Failed to submit task");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task submitted" });
      setInstruction("");
      queryClient.invalidateQueries({ queryKey: ["/api/agentTasks"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const [lcTool, setLcTool] = useState("");
  const [lcInput, setLcInput] = useState("");
  const [lcResult, setLcResult] = useState<any>(null);

  const lcRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/langchain/run", {
        tool: lcTool,
        input: lcInput ? JSON.parse(lcInput) : {},
      });
      return res.json();
    },
    onSuccess: (data) => setLcResult(data),
    onError: (e: any) => toast({ title: "LangChain error", description: e?.message, variant: "destructive" }),
  });

  const [chainSteps, setChainSteps] = useState<Array<{ tool: string; input: string }>>([{ tool: "", input: "" }]);
  const [chainResult, setChainResult] = useState<any>(null);

  const chainMutation = useMutation({
    mutationFn: async () => {
      const steps = chainSteps
        .filter((s) => s.tool)
        .map((s) => ({ tool: s.tool, input: s.input ? JSON.parse(s.input) : {} }));
      const res = await apiRequest("POST", "/api/langchain/chain", { steps });
      return res.json();
    },
    onSuccess: (data) => setChainResult(data),
    onError: (e: any) => toast({ title: "Chain failed", description: e?.message, variant: "destructive" }),
  });

  const tasks = tasksData?.tasks || [];
  const tools = toolsData?.tools || [];
  const langchainTools = langchainToolsData?.tools || [];

  const categoryColors: Record<string, string> = {
    clinical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    data: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    communication: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    analysis: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  return (
    <div className="p-6 space-y-4" data-testid="page-agent-ops">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Agent Operations</h2>
        <Badge variant="secondary" className="text-xs">{tasks.length} tasks</Badge>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="tasks" className="gap-1 text-xs"><Bot className="w-3.5 h-3.5" /> Tasks</TabsTrigger>
          <TabsTrigger value="tools" className="gap-1 text-xs"><Wrench className="w-3.5 h-3.5" /> Tool Registry</TabsTrigger>
          <TabsTrigger value="langchain" className="gap-1 text-xs"><Link className="w-3.5 h-3.5" /> LangChain</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4 pt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter task instruction for the agent..."
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !submitMutation.isPending && submitMutation.mutate()}
                  className="flex-1"
                  data-testid="input-instruction"
                />
                <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !instruction.trim()} data-testid="button-submit">
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-12" data-testid="status-loading">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No tasks yet. Submit an instruction above.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => <TaskCard key={t.taskId} task={t} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tools" className="space-y-4 pt-4">
          <div className="text-sm text-muted-foreground mb-2">
            {tools.length} registered clinical agent tools
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tools.map((t) => (
              <Card key={t.id} data-testid={`tool-${t.id}`} className="border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">{t.id}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${categoryColors[t.category] || "bg-muted"}`}>
                      {t.category}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="langchain" className="space-y-4 pt-4">
          <div className="text-sm text-muted-foreground">
            LangChain-compatible tool interface. Use these endpoints from any LangChain agent: <code className="text-xs bg-muted px-1 rounded">POST /api/langchain/run</code> or <code className="text-xs bg-muted px-1 rounded">POST /api/langchain/chain</code>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Single Tool Run</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Tool</Label>
                  <Select value={lcTool} onValueChange={setLcTool}>
                    <SelectTrigger data-testid="select-lc-tool">
                      <SelectValue placeholder="Select a tool" />
                    </SelectTrigger>
                    <SelectContent>
                      {langchainTools.map((t) => (
                        <SelectItem key={t.name} value={t.name}>
                          <div>
                            <div className="text-xs font-medium">{t.name}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {lcTool && langchainTools.find((t) => t.name === lcTool) && (
                    <p className="text-xs text-muted-foreground">
                      {langchainTools.find((t) => t.name === lcTool)?.description}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Input (JSON)</Label>
                  <Textarea
                    value={lcInput}
                    onChange={(e) => setLcInput(e.target.value)}
                    placeholder='{"symptoms": "fever, cough"}'
                    rows={3}
                    className="font-mono text-xs"
                    data-testid="input-lc-json"
                  />
                </div>
                <Button onClick={() => lcRunMutation.mutate()} disabled={!lcTool || lcRunMutation.isPending} data-testid="button-lc-run">
                  {lcRunMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Run Tool
                </Button>
                {lcResult && (
                  <pre className="text-xs bg-muted/30 rounded-md p-2 overflow-auto max-h-48 whitespace-pre-wrap" data-testid="lc-result">
                    {JSON.stringify(lcResult, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tool Chain</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {chainSteps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Select value={step.tool} onValueChange={(v) => setChainSteps(chainSteps.map((s, idx) => idx === i ? { ...s, tool: v } : s))}>
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder={`Step ${i + 1} tool`} />
                          </SelectTrigger>
                          <SelectContent>
                            {langchainTools.map((t) => (
                              <SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder='{"key": "value"}'
                          value={step.input}
                          onChange={(e) => setChainSteps(chainSteps.map((s, idx) => idx === i ? { ...s, input: e.target.value } : s))}
                          className="text-xs font-mono h-7"
                        />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 mt-0.5 shrink-0" onClick={() => setChainSteps(chainSteps.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setChainSteps([...chainSteps, { tool: "", input: "" }])} className="text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Add Step
                  </Button>
                </div>
                <Button onClick={() => chainMutation.mutate()} disabled={chainSteps.every((s) => !s.tool) || chainMutation.isPending} data-testid="button-run-chain">
                  {chainMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Run Chain
                </Button>
                {chainResult && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Completed in {chainResult.totalLatencyMs}ms</div>
                    {chainResult.steps.map((step: any, i: number) => (
                      <div key={i} className="bg-muted/30 rounded-md p-2">
                        <div className="text-xs font-mono font-semibold flex items-center gap-2">
                          {step.tool}
                          {step.error ? <Badge variant="destructive" className="text-xs">error</Badge> : <Badge variant="default" className="text-xs">ok</Badge>}
                          <span className="text-muted-foreground font-normal">{step.latencyMs}ms</span>
                        </div>
                        {step.error && <div className="text-xs text-destructive mt-0.5">{step.error}</div>}
                        {step.output && <pre className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{JSON.stringify(step.output).slice(0, 200)}</pre>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Available LangChain Tools ({langchainTools.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {langchainTools.map((t) => (
                  <div key={t.name} className="border rounded-md p-2">
                    <div className="text-xs font-mono font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
