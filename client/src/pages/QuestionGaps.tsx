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
import { Loader2, HelpCircle } from "lucide-react";

type QuestionGap = {
  token: string;
  complaintId: string;
  missingCount: number;
  totalCases: number;
  missingRate: number;
  requestedDuringReview: number;
};

export default function QuestionGaps() {
  const { authFetch } = useAuth();
  const [gaps, setGaps] = useState<QuestionGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/questionGaps");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setGaps(json.gaps || []);
      } catch (err: any) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-question-gaps">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Question Gap Analysis</h2>
      </div>

      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8" data-testid="text-empty">
          No question gaps detected.
        </p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Commonly Missing Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Missing Rate</TableHead>
                    <TableHead>Missing / Total</TableHead>
                    <TableHead>Requested in Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gaps.map((g, i) => (
                    <TableRow key={`${g.complaintId}-${g.token}`} data-testid={`gap-row-${i}`}>
                      <TableCell className="text-xs font-mono">{g.token}</TableCell>
                      <TableCell className="text-xs">{g.complaintId}</TableCell>
                      <TableCell>
                        <Badge
                          variant={g.missingRate > 0.5 ? "destructive" : g.missingRate > 0.2 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {(g.missingRate * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{g.missingCount} / {g.totalCases}</TableCell>
                      <TableCell className="text-xs">{g.requestedDuringReview}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
