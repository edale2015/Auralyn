import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TestRun = { runId: string; complaintId: string; totalCases: number; timestamp: string };

export default function SyntheticTesting() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [complaintId, setComplaintId] = useState("");
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const res = await authFetch("/api/syntheticTesting/runs");
      const json = await res.json();
      setRuns(json.runs || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    if (!complaintId.trim()) return;
    setGenerating(true);
    try {
      const res = await authFetch("/api/syntheticTesting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: complaintId.trim(), count: 10 }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Test run created" });
      setComplaintId("");
      load();
    } catch (err: any) { toast({ title: "Error", description: err?.message, variant: "destructive" }); }
    finally { setGenerating(false); }
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-synthetic-testing">
      <div className="flex items-center gap-3"><FlaskConical className="h-5 w-5" /><h2 className="text-xl font-semibold">Synthetic Testing</h2></div>
      <div className="flex gap-2">
        <Input placeholder="Complaint ID (e.g. sore_throat)" value={complaintId} onChange={(e) => setComplaintId(e.target.value)} className="max-w-sm" data-testid="input-complaint-id" />
        <Button onClick={generate} disabled={generating || !complaintId.trim()} data-testid="button-generate">
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Generate & Run
        </Button>
      </div>
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : runs.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No test runs yet.</p> : (
        <div className="space-y-2">{runs.map((r) => (
          <Card key={r.runId} data-testid={`run-${r.runId}`}><CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div><div className="text-sm font-medium">{r.complaintId}</div><div className="text-xs text-muted-foreground">{r.runId} — {r.totalCases} cases</div></div>
              <Badge variant="secondary" className="text-xs">{new Date(r.timestamp).toLocaleString()}</Badge>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}
