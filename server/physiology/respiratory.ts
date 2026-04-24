/**
 * server/physiology/respiratory.ts
 * Pluggable respiratory risk score [0–1].
 * Designed to be replaced by a learned model from outcomes data.
 */

/**
 * Returns a respiratory risk score in [0, 1].
 *   SpO₂ < 92% → +0.3
 *   SpO₂ < 88% → additional +0.3
 *   On ventilator → +0.3
 */
export function respRisk(spo2?: number, onVent?: boolean): number {
  if (spo2 == null) return 0;
  let r = 0;
  if (spo2 < 92) r += 0.3;
  if (spo2 < 88) r += 0.3;
  if (onVent)    r += 0.3;
  return Math.min(1, r);
}
