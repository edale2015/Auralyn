export interface ComplaintOutcome {
  complaint: string;
  correct: boolean;
  escalated: boolean;
}

export interface ComplaintStats {
  complaint: string;
  total: number;
  accuracy: number;
  escalationRate: number;
  status: "healthy" | "warning" | "critical";
}

export function buildComplaintAnalytics(rows: ComplaintOutcome[]): ComplaintStats[] {
  const map: Record<string, { total: number; correct: number; escalated: number }> = {};
  for (const row of rows) {
    if (!map[row.complaint]) map[row.complaint] = { total: 0, correct: 0, escalated: 0 };
    map[row.complaint].total++;
    if (row.correct) map[row.complaint].correct++;
    if (row.escalated) map[row.complaint].escalated++;
  }
  return Object.entries(map).map(([complaint, v]) => {
    const accuracy = v.total ? v.correct / v.total : 0;
    const escalationRate = v.total ? v.escalated / v.total : 0;
    let status: ComplaintStats["status"] = "healthy";
    if (accuracy < 0.6) status = "critical";
    else if (accuracy < 0.8 || escalationRate > 0.3) status = "warning";
    return { complaint, total: v.total, accuracy: Number(accuracy.toFixed(3)), escalationRate: Number(escalationRate.toFixed(3)), status };
  }).sort((a, b) => a.accuracy - b.accuracy);
}

const seededComplaintRows: ComplaintOutcome[] = [
  { complaint: "Sore Throat", correct: true, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: true },{ complaint: "Sore Throat", correct: false, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: false },
  { complaint: "Sore Throat", correct: true, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: true },{ complaint: "Sore Throat", correct: false, escalated: false },{ complaint: "Sore Throat", correct: true, escalated: false },
  { complaint: "Ear Pain", correct: true, escalated: false },{ complaint: "Ear Pain", correct: true, escalated: true },{ complaint: "Ear Pain", correct: false, escalated: false },{ complaint: "Ear Pain", correct: true, escalated: false },{ complaint: "Ear Pain", correct: true, escalated: true },
  { complaint: "Ear Pain", correct: true, escalated: false },{ complaint: "Ear Pain", correct: true, escalated: false },{ complaint: "Ear Pain", correct: false, escalated: true },{ complaint: "Ear Pain", correct: true, escalated: false },{ complaint: "Ear Pain", correct: true, escalated: false },
  { complaint: "Sinusitis", correct: true, escalated: false },{ complaint: "Sinusitis", correct: true, escalated: false },{ complaint: "Sinusitis", correct: true, escalated: false },{ complaint: "Sinusitis", correct: false, escalated: true },{ complaint: "Sinusitis", correct: true, escalated: false },
  { complaint: "Dizziness/Vertigo", correct: true, escalated: true },{ complaint: "Dizziness/Vertigo", correct: false, escalated: true },{ complaint: "Dizziness/Vertigo", correct: false, escalated: false },{ complaint: "Dizziness/Vertigo", correct: true, escalated: true },{ complaint: "Dizziness/Vertigo", correct: false, escalated: true },
  { complaint: "Hearing Loss", correct: true, escalated: true },{ complaint: "Hearing Loss", correct: false, escalated: true },{ complaint: "Hearing Loss", correct: true, escalated: false },{ complaint: "Hearing Loss", correct: true, escalated: true },
  { complaint: "Nosebleed", correct: true, escalated: false },{ complaint: "Nosebleed", correct: true, escalated: false },{ complaint: "Nosebleed", correct: false, escalated: true },
  { complaint: "Hoarseness", correct: true, escalated: true },{ complaint: "Hoarseness", correct: false, escalated: true },{ complaint: "Hoarseness", correct: false, escalated: false },
];

export function getDemoComplaintAnalytics(): ComplaintStats[] {
  return buildComplaintAnalytics(seededComplaintRows);
}
