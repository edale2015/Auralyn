export interface MemoryCase {
  caseId: string;
  complaint: string;
  features: Record<string, any>;
  diagnosis?: string;
  disposition?: string;
  timestamp: number;
}

export interface SimilarCaseResult {
  caseId: string;
  complaint: string;
  diagnosis?: string;
  disposition?: string;
  score: number;
  matchedFeatures: string[];
}

const MAX_STORE_SIZE = 5000;
const memoryStore: MemoryCase[] = [];

export function storeClinicalMemory(caseData: MemoryCase) {
  memoryStore.push(caseData);
  if (memoryStore.length > MAX_STORE_SIZE) {
    memoryStore.shift();
  }
}

export function retrieveSimilarCases(features: Record<string, any>, limit = 5): SimilarCaseResult[] {
  const results = memoryStore.map(c => {
    let score = 0;
    const matchedFeatures: string[] = [];

    Object.keys(features).forEach(k => {
      if (c.features[k] === features[k]) {
        score++;
        matchedFeatures.push(k);
      }
    });

    return {
      caseId: c.caseId,
      complaint: c.complaint,
      diagnosis: c.diagnosis,
      disposition: c.disposition,
      score,
      matchedFeatures,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getMemoryStats() {
  const byComplaint: Record<string, number> = {};
  const byDiagnosis: Record<string, number> = {};
  memoryStore.forEach(c => {
    byComplaint[c.complaint] = (byComplaint[c.complaint] ?? 0) + 1;
    if (c.diagnosis) byDiagnosis[c.diagnosis] = (byDiagnosis[c.diagnosis] ?? 0) + 1;
  });

  return {
    totalCases: memoryStore.length,
    maxCapacity: MAX_STORE_SIZE,
    utilization: Math.round((memoryStore.length / MAX_STORE_SIZE) * 1000) / 10,
    byComplaint,
    byDiagnosis,
    oldestTimestamp: memoryStore.length > 0 ? memoryStore[0].timestamp : null,
    newestTimestamp: memoryStore.length > 0 ? memoryStore[memoryStore.length - 1].timestamp : null,
  };
}
