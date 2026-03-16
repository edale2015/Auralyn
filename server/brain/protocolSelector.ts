export interface ClinicalProtocol {
  id: string;
  name: string;
  source: string;
  applicableComplaints: string[];
  keyRecommendations: string[];
  safetyPriorities: string[];
  dispositionGuidance: string;
  evidenceLevel: 'A' | 'B' | 'C' | 'Expert';
}

const PROTOCOLS: Record<string, ClinicalProtocol> = {
  CDC_RESPIRATORY: {
    id: 'CDC_RESPIRATORY',
    name: 'CDC Respiratory Illness Guidance',
    source: 'CDC',
    applicableComplaints: ['cough', 'shortness_of_breath', 'fever'],
    keyRecommendations: ['Assess vaccination status', 'Oxygen saturation monitoring', 'Isolate if COVID/influenza suspected', 'CXR if clinical indicators met'],
    safetyPriorities: ['SpO2 < 94% → immediate escalation', 'Haemoptysis → urgent review', 'Stridor → emergency'],
    dispositionGuidance: 'Mild: self-care with monitoring. Moderate: urgent care. Severe/hypoxic: ED now.',
    evidenceLevel: 'A',
  },

  EMERGENCY_CARDIAC_PROTOCOL: {
    id: 'EMERGENCY_CARDIAC_PROTOCOL',
    name: 'ACEP / AHA Acute Coronary Syndrome Protocol',
    source: 'ACEP + AHA',
    applicableComplaints: ['chest_pain'],
    keyRecommendations: ['12-lead ECG within 10 min', 'Serial troponin', 'Aspirin 300mg', 'Sublingual GTN if systolic >90', 'O2 if SpO2 <94%'],
    safetyPriorities: ['ST elevation → cath lab activation', 'Haemodynamic instability → immediate resuscitation'],
    dispositionGuidance: 'Any suspicion of ACS → ED now. Cannot be safely cleared remotely.',
    evidenceLevel: 'A',
  },

  NICE_HEADACHE: {
    id: 'NICE_HEADACHE',
    name: 'NICE NG12 Headache in Adults',
    source: 'NICE',
    applicableComplaints: ['headache'],
    keyRecommendations: ['SSNOOP10 red flags screen', 'Thunderclap → LP after CT', 'Migraine: NSAID + antiemetic', 'TTH: reassurance + analgesia'],
    safetyPriorities: ['Thunderclap headache → emergency CT', 'Fever + neck stiffness → LP', 'New headache > age 50 → urgent imaging'],
    dispositionGuidance: 'Red flags → ED. Migraine pattern without flags → GP within 24h. TTH → self-care.',
    evidenceLevel: 'A',
  },

  NICE_SORE_THROAT: {
    id: 'NICE_SORE_THROAT',
    name: 'NICE NG84 Sore Throat (Acute)',
    source: 'NICE',
    applicableComplaints: ['sore_throat'],
    keyRecommendations: ['FeverPAIN or Centor score', 'Antibiotics only if score 4-5', 'Safety net for airway symptoms', 'Peritonsillar abscess → ENT emergency'],
    safetyPriorities: ['Stridor → 999 immediately', 'Drooling/trismus → ED now', 'Immunocompromised → lower threshold'],
    dispositionGuidance: 'Low Centor (0-2): self-care. High Centor (4-5): antibiotic. Complications: ED.',
    evidenceLevel: 'A',
  },

  AAFP_EAR_PAIN: {
    id: 'AAFP_EAR_PAIN',
    name: 'AAFP Acute Otitis Media Guidelines',
    source: 'AAFP + AAP',
    applicableComplaints: ['ear_pain'],
    keyRecommendations: ['Confirm tympanic membrane status', 'Watchful waiting for mild-moderate AOM >6 months', 'Amoxicillin if antibiotics warranted', 'Mastoiditis → ENT emergency'],
    safetyPriorities: ['Post-auricular swelling/erythema → mastoiditis → ED', 'Facial palsy → emergency', 'Vertigo + hearing loss → urgent ENT'],
    dispositionGuidance: 'Mild: watchful waiting 48-72h. Severe/bilateral/infant: antibiotics. Complications: ED.',
    evidenceLevel: 'A',
  },

  NICE_DIZZINESS: {
    id: 'NICE_DIZZINESS',
    name: 'NICE CKS Vertigo Guidelines',
    source: 'NICE',
    applicableComplaints: ['dizziness'],
    keyRecommendations: ['HINTS exam (Head Impulse, Nystagmus, Test of Skew)', 'BPPV: Epley manoeuvre', 'Central vertigo: neuroimaging', 'Vestibular neuritis: prochlorperazine'],
    safetyPriorities: ['Unable to walk → possible central → urgent CT/MRI', 'HINTS abnormal → stroke workup', 'Sudden hearing loss + vertigo → urgent ENT'],
    dispositionGuidance: 'BPPV confirmed: GP + Epley. Central signs: ED. Uncertain: urgent neurology.',
    evidenceLevel: 'B',
  },

  WHO_FEVER: {
    id: 'WHO_FEVER',
    name: 'WHO / NICE Fever Assessment Protocol',
    source: 'WHO + NICE',
    applicableComplaints: ['fever'],
    keyRecommendations: ['SEPSIS-3 criteria screen', 'Source identification', 'Blood cultures before antibiotics if sepsis suspected', 'Paediatric: NICE traffic light system'],
    safetyPriorities: ['qSOFA ≥2 → possible sepsis → ED urgently', 'Petechial rash + fever → meningococcal emergency → 999', 'Temp >38.5 in infants <3m → ED'],
    dispositionGuidance: 'Low risk: self-care + monitoring. Moderate: GP same day. Red flags: ED now.',
    evidenceLevel: 'A',
  },

  GENERAL_TRIAGE: {
    id: 'GENERAL_TRIAGE',
    name: 'General Triage Protocol',
    source: 'Manchester Triage System',
    applicableComplaints: [],
    keyRecommendations: ['Assess airway, breathing, circulation', 'Vital signs if possible', 'Red flag screen', 'Disposition by acuity'],
    safetyPriorities: ['Altered consciousness → emergency', 'Severe pain → urgent', 'Any red flag → do not self-care'],
    dispositionGuidance: 'Based on acuity: self-care / GP / urgent care / ED / 999.',
    evidenceLevel: 'Expert',
  },
};

export function selectProtocol(complaint: string): ClinicalProtocol {
  const key = complaint.toLowerCase().replace(/[\s-]+/g, '_');

  for (const protocol of Object.values(PROTOCOLS)) {
    if (protocol.applicableComplaints.includes(key)) return protocol;
  }

  return PROTOCOLS.GENERAL_TRIAGE;
}

export function getProtocol(protocolId: string): ClinicalProtocol | null {
  return PROTOCOLS[protocolId] ?? null;
}

export function listProtocols(): ClinicalProtocol[] {
  return Object.values(PROTOCOLS);
}
