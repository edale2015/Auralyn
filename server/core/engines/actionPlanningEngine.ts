interface ActionPlan { tests: string[]; treatments: string[]; precautions: string[]; }

const plans: Record<string, ActionPlan> = {
  pneumonia: { tests: ['chest_xray', 'CBC', 'CRP'], treatments: ['antibiotics', 'supportive_care'], precautions: ['return_if_worsening_dyspnea'] },
  myocardial_infarction: { tests: ['ECG', 'troponin', 'chest_xray'], treatments: ['aspirin', 'nitroglycerin'], precautions: ['do_not_delay_911'] },
  acute_coronary_syndrome: { tests: ['ECG', 'troponin'], treatments: ['aspirin'], precautions: ['immediate_ER'] },
  uti: { tests: ['urinalysis', 'urine_culture'], treatments: ['antibiotics', 'hydration'], precautions: ['return_if_fever_develops'] },
  pyelonephritis: { tests: ['urinalysis', 'urine_culture', 'CBC'], treatments: ['IV_or_oral_antibiotics'], precautions: ['return_if_no_improvement_48h'] },
  pulmonary_embolism: { tests: ['CT_PE', 'D_dimer', 'ECG'], treatments: ['anticoagulation'], precautions: ['immediate_ER'] },
  pharyngitis: { tests: ['rapid_strep'], treatments: ['antibiotics_if_strep_positive', 'analgesics'], precautions: ['return_if_worsening'] },
  meningitis: { tests: ['LP', 'CBC', 'blood_culture'], treatments: ['empiric_antibiotics'], precautions: ['immediate_ER'] },
};

export function actionPlanningEngine(diagnosis: string): ActionPlan {
  return plans[diagnosis] ?? { tests: [], treatments: [], precautions: ['follow_up_if_no_improvement'] };
}
