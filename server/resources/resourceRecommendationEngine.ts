export interface ResourceRecommendation {
  type: "lab" | "imaging" | "referral" | "medication" | "monitoring"
  resource: string
  priority: "stat" | "urgent" | "routine"
  rationale: string
  diagnosis?: string
}

const DX_RESOURCES: Record<string, ResourceRecommendation[]> = {
  acs: [
    { type: "lab", resource: "Troponin I (stat)", priority: "stat", rationale: "Rule out myocardial infarction", diagnosis: "acs" },
    { type: "lab", resource: "BMP, CBC, BNP", priority: "stat", rationale: "Cardiac workup", diagnosis: "acs" },
    { type: "imaging", resource: "12-lead ECG (stat)", priority: "stat", rationale: "Assess for STEMI/NSTEMI", diagnosis: "acs" },
    { type: "imaging", resource: "CXR", priority: "urgent", rationale: "Assess cardiac silhouette", diagnosis: "acs" },
    { type: "referral", resource: "Cardiology (emergent)", priority: "stat", rationale: "Possible ACS", diagnosis: "acs" },
  ],
  pneumonia: [
    { type: "lab", resource: "CBC, CMP", priority: "urgent", rationale: "Assess infection severity", diagnosis: "pneumonia" },
    { type: "imaging", resource: "CXR PA/Lateral", priority: "urgent", rationale: "Confirm infiltrate", diagnosis: "pneumonia" },
    { type: "lab", resource: "Blood cultures × 2 (if febrile)", priority: "urgent", rationale: "Bacteremia workup", diagnosis: "pneumonia" },
    { type: "lab", resource: "Sputum culture", priority: "routine", rationale: "Pathogen identification", diagnosis: "pneumonia" },
  ],
  meningitis: [
    { type: "lab", resource: "CBC, CMP, coagulation panel", priority: "stat", rationale: "Pre-LP workup", diagnosis: "meningitis" },
    { type: "imaging", resource: "CT Head without contrast (pre-LP)", priority: "stat", rationale: "Rule out herniation before LP", diagnosis: "meningitis" },
    { type: "lab", resource: "Lumbar puncture → CSF analysis", priority: "stat", rationale: "Confirm diagnosis", diagnosis: "meningitis" },
    { type: "lab", resource: "Blood cultures × 2", priority: "stat", rationale: "Bacteremia", diagnosis: "meningitis" },
    { type: "referral", resource: "Neurology / Infectious Disease (emergent)", priority: "stat", rationale: "Bacterial meningitis management", diagnosis: "meningitis" },
  ],
  pulmonary_embolism: [
    { type: "lab", resource: "D-dimer", priority: "urgent", rationale: "PE screening", diagnosis: "pulmonary_embolism" },
    { type: "lab", resource: "ABG", priority: "urgent", rationale: "Assess oxygenation", diagnosis: "pulmonary_embolism" },
    { type: "imaging", resource: "CT Pulmonary Angiography", priority: "urgent", rationale: "Confirm PE", diagnosis: "pulmonary_embolism" },
    { type: "monitoring", resource: "Continuous pulse oximetry", priority: "stat", rationale: "Monitor oxygenation", diagnosis: "pulmonary_embolism" },
  ],
  strep_pharyngitis: [
    { type: "lab", resource: "Rapid strep antigen test", priority: "routine", rationale: "Confirm strep infection", diagnosis: "strep_pharyngitis" },
    { type: "lab", resource: "Throat culture (if rapid neg)", priority: "routine", rationale: "Higher sensitivity", diagnosis: "strep_pharyngitis" },
  ],
  peritonsillar_abscess: [
    { type: "imaging", resource: "Soft tissue neck CT", priority: "urgent", rationale: "Assess abscess extent", diagnosis: "peritonsillar_abscess" },
    { type: "referral", resource: "ENT / Otolaryngology (urgent)", priority: "urgent", rationale: "Abscess drainage", diagnosis: "peritonsillar_abscess" },
    { type: "lab", resource: "CBC, CMP", priority: "urgent", rationale: "Assess infection severity", diagnosis: "peritonsillar_abscess" },
  ],
  uti: [
    { type: "lab", resource: "Urinalysis + urine culture", priority: "routine", rationale: "Confirm UTI", diagnosis: "uti" },
  ],
  appendicitis: [
    { type: "lab", resource: "CBC, CMP, lipase", priority: "urgent", rationale: "Inflammatory markers", diagnosis: "appendicitis" },
    { type: "imaging", resource: "CT Abdomen/Pelvis with contrast", priority: "urgent", rationale: "Confirm appendicitis", diagnosis: "appendicitis" },
    { type: "referral", resource: "Surgery (urgent consult)", priority: "urgent", rationale: "Possible appendicitis", diagnosis: "appendicitis" },
  ],
}

export function getResourceRecommendations(
  differential: any[],
  topN = 3
): ResourceRecommendation[] {
  const seen = new Set<string>()
  const recommendations: ResourceRecommendation[] = []

  for (const d of differential.slice(0, topN)) {
    const dx = typeof d === "string" ? d : d.diagnosis ?? "unknown"
    const resources = DX_RESOURCES[dx] ?? []

    for (const r of resources) {
      if (!seen.has(r.resource)) {
        seen.add(r.resource)
        recommendations.push(r)
      }
    }
  }

  const priorityOrder = { stat: 0, urgent: 1, routine: 2 }
  return recommendations.sort(
    (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  )
}
