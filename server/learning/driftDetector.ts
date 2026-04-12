/**
 * Drift Detector
 * Statistical distribution drift detector (L1 divergence).
 * Works alongside the existing driftTracker.ts / driftControl.ts in this directory.
 */

export interface DriftReport {
  hasDrift:    boolean;
  l1Distance:  number;
  threshold:   number;
  label?:      string;
  detectedAt:  string;
}

export class DriftDetector {
  /**
   * L1 distance between two probability distributions.
   * Returns true if drift exceeds the threshold (default 0.2).
   */
  detect(oldDist: number[], newDist: number[], threshold = 0.2): DriftReport {
    const len = Math.min(oldDist.length, newDist.length);
    let drift = 0;

    for (let i = 0; i < len; i++) {
      drift += Math.abs(oldDist[i] - newDist[i]);
    }

    return {
      hasDrift:   drift > threshold,
      l1Distance: Number(drift.toFixed(4)),
      threshold,
      detectedAt: new Date().toISOString(),
    };
  }

  /** Compare two labelled frequency maps (e.g. symptom → count) */
  detectFromMaps(
    oldMap: Record<string, number>,
    newMap: Record<string, number>,
    threshold = 0.2,
    label?: string
  ): DriftReport {
    const keys   = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
    const total1 = Object.values(oldMap).reduce((s, v) => s + v, 0) || 1;
    const total2 = Object.values(newMap).reduce((s, v) => s + v, 0) || 1;

    let drift = 0;
    for (const k of keys) {
      drift += Math.abs((oldMap[k] ?? 0) / total1 - (newMap[k] ?? 0) / total2);
    }

    return {
      hasDrift:   drift > threshold,
      l1Distance: Number(drift.toFixed(4)),
      threshold,
      label,
      detectedAt: new Date().toISOString(),
    };
  }

  /** Multi-window scan: returns true if any window exceeds threshold */
  scan(windows: number[][], threshold = 0.2): { anyDrift: boolean; reports: DriftReport[] } {
    const reports: DriftReport[] = [];
    for (let i = 0; i < windows.length - 1; i++) {
      reports.push(this.detect(windows[i], windows[i + 1], threshold));
    }
    return { anyDrift: reports.some((r) => r.hasDrift), reports };
  }
}

export const driftDetector = new DriftDetector();
