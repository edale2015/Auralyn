import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

type AuditRow = {
  TIMESTAMP: string;
  CASE_ID: string;
  CC_ID: string;
  TOKEN: string;
  RAW_ANSWER: string;
  PARSED_ANSWER: string;
  NORMALIZED_UNIT: string;
  CONFIDENCE: string;
};

function confidenceBadge(conf: string) {
  const c = conf.toLowerCase();
  if (c === "high")
    return <Badge variant="secondary" className="text-xs" data-testid="badge-confidence-high">high</Badge>;
  if (c === "medium")
    return <Badge variant="outline" className="text-xs" data-testid="badge-confidence-medium">medium</Badge>;
  return <Badge variant="destructive" className="text-xs" data-testid="badge-confidence-low">low</Badge>;
}

export default function CoercionAudit() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [confidence, setConfidence] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (confidence && confidence !== "all") qs.set("confidence", confidence);
      qs.set("limit", "200");

      const res = await authFetch(`/api/chatCoercionAudit?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load audit");
      setRows(json.rows || []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load coercion audit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [confidence]);

  return (
    <div className="p-6 space-y-4" data-testid="page-coercion-audit">
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Chat Coercion Audit</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Answer Normalization Log</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-normal">Confidence:</span>
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger className="w-[120px] h-8" data-testid="select-confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-2" data-testid="text-error">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8" data-testid="status-loading">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4" data-testid="text-empty">
              No coercion audit entries found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Raw</TableHead>
                    <TableHead>Parsed</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={`${r.CASE_ID}_${idx}`} data-testid={`audit-row-${idx}`}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.TIMESTAMP ? new Date(r.TIMESTAMP).toLocaleString() : ""}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.CASE_ID?.slice(0, 16)}</TableCell>
                      <TableCell className="text-xs">{r.CC_ID}</TableCell>
                      <TableCell className="text-xs font-mono">{r.TOKEN}</TableCell>
                      <TableCell className="text-xs">{r.RAW_ANSWER}</TableCell>
                      <TableCell className="text-xs font-semibold">{r.PARSED_ANSWER}</TableCell>
                      <TableCell className="text-xs">{r.NORMALIZED_UNIT}</TableCell>
                      <TableCell>{confidenceBadge(r.CONFIDENCE)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
