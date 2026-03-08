import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building } from "lucide-react";

type Org = { orgId: string; name: string; tier: string; createdAt: string };

export default function Organizations() {
  const { authFetch } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/organizations");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setOrgs(json.organizations || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-organizations">
      <div className="flex items-center gap-3"><Building className="h-5 w-5" /><h2 className="text-xl font-semibold">Organizations</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : orgs.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No organizations.</p> : (
        <div className="space-y-3">{orgs.map((o) => (
          <Card key={o.orgId} data-testid={`org-card-${o.orgId}`}><CardContent className="pt-4 flex items-center justify-between">
            <div><div className="font-medium">{o.name}</div><div className="text-xs text-muted-foreground">{o.orgId}</div></div>
            <Badge variant="secondary">{o.tier}</Badge>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}
