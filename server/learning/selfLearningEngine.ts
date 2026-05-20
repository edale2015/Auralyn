import { logOutcome as trackOutcome, learnFromOutcomes, getRecentOutcomes } from "./outcomeLearningEngine";
import { updateWeight, getAllWeights, getWeightHistory } from "./weightStore";

export interface SelfLearningCycle {
  cycleAt: string;
  processed: number;
  weightUpdates: number;
  topAdjustments: Array<{ key: string; delta: number }>;
}

const cycleLog: SelfLearningCycle[] = [];

export function logLearningOutcome(params: {
  caseId: string;
  packId: string;
  predictedDiagnosis: string;
  actualDiagnosis: string;
  correct: boolean;
}) {
  trackOutcome({
    packId: params.packId,
    caseId: params.caseId,
    predictedDiagnosis: params.predictedDiagnosis,
    actualDiagnosis: params.actualDiagnosis,
    correct: params.correct,
  });
}

export function runSelfLearning(): SelfLearningCycle {
  const recent = getRecentOutcomes(200);
  let weightUpdates = 0;
  const adjustments: Array<{ key: string; delta: number }> = [];

  for (const o of recent) {
    if (o.correct) {
      updateWeight(o.predictedDiagnosis, +0.05);
      adjustments.push({ key: o.predictedDiagnosis, delta: +0.05 });
      weightUpdates++;
    } else {
      updateWeight(o.predictedDiagnosis, -0.10);
      updateWeight(o.actualDiagnosis, +0.10);
      adjustments.push({ key: o.predictedDiagnosis, delta: -0.10 });
      adjustments.push({ key: o.actualDiagnosis, delta: +0.10 });
      weightUpdates += 2;
    }
  }

  learnFromOutcomes();

  const cycle: SelfLearningCycle = {
    cycleAt: new Date().toISOString(),
    processed: recent.length,
    weightUpdates,
    topAdjustments: adjustments.slice(0, 5),
  };

  cycleLog.push(cycle);
  if (cycleLog.length > 50) cycleLog.shift();

  console.log(`[SelfLearning] Cycle complete — processed: ${recent.length}, weight updates: ${weightUpdates}`);
  return cycle;
}

export function applyDxWeights(diagnoses: Array<{ name: string; score: number }>) {
  const weights = getAllWeights();
  return diagnoses.map(d => ({
    ...d,
    score: d.score * (weights[d.name] ?? 1.0),
  })).sort((a, b) => b.score - a.score);
}

export function getLastCycles(n = 10): SelfLearningCycle[] {
  return cycleLog.slice(-n).reverse();
}

export function getLearningSnapshot() {
  const last = cycleLog[cycleLog.length - 1];
  return {
    lastCycleAt: last?.cycleAt ?? null,
    totalCycles: cycleLog.length,
    currentWeights: getAllWeights(),
    weightHistory: getWeightHistory().slice(-20),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startSelfLearningLoop(intervalMs = 60_000) {
  if (timer) return;
  // Async wrapper yields to event loop first so in-flight WhatsApp callbacks
  // are not starved by the synchronous weight-update computation.
  timer = setInterval(async () => {
    await new Promise<void>(r => setImmediate(r));
    runSelfLearning();
  }, intervalMs);
  console.log(`[SelfLearning] Loop started (every ${intervalMs / 1000}s)`);
}

export function stopSelfLearningLoop() {
  if (timer) { clearInterval(timer); timer = null; }
}
