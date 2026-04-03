export type AcuitySignal =
  | 'possible_stemi'
  | 'possible_stroke'
  | 'possible_sepsis'
  | 'severe_dyspnea'
  | 'altered_mental_status'
  | 'sudden_severe_headache'
  | 'anaphylaxis'
  | 'ectopic_pregnancy_rupture'
  | 'testicular_torsion'
  | 'meningitis_or_meningococcal_sepsis'
  | 'aortic_dissection'
  | 'carbon_monoxide_poisoning'
  | 'adult_epiglottitis'
  | 'pediatric_intussusception'
  | 'none';

export type ErNowSpecificityFlag =
  | 'absolute_immediate'
  | 'recheck_in_30m_if_worse';

export interface IntakeSnapshot {
  chiefComplaint?: string;
  symptoms: string[];
  age?: number;
  sex?: 'male' | 'female' | 'other';
  history?: string[];
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
  specificityFlag?: ErNowSpecificityFlag;
  erNowMessage?: string;
}

function hasAny(haystack: string[], needles: string[]): boolean {
  const normalized = haystack.map(s => s.toLowerCase());
  return needles.some(needle => normalized.some(s => s.includes(needle.toLowerCase())));
}

export function classifyAcuity(snapshot: IntakeSnapshot): AcuityDecision {
  const symptoms = snapshot.symptoms ?? [];
  const history = snapshot.history ?? [];
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
    return {
      matched: true, signal: 'possible_stemi', confidence: 0.99, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this symptom pattern requires immediate cardiac evaluation.',
    };
  }

  if ((facialDroop && armWeakness) || (speech && armWeakness) || (speech && facialDroop)) {
    rationale.push('Stroke FAST-pattern detected');
    return {
      matched: true, signal: 'possible_stroke', confidence: 0.99, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — stroke symptoms require immediate imaging and intervention.',
    };
  }

  if (hypoxia || (sob && tachypnea) || (sob && hasAny(symptoms, ['at rest', 'cannot speak full sentences']))) {
    rationale.push('Severe dyspnea pattern detected');
    return {
      matched: true, signal: 'severe_dyspnea', confidence: 0.98, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — breathing difficulty at this severity requires immediate evaluation.',
    };
  }

  if ((confusion && fever && (tachycardia || hypotension)) || (fever && hypotension && tachypnea)) {
    rationale.push('Possible sepsis physiology detected');
    return {
      matched: true, signal: 'possible_sepsis', confidence: 0.97, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this presentation may indicate a life-threatening infection.',
    };
  }

  if (confusion && (hypotension || hypoxia)) {
    rationale.push('Altered mental status with unstable physiology');
    return {
      matched: true, signal: 'altered_mental_status', confidence: 0.96, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — altered awareness with unstable vitals requires immediate care.',
    };
  }

  if (severeHa && hasAny(symptoms, ['sudden', 'thunderclap', 'neck stiffness', 'passed out'])) {
    rationale.push('Sudden severe headache with dangerous modifiers');
    return {
      matched: true, signal: 'sudden_severe_headache', confidence: 0.97, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this headache pattern requires immediate evaluation.',
    };
  }

  if (rashSwelling && (sob || hasAny(symptoms, ['wheezing', 'throat closing', 'difficulty swallowing']))) {
    rationale.push('Possible anaphylaxis pattern detected');
    return {
      matched: true, signal: 'anaphylaxis', confidence: 0.98, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this allergic reaction pattern can become life-threatening within minutes.',
    };
  }

  if (
    snapshot.sex === 'female' &&
    hasAny(symptoms, ['abdominal pain', 'lower abdominal']) &&
    hasAny(symptoms, ['missed period', 'vaginal bleeding', 'shoulder pain', 'syncope', 'fainted'])
  ) {
    rationale.push('Ectopic pregnancy rupture risk pattern — female + abdominal pain + danger modifiers');
    return {
      matched: true, signal: 'ectopic_pregnancy_rupture', confidence: 0.97, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this symptom pattern requires immediate evaluation to rule out a surgical emergency.',
    };
  }

  if (
    snapshot.sex === 'male' &&
    hasAny(symptoms, ['scrotal pain', 'testicle pain', 'testicular pain']) &&
    hasAny(symptoms, ['sudden', 'acute', 'severe', 'under 6 hours', 'started suddenly'])
  ) {
    rationale.push('Testicular torsion pattern — male + acute scrotal pain');
    return {
      matched: true, signal: 'testicular_torsion', confidence: 0.96, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — sudden scrotal pain requires immediate evaluation. Time-sensitive.',
    };
  }

  if (
    hasAny(symptoms, ['severe headache', 'headache']) &&
    hasAny(symptoms, ['fever', 'temperature']) &&
    hasAny(symptoms, ['neck stiffness', 'stiff neck', 'photophobia', 'light sensitivity', 'rash', 'altered mental status', 'immunocompromised'])
  ) {
    rationale.push('Meningitis/meningococcal pattern — headache + fever + meningeal signs');
    return {
      matched: true, signal: 'meningitis_or_meningococcal_sepsis', confidence: 0.97, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this combination of symptoms requires immediate evaluation for meningitis.',
    };
  }

  if (
    hasAny(symptoms, ['tearing chest pain', 'ripping chest pain', 'tearing back pain', 'ripping back pain', 'tearing pain', 'ripping pain']) &&
    hasAny([...symptoms, ...history], ['hypertension', 'high blood pressure', 'marfan', 'aorta', 'aortic'])
  ) {
    rationale.push('Aortic dissection pattern — tearing pain + hypertension/Marfan history');
    return {
      matched: true, signal: 'aortic_dissection', confidence: 0.96, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — tearing chest or back pain with this history requires urgent imaging.',
    };
  }

  if (
    hasAny(symptoms, ['headache']) &&
    hasAny(symptoms, ['nausea', 'vomiting', 'dizziness']) &&
    hasAny([...symptoms, ...history], ['enclosed space', 'garage', 'heater', 'furnace', 'generator', 'winter', 'multiple people sick', 'carbon monoxide'])
  ) {
    rationale.push('Carbon monoxide poisoning pattern — headache + nausea + exposure history');
    return {
      matched: true, signal: 'carbon_monoxide_poisoning', confidence: 0.96, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — and leave the building immediately. This may be carbon monoxide poisoning.',
    };
  }

  if (
    hasAny(symptoms, ['sore throat', 'throat pain']) &&
    hasAny(symptoms, ['drooling', 'cannot swallow', 'unable to swallow', 'stridor', 'muffled voice', 'hot potato voice'])
  ) {
    rationale.push('Adult epiglottitis pattern — sore throat + drooling/stridor/dysphagia');
    return {
      matched: true, signal: 'adult_epiglottitis', confidence: 0.96, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — throat swelling that interferes with swallowing requires immediate evaluation.',
    };
  }

  if (
    (snapshot.age ?? 99) < 3 &&
    hasAny(symptoms, ['abdominal pain', 'stomach pain', 'episodic pain', 'drawing up legs', 'pulling up legs', 'knees to chest']) &&
    hasAny(symptoms, ['bloody stool', 'blood in stool', 'currant jelly stool', 'vomiting', 'lethargy', 'lethargic', 'limp'])
  ) {
    rationale.push('Pediatric intussusception pattern — child <3 + episodic abdominal pain + danger signs');
    return {
      matched: true, signal: 'pediatric_intussusception', confidence: 0.95, rationale, disposition: 'ER_NOW',
      specificityFlag: 'absolute_immediate',
      erNowMessage: 'Go to the ER now — this pain pattern in a young child requires immediate evaluation.',
    };
  }

  return {
    matched: false,
    signal: 'none',
    confidence: 0.2,
    rationale: ['No fast-path life-threatening signature detected'],
    disposition: 'CONTINUE_PIPELINE',
  };
}
