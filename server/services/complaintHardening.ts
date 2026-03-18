export type ComplaintPerformance = {
  complaint: string;
  accuracy: number;
  escalationRate: number;
};

export type HardeningResult = {
  complaint: string;
  accuracy: number;
  escalationRate: number;
  status: "stable" | "watch" | "critical";
  action: string;
};

export function buildComplaintHardeningPlan(rows: ComplaintPerformance[]): HardeningResult[] {
  return rows.map((row) => {
    let status: HardeningResult["status"] = "stable";
    let action = "Monitor";
    if (row.accuracy < 0.6 || row.escalationRate > 0.2) {
      status = "critical";
      action = "Require mandatory review, add more complaint questions, recalibrate confidence";
    } else if (row.accuracy < 0.75 || row.escalationRate > 0.12) {
      status = "watch";
      action = "Increase review sampling and inspect reasoning traces";
    }
    return { complaint: row.complaint, accuracy: row.accuracy, escalationRate: row.escalationRate, status, action };
  });
}

const seededComplaints: ComplaintPerformance[] = [
  { complaint: "cough", accuracy: 0.85, escalationRate: 0.05 },
  { complaint: "urinary burning", accuracy: 0.78, escalationRate: 0.1 },
  { complaint: "rash", accuracy: 0.55, escalationRate: 0.22 },
  { complaint: "sore throat", accuracy: 0.82, escalationRate: 0.08 },
  { complaint: "abdominal pain", accuracy: 0.45, escalationRate: 0.25 },
  { complaint: "ear pain", accuracy: 0.72, escalationRate: 0.14 },
  { complaint: "refill", accuracy: 0.95, escalationRate: 0.02 },
  { complaint: "headache", accuracy: 0.68, escalationRate: 0.18 },
];

export function getSeededHardeningPlan(): HardeningResult[] {
  return buildComplaintHardeningPlan(seededComplaints);
}
