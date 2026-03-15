export type SkillStatus = 'available' | 'unavailable' | 'pending';

export interface ClinicalSkill {
  id: string;
  label: string;
  description: string;
  device?: string;
  status: SkillStatus;
  telepresenceRequired: boolean;
  applicableComplaints: string[];
}

export const CLINICAL_SKILLS: ClinicalSkill[] = [
  { id: 'ekg_interpretation', label: 'ECG Interpretation', description: '12-lead ECG acquisition and AI rhythm analysis', device: 'ekg_module', status: 'available', telepresenceRequired: true, applicableComplaints: ['chest_pain', 'palpitations', 'syncope'] },
  { id: 'chest_xray_review', label: 'Chest X-Ray Review', description: 'Digital chest X-ray capture and AI analysis', device: 'imaging_kiosk', status: 'available', telepresenceRequired: true, applicableComplaints: ['cough', 'chest_pain', 'shortness_of_breath'] },
  { id: 'urinalysis_interpretation', label: 'Urinalysis', description: 'Dipstick urinalysis with AI interpretation', device: 'urinalysis_reader', status: 'available', telepresenceRequired: false, applicableComplaints: ['dysuria', 'urinary_frequency', 'flank_pain'] },
  { id: 'throat_exam', label: 'Throat Examination', description: 'HD throat camera with tonsil/exudate assessment', device: 'throat_camera', status: 'available', telepresenceRequired: true, applicableComplaints: ['sore_throat', 'fever', 'dysphagia'] },
  { id: 'otoscope_exam', label: 'Otoscope Exam', description: 'Digital otoscope for ear canal and TM assessment', device: 'otoscope', status: 'available', telepresenceRequired: true, applicableComplaints: ['ear_pain', 'hearing_loss', 'ear_discharge'] },
  { id: 'vitals_capture', label: 'Vital Signs', description: 'Automated BP, HR, SpO2, temperature capture', device: 'vitals_station', status: 'available', telepresenceRequired: false, applicableComplaints: ['*'] },
  { id: 'auscultation', label: 'Lung/Heart Auscultation', description: 'Digital stethoscope with AI pattern recognition', device: 'digital_stethoscope', status: 'available', telepresenceRequired: true, applicableComplaints: ['cough', 'chest_pain', 'shortness_of_breath', 'fever'] },
  { id: 'dermatology_scan', label: 'Skin Assessment', description: 'High-res dermoscope camera for rash/lesion evaluation', device: 'dermoscope', status: 'pending', telepresenceRequired: true, applicableComplaints: ['rash', 'skin_lesion'] },
  { id: 'rapid_strep', label: 'Rapid Strep Test', description: 'Point-of-care rapid strep antigen test', device: null, status: 'available', telepresenceRequired: false, applicableComplaints: ['sore_throat', 'fever'] },
  { id: 'flu_covid_panel', label: 'Flu/COVID Panel', description: 'Combined rapid antigen flu A/B + COVID-19', device: null, status: 'available', telepresenceRequired: false, applicableComplaints: ['cough', 'fever', 'flu_like_symptoms'] },
];

export function getSkillsForComplaint(complaint: string): ClinicalSkill[] {
  return CLINICAL_SKILLS.filter(
    (s) => s.applicableComplaints.includes('*') || s.applicableComplaints.includes(complaint)
  );
}

export function getSkillById(id: string): ClinicalSkill | undefined {
  return CLINICAL_SKILLS.find((s) => s.id === id);
}

export function getAvailableSkills(): ClinicalSkill[] {
  return CLINICAL_SKILLS.filter((s) => s.status === 'available');
}
