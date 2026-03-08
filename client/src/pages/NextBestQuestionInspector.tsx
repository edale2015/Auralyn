import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Zap } from "lucide-react";

export default function NextBestQuestionInspector() {
  const { authFetch } = useAuth();
  const [caseId, setCaseId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function inspect() {
    if (!caseId.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await authFetch(`/api/questionImpactDebug/${caseId.trim()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setResult(json);
    } catch (err: any) { setError(err?.message ?? "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-next-best-question">
      <div className="flex items-center gap-3">
        <Zap className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Next Best Question Inspector</h2>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} className="max-w-sm" data-testid="input-case-id" />
        <Button onClick={inspect} disabled={loading} data-testid="button-inspect">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1">Inspect</span>
        </Button>
      </div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Best Question</CardTitle></CardHeader>
            <CardContent>
              <Badge variant="default" data-testid="best-question">{result.bestQuestion || "None"}</Badge>
            </CardContent>
          </Card>
          {result.rankings?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Question Rankings</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Token</TableHead><TableHead>Info Gain</TableHead><TableHead>Separation</TableHead><TableHead>Clusters</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.rankings.map((r: any, i: number) => (
                      <TableRow key={r.token} data-testid={`ranking-row-${i}`}>
                        <TableCell className="text-xs font-mono">{r.token}</TableCell>
                        <TableCell className="text-xs">{r.informationGain}</TableCell>
                        <TableCell className="text-xs">{r.separationPower}</TableCell>
                        <TableCell className="text-xs">{r.affectedClusters?.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
