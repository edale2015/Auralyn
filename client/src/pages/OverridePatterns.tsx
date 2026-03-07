import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TrendingUp } from "lucide-react";

type OverridePattern = {
  complaintId: string;
  totalCases: number;
  overrideCount: number;
  overrideRate: number;
  dispositionOverrides: { transitions: { from: string; to: string; count: number }[] };
  topOverrideReasons: { reason: string; count: number }[];
};

export default function OverridePatterns() {
  const { authFetch } = useAuth();
  const [patterns, setPatterns] = useState<OverridePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/overridePatterns");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setPatterns(json.patterns || []);
      } catch (err: any) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-override-patterns">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Physician Override Patterns</h2>
      </div>

      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : patterns.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8" data-testid="text-empty">
          No override patterns found.
        </p>
      ) : (
        <div className="space-y-4">
          {patterns.map((p) => (
            <Card key={p.complaintId} data-testid={`override-card-${p.complaintId}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {p.complaintId}
                  <Badge variant={p.overrideRate > 0.3 ? "destructive" : p.overrideRate > 0.1 ? "default" : "secondary"}>
                    {(p.overrideRate * 100).toFixed(0)}% override rate
                  </Badge>
                  <span className="text-xs text-muted-foreground font-normal ml-auto">
                    {p.overrideCount} / {p.totalCases} cases
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.dispositionOverrides.transitions?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Disposition Changes</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Engine</TableHead>
                          <TableHead className="text-xs">Physician</TableHead>
                          <TableHead className="text-xs">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p.dispositionOverrides.transitions.map((t, i) => (
                          <TableRow key={i} data-testid={`transition-row-${i}`}>
                            <TableCell className="text-xs">{t.from}</TableCell>
                            <TableCell className="text-xs font-medium">{t.to}</TableCell>
                            <TableCell className="text-xs">{t.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {p.topOverrideReasons.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Top Reasons</h4>
                    <div className="flex flex-wrap gap-1">
                      {p.topOverrideReasons.map((r, i) => (
                        <Badge key={i} variant="outline" className="text-xs" data-testid={`reason-badge-${i}`}>
                          {r.reason} ({r.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
