export type ComplaintDrilldownRow = {
  complaint: string;
  totalCases: number;
  escalationRate: number;
  overrideRate: number;
  avgConfidence: number;
  avgSatisfaction: number;
};

export type PhysicianDrilldownRow = {
  physicianId: string;
  totalCases: number;
  avgReviewSeconds: number;
  overrideRate: number;
  avgSatisfaction: number;
  highRiskCases: number;
};

export function buildComplaintDrilldown(rows: ComplaintDrilldownRow[]) {
  return rows
    .map(r => {
      let status: "good" | "watch" | "critical" = "good";
      if (r.overrideRate > 0.18 || r.escalationRate > 0.2) status = "critical";
      else if (r.overrideRate > 0.1 || r.escalationRate > 0.12) status = "watch";
      return { ...r, status };
    })
    .sort((a, b) => b.totalCases - a.totalCases);
}

export function buildPhysicianDrilldown(rows: PhysicianDrilldownRow[]) {
  return rows
    .map(r => {
      let status: "good" | "watch" | "critical" = "good";
      if (r.overrideRate > 0.18 || r.avgSatisfaction < 4.0) status = "critical";
      else if (r.overrideRate > 0.1 || r.avgReviewSeconds > 30) status = "watch";
      return { ...r, status };
    })
    .sort((a, b) => b.totalCases - a.totalCases);
}

export function getDemoComplaintDrilldown(): ComplaintDrilldownRow[] {
  return [
    { complaint: "cough", totalCases: 420, escalationRate: 0.08, overrideRate: 0.06, avgConfidence: 0.87, avgSatisfaction: 4.6 },
    { complaint: "dizziness", totalCases: 150, escalationRate: 0.22, overrideRate: 0.19, avgConfidence: 0.69, avgSatisfaction: 4.0 },
    { complaint: "rash", totalCases: 260, escalationRate: 0.03, overrideRate: 0.04, avgConfidence: 0.91, avgSatisfaction: 4.8 },
    { complaint: "chest_pain", totalCases: 180, escalationRate: 0.15, overrideRate: 0.12, avgConfidence: 0.74, avgSatisfaction: 4.3 },
    { complaint: "headache", totalCases: 340, escalationRate: 0.05, overrideRate: 0.07, avgConfidence: 0.88, avgSatisfaction: 4.7 },
    { complaint: "back_pain", totalCases: 290, escalationRate: 0.04, overrideRate: 0.05, avgConfidence: 0.85, avgSatisfaction: 4.5 },
  ];
}

export function getDemoPhysicianDrilldown(): PhysicianDrilldownRow[] {
  return [
    { physicianId: "dr-johnson", totalCases: 410, avgReviewSeconds: 14, overrideRate: 0.05, avgSatisfaction: 4.8, highRiskCases: 44 },
    { physicianId: "dr-lee", totalCases: 330, avgReviewSeconds: 19, overrideRate: 0.08, avgSatisfaction: 4.6, highRiskCases: 31 },
    { physicianId: "dr-smith", totalCases: 215, avgReviewSeconds: 34, overrideRate: 0.2, avgSatisfaction: 3.9, highRiskCases: 12 },
    { physicianId: "dr-patel", totalCases: 280, avgReviewSeconds: 16, overrideRate: 0.06, avgSatisfaction: 4.7, highRiskCases: 28 },
    { physicianId: "dr-kim", totalCases: 190, avgReviewSeconds: 22, overrideRate: 0.11, avgSatisfaction: 4.4, highRiskCases: 15 },
  ];
}
