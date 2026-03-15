export type FieldType = 'boolean' | 'number' | 'select' | 'text' | 'multiselect';

export interface CaseField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  required: boolean;
  clinicalMeaning: string;
}

export interface GoldenCaseTemplate {
  complaint: string;
  label: string;
  fields: CaseField[];
  expectedDispositions: string[];
  commonDiagnoses: string[];
}

export interface GoldenCase {
  id: string;
  complaint: string;
  answers: Record<string, unknown>;
  symptoms: string[];
  expectedDiagnosis: string;
  expectedDisposition: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  tags?: string[];
}

export const GOLDEN_CASE_TEMPLATES: GoldenCaseTemplate[] = [
  {
    complaint: 'cough',
    label: 'Cough',
    commonDiagnoses: ['viral_uri', 'pneumonia', 'asthma', 'GERD', 'bronchitis', 'covid', 'sinusitis', 'lung_cancer', 'COPD'],
    expectedDispositions: ['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY', 'ER_NOW'],
    fields: [
      { id: 'duration_days', label: 'Duration', type: 'select', options: ['< 1 week', '1-3 weeks', '3-8 weeks', '> 8 weeks'], required: true, clinicalMeaning: 'Acute <3w, subacute 3-8w, chronic >8w changes DDx' },
      { id: 'fever', label: 'Fever (≥38°C / 100.4°F)', type: 'boolean', required: true, clinicalMeaning: 'Suggests infectious etiology' },
      { id: 'shortness_of_breath', label: 'Shortness of Breath', type: 'boolean', required: true, clinicalMeaning: 'Raises concern for pneumonia, asthma, PE' },
      { id: 'productive_cough', label: 'Productive (purulent sputum)', type: 'boolean', required: false, clinicalMeaning: 'Suggests bacterial infection' },
      { id: 'hemoptysis', label: 'Coughing blood', type: 'boolean', required: false, clinicalMeaning: 'Red flag — PE, TB, malignancy' },
      { id: 'age', label: 'Age', type: 'number', unit: 'years', required: true, clinicalMeaning: 'Age >50 + smoking raises lung cancer risk' },
      { id: 'smoker', label: 'Smoker (active or former)', type: 'boolean', required: true, clinicalMeaning: 'COPD, lung cancer risk factor' },
      { id: 'pack_years', label: 'Pack Years', type: 'number', required: false, clinicalMeaning: '>20 pack-years significantly increases lung cancer risk' },
      { id: 'chest_pain', label: 'Associated Chest Pain', type: 'boolean', required: false, clinicalMeaning: 'Pleuritic → PE/pleuritis; non-pleuritic → pneumonia' },
      { id: 'pleuritic_pain', label: 'Pleuritic (worse with breathing)', type: 'boolean', required: false, clinicalMeaning: 'Suggests PE or pleuritis' },
      { id: 'post_nasal_drip', label: 'Sinus Congestion / Post-nasal Drip', type: 'boolean', required: false, clinicalMeaning: 'Upper airway cough syndrome' },
      { id: 'heartburn_gerd', label: 'Heartburn / GERD Symptoms', type: 'boolean', required: false, clinicalMeaning: 'GERD-related chronic cough' },
      { id: 'flu_symptoms', label: 'Flu-like Symptoms (myalgias, malaise)', type: 'boolean', required: false, clinicalMeaning: 'Viral syndrome, influenza, COVID' },
      { id: 'wheezing', label: 'Wheezing', type: 'boolean', required: false, clinicalMeaning: 'Asthma, COPD, foreign body' },
      { id: 'lung_heart_history', label: 'Known Lung or Heart Disease', type: 'multiselect', options: ['COPD', 'Asthma', 'Heart failure', 'Prior TB', 'None'], required: false, clinicalMeaning: 'Baseline disease significantly modifies risk' },
      { id: 'immunocompromised', label: 'Immunocompromised', type: 'boolean', required: false, clinicalMeaning: 'Atypical pneumonia, opportunistic infection' },
      { id: 'travel_sick_contacts', label: 'Recent travel or sick contacts', type: 'boolean', required: false, clinicalMeaning: 'Infectious exposure risk' },
      { id: 'spo2', label: 'SpO2 (%)', type: 'number', unit: '%', required: false, clinicalMeaning: '<94% suggests significant respiratory compromise' },
    ],
  },
  {
    complaint: 'sore_throat',
    label: 'Sore Throat',
    commonDiagnoses: ['viral_pharyngitis', 'strep_pharyngitis', 'mono', 'peritonsillar_abscess', 'epiglottitis'],
    expectedDispositions: ['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY', 'ER_NOW'],
    fields: [
      { id: 'duration_days', label: 'Duration (days)', type: 'number', unit: 'days', required: true, clinicalMeaning: '>5 days without improvement raises concern' },
      { id: 'fever', label: 'Fever', type: 'boolean', required: true, clinicalMeaning: 'Centor criteria — increases strep score' },
      { id: 'exudate', label: 'Tonsillar Exudate', type: 'boolean', required: true, clinicalMeaning: 'Centor criteria' },
      { id: 'cough_absent', label: 'No Cough', type: 'boolean', required: true, clinicalMeaning: 'Centor criteria — absence of cough increases strep score' },
      { id: 'lymphadenopathy', label: 'Anterior Cervical Lymphadenopathy', type: 'boolean', required: false, clinicalMeaning: 'Centor criteria' },
      { id: 'trismus', label: 'Difficulty Opening Mouth (Trismus)', type: 'boolean', required: false, clinicalMeaning: 'Red flag — peritonsillar abscess' },
      { id: 'drooling', label: 'Drooling / Uvula Deviation', type: 'boolean', required: false, clinicalMeaning: 'Red flag — abscess or epiglottitis' },
      { id: 'stridor', label: 'Stridor / Airway Concern', type: 'boolean', required: false, clinicalMeaning: 'Red flag — epiglottitis, requires immediate airway assessment' },
      { id: 'age', label: 'Age', type: 'number', unit: 'years', required: true, clinicalMeaning: 'Mono more common age 15-24; Centor modified for age' },
    ],
  },
  {
    complaint: 'ear_pain',
    label: 'Ear Pain',
    commonDiagnoses: ['otitis_media', 'otitis_externa', 'TMJ', 'referred_pain', 'mastoiditis'],
    expectedDispositions: ['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY', 'ER_NOW'],
    fields: [
      { id: 'duration_days', label: 'Duration (days)', type: 'number', unit: 'days', required: true, clinicalMeaning: 'Acute <48h vs. subacute changes management' },
      { id: 'fever', label: 'Fever', type: 'boolean', required: true, clinicalMeaning: 'Suggests AOM vs. AOM with effusion' },
      { id: 'discharge', label: 'Ear Discharge', type: 'boolean', required: false, clinicalMeaning: 'Otitis externa vs. perforated AOM' },
      { id: 'hearing_loss', label: 'Hearing Loss', type: 'boolean', required: false, clinicalMeaning: 'Effusion, perforation, or cholesteatoma' },
      { id: 'pain_with_chewing', label: 'Pain with Chewing', type: 'boolean', required: false, clinicalMeaning: 'TMJ dysfunction or otitis externa' },
      { id: 'postauricular_swelling', label: 'Swelling Behind Ear', type: 'boolean', required: false, clinicalMeaning: 'Red flag — mastoiditis' },
      { id: 'prior_ear_infections', label: 'Recurrent Ear Infections', type: 'boolean', required: false, clinicalMeaning: 'Chronic OM, tube consideration' },
      { id: 'age', label: 'Age', type: 'number', unit: 'years', required: true, clinicalMeaning: 'AOM most common in children <5' },
    ],
  },
  {
    complaint: 'chest_pain',
    label: 'Chest Pain',
    commonDiagnoses: ['acute_coronary_syndrome', 'pulmonary_embolism', 'pericarditis', 'musculoskeletal', 'GERD', 'aortic_dissection'],
    expectedDispositions: ['ER_NOW', 'URGENT_SAME_DAY', 'OFFICE_24H', 'HOME_CARE'],
    fields: [
      { id: 'duration_hours', label: 'Duration (hours)', type: 'number', unit: 'hours', required: true, clinicalMeaning: 'Hyperacute onset <6h is red flag for ACS/aortic dissection' },
      { id: 'character', label: 'Character', type: 'select', options: ['pressure/squeezing', 'sharp/stabbing', 'burning', 'tearing', 'aching'], required: true, clinicalMeaning: 'Pressure = ACS; tearing = dissection; sharp pleuritic = PE/pericarditis' },
      { id: 'radiation', label: 'Radiation (jaw, arm, back)', type: 'boolean', required: true, clinicalMeaning: 'ACS — arm/jaw; dissection — back/interscapular' },
      { id: 'diaphoresis', label: 'Diaphoresis', type: 'boolean', required: true, clinicalMeaning: 'High-risk ACS feature' },
      { id: 'dyspnea', label: 'Shortness of Breath', type: 'boolean', required: true, clinicalMeaning: 'ACS, PE, or pneumonia' },
      { id: 'pleuritic', label: 'Pleuritic (worse with breathing)', type: 'boolean', required: false, clinicalMeaning: 'PE, pericarditis, pleuritis' },
      { id: 'exertional', label: 'Exertional', type: 'boolean', required: false, clinicalMeaning: 'Angina vs. pleuritis' },
      { id: 'risk_factors', label: 'Cardiac Risk Factors', type: 'multiselect', options: ['HTN', 'DM', 'Hyperlipidemia', 'Smoking', 'Family Hx', 'Prior MI', 'None'], required: true, clinicalMeaning: 'TIMI/HEART score inputs' },
      { id: 'leg_swelling', label: 'Leg Swelling / DVT Symptoms', type: 'boolean', required: false, clinicalMeaning: 'Wells PE criteria' },
      { id: 'age', label: 'Age', type: 'number', unit: 'years', required: true, clinicalMeaning: 'Age >40 significantly increases ACS probability' },
      { id: 'sex', label: 'Sex', type: 'select', options: ['male', 'female', 'other'], required: false, clinicalMeaning: 'Women more likely to have atypical ACS presentations' },
    ],
  },
  {
    complaint: 'shortness_of_breath',
    label: 'Shortness of Breath',
    commonDiagnoses: ['asthma', 'COPD_exacerbation', 'heart_failure', 'pulmonary_embolism', 'pneumonia', 'anemia', 'anxiety'],
    expectedDispositions: ['ER_NOW', 'URGENT_SAME_DAY', 'OFFICE_24H', 'VIDEO_VISIT', 'HOME_CARE'],
    fields: [
      { id: 'onset', label: 'Onset', type: 'select', options: ['sudden (<1 min)', 'rapid (minutes)', 'gradual (hours)', 'slow (days)'], required: true, clinicalMeaning: 'Sudden = PE/pneumothorax; gradual = pneumonia/HF' },
      { id: 'spo2', label: 'SpO2 (%)', type: 'number', unit: '%', required: true, clinicalMeaning: '<90% = immediate intervention; 90-94 = concerning' },
      { id: 'wheezing', label: 'Wheezing', type: 'boolean', required: false, clinicalMeaning: 'Asthma, COPD, anaphylaxis' },
      { id: 'orthopnea', label: 'Orthopnea (worse lying flat)', type: 'boolean', required: false, clinicalMeaning: 'Heart failure' },
      { id: 'leg_swelling', label: 'Bilateral Leg Swelling', type: 'boolean', required: false, clinicalMeaning: 'Heart failure, DVT/PE' },
      { id: 'chest_pain', label: 'Associated Chest Pain', type: 'boolean', required: false, clinicalMeaning: 'ACS, PE, pleuritis' },
      { id: 'fever', label: 'Fever', type: 'boolean', required: false, clinicalMeaning: 'Pneumonia, myocarditis' },
      { id: 'prior_episodes', label: 'Prior Episodes', type: 'boolean', required: false, clinicalMeaning: 'Asthma, COPD, recurrent PE' },
      { id: 'known_lung_heart', label: 'Known Lung/Heart Disease', type: 'multiselect', options: ['Asthma', 'COPD', 'Heart failure', 'CABG/stents', 'None'], required: false, clinicalMeaning: 'Exacerbation vs. new pathology' },
    ],
  },
  {
    complaint: 'dysuria',
    label: 'Painful Urination',
    commonDiagnoses: ['uti', 'pyelonephritis', 'STI', 'vaginitis', 'interstitial_cystitis'],
    expectedDispositions: ['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY'],
    fields: [
      { id: 'duration_days', label: 'Duration (days)', type: 'number', unit: 'days', required: true, clinicalMeaning: 'Longer duration raises pyelonephritis concern' },
      { id: 'fever', label: 'Fever', type: 'boolean', required: true, clinicalMeaning: 'Pyelonephritis or sepsis concern' },
      { id: 'flank_pain', label: 'Flank / Back Pain', type: 'boolean', required: true, clinicalMeaning: 'Pyelonephritis — requires more aggressive treatment' },
      { id: 'frequency', label: 'Urinary Frequency', type: 'boolean', required: true, clinicalMeaning: 'Classic UTI symptom' },
      { id: 'hematuria', label: 'Blood in Urine', type: 'boolean', required: false, clinicalMeaning: 'UTI, kidney stone, or malignancy' },
      { id: 'vaginal_discharge', label: 'Vaginal Discharge (if applicable)', type: 'boolean', required: false, clinicalMeaning: 'Vaginitis or cervicitis/STI' },
      { id: 'pregnant', label: 'Pregnant / Could be pregnant', type: 'boolean', required: false, clinicalMeaning: 'Requires different antibiotic choices, UTI high-risk' },
      { id: 'recurrent_utis', label: 'Recurrent UTIs (≥3/year)', type: 'boolean', required: false, clinicalMeaning: 'May require prophylaxis or urology referral' },
      { id: 'immunocompromised', label: 'Immunocompromised', type: 'boolean', required: false, clinicalMeaning: 'Higher risk complicated UTI' },
    ],
  },
];

export function getTemplateForComplaint(complaint: string): GoldenCaseTemplate | undefined {
  return GOLDEN_CASE_TEMPLATES.find((t) => t.complaint === complaint);
}

export function getAllComplaintLabels(): { value: string; label: string }[] {
  return GOLDEN_CASE_TEMPLATES.map((t) => ({ value: t.complaint, label: t.label }));
}
