import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Globe, TrendingUp, DollarSign, MapPin, Activity, RefreshCw, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

// Demo clinic data for deployment prioritization
const DEMO_CLINICS = [
  { id: "nyc-001", name: "NYC Urgent Care — Midtown",   city: "New York", state: "NY", dailyPatientVolume: 180, hasQRKioskCapability: true,  physicianCount: 4, estimatedMonthlyRevenue: 190000, currentEHR: "athena" },
  { id: "nyc-002", name: "NYC Urgent Care — Brooklyn",  city: "New York", state: "NY", dailyPatientVolume: 140, hasQRKioskCapability: true,  physicianCount: 3, estimatedMonthlyRevenue: 145000, currentEHR: "epic"   },
  { id: "nwk-001", name: "Newark Urgent Care — Downtown",city: "Newark",  state: "NJ", dailyPatientVolume: 95,  hasQRKioskCapability: false, physicianCount: 2, estimatedMonthlyRevenue: 88000,  currentEHR: "ecw"    },
  { id: "phi-001", name: "Philadelphia Quick Care",      city: "Philadelphia", state: "PA", dailyPatientVolume: 210, hasQRKioskCapability: true, physicianCount: 5, estimatedMonthlyRevenue: 220000, currentEHR: "athena" },
  { id: "bos-001", name: "Boston Acute Walk-In",         city: "Boston",  state: "MA", dailyPatientVolume: 160, hasQRKioskCapability: false, physicianCount: 3, estimatedMonthlyRevenue: 155000, currentEHR: "epic"   },
];

// Demo payer claim data
const DEMO_CLAIMS = [
  ...Array.from({ length: 120 }, (_, i) => ({ payer: "UnitedHealth", cpt: "99214", approved: Math.random() > 0.15, reimbursement: 112 + Math.random() * 20, denialReason: Math.random() > 0.7 ? "Medical necessity" : "Missing auth" })),
  ...Array.from({ length: 90 }, (_, i) => ({ payer: "Aetna", cpt: "99213", approved: Math.random() > 0.25, reimbursement: 88 + Math.random() * 15, denialReason: "Missing documentation" })),
  ...Array.from({ length: 70 }, (_, i) => ({ payer: "Cigna", cpt: "99215", approved: Math.random() > 0.10, reimbursement: 155 + Math.random() * 30, denialReason: "Code bundling" })),
  ...Array.from({ length: 50 }, (_, i) => ({ payer: "Medicare", cpt: "99213", approved: Math.random() > 0.05, reimbursement: 76 + Math.random() * 10 })),
];

interface DeploymentPlan {
  clinic: { id: string; name: string; city: string; state: string; dailyPatientVolume: number; estimatedMonthlyRevenue?: number };
  priorityScore: number;
  priorityRank: number;
  deploymentPhase: 1 | 2 | 3;
  blockers: string[];
}

interface PayerStats {
  payer: string;
  totalClaims: number;
  approvalRate: number;
  totalRevenue: number;
  avgRevenue: number;
  topDenialReasons: string[];
}

interface PayerStrategy {
  payer: string;
  action: string;
  rationale: string;
  priority: string;
  estimatedRevenueUplift?: number;
}

const PHASE_COLORS: Record<number, string> = { 1: "bg-green-500", 2: "bg-yellow-500", 3: "bg-slate-400" };

export default function NetworkControlTower() {
  const [deployData, setDeployData] = useState<{ plans: DeploymentPlan[]; timeline: any[] } | null>(null);
  const [payerData, setPayerData] = useState<{ stats: PayerStats[]; strategies: PayerStrategy[] } | null>(null);

  const { data: netStatus } = useQuery<any>({
    queryKey: ["/api/network/status"],
  });

  const deployMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/network/deploy", { clinics: DEMO_CLINICS }) as Promise<any>,
    onSuccess: (data: any) => setDeployData(data),
  });

  const payerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/network/payer", { claims: DEMO_CLAIMS }) as Promise<any>,
    onSuccess: (data: any) => setPayerData(data),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Network Control Tower</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Deployment prioritization · Payer optimization · Network learning</p>
        </div>
        {netStatus && (
          <Badge variant="outline" className="text-green-600 border-green-400" data-testid="network-status">
            <Activity size={12} className="mr-1" /> {netStatus.status}
          </Badge>
        )}
      </div>

      {/* Network learning summary */}
      {netStatus?.networkLearning && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={14} />
              Network Learning Engine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div data-testid="total-diagnoses">
                <div className="text-xl font-bold">{netStatus.networkLearning.totalDiagnoses}</div>
                <div className="text-muted-foreground text-xs">Diagnoses tracked</div>
              </div>
              <div data-testid="avg-weight">
                <div className="text-xl font-bold">{netStatus.networkLearning.avgWeight}</div>
                <div className="text-muted-foreground text-xs">Avg weight</div>
              </div>
              <div data-testid="underperforming">
                <div className="text-xl font-bold text-red-500">{netStatus.networkLearning.underPerforming?.length ?? 0}</div>
                <div className="text-muted-foreground text-xs">Under-performing</div>
              </div>
              <div data-testid="overperforming">
                <div className="text-xl font-bold text-green-500">{netStatus.networkLearning.overPerforming?.length ?? 0}</div>
                <div className="text-muted-foreground text-xs">Over-performing</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Deployment Planning */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 size={16} />
              Expansion Deployment Plan
            </CardTitle>
            <CardDescription>NYC metro + regional expansion priority ranking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
              size="sm" variant="outline"
              data-testid="run-deployment-btn"
            >
              {deployMutation.isPending ? "Analyzing…" : "Run Deployment Analysis"}
            </Button>
            {deployData?.plans && (
              <div className="space-y-2 mt-2">
                {deployData.plans.map(p => (
                  <div key={p.clinic.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`deploy-plan-${p.clinic.id}`}>
                    <div>
                      <div className="font-medium">{p.clinic.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.clinic.dailyPatientVolume} pts/day
                        {p.blockers.length > 0 && <span className="text-orange-500 ml-1">· {p.blockers.length} blocker(s)</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{Math.round(p.priorityScore * 100)}%</span>
                      <Badge className={`${PHASE_COLORS[p.deploymentPhase]} text-white text-xs`}>Phase {p.deploymentPhase}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {deployData?.timeline && (
              <div className="text-xs space-y-1 mt-2">
                {deployData.timeline.map(t => (
                  <div key={t.phase} className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant="outline" className="text-xs">Phase {t.phase}</Badge>
                    <span>Wk {t.startWeek}–{t.endWeek}: {t.clinics.join(", ")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payer Optimization */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign size={16} />
              Payer Strategy Optimization
            </CardTitle>
            <CardDescription>Approval rate analysis + contract negotiation signals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => payerMutation.mutate()}
              disabled={payerMutation.isPending}
              size="sm" variant="outline"
              data-testid="run-payer-btn"
            >
              {payerMutation.isPending ? "Analyzing…" : "Analyze Payer Performance"}
            </Button>
            {payerData?.stats && (
              <div className="space-y-2 mt-2">
                {payerData.stats.map(p => (
                  <div key={p.payer} className="py-1.5 border-b last:border-0" data-testid={`payer-stat-${p.payer.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{p.payer}</span>
                      <span className={`text-xs font-mono ${p.approvalRate < 0.80 ? "text-red-500" : "text-green-600"}`}>
                        {Math.round(p.approvalRate * 100)}% approval
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${Math.round(p.avgRevenue)} avg · ${p.totalRevenue.toLocaleString()} total · {p.totalClaims} claims
                    </div>
                    {payerData.strategies.find(s => s.payer === p.payer)?.priority === "HIGH" && (
                      <Badge className="mt-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-300">
                        {payerData.strategies.find(s => s.payer === p.payer)?.action?.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
