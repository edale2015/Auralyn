export interface CaseMemory {
  caseId: string;
  complaint: string;
  symptoms: string[];
  diagnosis: string;
  triage: string;
  timestamp: number;
}

export interface SimilarCaseResult {
  case: CaseMemory;
  score: number;
}

const memoryStore: CaseMemory[] = [];

export function storeCase(data: {
  caseId: string;
  complaint: string;
  symptoms: string[];
  diagnosis: string;
  triage: string;
}) {
  memoryStore.push({
    ...data,
    timestamp: Date.now(),
  });
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export function findSimilarCases(
  input: { complaint: string; symptoms: string[] },
  topK: number = 5,
  minScore: number = 0.1
): SimilarCaseResult[] {
  return memoryStore
    .filter(c => c.complaint === input.complaint)
    .map(c => ({
      case: c,
      score: jaccardSimilarity(c.symptoms, input.symptoms),
    }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function getMemoryStats() {
  const byComplaint: Record<string, number> = {};
  for (const c of memoryStore) {
    byComplaint[c.complaint] = (byComplaint[c.complaint] || 0) + 1;
  }
  return {
    totalCases: memoryStore.length,
    byComplaint,
    uniqueComplaints: Object.keys(byComplaint).length,
  };
}

export function seedCaseMemory() {
  if (memoryStore.length > 0) return 0;

  const demos = [
    { caseId: "mem_1", complaint: "chest_pain", symptoms: ["chest_tightness", "sob", "sweating"], diagnosis: "STEMI", triage: "er_now" },
    { caseId: "mem_2", complaint: "chest_pain", symptoms: ["heartburn", "epigastric_pain"], diagnosis: "GERD", triage: "self_care" },
    { caseId: "mem_3", complaint: "chest_pain", symptoms: ["chest_tightness", "exertional", "radiation_arm"], diagnosis: "unstable_angina", triage: "er_now" },
    { caseId: "mem_4", complaint: "cough", symptoms: ["cough", "fever", "sob"], diagnosis: "pneumonia", triage: "urgent_care" },
    { caseId: "mem_5", complaint: "cough", symptoms: ["cough", "runny_nose"], diagnosis: "URI", triage: "self_care" },
    { caseId: "mem_6", complaint: "headache", symptoms: ["frontal_pain", "stress", "neck_tension"], diagnosis: "tension_headache", triage: "self_care" },
    { caseId: "mem_7", complaint: "headache", symptoms: ["thunderclap", "worst_headache", "stiff_neck"], diagnosis: "SAH", triage: "er_now" },
    { caseId: "mem_8", complaint: "back_pain", symptoms: ["lumbar_pain", "leg_weakness", "bowel_issues"], diagnosis: "cauda_equina", triage: "er_now" },
    { caseId: "mem_9", complaint: "abdominal_pain", symptoms: ["RLQ_pain", "fever", "rebound"], diagnosis: "appendicitis", triage: "er_now" },
    { caseId: "mem_10", complaint: "abdominal_pain", symptoms: ["epigastric_pain", "bloating"], diagnosis: "gastritis", triage: "telemed_now" },
  ];

  for (const d of demos) storeCase(d);
  return demos.length;
}
