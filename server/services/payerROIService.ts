import type { TrialCaseResult } from "./trialSimulator";

export interface ROIReport {
  avoidedEDVisits:        number;
  edVisits:               number;
  totalSavings:           number;
  avgSavingsPerPatient:   number;
  edCostPerVisit:         number;
  urgentCareCostPerVisit: number;
  netBenefitPerPatient:   number;
  annualizedSavings500:   number;
}

class PayerROIService {
  private readonly ED_COST   = 2500;
  private readonly UC_COST   = 250;

  calculate(cases: TrialCaseResult[]): ROIReport {
    const total = cases.length;

    if (total === 0) {
      return {
        avoidedEDVisits:        0,
        edVisits:               0,
        totalSavings:           0,
        avgSavingsPerPatient:   0,
        edCostPerVisit:         this.ED_COST,
        urgentCareCostPerVisit: this.UC_COST,
        netBenefitPerPatient:   0,
        annualizedSavings500:   0,
      };
    }

    const edVisits     = cases.filter((c) => c.outcome === "ED now").length;
    const avoided      = total - edVisits;
    const totalSavings = avoided * (this.ED_COST - this.UC_COST);

    return {
      avoidedEDVisits:        avoided,
      edVisits,
      totalSavings,
      avgSavingsPerPatient:   totalSavings / total,
      edCostPerVisit:         this.ED_COST,
      urgentCareCostPerVisit: this.UC_COST,
      netBenefitPerPatient:   totalSavings / total,
      annualizedSavings500:   (totalSavings / total) * 500 * 250,
    };
  }
}

export const payerROIService = new PayerROIService();
