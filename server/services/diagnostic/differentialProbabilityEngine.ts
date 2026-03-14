export interface DifferentialCandidate {
  clusterId: string;
  priorProbability: number;
  posteriorProbability: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
}

/**
 * Bayesian likelihood heuristic table.
 * Key: symptom/answer token → clusterId → likelihood ratio.
 * Ratios >1 increase the posterior; <1 decrease it; 1 = no effect.
 */
const LIKELIHOOD_MAP: Record<string, Record<string, number>> = {
  // Respiratory
  fever:               { pneumonia: 3.0, flu: 2.5, covid: 2.0, bronchitis: 1.5 },
  cough:               { bronchitis: 3.0, pneumonia: 2.5, flu: 2.0, covid: 2.0, asthma: 1.5 },
  wheezing:            { asthma: 4.0, copd: 3.0, bronchitis: 1.5 },
  pleuritic_pain:      { pulmonary_embolism: 4.0, pneumonia: 2.5, pleuritis: 3.0 },
  hemoptysis:          { pulmonary_embolism: 3.5, tuberculosis: 4.0, lung_cancer: 3.0 },
  dyspnea:             { pulmonary_embolism: 3.0, asthma: 2.5, heart_failure: 2.5, pneumonia: 2.0 },

  // Cardiac
  chest_pain:          { acs: 3.5, pulmonary_embolism: 2.0, gerd: 1.5, musculoskeletal: 1.5 },
  diaphoresis:         { acs: 3.0, hypoglycemia: 2.5 },
  palpitations:        { arrhythmia: 3.5, anxiety: 2.0, hyperthyroidism: 2.5 },
  syncope:             { arrhythmia: 3.0, vasovagal: 2.5, acs: 2.0 },

  // ENT
  sore_throat:         { pharyngitis: 3.5, tonsillitis: 3.0, flu: 2.0 },
  stridor:             { croup: 4.0, epiglottitis: 4.5, foreign_body: 3.5 },
  ear_pain:            { otitis_media: 4.0, otitis_externa: 3.5 },
  nasal_congestion:    { uri: 3.0, sinusitis: 3.5, allergic_rhinitis: 3.0 },
  epistaxis:           { hypertension: 2.5, trauma: 2.0, coagulopathy: 2.0 },
  hoarseness:          { laryngitis: 3.5, gerd: 2.0, vocal_cord_lesion: 2.5 },

  // GI
  nausea:              { gastroenteritis: 3.0, appendicitis: 2.0, pregnancy: 2.0 },
  vomiting:            { gastroenteritis: 3.0, appendicitis: 2.5, bowel_obstruction: 2.5 },
  diarrhea:            { gastroenteritis: 4.0, ibd: 2.5, c_diff: 2.5 },
  abdominal_pain:      { appendicitis: 2.5, ectopic_pregnancy: 3.0, ibs: 2.0, cholecystitis: 2.5 },
  rebound_tenderness:  { appendicitis: 4.5, peritonitis: 4.5 },

  // GU
  dysuria:             { uti: 4.0, std: 2.0, urethritis: 2.5 },
  hematuria:           { urolithiasis: 3.5, uti: 2.5, bladder_cancer: 2.0 },
  flank_pain:          { urolithiasis: 4.0, pyelonephritis: 3.5 },

  // Neuro
  headache:            { migraine: 3.0, tension_headache: 2.5, subarachnoid_hemorrhage: 2.0, meningitis: 2.0 },
  thunderclap_headache:{ subarachnoid_hemorrhage: 5.0 },
  neck_stiffness:      { meningitis: 4.5, subarachnoid_hemorrhage: 3.0 },
  focal_weakness:      { stroke: 4.0, tia: 3.5, ms: 2.5 },
  altered_mentation:   { sepsis: 3.0, hypoglycemia: 3.0, encephalitis: 3.0 },

  // MSK / Derm
  joint_swelling:      { gout: 3.5, septic_arthritis: 3.0, rheumatoid_arthritis: 2.5 },
  rash:                { cellulitis: 3.0, contact_dermatitis: 2.5, shingles: 3.5, measles: 2.5 },

  // Endo / Metabolic
  polyuria:            { diabetes: 4.0, diabetes_insipidus: 3.0 },
  polydipsia:          { diabetes: 4.0 },
  weight_loss:         { diabetes: 2.5, cancer: 2.5, hyperthyroidism: 3.0 },
};

/** Protective evidence map — symptoms that make a DX less likely. */
const EVIDENCE_AGAINST_MAP: Record<string, Record<string, number>> = {
  fever:          { tension_headache: 0.4, musculoskeletal: 0.5 },
  pleuritic_pain: { gerd: 0.3 },
  dysuria:        { urolithiasis: 0.6 },
};

function likelihood(symptom: string, clusterId: string): number {
  return LIKELIHOOD_MAP[symptom]?.[clusterId] ?? 1.0;
}

function protectiveLikelihood(symptom: string, clusterId: string): number {
  return EVIDENCE_AGAINST_MAP[symptom]?.[clusterId] ?? 1.0;
}

export function computeDifferentialProbabilities(
  dxCandidates: Array<{ clusterId: string; score: number }>,
  answers: Record<string, unknown>
): DifferentialCandidate[] {
  if (dxCandidates.length === 0) return [];

  const totalScore = dxCandidates.reduce((s, d) => s + Math.max(0, d.score), 0) || 1;

  const answeredKeys = Object.keys(answers).filter(
    (k) => answers[k] !== undefined && answers[k] !== null && answers[k] !== false && answers[k] !== "no"
  );
  const negativeKeys = Object.keys(answers).filter(
    (k) => answers[k] === false || answers[k] === "no"
  );

  const raw = dxCandidates.map((d) => {
    const prior = Math.max(0, d.score) / totalScore;

    // Apply positive evidence (Bayes likelihood update)
    let posterior = prior;
    const evidenceFor: string[] = [];
    const evidenceAgainst: string[] = [];

    for (const key of answeredKeys) {
      const lr = likelihood(key, d.clusterId);
      if (lr !== 1.0) {
        posterior *= lr;
        if (lr > 1.0) evidenceFor.push(key);
        else evidenceAgainst.push(key);
      }
    }

    // Apply negative evidence (protective factors)
    for (const key of negativeKeys) {
      const lr = protectiveLikelihood(key, d.clusterId);
      if (lr !== 1.0) {
        posterior *= lr;
        evidenceAgainst.push(key);
      }
    }

    return { clusterId: d.clusterId, prior, posterior, evidenceFor, evidenceAgainst };
  });

  // Normalize posteriors so they sum to 1
  const totalPosterior = raw.reduce((s, d) => s + d.posterior, 0) || 1;

  return raw
    .map((d) => ({
      clusterId: d.clusterId,
      priorProbability: d.prior,
      posteriorProbability: d.posterior / totalPosterior,
      evidenceFor: d.evidenceFor,
      evidenceAgainst: d.evidenceAgainst,
    }))
    .sort((a, b) => b.posteriorProbability - a.posteriorProbability);
}
