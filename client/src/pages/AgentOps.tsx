import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Task = { taskId: string; instruction: string; status: string; createdAt: string };

export default function AgentOps() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const res = await authFetch("/api/agentTasks");
      const json = await res.json();
      setTasks(json.tasks || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    if (!instruction.trim()) return;
    setSubmitting(true);
    try {
      const res = await authFetch("/api/agentTasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Task submitted" });
      setInstruction("");
      load();
    } catch (err: any) { toast({ title: "Error", description: err?.message, variant: "destructive" }); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-agent-ops">
      <div className="flex items-center gap-3"><Bot className="h-5 w-5" /><h2 className="text-xl font-semibold">Agent Operations</h2></div>
      <div className="flex gap-2">
        <Input placeholder="Enter task instruction..." value={instruction} onChange={(e) => setInstruction(e.target.value)} className="max-w-lg" data-testid="input-instruction" />
        <Button onClick={submit} disabled={submitting || !instruction.trim()} data-testid="button-submit">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
        </Button>
      </div>
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : tasks.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No tasks.</p> : (
        <div className="space-y-2">{tasks.map((t) => (
          <Card key={t.taskId} data-testid={`task-${t.taskId}`}><CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div><div className="text-sm font-medium">{t.instruction}</div><div className="text-xs text-muted-foreground mt-1">{t.taskId}</div></div>
              <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"} className="text-xs">{t.status}</Badge>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}
