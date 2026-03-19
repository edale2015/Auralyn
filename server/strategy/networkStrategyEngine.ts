export interface PayerPerformance {
  payer: string;
  revenuePerEncounter: number;
  denialRate: number;
  volume: number;
  avgPaymentDays?: number;
}

export interface NetworkStrategy {
  payer: string;
  strategy: "expand" | "maintain" | "renegotiate" | "reduce" | "drop";
  score: number;
  reasoning: string;
}

export function analyzeNetwork(payers: PayerPerformance[]): NetworkStrategy[] {
  return payers.map((p) => {
    const score = Math.round(p.revenuePerEncounter * (1 - p.denialRate) * Math.log(p.volume + 1) * 100) / 100;

    let strategy: NetworkStrategy["strategy"] = "maintain";
    let reasoning = "Performance within acceptable range";

    if (p.revenuePerEncounter > 120 && p.denialRate < 0.08 && p.volume > 50) {
      strategy = "expand";
      reasoning = "High revenue, low denials, proven volume — increase case routing";
    } else if (p.denialRate > 0.20) {
      strategy = "reduce";
      reasoning = `Denial rate ${(p.denialRate * 100).toFixed(1)}% is unacceptable — reduce volume and escalate contract review`;
    } else if (p.denialRate > 0.15) {
      strategy = "renegotiate";
      reasoning = `Denial rate ${(p.denialRate * 100).toFixed(1)}% above threshold — negotiate denial reduction terms`;
    } else if (p.revenuePerEncounter < 70) {
      strategy = "renegotiate";
      reasoning = `Revenue per encounter $${p.revenuePerEncounter} below market — negotiate higher rates`;
    } else if (p.revenuePerEncounter < 50 && p.denialRate > 0.12) {
      strategy = "drop";
      reasoning = "Low revenue combined with high denials — consider terminating contract";
    }

    return { payer: p.payer, strategy, score, reasoning };
  }).sort((a, b) => b.score - a.score);
}
