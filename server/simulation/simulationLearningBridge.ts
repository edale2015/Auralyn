export interface LearningUpdate {
  type: "disposition_error" | "diagnosis_error" | "red_flag_miss";
  complaint: string;
  predicted?: string;
  expected?: string;
  timestamp: number;
}

const learningQueue: LearningUpdate[] = [];

export function feedSimulationLearning(results: any[]): LearningUpdate[] {
  const updates: LearningUpdate[] = [];

  results.forEach(r => {
    if (!r.dispositionCorrect) {
      updates.push({
        type: "disposition_error",
        complaint: r.complaint,
        predicted: r.predictedDisposition,
        expected: r.expectedDisposition,
        timestamp: Date.now(),
      });
    }

    if (!r.diagnosisMatch) {
      updates.push({
        type: "diagnosis_error",
        complaint: r.complaint,
        predicted: r.predictedTopDiagnosis,
        expected: r.expectedTopDiagnosis,
        timestamp: Date.now(),
      });
    }

    if (r.redFlagMiss) {
      updates.push({
        type: "red_flag_miss",
        complaint: r.complaint,
        predicted: r.predictedDisposition,
        expected: "er_now",
        timestamp: Date.now(),
      });
    }
  });

  learningQueue.push(...updates);
  if (learningQueue.length > 1000) learningQueue.splice(0, learningQueue.length - 1000);

  return updates;
}

export function getLearningQueue(): LearningUpdate[] {
  return [...learningQueue];
}

export function getLearningStats() {
  const total = learningQueue.length;
  const byType: Record<string, number> = {};
  const byComplaint: Record<string, number> = {};

  learningQueue.forEach(u => {
    byType[u.type] = (byType[u.type] ?? 0) + 1;
    byComplaint[u.complaint] = (byComplaint[u.complaint] ?? 0) + 1;
  });

  return { total, byType, byComplaint };
}
