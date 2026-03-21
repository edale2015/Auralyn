// ARCHIVED — Phase 4 Step 21 cleanup
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, GitBranch } from "lucide-react";

type GraphNode = { id: string; label: string; type: string };
type GraphEdge = { from: string; to: string; label?: string };

export default function DecisionGraphExplorer() {
  const { authFetch } = useAuth();
  const [caseId, setCaseId] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!caseId.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await authFetch(`/api/decisionGraphs/trace/${caseId.trim()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNodes(json.nodes || []);
      setEdges(json.edges || []);
    } catch (err: any) { setError(err?.message ?? "Error"); }
    finally { setLoading(false); }
  }

  const nodeTypeColor = (t: string) => t === "outcome" ? "default" : t === "redFlag" ? "destructive" : "outline";

  return (
    <div className="p-6 space-y-4" data-testid="page-decision-graph-explorer">
      <div className="flex items-center gap-3"><GitBranch className="h-5 w-5" /><h2 className="text-xl font-semibold">Decision Graph Explorer</h2></div>
      <div className="flex gap-2">
        <Input placeholder="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} className="max-w-sm" data-testid="input-case-id" />
        <Button onClick={load} disabled={loading} data-testid="button-load">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load Graph"}
        </Button>
      </div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {nodes.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Graph ({nodes.length} nodes, {edges.length} edges)</CardTitle></CardHeader><CardContent>
          <div className="space-y-2">
            {nodes.map((n) => (
              <div key={n.id} className="flex items-center gap-2" data-testid={`node-${n.id}`}>
                <Badge variant={nodeTypeColor(n.type) as any} className="text-xs">{n.type}</Badge>
                <span className="text-sm">{n.label}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
