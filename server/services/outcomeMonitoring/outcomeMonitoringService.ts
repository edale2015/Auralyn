import { firestoreCaseStore } from "../firestoreCaseStore";
import { analyzeBouncebacks } from "./bouncebackAnalyzer";

export interface OutcomeMonitoringSummary {
  totalCases: number;
  casesWithOutcome: number;
  outcomeCaptureRate: number;
  bouncebackRate: number;
  dispositionAccuracy: number;
  avgTimeToResolution: number;
}

export async function getOutcomeMonitoringSummary(): Promise<OutcomeMonitoringSummary> {
  const cases = await firestoreCaseStore.listCases({ limit: 500 });
  const withOutcome = cases.filter((c) => (c as any).outcome);
  const bouncebackData = await analyzeBouncebacks();

  let accurateCount = 0;
  for (const c of withOutcome) {
    const outcome = (c as any).outcome;
    if (outcome?.finalDiagnosis && c.engineResult?.recommendedDisposition) accurateCount++;
  }

  return {
    totalCases: cases.length,
    casesWithOutcome: withOutcome.length,
    outcomeCaptureRate: cases.length > 0 ? withOutcome.length / cases.length : 0,
    bouncebackRate: bouncebackData.rate,
    dispositionAccuracy: withOutcome.length > 0 ? accurateCount / withOutcome.length : 0,
    avgTimeToResolution: 0,
  };
}
