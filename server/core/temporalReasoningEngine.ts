export type TemporalPattern = 'hyperacute' | 'acute' | 'subacute' | 'chronic' | 'unknown';

export interface TemporalResult {
  pattern: TemporalPattern;
  durationHours?: number;
  riskModifiers: string[];
  urgencyBoost: number;
}

const TEMPORAL_RED_FLAGS: Record<TemporalPattern, string[]> = {
  hyperacute: [
    'thunderclap_headache → subarachnoid_hemorrhage',
    'sudden_chest_pain → aortic_dissection',
    'sudden_vision_loss → retinal_artery_occlusion',
    'sudden_facial_droop → stroke',
  ],
  acute: [
    'fever + stiff_neck → meningitis',
    'chest_pain + diaphoresis → ACS',
    'dyspnea + pleuritic_pain → PE',
  ],
  subacute: [
    'productive_cough + fever → pneumonia',
    'weight_loss + fatigue → malignancy or TB',
  ],
  chronic: [
    'chronic_cough + smoking → COPD or lung_cancer',
    'recurrent_dysuria → chronic_UTI or interstitial_cystitis',
  ],
  unknown: [],
};

export function temporalReasoningEngine(caseData: {
  durationHours?: number;
  timeline?: string[];
  symptoms?: string[];
}): TemporalResult {
  const duration = caseData.durationHours;

  let pattern: TemporalPattern = 'unknown';
  let urgencyBoost = 0;

  if (duration !== undefined) {
    if (duration < 6) { pattern = 'hyperacute'; urgencyBoost = 3; }
    else if (duration < 48) { pattern = 'acute'; urgencyBoost = 1; }
    else if (duration < 720) { pattern = 'subacute'; urgencyBoost = 0; }
    else { pattern = 'chronic'; urgencyBoost = 0; }
  }

  const riskModifiers = TEMPORAL_RED_FLAGS[pattern] ?? [];

  return {
    pattern,
    durationHours: duration,
    riskModifiers,
    urgencyBoost,
  };
}
