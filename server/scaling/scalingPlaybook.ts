type Location = {
  name: string;
  demandFactor: number;
  costFactor: number;
  population?: number;
  competitorDensity?: number;
};

type ExpansionProjection = {
  location: string;
  projectedDailyRevenue: number;
  projectedMonthlyCost: number;
  projectedMonthlyProfit: number;
  breakEvenDays: number;
  viabilityScore: number;
  recommendation: string;
};

const defaultLocations: Location[] = [
  { name: "Manhattan", demandFactor: 1.3, costFactor: 1.5, population: 1600000, competitorDensity: 0.8 },
  { name: "Brooklyn", demandFactor: 1.1, costFactor: 1.1, population: 2600000, competitorDensity: 0.5 },
  { name: "Queens", demandFactor: 1.0, costFactor: 0.9, population: 2300000, competitorDensity: 0.4 },
  { name: "Long Island", demandFactor: 0.9, costFactor: 0.85, population: 2800000, competitorDensity: 0.3 },
  { name: "Westchester", demandFactor: 0.85, costFactor: 1.0, population: 1000000, competitorDensity: 0.35 },
  { name: "Upstate NY", demandFactor: 0.7, costFactor: 0.6, population: 4000000, competitorDensity: 0.2 }
];

export class ScalingPlaybookEngine {
  projectExpansion(baseState: { patientsPerDay: number; avgRevenue: number; denialRate: number },
                   locations?: Location[]): ExpansionProjection[] {
    const locs = locations || defaultLocations;

    return locs.map(loc => {
      const adjustedPatients = baseState.patientsPerDay * loc.demandFactor;
      const adjustedRevenue = baseState.avgRevenue * (1 - baseState.denialRate);
      const dailyRevenue = adjustedPatients * adjustedRevenue;
      const dailyCost = adjustedPatients * loc.costFactor * 15;
      const dailyProfit = dailyRevenue - dailyCost;
      const monthlyProfit = dailyProfit * 22;
      const monthlyCost = dailyCost * 22;

      const setupCost = 10000 * loc.costFactor;
      const breakEvenDays = dailyProfit > 0 ? Math.ceil(setupCost / dailyProfit) : 999;

      const competitorPenalty = loc.competitorDensity ? (1 - loc.competitorDensity * 0.3) : 1;
      const viabilityScore = Math.round(
        (dailyProfit / 1000) * competitorPenalty * loc.demandFactor * 100
      ) / 100;

      let recommendation: string;
      if (viabilityScore > 5) recommendation = "strong expansion target";
      else if (viabilityScore > 2) recommendation = "viable — proceed with pilot";
      else if (viabilityScore > 0) recommendation = "marginal — monitor before committing";
      else recommendation = "not recommended at this time";

      return {
        location: loc.name,
        projectedDailyRevenue: Math.round(dailyRevenue),
        projectedMonthlyCost: Math.round(monthlyCost),
        projectedMonthlyProfit: Math.round(monthlyProfit),
        breakEvenDays,
        viabilityScore,
        recommendation
      };
    }).sort((a, b) => b.viabilityScore - a.viabilityScore);
  }
}

export const scalingPlaybookEngine = new ScalingPlaybookEngine();
