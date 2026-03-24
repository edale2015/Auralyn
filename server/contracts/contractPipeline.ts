import { auditLog } from "../security/auditLogger";

export type InsurerStatus = "target" | "contacted" | "negotiating" | "contracted" | "declined";

export interface Insurer {
  payerId: string;
  name: string;
  contactEmail?: string;
  apiEndpoint?: string;
  status: InsurerStatus;
  notes?: string;
  contractedAt?: string;
  proposedRate?: number;
  agreedRate?: number;
  specialty?: string;
}

export interface NegotiationStrategy {
  payerId: string;
  recommendedRate: number;
  leverage: string;
  tactic: "anchor_high" | "value_based" | "volume_discount" | "quality_bonus";
  confidence: number;
  nextStep: string;
}

const insurers = new Map<string, Insurer>();

const DEMO_INSURERS: Insurer[] = [
  { payerId: "bcbs-ny", name: "BCBS New York", contactEmail: "network@bcbsny.com", status: "target", specialty: "general", proposedRate: 115 },
  { payerId: "aetna", name: "Aetna", contactEmail: "provider@aetna.com", status: "target", specialty: "ent", proposedRate: 108 },
  { payerId: "cigna", name: "Cigna", contactEmail: "contracting@cigna.com", status: "contacted", specialty: "general", proposedRate: 112 },
  { payerId: "unitedhealth", name: "UnitedHealth Group", contactEmail: "network@uhg.com", status: "negotiating", specialty: "general", proposedRate: 120, agreedRate: 118 },
  { payerId: "humana", name: "Humana", status: "contracted", contractedAt: new Date().toISOString(), agreedRate: 105 },
];

function seedInsurers(): void {
  for (const i of DEMO_INSURERS) {
    insurers.set(i.payerId, i);
    auditLog({ actor: "contract_pipeline", action: "insurer_registered", details: { payerId: i.payerId, status: i.status } });
  }
}

export function registerInsurer(i: Insurer): Insurer {
  insurers.set(i.payerId, i);
  auditLog({ actor: "contract_pipeline", action: "insurer_registered", details: { payerId: i.payerId, name: i.name } });
  return i;
}

export function updateInsurerStatus(payerId: string, status: InsurerStatus, extra?: Partial<Insurer>): Insurer | null {
  const existing = insurers.get(payerId);
  if (!existing) return null;
  const updated = { ...existing, status, ...extra };
  if (status === "contracted" && !updated.contractedAt) updated.contractedAt = new Date().toISOString();
  insurers.set(payerId, updated);
  auditLog({ actor: "contract_pipeline", action: "status_updated", details: { payerId, status, agreedRate: extra?.agreedRate } });
  return updated;
}

export function getInsurers(statusFilter?: InsurerStatus): Insurer[] {
  const all = [...insurers.values()];
  return statusFilter ? all.filter((i) => i.status === statusFilter) : all;
}

export function getInsurer(payerId: string): Insurer | undefined {
  return insurers.get(payerId);
}

export function generateNegotiationStrategy(insurer: Insurer, performanceScore = 0.88): NegotiationStrategy {
  const baseRate = insurer.proposedRate ?? 100;

  const tactic: NegotiationStrategy["tactic"] =
    performanceScore >= 0.9 ? "quality_bonus" :
    baseRate >= 115 ? "anchor_high" :
    "value_based";

  const recommendedRate = Math.round(baseRate * (1 + performanceScore * 0.15));

  const leverage =
    performanceScore >= 0.9 ? "Superior quality metrics (HEDIS top decile) justify premium rates" :
    "Strong outcomes data with low readmission rates and high patient satisfaction";

  const nextStep =
    insurer.status === "target" ? "Send initial outreach email with clinical outcomes packet" :
    insurer.status === "contacted" ? "Schedule kickoff call — present rate card and quality data" :
    insurer.status === "negotiating" ? "Counter with value-based addendum — tie bonuses to STAR ratings" :
    "Monitor quarterly performance against contracted rates";

  return {
    payerId: insurer.payerId,
    recommendedRate,
    leverage,
    tactic,
    confidence: Math.min(0.95, performanceScore + 0.07),
    nextStep,
  };
}

export function getContractSummary() {
  const all = [...insurers.values()];
  const byStatus = { target: 0, contacted: 0, negotiating: 0, contracted: 0, declined: 0 };
  let totalAgreedRevenue = 0;

  for (const i of all) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    if (i.agreedRate) totalAgreedRevenue += i.agreedRate;
  }

  return { total: all.length, byStatus, contractedCount: byStatus.contracted, projectedMonthlyRevenue: totalAgreedRevenue * 80 };
}

seedInsurers();
