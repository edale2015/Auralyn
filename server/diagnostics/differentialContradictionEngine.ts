export interface MissingEvidence {
  diagnosis: string
  requiredFeature: string
  present: boolean
  impact: "high" | "medium" | "low"
  note: string
}

export interface ContradictingEvidence {
  diagnosis: string
  contradictingFeature: string
  reason: string
  strengthReducedBy: number
}

export interface UnruledOutDanger {
  diagnosis: string
  riskLevel: "critical" | "high"
  rulingOutQuestion: string
  presentFeatures: string[]
}

export interface ContradictionReport {
  topDiagnosis: string
  missingEvidence: MissingEvidence[]
  contradictions: ContradictingEvidence[]
  unruledDangers: UnruledOutDanger[]
  prematureClosureRisk: "high" | "moderate" | "low"
  closureReason?: string
}

const DX_REQUIRED_FEATURES: Record<
  string,
  Array<{ feature: string; impact: "high" | "medium" | "low"; note: string }>
> = {
  acs: [
    { feature: "chest_pain_radiation", impact: "high", note: "Radiation to arm/jaw strongly supports ACS" },
    { feature: "diaphoresis", impact: "high", note: "Diaphoresis with chest pain is a red flag for MI" },
    { feature: "ecg_changes", impact: "high", note: "ECG changes confirm or rule out STEMI/NSTEMI" },
    { feature: "troponin_result", impact: "high", note: "Troponin is required to confirm ACS" },
    { feature: "exertional_component", impact: "medium", note: "Exertional onset raises ACS likelihood" },
  ],
  pneumonia: [
    { feature: "fever", impact: "high", note: "Fever supports infectious etiology" },
    { feature: "productive_cough", impact: "high", note: "Productive cough with fever points to pneumonia" },
    { feature: "breath_sounds", impact: "high", note: "Focal crackles on exam confirm pneumonia" },
    { feature: "cxr_done", impact: "high", note: "CXR needed to confirm infiltrate" },
    { feature: "oxygen_saturation", impact: "medium", note: "O2 sat helps gauge severity" },
  ],
  pta: [
    { feature: "trismus", impact: "high", note: "Trismus (jaw stiffness) is pathognomonic for PTA" },
    { feature: "uvula_deviation", impact: "high", note: "Uvula deviation away from abscess confirms PTA" },
    { feature: "hot_potato_voice", impact: "medium", note: "Muffled voice supports peritonsillar involvement" },
    { feature: "unilateral_swelling", impact: "high", note: "Unilateral tonsillar swelling differentiates PTA from tonsillitis" },
  ],
  strep_pharyngitis: [
    { feature: "centor_score", impact: "high", note: "Centor ≥3 strongly supports strep; <2 argues against" },
    { feature: "no_cough", impact: "medium", note: "Absence of cough supports strep over viral" },
    { feature: "exudate", impact: "medium", note: "Tonsillar exudate is a Centor criterion" },
    { feature: "rapid_strep_test", impact: "high", note: "Rapid strep test confirms or rules out definitively" },
  ],
  meningitis: [
    { feature: "neck_stiffness", impact: "high", note: "Nuchal rigidity is a Kernig/Brudzinski sign for meningitis" },
    { feature: "photophobia", impact: "high", note: "Photophobia with fever is a meningeal irritation sign" },
    { feature: "thunderclap_headache", impact: "high", note: "Thunderclap onset raises concern for SAH or bacterial meningitis" },
    { feature: "fever", impact: "high", note: "Fever is required for bacterial meningitis" },
    { feature: "lp_done", impact: "high", note: "Lumbar puncture confirms meningitis definitively" },
  ],
  pulmonary_embolism: [
    { feature: "wells_score", impact: "high", note: "Wells score stratifies PE pretest probability" },
    { feature: "pleuritic_chest_pain", impact: "medium", note: "Pleuritic pain suggests pulmonary infarction from PE" },
    { feature: "leg_swelling", impact: "high", note: "Unilateral leg swelling suggests DVT → PE" },
    { feature: "tachycardia", impact: "high", note: "Tachycardia with dyspnea is a PE red flag" },
    { feature: "dimer_or_ctpa", impact: "high", note: "D-dimer or CTA pulmonary is required to confirm/exclude PE" },
  ],
  appendicitis: [
    { feature: "mcburney_tenderness", impact: "high", note: "RLQ tenderness at McBurney's point is classic" },
    { feature: "rebound_tenderness", impact: "high", note: "Rebound tenderness suggests peritoneal irritation" },
    { feature: "fever", impact: "medium", note: "Low-grade fever accompanies appendicitis" },
    { feature: "cbc_wbc", impact: "high", note: "Leukocytosis supports appendicitis" },
    { feature: "imaging_done", impact: "high", note: "CT abdomen confirms appendicitis and rules out alternatives" },
  ],
  viral_uri: [
    { feature: "no_high_fever", impact: "medium", note: "High fever argues against simple viral URI" },
    { feature: "bilateral_symptoms", impact: "medium", note: "Bilateral nasal congestion/cough fits viral pattern" },
    { feature: "no_exudate", impact: "medium", note: "No exudate reduces likelihood of strep" },
  ],
  sinusitis: [
    { feature: "purulent_nasal_discharge", impact: "high", note: "Purulent discharge supports bacterial sinusitis" },
    { feature: "facial_pain_pressure", impact: "high", note: "Maxillary or frontal pressure is classic for sinusitis" },
    { feature: "duration_10_days", impact: "high", note: "Persistence >10 days favors bacterial over viral" },
  ],
}

const DANGEROUS_UNRULED_DIAGNOSES: UnruledOutDanger[] = [
  {
    diagnosis: "acs",
    riskLevel: "critical",
    rulingOutQuestion: "Has the patient had an ECG and troponin within the last hour?",
    presentFeatures: ["chest_pain", "diaphoresis", "radiation"],
  },
  {
    diagnosis: "meningitis",
    riskLevel: "critical",
    rulingOutQuestion: "Does the patient have neck stiffness or photophobia?",
    presentFeatures: ["headache", "fever", "neck_stiffness"],
  },
  {
    diagnosis: "pulmonary_embolism",
    riskLevel: "critical",
    rulingOutQuestion: "Has a Wells score been computed and D-dimer or CTA ordered if indicated?",
    presentFeatures: ["dyspnea", "tachycardia", "leg_swelling", "pleuritic_chest_pain"],
  },
  {
    diagnosis: "appendicitis",
    riskLevel: "high",
    rulingOutQuestion: "Has RLQ tenderness been assessed and CBC/imaging ordered?",
    presentFeatures: ["abdominal_pain", "fever", "rebound_tenderness"],
  },
  {
    diagnosis: "pta",
    riskLevel: "high",
    rulingOutQuestion: "Has trismus and uvula deviation been assessed to rule out peritonsillar abscess?",
    presentFeatures: ["sore_throat", "trismus", "uvula_deviation"],
  },
]

const DX_CONTRADICTING_FEATURES: Record<
  string,
  Array<{ feature: string; reason: string; reduction: number }>
> = {
  acs: [
    { feature: "reproducible_on_palpation", reason: "Reproducible chest wall tenderness argues against ACS", reduction: 0.4 },
    { feature: "positional_relief", reason: "Pain that changes with position argues against cardiac origin", reduction: 0.3 },
    { feature: "sharp_stabbing", reason: "Sharp stabbing quality is less typical for ischemic pain", reduction: 0.2 },
  ],
  pneumonia: [
    { feature: "no_fever", reason: "Absence of fever substantially lowers pneumonia probability", reduction: 0.4 },
    { feature: "normal_breath_sounds", reason: "Normal breath sounds argue against consolidation", reduction: 0.35 },
  ],
  strep_pharyngitis: [
    { feature: "cough_present", reason: "Presence of cough is a point against strep (Centor)", reduction: 0.25 },
    { feature: "no_fever", reason: "Absence of fever reduces strep probability", reduction: 0.2 },
    { feature: "no_exudate", reason: "No exudate reduces Centor score", reduction: 0.15 },
  ],
  viral_uri: [
    { feature: "high_fever", reason: "High fever argues against simple viral URI", reduction: 0.3 },
    { feature: "severe_unilateral_throat_pain", reason: "Severe unilateral pain raises concern for PTA or abscess", reduction: 0.25 },
  ],
}

function extractFeatureSet(
  presentSymptoms: string[],
  answeredQuestions: Array<{ questionId: string; answer: string }> = []
): Set<string> {
  const features = new Set<string>()
  for (const s of presentSymptoms) {
    features.add(s.toLowerCase().replace(/\s+/g, "_"))
  }
  for (const q of answeredQuestions) {
    if (q.answer === "yes" || q.answer === "true") {
      features.add(q.questionId.toLowerCase().replace(/\s+/g, "_"))
    }
    if (q.answer === "no" || q.answer === "false") {
      features.add(`no_${q.questionId.toLowerCase().replace(/\s+/g, "_")}`)
    }
  }
  return features
}

export function computeContradictionReport(params: {
  topDiagnosis: string
  differential: Array<{ diagnosis: string; score: number }>
  presentSymptoms: string[]
  answeredQuestions?: Array<{ questionId: string; answer: string }>
}): ContradictionReport {
  const { topDiagnosis, differential, presentSymptoms, answeredQuestions = [] } = params
  const features = extractFeatureSet(presentSymptoms, answeredQuestions)
  const dxKey = topDiagnosis.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_")

  const required = DX_REQUIRED_FEATURES[dxKey] ?? []
  const missingEvidence: MissingEvidence[] = required
    .filter((r) => !features.has(r.feature))
    .map((r) => ({
      diagnosis: topDiagnosis,
      requiredFeature: r.feature.replace(/_/g, " "),
      present: false,
      impact: r.impact,
      note: r.note,
    }))

  const contraFeatures = DX_CONTRADICTING_FEATURES[dxKey] ?? []
  const contradictions: ContradictingEvidence[] = contraFeatures
    .filter((c) => features.has(c.feature))
    .map((c) => ({
      diagnosis: topDiagnosis,
      contradictingFeature: c.feature.replace(/_/g, " "),
      reason: c.reason,
      strengthReducedBy: c.reduction,
    }))

  const topDxNames = new Set(differential.slice(0, 3).map((d) => d.diagnosis.toLowerCase()))
  const unruledDangers: UnruledOutDanger[] = DANGEROUS_UNRULED_DIAGNOSES.filter((danger) => {
    if (topDxNames.has(danger.diagnosis)) return false
    return danger.presentFeatures.some((f) => features.has(f))
  })

  const highMissing = missingEvidence.filter((m) => m.impact === "high").length
  const hasContradictions = contradictions.length > 0
  const hasDangers = unruledDangers.length > 0

  let prematureClosureRisk: "high" | "moderate" | "low" = "low"
  let closureReason: string | undefined

  if (highMissing >= 2 && hasDangers) {
    prematureClosureRisk = "high"
    closureReason = `${highMissing} key features unverified and ${unruledDangers.length} dangerous diagnosis not yet ruled out`
  } else if (highMissing >= 1 || hasContradictions || hasDangers) {
    prematureClosureRisk = "moderate"
    closureReason = [
      highMissing ? `${highMissing} key feature(s) missing` : null,
      hasContradictions ? "contradicting evidence present" : null,
      hasDangers ? "dangerous diagnosis not ruled out" : null,
    ]
      .filter(Boolean)
      .join("; ")
  }

  return {
    topDiagnosis,
    missingEvidence,
    contradictions,
    unruledDangers,
    prematureClosureRisk,
    closureReason,
  }
}
