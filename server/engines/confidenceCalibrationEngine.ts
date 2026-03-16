export class ConfidenceCalibrationEngine {
  readonly name = 'confidenceCalibrationEngine';

  private readonly OVERCONFIDENCE_THRESHOLD = 0.9;
  private readonly UNDERCONFIDENCE_THRESHOLD = 0.4;
  private readonly OVERCONFIDENCE_DAMPENER = 0.85;
  private readonly UNDERCONFIDENCE_LIFT = 0.1;
  private readonly MAX_CALIBRATED = 0.97;
  private readonly MIN_CALIBRATED = 0.05;

  run(context: any): any {
    const raw = typeof context.confidence === 'number' ? context.confidence : null;

    if (raw === null) return { ...context, calibratedConfidence: null, confidenceCalibrated: false };

    let calibrated = raw;

    if (raw > this.OVERCONFIDENCE_THRESHOLD) {
      calibrated = raw * this.OVERCONFIDENCE_DAMPENER;
    } else if (raw < this.UNDERCONFIDENCE_THRESHOLD) {
      calibrated = raw + this.UNDERCONFIDENCE_LIFT;
    }

    calibrated = Math.min(this.MAX_CALIBRATED, Math.max(this.MIN_CALIBRATED, calibrated));

    const delta = calibrated - raw;
    const direction = delta > 0.005 ? 'lifted' : delta < -0.005 ? 'dampened' : 'unchanged';

    return {
      ...context,
      calibratedConfidence: Math.round(calibrated * 1000) / 1000,
      confidenceCalibrated: true,
      confidenceCalibrationDelta: Math.round(delta * 1000) / 1000,
      confidenceCalibrationDirection: direction,
    };
  }
}
