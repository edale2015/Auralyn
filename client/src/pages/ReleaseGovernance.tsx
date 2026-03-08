import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket } from "lucide-react";

type Gate = { gateId: string; name: string; status: string };
type Release = { version: string; createdAt: string; status: string; gates: Gate[] };

export default function ReleaseGovernance() {
  const { authFetch } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/releaseGovernance");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setReleases(json.releases || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  const gateBadge = (status: string) => status === "pass" ? "default" : status === "fail" ? "destructive" : "outline";

  return (
    <div className="p-6 space-y-4" data-testid="page-release-governance">
      <div className="flex items-center gap-3"><Rocket className="h-5 w-5" /><h2 className="text-xl font-semibold">Release Governance</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : releases.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No releases.</p> : (
        <div className="space-y-4">{releases.map((r) => (
          <Card key={r.version} data-testid={`release-${r.version}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">v{r.version}</CardTitle>
                <Badge variant={r.status === "released" ? "default" : r.status === "approved" ? "secondary" : "outline"} className="text-xs">{r.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {r.gates.map((g) => (
                  <Badge key={g.gateId} variant={gateBadge(g.status) as any} className="text-xs">{g.name}: {g.status}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}</div>
      )}
    </div>
  );
}
