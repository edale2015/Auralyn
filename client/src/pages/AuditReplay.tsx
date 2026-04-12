/**
 * Audit Replay — deterministic re-run of historical scope decisions
 * FDA use: "What did the system decide on date X, and would it decide the same today?"
 */
import { useState }     from "react";
import { useMutation }  from "@tanstack/react-query";
import { apiRequest }   from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button }       from "@/components/ui/button";
import { Textarea }     from "@/components/ui/textarea";
import { Badge }        from "@/components/ui/badge";
import { ScrollArea }   from "@/components/ui/scroll-area";
import { useToast }     from "@/hooks/use-toast";
import { History, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

const DEMO_EVENTS = [
  { id: "E001", agent: "ehr_agent",        action: "write:ehr",         context: { physicianSigned: true, confidence: 0.95 },  result: { allowed: true } },
  { id: "E002", agent: "triage_agent",     action: "read:patient_data", context: {},                                           result: { allowed: true } },
  { id: "E003", agent: "triage_agent",     action: "write:ehr",         context: {},                                           result: { allowed: false } },
  { id: "E004", agent: "treatment_agent",  action: "execute:prescription", context: { physicianSigned: false },               result: { allowed: false, requiresOverride: true } },
  { id: "E005", agent: "escalation_agent", action: "execute:escalation",   context: {},                                       result: { allowed: true } },
];

export default function AuditReplay() {
  const { toast } = useToast();
  const [rawEvents, setRawEvents] = useState(JSON.stringify(DEMO_EVENTS, null, 2));
  const [result,    setResult]    = useState<any>(null);

  const replayMut = useMutation({
    mutationFn: (events: any[]) => apiRequest("POST", "/api/medical-os/replay/case", { events }),
    onSuccess:  (data) => { setResult(data); toast({ title: `Replayed ${(data as any).timeline?.length ?? 0} events` }); },
    onError:    () => toast({ title: "Replay failed", variant: "destructive" }),
  });

  const handleReplay = () => {
    try { replayMut.mutate(JSON.parse(rawEvents)); }
    catch { toast({ title: "Invalid JSON", variant: "destructive" }); }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><History className="h-5 w-5 text-primary" />Audit Replay Engine</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Deterministic re-run of historical decisions · FDA compliance proof · Scope divergence detection</p>
        </div>
        <Button size="sm" onClick={handleReplay} disabled={replayMut.isPending} data-testid="button-replay">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${replayMut.isPending ? "animate-spin" : ""}`} />Replay Case
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input editor */}
        <Card>
          <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm">Event Log (JSON)</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={rawEvents}
              onChange={(e) => setRawEvents(e.target.value)}
              className="font-mono text-xs h-72 resize-none"
              data-testid="textarea-events"
            />
            <p className="text-xs text-muted-foreground mt-1">Each event needs: agent, action, context, result</p>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Replay Results
              {result && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {result.matched}/{result.timeline?.length} matched · {result.diverged} diverged
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-72 px-3 py-2">
              {!result && <div className="text-xs text-muted-foreground py-6 text-center">Press Replay Case to run</div>}
              {result?.timeline?.map((t: any, i: number) => (
                <div key={i} data-testid={`replay-event-${i}`} className={`rounded px-2.5 py-2 mb-1.5 text-xs border ${t.match ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-red-300 bg-red-50/50 dark:bg-red-950/20"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold font-mono">{t.agent} → {t.action}</span>
                    {t.match
                      ? <Badge className="bg-emerald-600 text-white text-xs px-1.5 py-0"><CheckCircle className="h-3 w-3 mr-1 inline" />Match</Badge>
                      : <Badge className="bg-red-600 text-white text-xs px-1.5 py-0"><XCircle className="h-3 w-3 mr-1 inline" />Diverged</Badge>
                    }
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    Original: <span className={t.original?.allowed ? "text-emerald-700" : "text-red-700"}>{String(t.original?.allowed)}</span>
                    {" "}→ Replayed: <span className={t.replayed?.allowed ? "text-emerald-700" : "text-red-700"}>{String(t.replayed?.allowed)}</span>
                  </div>
                  {!t.match && t.divergenceReason && (
                    <div className="flex items-start gap-1 text-red-600 mt-0.5"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />{t.divergenceReason}</div>
                  )}
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Events", value: result.timeline?.length ?? 0 },
            { label: "Matched",      value: result.matched, color: "text-emerald-600" },
            { label: "Diverged",     value: result.diverged, color: result.diverged > 0 ? "text-red-600" : "text-emerald-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="py-3 text-center">
                <div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
