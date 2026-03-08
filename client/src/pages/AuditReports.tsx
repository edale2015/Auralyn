import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Shield } from "lucide-react";

type AuditData = { generatedAt: string; totalEvents: number; byAction: Record<string, number>; byUser: Record<string, number>; recentEntries: { userId: string; action: string; resource: string; timestamp: string }[] };

export default function AuditReports() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/auditReports/report");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-audit-reports">
      <div className="flex items-center gap-3"><Shield className="h-5 w-5" /><h2 className="text-xl font-semibold">Audit Reports</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : !data ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No data.</p> : (
        <div className="space-y-4">
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold" data-testid="stat-total">{data.totalEvents}</div><div className="text-xs text-muted-foreground">Total audit events</div></CardContent></Card>
          {data.recentEntries.length > 0 && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Resource</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                <TableBody>{data.recentEntries.map((e, i) => (
                  <TableRow key={i} data-testid={`audit-row-${i}`}>
                    <TableCell className="text-xs">{e.userId}</TableCell>
                    <TableCell className="text-xs">{e.action}</TableCell>
                    <TableCell className="text-xs">{e.resource}</TableCell>
                    <TableCell className="text-xs">{new Date(e.timestamp).toLocaleString()}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
