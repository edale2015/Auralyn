import { loadClinicalMemory } from "./clinicalMemoryEngine";

export interface LearningReport {
  totalCases: number;
  casesWithOutcome: number;
  accuracy: number;
  dispositionBreakdown: Record<string, { predicted: number; correct: number; accuracy: number }>;
  topCorrectComplaints: Array<{ complaint: string; accuracy: number; count: number }>;
  topMissedComplaints: Array<{ complaint: string; accuracy: number; count: number }>;
}

export function generateLearningReport(): LearningReport {
  const cases = loadClinicalMemory();

  let correct = 0;
  let total = 0;

  const dispositionBreakdown: Record<string, { predicted: number; correct: number; accuracy: number }> = {};
  const complaintStats: Record<string, { correct: number; total: number }> = {};

  for (const c of cases) {
    const disp = c.predictedDisposition ?? "UNKNOWN";
    if (!dispositionBreakdown[disp]) {
      dispositionBreakdown[disp] = { predicted: 0, correct: 0, accuracy: 0 };
    }
    dispositionBreakdown[disp].predicted++;

    if (!c.outcomeKnown) continue;
    total++;

    const complaint = c.complaint ?? "unknown";
    if (!complaintStats[complaint]) complaintStats[complaint] = { correct: 0, total: 0 };
    complaintStats[complaint].total++;

    if (c.finalDisposition === c.predictedDisposition) {
      correct++;
      dispositionBreakdown[disp].correct++;
      complaintStats[complaint].correct++;
    }
  }

  // Finalize accuracy per disposition
  for (const key of Object.keys(dispositionBreakdown)) {
    const d = dispositionBreakdown[key];
    d.accuracy = d.predicted > 0 ? d.correct / d.predicted : 0;
  }

  // Rank complaints by accuracy
  const complaintList = Object.entries(complaintStats)
    .filter(([, s]) => s.total >= 2)
    .map(([complaint, s]) => ({
      complaint,
      accuracy: s.correct / s.total,
      count: s.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    totalCases: cases.length,
    casesWithOutcome: total,
    accuracy: total > 0 ? correct / total : 0,
    dispositionBreakdown,
    topCorrectComplaints: complaintList.slice(0, 5),
    topMissedComplaints: [...complaintList].reverse().slice(0, 5),
  };
}
