export interface SkillRequirement {
  skill: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  relatedEngines: string[];
}

export const SkillGraph: Record<string, SkillRequirement[]> = {
  cough: [
    { skill: 'red_flag_detection',   priority: 'critical', description: 'Identify haemoptysis, stridor, and respiratory failure signs',  relatedEngines: ['redFlagEngine', 'sepsisAlertEngine'] },
    { skill: 'pneumonia_risk',        priority: 'high',     description: 'CRB-65 and atypical pneumonia pattern recognition',            relatedEngines: ['bayesianDifferentialEngine', 'riskFactorEngine'] },
    { skill: 'asthma_history',        priority: 'high',     description: 'Prior bronchospasm, wheeze, atopy, ICS use',                  relatedEngines: ['caseSimilarityEngine', 'temporalSymptomEngine'] },
    { skill: 'chronic_cough',         priority: 'medium',   description: 'Post-nasal drip, GERD, ACE-inhibitor, pertussis',             relatedEngines: ['differentialPruningEngine', 'guidelineComplianceEngine'] },
    { skill: 'epidemiology_context',  priority: 'medium',   description: 'Flu season, COVID prevalence, TB exposure',                  relatedEngines: ['epidemiologyAdjustmentEngine'] },
  ],

  headache: [
    { skill: 'thunderclap_recognition', priority: 'critical', description: 'SAH identification — sudden-onset worst-ever headache',   relatedEngines: ['redFlagEngine', 'strokeAlertEngine'] },
    { skill: 'meningism_screen',        priority: 'critical', description: 'Neck stiffness, photophobia, Kernig/Brudzinski',          relatedEngines: ['redFlagEngine', 'sepsisAlertEngine'] },
    { skill: 'migraine_classification', priority: 'high',     description: 'ICHD-3 migraine with/without aura criteria',             relatedEngines: ['bayesianDifferentialEngine', 'caseSimilarityEngine'] },
    { skill: 'secondary_headache',      priority: 'high',     description: 'Raised ICP, temporal arteritis, hypertensive',           relatedEngines: ['riskFactorEngine', 'demographicAdjustmentEngine'] },
    { skill: 'red_flag_detection',      priority: 'critical', description: 'New onset >50, positional change, woken from sleep',     relatedEngines: ['redFlagEngine'] },
  ],

  chest_pain: [
    { skill: 'mi_risk',               priority: 'critical', description: 'HEART score, TIMI, ECG interpretation context',             relatedEngines: ['miAlertEngine', 'redFlagEngine', 'riskThresholdEngine'] },
    { skill: 'pe_risk',               priority: 'critical', description: 'Wells score for pulmonary embolism',                        relatedEngines: ['redFlagEngine', 'bayesianDifferentialEngine'] },
    { skill: 'aortic_dissection',     priority: 'critical', description: 'Ripping/tearing, BP differential, prior HTN',              relatedEngines: ['redFlagEngine', 'riskFactorEngine'] },
    { skill: 'gerd',                  priority: 'medium',   description: 'Burning, post-prandial, positional relief',                relatedEngines: ['differentialPruningEngine', 'temporalSymptomEngine'] },
    { skill: 'musculoskeletal',       priority: 'low',      description: 'Reproducible on palpation, positional',                   relatedEngines: ['clusterScoringEngine'] },
  ],

  sore_throat: [
    { skill: 'centor_score',          priority: 'critical', description: 'Strep pharyngitis probability: tonsillar exudate, LAD, no cough, fever', relatedEngines: ['bayesianDifferentialEngine', 'riskFactorEngine'] },
    { skill: 'peri_tonsillar_abscess',priority: 'critical', description: 'Trismus, uvula deviation, muffled voice, drooling',       relatedEngines: ['redFlagEngine', 'anaphylaxisAlertEngine'] },
    { skill: 'epiglottitis',          priority: 'critical', description: 'Stridor, tripod posture, drooling — airway emergency',    relatedEngines: ['redFlagEngine', 'sepsisAlertEngine'] },
    { skill: 'viral_pharyngitis',     priority: 'medium',   description: 'Rhinorrhoea, mild fever, gradual onset',                 relatedEngines: ['clusterScoringEngine', 'epidemiologyAdjustmentEngine'] },
  ],

  ear_pain: [
    { skill: 'otitis_media',          priority: 'high',     description: 'AOM vs OME distinction, fever, hearing loss pattern',     relatedEngines: ['bayesianDifferentialEngine', 'caseSimilarityEngine'] },
    { skill: 'mastoiditis',           priority: 'critical', description: 'Post-auricular tenderness, ear displacement — complication of AOM', relatedEngines: ['redFlagEngine'] },
    { skill: 'otitis_externa',        priority: 'medium',   description: 'Tragal tenderness, discharge, swimming exposure',         relatedEngines: ['clusterScoringEngine'] },
    { skill: 'referred_pain',         priority: 'low',      description: 'TMJ, dental, tonsil, cervical spine',                   relatedEngines: ['differentialPruningEngine'] },
  ],

  dizziness: [
    { skill: 'stroke_risk',           priority: 'critical', description: 'HINTS exam, sudden onset, cannot walk, headache',         relatedEngines: ['strokeAlertEngine', 'redFlagEngine'] },
    { skill: 'bppv',                  priority: 'high',     description: 'Dix-Hallpike, positional, seconds duration',             relatedEngines: ['caseSimilarityEngine', 'temporalSymptomEngine'] },
    { skill: 'menieres',              priority: 'medium',   description: 'Tinnitus + hearing loss + episodic vertigo triad',       relatedEngines: ['clusterScoringEngine', 'symptomInteractionEngine'] },
    { skill: 'medication_side_effect',priority: 'medium',   description: 'Antihypertensives, benzodiazepines, aminoglycosides',    relatedEngines: ['drugInteractionSafetyEngine', 'riskFactorEngine'] },
  ],

  shortness_of_breath: [
    { skill: 'respiratory_failure',   priority: 'critical', description: 'SpO2 <92%, accessory muscle use, unable to speak in sentences', relatedEngines: ['redFlagEngine', 'riskThresholdEngine'] },
    { skill: 'pe_risk',               priority: 'critical', description: 'Wells PE criteria, sudden onset, pleuritic pain, immobility',  relatedEngines: ['redFlagEngine', 'bayesianDifferentialEngine'] },
    { skill: 'asthma_exacerbation',   priority: 'high',     description: 'Prior Dx, trigger exposure, peak flow, last admission',       relatedEngines: ['caseSimilarityEngine', 'riskFactorEngine'] },
    { skill: 'heart_failure',         priority: 'high',     description: 'PND, orthopnoea, oedema, prior cardiac history',              relatedEngines: ['miAlertEngine', 'comorbidityEngine'] },
  ],

  fever: [
    { skill: 'sepsis_screen',         priority: 'critical', description: 'qSOFA: altered mentation, RR ≥22, SBP ≤100',               relatedEngines: ['sepsisAlertEngine', 'redFlagEngine'] },
    { skill: 'meningitis',            priority: 'critical', description: 'Rash (petechial), neck stiffness, photophobia, altered GCS', relatedEngines: ['redFlagEngine'] },
    { skill: 'source_identification', priority: 'high',     description: 'UTI, LRTI, cellulitis, cholangitis source determination',    relatedEngines: ['bayesianDifferentialEngine', 'epidemiologyAdjustmentEngine'] },
    { skill: 'paediatric_fever',      priority: 'high',     description: 'NICE traffic light system for under-5 febrile illness',      relatedEngines: ['pediatricSafetyEngine', 'riskFactorEngine'] },
  ],
};

export function getSkillsForComplaint(complaint: string): SkillRequirement[] {
  const key = complaint.toLowerCase().replace(/[\s-]+/g, '_');
  return SkillGraph[key] ?? [];
}

export function listComplaintsWithSkills(): string[] {
  return Object.keys(SkillGraph);
}

export function getCriticalSkills(complaint: string): SkillRequirement[] {
  return getSkillsForComplaint(complaint).filter((s) => s.priority === 'critical');
}

export function getEnginesForComplaint(complaint: string): string[] {
  const engines = new Set<string>();
  for (const skill of getSkillsForComplaint(complaint)) {
    for (const e of skill.relatedEngines) engines.add(e);
  }
  return Array.from(engines);
}
