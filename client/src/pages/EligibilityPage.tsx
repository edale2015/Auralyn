import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, RefreshCw, CheckCircle, XCircle } from "lucide-react";

const PAYERS = ["bcbs-ny","aetna","cigna","unitedhealth","humana","medicare","medicaid"];

export default function EligibilityPage() {
  const { toast } = useToast();
  const [history, setHistory]   = useState<any[]>([]);
  const [stats,   setStats]     = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/eligibility/history");
      const j = await r.json();
      setHistory(j.history ?? []);
      setStats(j.stats);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  const verify = async () => {
    setVerifying(true);
    try {
      const ptId  = `pt-${Math.floor(Math.random() * 9000) + 1000}`;
      const payer = PAYERS[Math.floor(Math.random() * PAYERS.length)];
      const r = await fetch("/api/eligibility/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: ptId, payer }),
      });
      const j = await r.json();
      toast({
        title: j.result.eligible ? `✅ Eligible — ${j.result.coverageType}` : "❌ Not Eligible",
        description: `${payer} · Copay $${j.result.copay} · ${j.result.networkStatus}`,
        variant: j.result.eligible ? "default" : "destructive",
      });
      fetchData();
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally { setVerifying(false); }
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Insurance Eligibility</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData} data-testid="btn-refresh-elig"><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={verify} disabled={verifying} data-testid="btn-verify-eligibility">
            {verifying ? "Verifying…" : "Verify Patient"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Checks", value: stats.total },
            { label: "Eligibility Rate", value: `${(stats.eligibilityRate * 100).toFixed(0)}%`, color: "text-green-400" },
            { label: "Out-of-Network", value: `${(stats.outOfNetworkRate * 100).toFixed(0)}%`, color: "text-amber-400" },
            { label: "Avg Copay", value: `$${stats.avgCopay.toFixed(0)}`, color: "text-blue-400" },
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

      {/* Verification History */}
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Verification History</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {history.map((r, i) => (
              <div key={r.verificationId ?? i}
                className={`rounded-lg border px-3 py-2 text-xs ${r.eligible ? "border-green-800/40 bg-green-950/20" : "border-red-800/40 bg-red-950/20"}`}
                data-testid={`row-eligibility-${i}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.eligible
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                      <span className="font-semibold">{r.patientId}</span>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1">{r.payer}</Badge>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1">{r.coverageType}</Badge>
                      <Badge variant={r.networkStatus === "in-network" ? "default" : "destructive"} className="text-[9px] h-3.5 px-1">{r.networkStatus}</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-muted-foreground flex-wrap">
                      <span>Copay <strong className="text-foreground">${r.copay}</strong></span>
                      <span>Coinsurance <strong className="text-foreground">{r.coinsurance}%</strong></span>
                      <span>Deductible <strong className="text-foreground">${r.deductibleMet}/${r.deductible}</strong></span>
                      {r.priorAuthRequired && <span className="text-amber-400">PA Required</span>}
                      {r.referralRequired   && <span className="text-amber-400">Referral Required</span>}
                    </div>
                    {r.flags?.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {r.flags.map((f: string, fi: number) => (
                          <p key={fi} className="text-amber-400 text-[10px]">⚠ {f}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-muted-foreground text-[10px] shrink-0">{new Date(r.verifiedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="text-xs text-muted-foreground italic">No verifications yet. Click "Verify Patient" to run a check.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
