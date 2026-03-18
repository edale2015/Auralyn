export interface PhysicianCaseRecord {
  physicianId: string;
  physicianName: string;
  clinicId: string;
  caseId: string;
  reviewed: boolean;
  override: boolean;
  reviewTimeSeconds: number;
  satisfaction: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  correct: boolean;
  timestamp: number;
}

export interface PhysicianPerformance {
  physicianId: string;
  physicianName: string;
  clinicId: string;
  totalCases: number;
  reviewedCases: number;
  overrides: number;
  avgReviewTimeSeconds: number;
  overrideRate: number;
  avgSatisfaction: number;
  accuracy: number;
  highRiskCases: number;
  performanceGrade: "A" | "B" | "C" | "D";
}

export function computePhysicianMetrics(records: PhysicianCaseRecord[]): PhysicianPerformance[] {
  const map: Record<string, { total: number; reviewed: number; overrides: number; totalTime: number; satisfaction: number; correct: number; highRisk: number; name: string; clinicId: string }> = {};

  for (const r of records) {
    if (!map[r.physicianId]) {
      map[r.physicianId] = { total: 0, reviewed: 0, overrides: 0, totalTime: 0, satisfaction: 0, correct: 0, highRisk: 0, name: r.physicianName, clinicId: r.clinicId };
    }
    const p = map[r.physicianId];
    p.total++;
    if (r.reviewed) p.reviewed++;
    if (r.override) p.overrides++;
    p.totalTime += r.reviewTimeSeconds;
    p.satisfaction += r.satisfaction;
    if (r.correct) p.correct++;
    if (r.riskLevel === "HIGH") p.highRisk++;
  }

  return Object.entries(map).map(([id, p]) => {
    const overrideRate = p.total > 0 ? p.overrides / p.total : 0;
    const avgReviewTimeSeconds = p.total > 0 ? p.totalTime / p.total : 0;
    const avgSatisfaction = p.total > 0 ? p.satisfaction / p.total : 0;
    const accuracy = p.total > 0 ? p.correct / p.total : 0;

    let grade: PhysicianPerformance["performanceGrade"] = "A";
    if (accuracy < 0.6 || overrideRate > 0.3 || avgSatisfaction < 3) grade = "D";
    else if (accuracy < 0.75 || overrideRate > 0.2 || avgSatisfaction < 3.5) grade = "C";
    else if (accuracy < 0.85 || overrideRate > 0.15 || avgSatisfaction < 4) grade = "B";

    return {
      physicianId: id,
      physicianName: p.name,
      clinicId: p.clinicId,
      totalCases: p.total,
      reviewedCases: p.reviewed,
      overrides: p.overrides,
      avgReviewTimeSeconds: Number(avgReviewTimeSeconds.toFixed(1)),
      overrideRate: Number(overrideRate.toFixed(3)),
      avgSatisfaction: Number(avgSatisfaction.toFixed(2)),
      accuracy: Number(accuracy.toFixed(3)),
      highRiskCases: p.highRisk,
      performanceGrade: grade,
    };
  }).sort((a, b) => b.accuracy - a.accuracy);
}

const seededRecords: PhysicianCaseRecord[] = [
  { physicianId: "dr_001", physicianName: "Dr. Sarah Williams", clinicId: "clinic_a", caseId: "c_001", reviewed: true, override: false, reviewTimeSeconds: 14, satisfaction: 4.8, riskLevel: "HIGH", correct: true, timestamp: Date.now() - 3600000 },
  { physicianId: "dr_001", physicianName: "Dr. Sarah Williams", clinicId: "clinic_a", caseId: "c_002", reviewed: true, override: true, reviewTimeSeconds: 22, satisfaction: 4.2, riskLevel: "HIGH", correct: true, timestamp: Date.now() - 3500000 },
  { physicianId: "dr_001", physicianName: "Dr. Sarah Williams", clinicId: "clinic_a", caseId: "c_003", reviewed: true, override: false, reviewTimeSeconds: 11, satisfaction: 4.9, riskLevel: "LOW", correct: true, timestamp: Date.now() - 3400000 },
  { physicianId: "dr_001", physicianName: "Dr. Sarah Williams", clinicId: "clinic_a", caseId: "c_004", reviewed: true, override: false, reviewTimeSeconds: 18, satisfaction: 4.5, riskLevel: "MEDIUM", correct: false, timestamp: Date.now() - 3300000 },
  { physicianId: "dr_001", physicianName: "Dr. Sarah Williams", clinicId: "clinic_a", caseId: "c_005", reviewed: true, override: false, reviewTimeSeconds: 9, satisfaction: 5.0, riskLevel: "LOW", correct: true, timestamp: Date.now() - 3200000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_006", reviewed: true, override: false, reviewTimeSeconds: 8, satisfaction: 4.9, riskLevel: "LOW", correct: true, timestamp: Date.now() - 3100000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_007", reviewed: true, override: true, reviewTimeSeconds: 25, satisfaction: 3.8, riskLevel: "HIGH", correct: true, timestamp: Date.now() - 3000000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_008", reviewed: true, override: false, reviewTimeSeconds: 12, satisfaction: 4.6, riskLevel: "MEDIUM", correct: true, timestamp: Date.now() - 2900000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_009", reviewed: true, override: false, reviewTimeSeconds: 15, satisfaction: 4.4, riskLevel: "MEDIUM", correct: false, timestamp: Date.now() - 2800000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_010", reviewed: true, override: false, reviewTimeSeconds: 10, satisfaction: 4.7, riskLevel: "LOW", correct: true, timestamp: Date.now() - 2700000 },
  { physicianId: "dr_002", physicianName: "Dr. Michael Chen", clinicId: "clinic_a", caseId: "c_011", reviewed: true, override: true, reviewTimeSeconds: 30, satisfaction: 3.5, riskLevel: "HIGH", correct: false, timestamp: Date.now() - 2600000 },
  { physicianId: "dr_003", physicianName: "PA Jessica Martinez", clinicId: "clinic_a", caseId: "c_012", reviewed: true, override: false, reviewTimeSeconds: 7, satisfaction: 4.8, riskLevel: "LOW", correct: true, timestamp: Date.now() - 2500000 },
  { physicianId: "dr_003", physicianName: "PA Jessica Martinez", clinicId: "clinic_a", caseId: "c_013", reviewed: true, override: false, reviewTimeSeconds: 9, satisfaction: 4.6, riskLevel: "LOW", correct: true, timestamp: Date.now() - 2400000 },
  { physicianId: "dr_003", physicianName: "PA Jessica Martinez", clinicId: "clinic_a", caseId: "c_014", reviewed: true, override: false, reviewTimeSeconds: 11, satisfaction: 4.3, riskLevel: "MEDIUM", correct: true, timestamp: Date.now() - 2300000 },
  { physicianId: "dr_003", physicianName: "PA Jessica Martinez", clinicId: "clinic_a", caseId: "c_015", reviewed: true, override: false, reviewTimeSeconds: 13, satisfaction: 4.1, riskLevel: "MEDIUM", correct: false, timestamp: Date.now() - 2200000 },
  { physicianId: "dr_005", physicianName: "Dr. Emily Johnson", clinicId: "clinic_b", caseId: "c_016", reviewed: true, override: false, reviewTimeSeconds: 10, satisfaction: 4.9, riskLevel: "LOW", correct: true, timestamp: Date.now() - 2100000 },
  { physicianId: "dr_005", physicianName: "Dr. Emily Johnson", clinicId: "clinic_b", caseId: "c_017", reviewed: true, override: false, reviewTimeSeconds: 16, satisfaction: 4.7, riskLevel: "HIGH", correct: true, timestamp: Date.now() - 2000000 },
  { physicianId: "dr_005", physicianName: "Dr. Emily Johnson", clinicId: "clinic_b", caseId: "c_018", reviewed: true, override: true, reviewTimeSeconds: 28, satisfaction: 4.0, riskLevel: "HIGH", correct: true, timestamp: Date.now() - 1900000 },
  { physicianId: "dr_005", physicianName: "Dr. Emily Johnson", clinicId: "clinic_b", caseId: "c_019", reviewed: true, override: false, reviewTimeSeconds: 8, satisfaction: 5.0, riskLevel: "LOW", correct: true, timestamp: Date.now() - 1800000 },
  { physicianId: "dr_005", physicianName: "Dr. Emily Johnson", clinicId: "clinic_b", caseId: "c_020", reviewed: true, override: false, reviewTimeSeconds: 14, satisfaction: 4.5, riskLevel: "MEDIUM", correct: true, timestamp: Date.now() - 1700000 },
];

export function getSeededRecords(): PhysicianCaseRecord[] {
  return seededRecords;
}

export function addCaseRecord(record: PhysicianCaseRecord): void {
  seededRecords.push(record);
}

export function getPhysicianPerformance(clinicId?: string): PhysicianPerformance[] {
  const filtered = clinicId ? seededRecords.filter((r) => r.clinicId === clinicId) : seededRecords;
  return computePhysicianMetrics(filtered);
}
