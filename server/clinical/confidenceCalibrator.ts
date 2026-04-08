/**
 * confidenceCalibrator.ts
 * Calibrates the brain's output confidence against historical accuracy.
 *
 * Raw model confidence scores are often over- or under-confident.
 * Calibration bins past predictions and adjusts current confidence
 * to match observed accuracy within each probability bracket.
 *
 * This prevents the system from asserting "80% certain" when historical
 * accuracy in that confidence range is actually 55%.
 */

import { getRedisAsync } from "../queue/redis";

const KEY_PREFIX = "calibration";
const BIN_COUNT  = 10;

export interface CalibrationBin {
  predictions: number;
  correct:     number;
  accuracy:    number;
}

/**
 * Returns the bin index (0–9) for a given probability score.
 */
function binIndex(score: number): number {
  return Math.min(BIN_COUNT - 1, Math.floor(score * BIN_COUNT));
}

/**
 * Records a calibration data point: predicted confidence + whether it was correct.
 */
export async function recordCalibrationPoint(
  engine:          string,
  predictedScore:  number,
  correct:         boolean,
): Promise<void> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return;

    const bin = binIndex(predictedScore);
    const key = `${KEY_PREFIX}:${engine}:bin:${bin}`;

    if (typeof redis.hincrby === "function") {
      await redis.hincrby(key, "predictions", 1);
      if (correct) await redis.hincrby(key, "correct", 1);
    }
  } catch {
  }
}

/**
 * Returns calibration bins for a given engine.
 */
export async function getCalibrationBins(engine: string): Promise<CalibrationBin[]> {
  const bins: CalibrationBin[] = [];

  try {
    const redis = await getRedisAsync();
    if (!redis) return Array(BIN_COUNT).fill({ predictions: 0, correct: 0, accuracy: 0 });

    for (let i = 0; i < BIN_COUNT; i++) {
      const key = `${KEY_PREFIX}:${engine}:bin:${i}`;
      let data: Record<string, string> = {};
      if (typeof redis.hgetall === "function") {
        data = (await redis.hgetall(key)) ?? {};
      }

      const predictions = Number(data.predictions ?? 0);
      const correct     = Number(data.correct     ?? 0);
      bins.push({
        predictions,
        correct,
        accuracy: predictions > 0 ? correct / predictions : 0,
      });
    }
  } catch {
    return Array(BIN_COUNT).fill({ predictions: 0, correct: 0, accuracy: 0 });
  }

  return bins;
}

/**
 * Calibrates a confidence score against historical accuracy data.
 * Returns the adjusted confidence (or original if insufficient data).
 */
export async function calibrateConfidence(
  engine:    string,
  rawScore:  number,
): Promise<number> {
  try {
    const bins = await getCalibrationBins(engine);
    const bin  = bins[binIndex(rawScore)];

    if (!bin || bin.predictions < 10) return rawScore;

    return bin.accuracy;
  } catch {
    return rawScore;
  }
}
