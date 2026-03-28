import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, RefreshCw, Send, AlertTriangle } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending:          "border-gray-500/40 bg-gray-900/20 text-gray-400",
  submitted:        "border-blue-500/40 bg-blue-900/20 text-blue-400",
  approved:         "border-green-500/40 bg-green-900/20 text-green-400",
  denied:           "border-red-500/40 bg-red-900/20 text-red-400",
  appealing:        "border-amber-500/40 bg-amber-900/20 text-amber-400",
  appealed_approved:"border-emerald-500/40 bg-emerald-900/20 text-emerald-400",
  expired:          "border-muted/40 bg-muted/20 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "Pending", submitted: "Submitted", approved: "✅ Approved",
    denied: "❌ Denied", appealing: "⏳ Appealing",
    appealed_approved: "✅ Appeal Approved", expired: "Expired",
  };
  const colors: Record<string, string> = {
    pending: "secondary", submitted: "default", approved: "default",
    denied: "destructive", appealing: "secondary",
    appealed_approved: "default", expired: "secondary",
  };
  return <Badge variant={(colors[status] ?? "secondary") as any} className="text-[10px]">{labels[status] ?? status}</Badge>;
}

export default function PriorAuthPage() {
  const { toast } = useToast();
  const [queue, setQueue]   = useState<any[]>([]);
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [appealing, setAppealing]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/prior-auth/queue");
      const j = await r.json();
      setQueue(j.queue ?? []);
      setStats(j.stats);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 4000);
    return () => clearInterval(t);
  }, [fetchData]);

  const submit = async (paId: string) => {
    setSubmitting(paId);
    try {
      await fetch(`/api/prior-auth/${paId}/submit`, { method: "POST" });
      toast({ title: "PA submitted to payer" });
      fetchData();
    } catch (e: any) {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  const appeal = async (paId: string) => {
    setAppealing(paId);
    try {
      await fetch(`/api/prior-auth/${paId}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Additional clinical documentation provided per physician review." }),
      });
      toast({ title: "Appeal filed" });
      fetchData();
    } catch (e: any) {
      toast({ title: "Appeal failed", description: e.message, variant: "destructive" });
    } finally { setAppealing(null); }
  };

  const createNew = async () => {
    setLoading(true);
    try {
      const demos = [
        { caseId: `c-${Date.now()}`, diagnosis: "Acute Sinusitis", cpt: "30140", icd10: "J01.90", payer: "bcbs-ny", urgency: "routine" },
        { caseId: `c-${Date.now()}`, diagnosis: "Otitis Externa", cpt: "69210", icd10: "H60.90", payer: "cigna", urgency: "urgent" },
        { caseId: `c-${Date.now()}`, diagnosis: "Influenza B", cpt: "87804", icd10: "J10.1", payer: "aetna", urgency: "urgent" },
      ];
      const demo = demos[Math.floor(Math.random() * demos.length)];
      const r = await fetch("/api/prior-auth/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(demo),
      });
      const j = await r.json();
      toast({ title: `PA created: ${j.pa.paId}` });
      fetchData();
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Prior Authorization</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData} data-testid="btn-refresh-pa"><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={createNew} disabled={loading} data-testid="btn-create-pa">+ New PA Request</Button>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Approved", value: (stats.byStatus?.approved ?? 0) + (stats.byStatus?.appealed_approved ?? 0), color: "text-green-400" },
            { label: "Pending/Submitted", value: (stats.byStatus?.pending ?? 0) + (stats.byStatus?.submitted ?? 0), color: "text-blue-400" },
            { label: "Denied", value: stats.byStatus?.denied ?? 0, color: "text-red-400" },
            { label: "Approval Rate", value: `${(stats.approvalRate * 100).toFixed(0)}%`, color: "text-emerald-400" },
          ].map(s => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* PA Queue */}
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">PA Queue ({queue.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {queue.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No PA requests yet.</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {queue.map(pa => (
                <div key={pa.paId} className={`rounded-lg border px-3 py-2.5 text-xs ${STATUS_STYLES[pa.status] ?? "border-border/40"}`} data-testid={`card-pa-${pa.paId}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-[11px]">{pa.paId}</span>
                        <StatusBadge status={pa.status} />
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{pa.urgency}</Badge>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{pa.payer}</Badge>
                      </div>
                      <p className="mt-1 font-medium">{pa.diagnosis} · CPT {pa.cpt} · ICD {pa.icd10}</p>
                      {pa.denialReason && (
                        <div className="flex items-center gap-1 mt-1 text-red-400">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>{pa.denialReason}</span>
                        </div>
                      )}
                      {pa.appealNotes && <p className="mt-0.5 text-amber-400 italic">{pa.appealNotes}</p>}
                      <p className="text-muted-foreground mt-0.5">
                        Submitted {new Date(pa.submittedAt).toLocaleString()}
                        {pa.decisionAt && ` · Decision ${new Date(pa.decisionAt).toLocaleTimeString()}`}
                        {pa.authId && ` · Auth: ${pa.authId}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {pa.status === "pending" && (
                        <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => submit(pa.paId)} disabled={submitting === pa.paId} data-testid={`btn-submit-pa-${pa.paId}`}>
                          <Send className="h-2.5 w-2.5 mr-1" />{submitting === pa.paId ? "…" : "Submit"}
                        </Button>
                      )}
                      {pa.status === "denied" && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => appeal(pa.paId)} disabled={appealing === pa.paId} data-testid={`btn-appeal-pa-${pa.paId}`}>
                          {appealing === pa.paId ? "Filing…" : "Appeal"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
