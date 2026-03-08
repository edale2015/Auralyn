import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, LayoutDashboard } from "lucide-react";

type Summary = { complaintId: string; totalCases: number; activeCases: number; completedCases: number; redFlagRate: number; dispositionBreakdown: Record<string, number> };

export default function ComplaintControlCenter() {
  const { authFetch } = useAuth();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/complaintControlCenter");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSummaries(json.summaries || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-complaint-control-center">
      <div className="flex items-center gap-3"><LayoutDashboard className="h-5 w-5" /><h2 className="text-xl font-semibold">Complaint Control Center</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : summaries.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No complaint data.</p> : (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Complaints Overview</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>Complaint</TableHead><TableHead>Total</TableHead><TableHead>Active</TableHead><TableHead>Completed</TableHead><TableHead>Red Flag Rate</TableHead><TableHead>Dispositions</TableHead></TableRow></TableHeader>
            <TableBody>{summaries.map((s) => (
              <TableRow key={s.complaintId} data-testid={`cc-row-${s.complaintId}`}>
                <TableCell className="text-xs font-mono font-medium">{s.complaintId}</TableCell>
                <TableCell className="text-xs">{s.totalCases}</TableCell>
                <TableCell className="text-xs">{s.activeCases}</TableCell>
                <TableCell className="text-xs">{s.completedCases}</TableCell>
                <TableCell className="text-xs">{Math.round(s.redFlagRate * 100)}%</TableCell>
                <TableCell className="text-xs">{Object.entries(s.dispositionBreakdown).map(([k, v]) => <Badge key={k} variant="outline" className="mr-1 text-xs">{k}: {v}</Badge>)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
