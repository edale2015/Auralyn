/**
 * Clinical Trial Simulator — AI vs baseline comparative effectiveness
 * Generates FDA-submission-grade evidence: ICU reduction, mortality impact, TTE improvement
 */
import { useState }    from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest }  from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { ScrollArea }  from "@/components/ui/scroll-area";
import { useToast }    from "@/hooks/use-toast";
import { FlaskConical, TrendingDown, Activity, RefreshCw, CheckCircle } from "lucide-react";

// 10 sample patients for demo trial
const DEMO_PATIENTS = Array.from({ length: 10 }, (_, i) => {
  const critical = i < 3;
  const moderate = i < 6;
  return {
    id:       `SIM-${String(i + 1).padStart(2, "0")}`,
    vitals:   {
      hr:         critical ? 130 + i * 4 : moderate ? 105 + i * 2 : 75 + i,
      spo2:       critical ? 86 - i     : moderate ? 93 - i       : 98,
      temp:       critical ? 103.5 + i * 0.2 : moderate ? 101.0 : 98.6,
      systolicBP: critical ? 78 + i * 3 : moderate ? 100 + i * 3  : 120,
      rr:         critical ? 28 + i     : moderate ? 22            : 16,
    },
    symptoms: critical ? ["fever", "chills"] : moderate ? ["fever"] : [],
    level:    critical ? "CRITICAL" : moderate ? "HIGH" : "LOW" as any,
  };
});

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function MetricCard({ label, value, sub, color = "", icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-start justify-between">
          <div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground font-medium">{label}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {Icon && <Icon className={`h-5 w-5 ${color || "text-muted-foreground"} opacity-70`} />}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClinicalTrials() {
  const { toast }   = useToast();
  const [result, setResult] = useState<any>(null);

  const trialMut = useMutation({
    mutationFn: (patients: any[]) => apiRequest("POST", "/api/medical-os/trial/run", { patients }),
    onSuccess:  (data) => { setResult(data); toast({ title: `Trial complete — ${(data as any).patients} patients` }); },
    onError:    () => toast({ title: "Trial simulation failed", variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" />Clinical Trial Simulator</h1>
          <p className="text-xs text-muted-foreground">AI vs Baseline · ICU avoidance · FDA evidence generation · Mortality modeling</p>
        </div>
        <div className="flex items-center gap-2">
          {result?.fdaEvidence && (
            <Badge className="bg-emerald-600 text-white"><CheckCircle className="h-3.5 w-3.5 mr-1" />FDA Evidence Threshold Met</Badge>
          )}
          <Button size="sm" onClick={() => trialMut.mutate(DEMO_PATIENTS)} disabled={trialMut.isPending} data-testid="button-run-trial">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${trialMut.isPending ? "animate-spin" : ""}`} />
            {trialMut.isPending ? "Simulating…" : "Run 10-Patient Trial"}
          </Button>
        </div>
      </div>

      {!result ? (
        <div className="text-center text-muted-foreground py-16">Press "Run 10-Patient Trial" to simulate AI vs baseline outcomes</div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Patients"         value={result.patients}                           icon={Activity} />
            <MetricCard label="ICU Reduction"    value={pct(result.avgICUReduction)}  color="text-emerald-600" icon={TrendingDown} />
            <MetricCard label="ICU Avoidance"    value={pct(result.icuAvoidanceRate)} color="text-emerald-600" sub="patients helped" />
            <MetricCard label="Det. Reduction"   value={pct(result.avgDetReduction)}  color="text-emerald-600" />
            <MetricCard label="TTE Improvement"  value={`+${result.avgTTEImprovement}min`} color="text-blue-600" sub="time gained" />
            <MetricCard label="Est. Mortality↓"  value={pct(result.estimatedMortalityRed)} color="text-emerald-600" sub="modelled" />
          </div>

          {/* FDA verdict */}
          <Card>
            <CardContent className="py-3 flex items-center gap-3">
              {result.fdaEvidence
                ? <><CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" /><div><div className="font-semibold text-emerald-700">FDA Evidence Threshold Met</div><div className="text-xs text-muted-foreground">ICU avoidance rate {pct(result.icuAvoidanceRate)} exceeds 20% threshold — suitable for SaMD submission evidence package</div></div></>
                : <><Activity className="h-5 w-5 text-yellow-600 flex-shrink-0" /><div><div className="font-semibold text-yellow-700">Evidence Threshold Not Yet Met</div><div className="text-xs text-muted-foreground">Run with larger cohort or higher-acuity patients to reach 20% ICU avoidance threshold</div></div></>
              }
            </CardContent>
          </Card>

          {/* Per-patient outcomes */}
          <Card>
            <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm">Per-Patient Outcomes ({result.outcomes?.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr className="text-muted-foreground">
                      <th className="text-left px-3 py-1.5">Patient</th>
                      <th className="text-right px-2 py-1.5">Baseline ICU</th>
                      <th className="text-right px-2 py-1.5">AI ICU</th>
                      <th className="text-right px-2 py-1.5">Reduction</th>
                      <th className="text-right px-2 py-1.5">Bundles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.outcomes?.map((o: any, i: number) => (
                      <tr key={i} data-testid={`trial-row-${o.patientId}`} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-1.5 font-mono font-semibold">{o.patientId}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{pct(o.baselineICUProb)}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{pct(o.aiICUProb)}</td>
                        <td className={`text-right px-2 py-1.5 font-mono font-bold ${o.icuProbReduction > 0.1 ? "text-emerald-600" : ""}`}>
                          {o.icuProbReduction > 0 ? `-${pct(o.icuProbReduction)}` : "—"}
                        </td>
                        <td className="text-right px-2 py-1.5">{o.interventionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
