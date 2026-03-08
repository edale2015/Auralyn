export interface SyntheticCase {
  caseId: string;
  complaintId: string;
  answers: Record<string, unknown>;
  expectedDisposition?: string;
  metadata: { generated: true; seed: number };
}

const COMPLAINT_PROFILES: Record<string, Record<string, unknown>[]> = {
  sore_throat: [
    { Q_FEVER: true, Q_TONSILLAR_EXUDATE: true, Q_COUGH: false, Q_AGE: 25 },
    { Q_FEVER: false, Q_TONSILLAR_EXUDATE: false, Q_COUGH: true, Q_AGE: 45 },
  ],
  cough: [
    { Q_DURATION_DAYS: 3, Q_FEVER: true, Q_PRODUCTIVE: true, Q_AGE: 35 },
    { Q_DURATION_DAYS: 14, Q_FEVER: false, Q_PRODUCTIVE: false, Q_AGE: 60 },
  ],
};

export function generateSyntheticCases(complaintId: string, count = 10): SyntheticCase[] {
  const profiles = COMPLAINT_PROFILES[complaintId] || [{}];
  const cases: SyntheticCase[] = [];

  for (let i = 0; i < count; i++) {
    const seed = Date.now() + i;
    const profile = profiles[i % profiles.length];
    cases.push({
      caseId: `synth_${complaintId}_${seed}`,
      complaintId,
      answers: { ...profile },
      metadata: { generated: true, seed },
    });
  }

  return cases;
}
