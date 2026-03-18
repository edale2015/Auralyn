import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

export default function PackAuditLogPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/pack-admin/audit?limit=300");
      const json = await res.json();
      setRows(json.rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function getActionColor(action: string) {
    switch (action) {
      case "create": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "update": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "delete": return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "validate": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      default: return "bg-muted text-muted-foreground";
    }
  }

  return (
    <div className="p-6" data-testid="pack-audit-log-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pack Audit Log</h1>
          <p className="text-muted-foreground">Track all changes to packs, questions, and templates</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} data-testid="button-refresh-audit">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
            <Badge variant="outline" data-testid="badge-audit-count">{rows.length} entries</Badge>
          </div>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-240px)]">
          <CardContent className="space-y-3">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">No audit entries yet. Changes to packs and questions will appear here.</p>
            )}
            {rows.map((row: any) => (
              <div
                key={row.id}
                className="border rounded-lg p-3 space-y-2"
                data-testid={`audit-entry-${row.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{row.entityType}</Badge>
                    <span className="font-medium text-sm" data-testid={`text-entity-${row.id}`}>{row.entityId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${getActionColor(row.action)}`}>
                      {row.action}
                    </span>
                    {row.validationOk !== undefined && (
                      row.validationOk
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {row.at ? new Date(row.at).toLocaleString() : "N/A"}
                  </span>
                  <span>Actor: {row.actorId}{row.actorName ? ` (${row.actorName})` : ""}</span>
                </div>

                {row.notes && (
                  <p className="text-xs text-muted-foreground">{row.notes}</p>
                )}

                {row.validationIssuesJson && row.validationIssuesJson !== "[]" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Validation issues
                    </summary>
                    <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-auto whitespace-pre-wrap">{row.validationIssuesJson}</pre>
                  </details>
                )}

                {row.afterJson && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">After JSON</summary>
                    <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-auto whitespace-pre-wrap">{row.afterJson}</pre>
                  </details>
                )}
              </div>
            ))}
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
