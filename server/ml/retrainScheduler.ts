import { trainModel } from "./admissionModel";
import { getFeatureLog, clearFeatureLog } from "./featureLogger";

export interface RetrainCheckResult {
  triggered:    boolean;
  reason?:      string;
  accuracy:     number;
  threshold:    number;
  featureCount: number;
}

const ACCURACY_THRESHOLD    = 0.90;
const MIN_SAMPLES_TO_RETRAIN = 100;

let _timer: ReturnType<typeof setInterval> | null = null;
let lastRetrainAt: string | null = null;
let retrainCount = 0;

export async function retrainIfNeeded(metrics: {
  accuracy:     number;
  safetyMismatchRate?: number;
}): Promise<RetrainCheckResult> {
  const { accuracy } = metrics;
  const entries      = getFeatureLog();

  if (accuracy >= ACCURACY_THRESHOLD) {
    return { triggered: false, accuracy, threshold: ACCURACY_THRESHOLD, featureCount: entries.length };
  }

  if (entries.length < MIN_SAMPLES_TO_RETRAIN) {
    return {
      triggered:    false,
      reason:       `Insufficient samples (${entries.length} < ${MIN_SAMPLES_TO_RETRAIN})`,
      accuracy,
      threshold:    ACCURACY_THRESHOLD,
      featureCount: entries.length,
    };
  }

  console.log(`[Retrain] Triggering retraining (accuracy=${accuracy.toFixed(3)} < ${ACCURACY_THRESHOLD})`);

  const rows = entries.map(e => e.features as any);
  await trainModel(rows);

  lastRetrainAt = new Date().toISOString();
  retrainCount++;

  return {
    triggered:    true,
    reason:       `accuracy=${accuracy.toFixed(3)} below threshold`,
    accuracy,
    threshold:    ACCURACY_THRESHOLD,
    featureCount: entries.length,
  };
}

export function scheduleRetrainCheck(
  getMetrics: () => { accuracy: number },
  intervalMs = 3_600_000
): void {
  if (_timer) return;

  _timer = setInterval(async () => {
    try {
      const metrics = getMetrics();
      await retrainIfNeeded(metrics);
    } catch (err: any) {
      console.error(`[Retrain] Scheduled check failed: ${err.message}`);
    }
  }, intervalMs);

  console.log(`[Retrain] Scheduled accuracy watchdog every ${intervalMs / 1000}s`);
}

export function stopRetrainScheduler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

export function getRetrainStats(): { lastRetrainAt: string | null; retrainCount: number; threshold: number } {
  return { lastRetrainAt, retrainCount, threshold: ACCURACY_THRESHOLD };
}
