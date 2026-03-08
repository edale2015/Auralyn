import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type ValResult = { caseId: string; valid: boolean; checks: { name: string; passed: boolean; message: string }[] };
type BatchData = { total: number; valid: number; invalid: number; results: ValResult[] };

export default function ClinicalValidation() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<BatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/clinicalValidation");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-clinical-validation">
      <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5" /><h2 className="text-xl font-semibold">Clinical Validation</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : !data ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No data.</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-total">{data.total}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-green-600" data-testid="stat-valid">{data.valid}</div><div className="text-xs text-muted-foreground">Valid</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-red-600" data-testid="stat-invalid">{data.invalid}</div><div className="text-xs text-muted-foreground">Invalid</div></CardContent></Card>
          </div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Validation Results</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Status</TableHead><TableHead>Checks</TableHead></TableRow></TableHeader>
              <TableBody>{data.results.slice(0, 30).map((r) => (
                <TableRow key={r.caseId} data-testid={`val-row-${r.caseId}`}>
                  <TableCell className="text-xs font-mono">{r.caseId}</TableCell>
                  <TableCell>{r.valid ? <Badge variant="default" className="text-xs">Valid</Badge> : <Badge variant="destructive" className="text-xs">Invalid</Badge>}</TableCell>
                  <TableCell className="text-xs">{r.checks.filter((c) => !c.passed).map((c) => c.name).join(", ") || "All passed"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
