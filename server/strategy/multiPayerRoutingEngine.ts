export interface RoutingOption {
  payer: string;
  expectedRevenue: number;
  denialRisk: number;
  rlhfScore: number;
}

export interface RoutingDecision {
  payer: string;
  adjustedValue: number;
  rawRevenue: number;
  risk: number;
  rlhfScore: number;
  allOptions: Array<{ payer: string; adjustedValue: number }>;
}

export function choosePayerRoute(encounter: any, options: RoutingOption[]): RoutingDecision {
  const scored = options.map((opt) => ({
    payer: opt.payer,
    adjustedValue: Math.round(opt.expectedRevenue * opt.rlhfScore * (1 - opt.denialRisk) * 100) / 100,
    rawRevenue: opt.expectedRevenue,
    risk: opt.denialRisk,
    rlhfScore: opt.rlhfScore,
  }));

  scored.sort((a, b) => b.adjustedValue - a.adjustedValue);
  const best = scored[0];

  return {
    payer: best.payer,
    adjustedValue: best.adjustedValue,
    rawRevenue: best.rawRevenue,
    risk: best.risk,
    rlhfScore: best.rlhfScore,
    allOptions: scored.map((s) => ({ payer: s.payer, adjustedValue: s.adjustedValue })),
  };
}
