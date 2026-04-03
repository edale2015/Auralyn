export type AcuitySignal =
  | 'possible_stemi'
  | 'possible_stroke'
  | 'possible_sepsis'
  | 'severe_dyspnea'
  | 'altered_mental_status'
  | 'sudden_severe_headache'
  | 'anaphylaxis'
  | 'none';

export interface IntakeSnapshot {
  chiefComplaint?: string;
  symptoms: string[];
  age?: number;
  vitals?: {
    heartRate?: number;
    systolicBP?: number;
    spo2?: number;
    temperatureF?: number;
    respiratoryRate?: number;
  };
  modifiers?: Record<string, string | number | boolean | undefined>;
}

export interface AcuityDecision {
  matched: boolean;
  signal: AcuitySignal;
  confidence: number;
  rationale: string[];
  disposition: 'ER_NOW' | 'CONTINUE_PIPELINE';
}

function hasAny(symptoms: string[], terms: string[]): boolean {
  const normalized = symptoms.map(s => s.toLowerCase());
  return terms.some(term => normalized.some(s => s.includes(term)));
}

export function classifyAcuity(snapshot: IntakeSnapshot): AcuityDecision {
  const symptoms = snapshot.symptoms ?? [];
  const rationale: string[] = [];
  const { vitals } = snapshot;

  const chestPain    = hasAny(symptoms, ['chest pain', 'pressure in chest', 'chest tightness']);
  const diaphoresis  = hasAny(symptoms, ['sweating', 'diaphoresis', 'clammy']);
  const armJawPain   = hasAny(symptoms, ['jaw pain', 'left arm pain', 'arm pain']);
  const sob          = hasAny(symptoms, ['shortness of breath', 'trouble breathing', 'difficulty breathing']);
  const facialDroop  = hasAny(symptoms, ['facial droop', 'drooping face']);
  const armWeakness  = hasAny(symptoms, ['arm weakness', 'leg weakness', 'one-sided weakness']);
  const speech       = hasAny(symptoms, ['slurred speech', 'trouble speaking', 'aphasia']);
  const severeHa     = hasAny(symptoms, ['worst headache', 'thunderclap headache', 'sudden severe headache']);
  const confusion    = hasAny(symptoms, ['confusion', 'altered mental status', 'not acting right']);
  const fever        = vitals?.temperatureF !== undefined && vitals.temperatureF >= 100.4;
  const tachycardia  = vitals?.heartRate !== undefined && vitals.heartRate >= 120;
  const hypotension  = vitals?.systolicBP !== undefined && vitals.systolicBP < 90;
  const hypoxia      = vitals?.spo2 !== undefined && vitals.spo2 < 90;
  const tachypnea    = vitals?.respiratoryRate !== undefined && vitals.respiratoryRate >= 30;
  const rashSwelling = hasAny(symptoms, ['hives', 'facial swelling', 'tongue swelling', 'lip swelling']);

  if (chestPain && (diaphoresis || armJawPain || sob)) {
    rationale.push('High-risk chest pain constellation detected');
    return { matched: true, signal: 'possible_stemi', confidence: 0.99, rationale, disposition: 'ER_NOW' };
  }

  if ((facialDroop && armWeakness) || (speech && armWeakness) || (speech && facialDroop)) {
    rationale.push('Stroke FAST-pattern detected');
    return { matched: true, signal: 'possible_stroke', confidence: 0.99, rationale, disposition: 'ER_NOW' };
  }

  if (hypoxia || (sob && tachypnea) || (sob && hasAny(symptoms, ['at rest', 'cannot speak full sentences']))) {
    rationale.push('Severe dyspnea pattern detected');
    return { matched: true, signal: 'severe_dyspnea', confidence: 0.98, rationale, disposition: 'ER_NOW' };
  }

  if ((confusion && fever && (tachycardia || hypotension)) || (fever && hypotension && tachypnea)) {
    rationale.push('Possible sepsis physiology detected');
    return { matched: true, signal: 'possible_sepsis', confidence: 0.97, rationale, disposition: 'ER_NOW' };
  }

  if (confusion && (hypotension || hypoxia)) {
    rationale.push('Altered mental status with unstable physiology');
    return { matched: true, signal: 'altered_mental_status', confidence: 0.96, rationale, disposition: 'ER_NOW' };
  }

  if (severeHa && hasAny(symptoms, ['sudden', 'thunderclap', 'neck stiffness', 'passed out'])) {
    rationale.push('Sudden severe headache with dangerous modifiers');
    return { matched: true, signal: 'sudden_severe_headache', confidence: 0.97, rationale, disposition: 'ER_NOW' };
  }

  if (rashSwelling && (sob || hasAny(symptoms, ['wheezing', 'throat closing', 'difficulty swallowing']))) {
    rationale.push('Possible anaphylaxis pattern detected');
    return { matched: true, signal: 'anaphylaxis', confidence: 0.98, rationale, disposition: 'ER_NOW' };
  }

  return {
    matched: false,
    signal: 'none',
    confidence: 0.2,
    rationale: ['No fast-path life-threatening signature detected'],
    disposition: 'CONTINUE_PIPELINE',
  };
}
