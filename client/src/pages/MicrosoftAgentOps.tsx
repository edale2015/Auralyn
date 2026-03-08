import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Cpu } from "lucide-react";

type Session = { sessionId: string; steps: any[]; status: string; createdAt: string };

export default function MicrosoftAgentOps() {
  const { authFetch } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/msAgentTasks/sessions");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSessions(json.sessions || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-ms-agent-ops">
      <div className="flex items-center gap-3"><Cpu className="h-5 w-5" /><h2 className="text-xl font-semibold">Microsoft Agent Operations</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : sessions.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No agent sessions.</p> : (
        <div className="space-y-2">{sessions.map((s) => (
          <Card key={s.sessionId} data-testid={`session-${s.sessionId}`}><CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div><div className="text-xs font-mono">{s.sessionId}</div><div className="text-xs text-muted-foreground mt-1">{s.steps.length} steps</div></div>
              <Badge variant={s.status === "completed" ? "default" : s.status === "active" ? "secondary" : "destructive"} className="text-xs">{s.status}</Badge>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}
