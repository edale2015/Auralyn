export interface SimulationScenario {
  volumeMultiplier: number;
  visitVolume: number;
  revenue: number;
  gain: number;
  netGain: number;
  roiAtVolume: number;
}

export interface ContractSimulationResult {
  payerId: string;
  payerName: string;
  currentRate: number;
  proposedRate: number;
  rateChangePct: number;
  visitVolume: number;
  effectiveCollectionRate: number;
  currentRevenue: number;
  projectedRevenue: number;
  revenueGain: number;
  negotiationCost: number;
  netGain: number;
  roi: number;
  breakEvenMonths: number | null;
  strategy: string;
  recommendation: string;
  riskAssessment: string;
  scenarios: SimulationScenario[];
  sensitivityAnalysis: { variable: string; impact: string; direction: "positive" | "negative" | "neutral" }[];
}

export function simulateContractChange(params: {
  payerId: string;
  payerName?: string;
  currentRate: number;
  proposedRate: number;
  visitVolume: number;
  denialRate?: number;
  avgCaseMix?: number;
  negotiationCostHours?: number;
  hourlyRate?: number;
}): ContractSimulationResult {
  const {
    payerId,
    payerName = "Unknown Payer",
    currentRate,
    proposedRate,
    visitVolume,
    denialRate = 0.12,
    avgCaseMix = 0.70,
    negotiationCostHours = 20,
    hourlyRate = 150,
  } = params;

  const effectiveCollectionRate = 1 - denialRate;
  const currentRevenue = currentRate * visitVolume * effectiveCollectionRate * avgCaseMix;
  const projectedRevenue = proposedRate * visitVolume * effectiveCollectionRate * avgCaseMix;
  const revenueGain = projectedRevenue - currentRevenue;
  const negotiationCost = negotiationCostHours * hourlyRate;
  const netGain = revenueGain - negotiationCost;
  const roi = negotiationCost > 0 ? (netGain / negotiationCost) * 100 : 0;
  const breakEvenMonths = revenueGain > 0 ? (negotiationCost / (revenueGain / 12)) : null;
  const rateChangePct = currentRate > 0 ? ((proposedRate - currentRate) / currentRate) * 100 : 0;

  let strategy: string;
  let recommendation: string;
  let riskAssessment: string;

  if (rateChangePct > 20 && roi > 300) {
    strategy = "anchor_high";
    recommendation = "Exceptional ROI — negotiate aggressively, lead with quality outcomes and denial rate advantage.";
    riskAssessment = "Low risk — strong data position justifies aggressive anchoring.";
  } else if (rateChangePct > 15 && roi > 200) {
    strategy = "anchor_high";
    recommendation = "Strong ROI — pursue aggressively with outcome data and HEDIS metrics as leverage.";
    riskAssessment = "Low-to-moderate risk — prepare counter-proposal fallback.";
  } else if (roi > 100) {
    strategy = "value_based";
    recommendation = "Good ROI — frame negotiation around quality metrics, outcomes data, and total cost of care.";
    riskAssessment = "Moderate risk — payer may push back; have bundled rate alternative ready.";
  } else if (roi > 50) {
    strategy = "bundled_rate";
    recommendation = "Moderate ROI — consider bundled rates or multi-year contract for better overall value.";
    riskAssessment = "Moderate risk — evaluate multi-year volume commitments as trade-off.";
  } else if (netGain < 0) {
    strategy = "risk_share";
    recommendation = "Negative ROI — delay negotiation, build outcomes data, or explore risk-share model.";
    riskAssessment = "High risk — current data does not support rate increase; wait 6 months.";
  } else {
    strategy = "standard";
    recommendation = "Acceptable ROI — proceed with standard rate negotiation targeting 10–15% increase.";
    riskAssessment = "Low risk — standard contract renewal playbook applies.";
  }

  const scenarios: SimulationScenario[] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(multiplier => {
    const vol = Math.round(visitVolume * multiplier);
    const rev = proposedRate * vol * effectiveCollectionRate * avgCaseMix;
    const gain = rev - currentRevenue;
    const net = gain - negotiationCost;
    const roiAtVolume = negotiationCost > 0 ? (net / negotiationCost) * 100 : 0;
    return {
      volumeMultiplier: multiplier,
      visitVolume: vol,
      revenue: Math.round(rev),
      gain: Math.round(gain),
      netGain: Math.round(net),
      roiAtVolume: Math.round(roiAtVolume),
    };
  });

  const sensitivityAnalysis = [
    {
      variable: "Denial Rate ±5%",
      impact: `${(revenueGain * 0.05 * effectiveCollectionRate).toFixed(0)} revenue swing`,
      direction: "negative" as const,
    },
    {
      variable: "Visit Volume ±10%",
      impact: `$${Math.abs(Math.round(proposedRate * visitVolume * 0.1 * effectiveCollectionRate * avgCaseMix)).toLocaleString()} revenue swing`,
      direction: revenueGain > 0 ? "positive" as const : "neutral" as const,
    },
    {
      variable: "Negotiation Time ±10hrs",
      impact: `$${(10 * hourlyRate).toLocaleString()} cost delta`,
      direction: "neutral" as const,
    },
    {
      variable: "Case Mix Index ±5%",
      impact: `$${Math.abs(Math.round(proposedRate * visitVolume * effectiveCollectionRate * 0.05)).toLocaleString()} revenue swing`,
      direction: avgCaseMix > 0.7 ? "positive" as const : "negative" as const,
    },
  ];

  return {
    payerId,
    payerName,
    currentRate,
    proposedRate,
    rateChangePct: Math.round(rateChangePct * 10) / 10,
    visitVolume,
    effectiveCollectionRate: Math.round(effectiveCollectionRate * 1000) / 1000,
    currentRevenue: Math.round(currentRevenue),
    projectedRevenue: Math.round(projectedRevenue),
    revenueGain: Math.round(revenueGain),
    negotiationCost: Math.round(negotiationCost),
    netGain: Math.round(netGain),
    roi: Math.round(roi),
    breakEvenMonths: breakEvenMonths ? Math.round(breakEvenMonths * 10) / 10 : null,
    strategy,
    recommendation,
    riskAssessment,
    scenarios,
    sensitivityAnalysis,
  };
}
