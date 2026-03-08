import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart3 } from "lucide-react";

type QASummary = { complaintId: string; totalCases: number; overrideCount: number; exportFailures: number; missingQuestionCount: number; dispositionDistribution: Record<string, number> };

export default function ComplaintQADashboard() {
  const { authFetch } = useAuth();
  const [summaries, setSummaries] = useState<QASummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/complaintQADashboard");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSummaries(json.summaries || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-complaint-qa">
      <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5" /><h2 className="text-xl font-semibold">Complaint QA Dashboard</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : summaries.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No QA data.</p> : (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">QA by Complaint</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>Complaint</TableHead><TableHead>Cases</TableHead><TableHead>Missing Qs</TableHead><TableHead>Export Failures</TableHead><TableHead>Dispositions</TableHead></TableRow></TableHeader>
            <TableBody>{summaries.map((s) => (
              <TableRow key={s.complaintId} data-testid={`qa-row-${s.complaintId}`}>
                <TableCell className="text-xs font-mono">{s.complaintId}</TableCell>
                <TableCell className="text-xs">{s.totalCases}</TableCell>
                <TableCell className="text-xs">{s.missingQuestionCount}</TableCell>
                <TableCell className="text-xs">{s.exportFailures}</TableCell>
                <TableCell className="text-xs">{Object.entries(s.dispositionDistribution).map(([k, v]) => <Badge key={k} variant="outline" className="mr-1 text-xs">{k}: {v}</Badge>)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
