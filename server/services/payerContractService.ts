export interface ContractSimulation {
  volume:          number;
  baseRatePerVisit:number;
  bonusPerVisit:   number;
  totalRatePerVisit:number;
  annualRevenue:   number;
  edDiversionBonus: number;
  projectedROI:    string;
}

export interface NegotiationStrategy {
  strategy:     string;
  levers:       string[];
  estimatedUplift: string;
}

class PayerContractService {
  simulateContract(volume: number): ContractSimulation {
    const baseRate  = 100;
    const bonus     = volume > 1000 ? 20 : volume > 500 ? 10 : 0;
    const edDiversionBonus = volume > 1000 ? 50_000 : 0;
    const total     = baseRate + bonus;
    const annual    = total * volume;

    return {
      volume,
      baseRatePerVisit:  baseRate,
      bonusPerVisit:     bonus,
      totalRatePerVisit: total,
      annualRevenue:     annual + edDiversionBonus,
      edDiversionBonus,
      projectedROI:      `${((annual / (volume * 60)) * 100).toFixed(1)}% margin`,
    };
  }

  suggestNegotiation(data: {
    avoidedEDVisits?: number;
    totalSavings?:    number;
    accuracy?:        number;
  }): NegotiationStrategy {
    const avoided = data.avoidedEDVisits ?? 0;
    const savings = data.totalSavings ?? 0;
    const accuracy = data.accuracy ?? 0;

    const levers: string[] = [];
    let strategy = "Standard contract acceptable";
    let uplift   = "0–5%";

    if (avoided > 100) {
      levers.push(`Quantify ED diversion: ${avoided} visits avoided saving $${savings.toLocaleString()}`);
      strategy = "Request higher reimbursement based on ED diversion savings";
      uplift   = "10–25%";
    }

    if (accuracy >= 0.9) {
      levers.push(`Clinical accuracy ${(accuracy * 100).toFixed(1)}% exceeds industry average — supports premium tier`);
      uplift = "15–30%";
    }

    levers.push("Include shared-savings clause tied to ED diversion metrics");
    levers.push("Bundle telehealth + in-person visits for volume discount offset");

    return { strategy, levers, estimatedUplift: uplift };
  }
}

export const payerContractService = new PayerContractService();
