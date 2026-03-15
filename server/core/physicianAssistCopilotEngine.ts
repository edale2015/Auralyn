import type { BrainCaseInput, DifferentialScore, Disposition } from '../../shared/clinicalEngineTypes';

export interface CopilotNote {
  chiefComplaint: string;
  hpi: string;
  assessment: string;
  plan: string;
  dispositionRationale: string;
  icdSuggestions: string[];
  fullNote: string;
}

const ICD10_MAP: Record<string, string[]> = {
  acute_coronary_syndrome: ['I20.0', 'I21.9'],
  pulmonary_embolism: ['I26.99'],
  pneumonia: ['J18.9', 'J15.9'],
  uti: ['N39.0'],
  pyelonephritis: ['N10'],
  pharyngitis: ['J02.9', 'J02.0'],
  otitis_media: ['H66.9', 'H66.90'],
  meningitis: ['G03.9'],
  influenza: ['J11.1'],
  covid: ['U07.1'],
  migraine: ['G43.909'],
  sinusitis: ['J32.9'],
  bronchitis: ['J40'],
  asthma: ['J45.901'],
  sepsis: ['A41.9'],
};

export function runPhysicianAssistCopilotEngine(
  input: BrainCaseInput,
  differentials: DifferentialScore[],
  disposition: Disposition,
  tests: string[],
  treatments: string[],
  notes: string[]
): CopilotNote {
  const topDx = differentials[0];
  const complaint = input.complaint || 'presenting complaint';
  const duration = input.durationHours ? `${input.durationHours} hours` : 'unknown duration';
  const symList = (input.symptoms ?? []).join(', ') || 'none documented';
  const negList = (input.negatives ?? []).join(', ') || 'none';

  const chiefComplaint = `${complaint} × ${duration}`;

  const hpi = `Patient presents with ${complaint} for ${duration}. ` +
    `Positive symptoms include: ${symList}. ` +
    `Pertinent negatives: ${negList}. ` +
    (input.profile?.age ? `Patient is a ${input.profile.age}-year-old ` : '') +
    (input.profile?.sex ? `${input.profile.sex}. ` : '') +
    (input.profile?.comorbidities?.length ? `PMH: ${input.profile.comorbidities.join(', ')}.` : '');

  const diffList = differentials.slice(0, 3)
    .map((d, i) => `${i + 1}. ${d.diagnosis.replace(/_/g, ' ')} (${Math.round(d.score * 100)}%)`)
    .join('; ');

  const assessment = `${topDx ? topDx.diagnosis.replace(/_/g, ' ').toUpperCase() : 'Undifferentiated'} — most likely given clinical presentation. ` +
    `Differential: ${diffList}. ` +
    (notes.length ? `Clinical notes: ${notes.slice(0, 2).join('. ')}.` : '');

  const planTests = tests.length ? `Tests ordered: ${tests.join(', ')}.` : 'No additional workup at this time.';
  const planTx = treatments.length ? `Treatment: ${treatments.join(', ')}.` : 'Supportive care.';
  const plan = `${planTests} ${planTx}`;

  const dispositionRationale = `Disposition: ${disposition.replace(/_/g, ' ')}. ` +
    (disposition === 'ER_NOW' ? 'Requires immediate emergency evaluation.' :
     disposition === 'HOME_CARE' ? 'Clinically stable for outpatient management with precautions.' :
     disposition === 'VIDEO_VISIT' ? 'Appropriate for virtual follow-up within 24-48 hours.' :
     disposition === 'NEEDS_PHYSICIAN_REVIEW' ? 'Case flagged for physician review before final disposition.' :
     'Follow-up as indicated.');

  const icdSuggestions = differentials
    .slice(0, 3)
    .flatMap((d) => ICD10_MAP[d.diagnosis] ?? [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);

  const fullNote = [
    `CC: ${chiefComplaint}`,
    `HPI: ${hpi}`,
    `A/P: ${assessment}`,
    `PLAN: ${plan}`,
    `DISPOSITION: ${dispositionRationale}`,
    icdSuggestions.length ? `ICD-10: ${icdSuggestions.join(', ')}` : '',
  ].filter(Boolean).join('\n\n');

  return { chiefComplaint, hpi, assessment, plan, dispositionRationale, icdSuggestions, fullNote };
}
