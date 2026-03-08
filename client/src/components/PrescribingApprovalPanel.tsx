import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Req = { caseId: string; medicationId: string; dose: string; duration: string; prescriberId: string; status: string };

export default function PrescribingApprovalPanel() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await authFetch("/api/prescribingControls?status=pending");
      const json = await res.json();
      setRequests(json.requests || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function review(caseId: string, medicationId: string, approved: boolean) {
    try {
      await authFetch("/api/prescribingControls/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, medicationId, approved }),
      });
      toast({ title: approved ? "Approved" : "Denied" });
      load();
    } catch (err: any) { toast({ title: "Error", description: err?.message, variant: "destructive" }); }
  }

  if (loading) return <div className="flex justify-center py-4" data-testid="status-loading"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (requests.length === 0) return <p className="text-sm text-muted-foreground p-4" data-testid="text-empty">No pending prescribing requests</p>;

  return (
    <Card data-testid="prescribing-approval-panel">
      <CardHeader className="pb-2"><CardTitle className="text-base">Pending Prescribing Requests</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Medication</TableHead><TableHead>Dose</TableHead><TableHead>Duration</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{requests.map((r) => (
            <TableRow key={`${r.caseId}-${r.medicationId}`} data-testid={`prescribing-row-${r.caseId}`}>
              <TableCell className="text-xs font-mono">{r.caseId}</TableCell>
              <TableCell className="text-xs">{r.medicationId}</TableCell>
              <TableCell className="text-xs">{r.dose}</TableCell>
              <TableCell className="text-xs">{r.duration}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => review(r.caseId, r.medicationId, true)} data-testid={`button-approve-${r.caseId}`}><Check className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => review(r.caseId, r.medicationId, false)} data-testid={`button-deny-${r.caseId}`}><X className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
