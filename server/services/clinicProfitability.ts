export type ProfitabilityInput = {
  clinicId: string;
  totalCases: number;
  avgRevenuePerCase: number;
  avgCostPerCase: number;
  monthlyPlatformFee: number;
};

export function computeClinicProfitability(input: ProfitabilityInput) {
  const grossRevenue = input.totalCases * input.avgRevenuePerCase;
  const variableCost = input.totalCases * input.avgCostPerCase;
  const totalCost = variableCost + input.monthlyPlatformFee;
  const grossMargin = grossRevenue - totalCost;
  const marginPct = grossRevenue ? grossMargin / grossRevenue : 0;

  return {
    clinicId: input.clinicId,
    grossRevenue: Number(grossRevenue.toFixed(2)),
    variableCost: Number(variableCost.toFixed(2)),
    monthlyPlatformFee: Number(input.monthlyPlatformFee.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    grossMargin: Number(grossMargin.toFixed(2)),
    marginPct: Number((marginPct * 100).toFixed(2))
  };
}
