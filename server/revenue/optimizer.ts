import { logMetric } from "../monitoring/metrics";
import { mapBilling } from "./billing";

export interface OptimizationInput {
  caseId: string;
  diagnosis?: string;
  complaints?: string[];
  revenue: number;
  payer?: string;
  currentPlan?: string;
}

export interface OptimizationResult extends OptimizationInput {
  adjustedPlan: string;
  additionalCodes?: string[];
  estimatedRevenueLift: number;
  confidence: number;
  reason: string;
}

export function optimizeRevenue(decisions: OptimizationInput[]): OptimizationResult[] {
  return decisions.map(d => {
    const billing = mapBilling({ diagnosis: d.diagnosis, complaints: d.complaints });
    const expectedRevenue = billing.totalExpectedReimbursement;

    let adjustedPlan = "standard";
    let estimatedRevenueLift = 0;
    let reason = "Revenue within expected range";
    const additionalCodes: string[] = [];

    if (d.revenue < 50) {
      adjustedPlan = "optimize_testing";
      estimatedRevenueLift = Math.max(0, expectedRevenue - d.revenue);
      reason = "Revenue below threshold — consider additional diagnostic codes";
      additionalCodes.push("99213");
    } else if (d.revenue < 100 && d.complaints && d.complaints.length > 1) {
      adjustedPlan = "add_secondary_codes";
      estimatedRevenueLift = 25;
      reason = "Multiple complaints may support secondary diagnosis coding";
      additionalCodes.push("Z13.88");
    } else if (d.payer === "medicaid" && d.revenue < expectedRevenue * 0.8) {
      adjustedPlan = "appeal_or_rebill";
      estimatedRevenueLift = expectedRevenue * 0.2;
      reason = "Medicaid reimbursement below expected rate — review billing";
    }

    logMetric("revenue.optimization.lift", estimatedRevenueLift, "outcome", { caseId: d.caseId });

    return {
      ...d,
      adjustedPlan,
      additionalCodes: additionalCodes.length ? additionalCodes : undefined,
      estimatedRevenueLift,
      confidence: 0.78,
      reason,
    };
  });
}

export function projectMonthlyRevenue(avgPerVisit: number, visitsPerDay: number, workingDays = 22): number {
  return avgPerVisit * visitsPerDay * workingDays;
}
