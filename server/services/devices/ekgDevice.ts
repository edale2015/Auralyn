export interface EKGResult {
  rhythm: string;
  heartRate: number;
  prInterval?: number;
  qrsWidth?: number;
  qtcInterval?: number;
  stSegmentChanges: string[];
  interpretation: string;
  urgency: 'critical' | 'abnormal' | 'borderline' | 'normal';
}

export async function runEKG(): Promise<EKGResult> {
  return {
    rhythm: 'sinus',
    heartRate: 72,
    prInterval: 160,
    qrsWidth: 90,
    qtcInterval: 420,
    stSegmentChanges: [],
    interpretation: 'Normal sinus rhythm. No acute ST changes.',
    urgency: 'normal',
  };
}

export async function interpretEKGForComplaint(
  complaint: string,
  vitals?: Record<string, number>
): Promise<EKGResult> {
  const base = await runEKG();
  if (complaint === 'chest_pain') {
    base.stSegmentChanges = ['ST changes require physician review'];
    base.urgency = 'abnormal';
    base.interpretation = 'Sinus rhythm. ST changes noted — clinical correlation required.';
  }
  return base;
}
