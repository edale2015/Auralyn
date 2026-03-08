import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Package } from "lucide-react";

type ManifestEntry = { caseId: string; complaintId: string; status: string; exportedAt?: string };
type ManifestData = { totalCases: number; exportedCases: number; pendingCases: number; manifests: ManifestEntry[] };

export default function EcwExportWorkbench() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/ecwPackets/manifest");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-ecw-workbench">
      <div className="flex items-center gap-3"><Package className="h-5 w-5" /><h2 className="text-xl font-semibold">eCW Export Workbench</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : !data ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No data.</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold" data-testid="stat-total">{data.totalCases}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-green-600" data-testid="stat-exported">{data.exportedCases}</div><div className="text-xs text-muted-foreground">Exported</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-amber-600" data-testid="stat-pending">{data.pendingCases}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
          </div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Export Manifest</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Complaint</TableHead><TableHead>Status</TableHead><TableHead>Exported</TableHead></TableRow></TableHeader>
              <TableBody>{data.manifests.slice(0, 50).map((m) => (
                <TableRow key={m.caseId} data-testid={`manifest-row-${m.caseId}`}>
                  <TableCell className="text-xs font-mono">{m.caseId}</TableCell>
                  <TableCell className="text-xs">{m.complaintId}</TableCell>
                  <TableCell><Badge variant={m.status === "exported" ? "default" : m.status === "ready" ? "secondary" : "outline"} className="text-xs">{m.status}</Badge></TableCell>
                  <TableCell className="text-xs">{m.exportedAt ? new Date(m.exportedAt).toLocaleString() : "—"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
