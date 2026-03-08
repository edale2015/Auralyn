import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileCheck } from "lucide-react";

type Consent = { consentId: string; patientId: string; type: string; granted: boolean; grantedAt?: string; revokedAt?: string };

export default function PatientConsentAdmin() {
  const { authFetch } = useAuth();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/patientConsent");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setConsents(json.consents || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-patient-consent">
      <div className="flex items-center gap-3"><FileCheck className="h-5 w-5" /><h2 className="text-xl font-semibold">Patient Consent Admin</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : consents.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No consent records.</p> : (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Consent Records</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>{consents.map((c) => (
              <TableRow key={c.consentId} data-testid={`consent-row-${c.consentId}`}>
                <TableCell className="text-xs font-mono">{c.patientId}</TableCell>
                <TableCell className="text-xs">{c.type}</TableCell>
                <TableCell><Badge variant={c.granted ? "default" : "destructive"} className="text-xs">{c.granted ? "Granted" : "Revoked"}</Badge></TableCell>
                <TableCell className="text-xs">{c.grantedAt ? new Date(c.grantedAt).toLocaleString() : "—"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
