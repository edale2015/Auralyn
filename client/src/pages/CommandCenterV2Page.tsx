/**
 * Command Center v2 — Live EHR Writes + Audit Replay
 * Real-time EHR write console with success/fail audit trail and FHIR sync status.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Database, Wifi, WifiOff, FileText, Clock, RotateCcw, Send,
  Shield, Server, ChevronRight,
} from "lucide-react";

export default function CommandCenterV2Page() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [writeForm, setWriteForm] = useState({ patientId: "", disposition: "", notes: "", system: "" });
  const [replayPatientId, setReplayPatientId] = useState("");

  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: ["/api/cc-v2/ehr-status"],
    refetchInterval: 15_000,
  });

  const { data: audit, isLoading: auditLoading } = useQuery<any>({
    queryKey: ["/api/cc-v2/write-audit"],
    refetchInterval: 5_000,
  });

  const { data: replay, isFetching: replayFetching } = useQuery<any>({
    queryKey: ["/api/cc-v2/audit-replay", replayPatientId],
    enabled: replayPatientId.length > 0,
  });

  const writeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cc-v2/ehr-write", writeForm),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cc-v2/write-audit"] });
      qc.invalidateQueries({ queryKey: ["/api/cc-v2/ehr-status"] });
      toast({
        title: data.result?.isMock ? "EHR Write (mock)" : "EHR Write Successful",
        description: `Patient ${writeForm.patientId} → ${data.result?.system ?? "unknown"}`,
      });
      setWriteForm(f => ({ ...f, disposition: "", notes: "" }));
    },
    onError: (err: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cc-v2/write-audit"] });
      toast({ title: "EHR Write Failed", description: err.message, variant: "destructive" });
    },
  });

  const adapters = status?.adapters ?? {};
  const fhir     = status?.fhir ?? {};
  const writeStats = status?.writeAttempts ?? { total: 0, success: 0, failed: 0, mock: 0 };
  const log        = audit?.log ?? [];

  function adapterBadge(configured: boolean, active?: boolean) {
    if (active) return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">mock active</Badge>;
    if (configured) return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">configured</Badge>;
    return <Badge variant="secondary">not configured</Badge>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Command Center v2</h1>
            <p className="text-xs text-slate-400">Live EHR Writes · Audit Replay · FHIR Sync</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => { qc.invalidateQueries({ queryKey: ["/api/cc-v2/ehr-status"] }); qc.invalidateQueries({ queryKey: ["/api/cc-v2/write-audit"] }); }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Writes",   value: writeStats.total,   icon: Activity,      color: "text-blue-400" },
          { label: "Successful",     value: writeStats.success,  icon: CheckCircle,   color: "text-emerald-400" },
          { label: "Failed",         value: writeStats.failed,   icon: XCircle,       color: "text-red-400" },
          { label: "Mock (dev)",     value: writeStats.mock,     icon: Server,        color: "text-slate-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-slate-100" data-testid={`stat-${label.toLowerCase().replace(/ /g, "-")}`}>{value}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* EHR Write Panel */}
        <div className="lg:col-span-1 space-y-3">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" /> New EHR Write
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-400">Patient ID</Label>
                <Input
                  data-testid="input-patient-id"
                  className="bg-slate-800 border-slate-700 text-slate-100 mt-1"
                  placeholder="e.g. P001"
                  value={writeForm.patientId}
                  onChange={e => setWriteForm(f => ({ ...f, patientId: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Disposition / Diagnosis</Label>
                <Input
                  data-testid="input-disposition"
                  className="bg-slate-800 border-slate-700 text-slate-100 mt-1"
                  placeholder="e.g. URGENT_24H – Sepsis R/O"
                  value={writeForm.disposition}
                  onChange={e => setWriteForm(f => ({ ...f, disposition: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Clinical Notes</Label>
                <Textarea
                  data-testid="textarea-notes"
                  className="bg-slate-800 border-slate-700 text-slate-100 mt-1 text-sm resize-none"
                  rows={3}
                  placeholder="Encounter summary, treatment, labs ordered..."
                  value={writeForm.notes}
                  onChange={e => setWriteForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">System Override (optional)</Label>
                <Input
                  data-testid="input-system"
                  className="bg-slate-800 border-slate-700 text-slate-100 mt-1"
                  placeholder="epic | athena | ecw (blank = auto)"
                  value={writeForm.system}
                  onChange={e => setWriteForm(f => ({ ...f, system: e.target.value }))}
                />
              </div>
              <Button
                data-testid="button-submit-ehr-write"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={writeMutation.isPending || !writeForm.patientId || !writeForm.disposition}
                onClick={() => writeMutation.mutate()}
              >
                {writeMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {writeMutation.isPending ? "Writing..." : "Write to EHR"}
              </Button>
            </CardContent>
          </Card>

          {/* EHR Adapter Status */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> Adapter Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {statusLoading ? <p className="text-xs text-slate-500">Loading...</p> : (
                <>
                  {["athena", "epic", "ecw", "mock"].map(sys => (
                    <div key={sys} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800 last:border-0">
                      <span className="uppercase font-mono text-slate-300">{sys}</span>
                      {adapterBadge(adapters[sys]?.configured, adapters[sys]?.active)}
                    </div>
                  ))}
                  <Separator className="bg-slate-800 my-2" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">FHIR R4</span>
                    <div className="flex items-center gap-1.5">
                      {fhir.configured
                        ? <><Wifi className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">connected</span></>
                        : <><WifiOff className="w-3 h-3 text-slate-500" /><span className="text-slate-500">not configured</span></>
                      }
                    </div>
                  </div>
                  {fhir.baseUrl && <p className="text-xs text-slate-500 font-mono truncate">{fhir.baseUrl}</p>}
                </>
              )}
            </CardContent>
          </Card>

          {/* Audit Replay */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-400" /> Audit Replay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  data-testid="input-replay-patient-id"
                  className="bg-slate-800 border-slate-700 text-slate-100 text-xs"
                  placeholder="Patient ID to replay"
                  value={replayPatientId}
                  onChange={e => setReplayPatientId(e.target.value)}
                />
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0"
                  onClick={() => qc.invalidateQueries({ queryKey: ["/api/cc-v2/audit-replay", replayPatientId] })}
                  data-testid="button-replay-search"
                >
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              </div>
              {replayFetching && <p className="text-xs text-slate-500">Loading...</p>}
              {replay && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">{replay.total} write attempts</p>
                  {(replay.entries ?? []).map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-slate-800 last:border-0">
                      {e.success
                        ? <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className="text-slate-400 font-mono">{new Date(e.ts).toLocaleTimeString()}</span>
                      <span className="text-slate-300 uppercase">{e.system}</span>
                    </div>
                  ))}
                  {replay.total === 0 && <p className="text-xs text-slate-600 italic">No writes found for this patient.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Write Audit Log */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-900 border-slate-800 h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" /> Live Write Audit Log
                  <Badge variant="secondary" className="text-xs ml-1">{audit?.total ?? 0}</Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px] px-4 pb-4">
                {auditLoading && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading audit log...
                  </div>
                )}
                {!auditLoading && log.length === 0 && (
                  <div className="text-center py-16 text-slate-600">
                    <Database className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No EHR writes recorded yet</p>
                    <p className="text-xs mt-1">Submit a write using the panel on the left</p>
                  </div>
                )}
                {log.map((entry: any, i: number) => (
                  <div
                    key={i}
                    data-testid={`audit-row-${i}`}
                    className="flex items-start gap-3 py-2.5 border-b border-slate-800 last:border-0"
                  >
                    {entry.success
                      ? <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-300 font-medium">{entry.patientId}</span>
                        <Badge className={`text-xs ${entry.success ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                          {entry.success ? "OK" : "FAIL"}
                        </Badge>
                        <span className="uppercase text-xs text-blue-400 font-mono">{entry.system}</span>
                        {entry.isMock && <Badge variant="outline" className="text-xs border-slate-600 text-slate-500">mock</Badge>}
                      </div>
                      {entry.error && <p className="text-xs text-red-400 mt-0.5 truncate">{entry.error}</p>}
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(entry.ts).toLocaleTimeString()} · by {entry.physician}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0 mt-1" />
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
