import { getFeedbackLogs, seedDemoFeedback, getFeedbackStats, FeedbackLog } from "./feedbackEngine";
import { detectErrors, getErrorSummary, DetectedError } from "./errorDetectionEngine";
import { generateFixes, storeGeneratedFixes, getStoredFixes, AutoFix } from "./autoFixEngine";
import { getMemoryStats as getCaseMemoryStats, seedCaseMemory } from "./caseMemoryEngine";

export interface ImprovementCycleResult {
  cycleId: string;
  timestamp: string;
  feedbackStats: ReturnType<typeof getFeedbackStats>;
  errorSummary: ReturnType<typeof getErrorSummary>;
  errors: DetectedError[];
  fixes: AutoFix[];
  newFixCount: number;
  duplicatesSkipped: number;
  caseMemoryStats: ReturnType<typeof getCaseMemoryStats>;
}

let cycleCount = 0;
let lastProcessedIndex = 0;

function fixKey(e: DetectedError): string {
  return `${e.caseId}|${e.complaint}|${e.severity}|${e.predictedDiagnosis}|${e.actualDiagnosis}`;
}

export function runSelfImprovementCycle(): ImprovementCycleResult {
  cycleCount++;
  const cycleId = `cycle_${cycleCount}_${Date.now()}`;

  const allLogs = getFeedbackLogs();
  const feedbackStats = getFeedbackStats();

  const newLogs = allLogs.slice(lastProcessedIndex);
  lastProcessedIndex = allLogs.length;

  const errors = detectErrors(newLogs);
  const errorSummary = getErrorSummary(errors);

  const existingKeys = new Set(getStoredFixes().map(f => `${f.caseId}|${f.complaint}|${f.severity}`));
  const candidateFixes = generateFixes(errors);
  const newFixes = candidateFixes.filter(f => {
    const key = `${f.caseId}|${f.complaint}|${f.severity}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  storeGeneratedFixes(newFixes);

  const caseMemoryStats = getCaseMemoryStats();

  return {
    cycleId,
    timestamp: new Date().toISOString(),
    feedbackStats,
    errorSummary,
    errors,
    fixes: newFixes,
    newFixCount: newFixes.length,
    duplicatesSkipped: candidateFixes.length - newFixes.length,
    caseMemoryStats,
  };
}

export function seedAllDemoData() {
  const feedbackCount = seedDemoFeedback();
  const memoryCount = seedCaseMemory();
  return { feedbackCount, memoryCount };
}

export function getCycleCount() {
  return cycleCount;
}

export function getFixesPending() {
  return getStoredFixes().filter(f => f.status === "pending");
}

export function getAllFixes() {
  return getStoredFixes();
}
