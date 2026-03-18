export type RankedPhysicianInput = {
  physicianId: string;
  clinicId: string;
  avgReviewTimeSeconds: number;
  overrideRate: number;
  avgSatisfaction: number;
  highRiskHandled: number;
  active: boolean;
};

export type RankedPhysicianOutput = RankedPhysicianInput & {
  intelligenceScore: number;
  tier: "elite" | "strong" | "watch" | "restricted";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computePhysicianIntelligenceScore(p: RankedPhysicianInput): RankedPhysicianOutput {
  const speedScore = clamp(100 - p.avgReviewTimeSeconds, 0, 100) * 0.25;
  const overrideScore = clamp(100 - p.overrideRate * 100, 0, 100) * 0.3;
  const satisfactionScore = clamp((p.avgSatisfaction / 5) * 100, 0, 100) * 0.25;
  const riskScore = clamp(p.highRiskHandled * 5, 0, 100) * 0.2;
  const total = speedScore + overrideScore + satisfactionScore + riskScore;

  let tier: RankedPhysicianOutput["tier"] = "watch";
  if (!p.active) tier = "restricted";
  else if (total >= 85) tier = "elite";
  else if (total >= 70) tier = "strong";
  else if (total < 50) tier = "restricted";

  return { ...p, intelligenceScore: Number(total.toFixed(2)), tier };
}

export function rankPhysicians(physicians: RankedPhysicianInput[]): RankedPhysicianOutput[] {
  return physicians.map(computePhysicianIntelligenceScore).sort((a, b) => b.intelligenceScore - a.intelligenceScore);
}

const seededPhysicians: RankedPhysicianInput[] = [
  { physicianId: "dr-johnson", clinicId: "clinic_a", avgReviewTimeSeconds: 15, overrideRate: 0.05, avgSatisfaction: 4.8, highRiskHandled: 12, active: true },
  { physicianId: "dr-williams", clinicId: "clinic_a", avgReviewTimeSeconds: 14, overrideRate: 0.08, avgSatisfaction: 4.7, highRiskHandled: 8, active: true },
  { physicianId: "dr-chen", clinicId: "clinic_b", avgReviewTimeSeconds: 25, overrideRate: 0.18, avgSatisfaction: 4.3, highRiskHandled: 4, active: true },
  { physicianId: "pa-martinez", clinicId: "clinic_b", avgReviewTimeSeconds: 10, overrideRate: 0.03, avgSatisfaction: 4.5, highRiskHandled: 2, active: true },
  { physicianId: "dr-patel", clinicId: "clinic_a", avgReviewTimeSeconds: 35, overrideRate: 0.22, avgSatisfaction: 4.1, highRiskHandled: 6, active: true },
  { physicianId: "dr-kim", clinicId: "clinic_b", avgReviewTimeSeconds: 20, overrideRate: 0.1, avgSatisfaction: 4.6, highRiskHandled: 10, active: true },
];

export function getSeededRankings(): RankedPhysicianOutput[] {
  return rankPhysicians(seededPhysicians);
}
