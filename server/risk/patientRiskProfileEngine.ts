export interface PatientRiskProfile {
  ageRisk: number
  metabolicRisk: number
  respiratoryRisk: number
  cardiovascularRisk: number
  immunocompromisedRisk: number
  pregnancyRisk: number
  overallRiskScore: number
  riskFactors: string[]
}

export function computePatientRiskProfile(patient: any): PatientRiskProfile {
  const profile: PatientRiskProfile = {
    ageRisk: 0,
    metabolicRisk: 0,
    respiratoryRisk: 0,
    cardiovascularRisk: 0,
    immunocompromisedRisk: 0,
    pregnancyRisk: 0,
    overallRiskScore: 0,
    riskFactors: [],
  }

  if (!patient) return profile

  const pmh = (patient.pmh ?? patient.medicalHistory ?? patient.pastMedicalHistory ?? "").toLowerCase()
  const meds = (patient.medications ?? patient.meds ?? "").toLowerCase()

  if (patient.age) {
    if (patient.age > 75) {
      profile.ageRisk = 0.45
      profile.riskFactors.push("age > 75")
    } else if (patient.age > 65) {
      profile.ageRisk = 0.30
      profile.riskFactors.push("age > 65")
    } else if (patient.age < 2) {
      profile.ageRisk = 0.35
      profile.riskFactors.push("infant")
    } else if (patient.age < 6) {
      profile.ageRisk = 0.20
      profile.riskFactors.push("young child")
    }
  }

  if (pmh.includes("diabetes")) {
    profile.metabolicRisk = 0.25
    profile.riskFactors.push("diabetes mellitus")
  }
  if (pmh.includes("obesity") || patient.bmi > 35) {
    profile.metabolicRisk = Math.max(profile.metabolicRisk, 0.15)
    profile.riskFactors.push("obesity")
  }

  if (pmh.includes("copd") || pmh.includes("emphysema")) {
    profile.respiratoryRisk = 0.45
    profile.riskFactors.push("COPD")
  }
  if (pmh.includes("asthma")) {
    profile.respiratoryRisk = Math.max(profile.respiratoryRisk, 0.25)
    profile.riskFactors.push("asthma")
  }

  if (pmh.includes("coronary") || pmh.includes("cad") || pmh.includes("heart disease")) {
    profile.cardiovascularRisk = 0.45
    profile.riskFactors.push("CAD")
  }
  if (pmh.includes("hypertension") || pmh.includes("htn")) {
    profile.cardiovascularRisk = Math.max(profile.cardiovascularRisk, 0.20)
    profile.riskFactors.push("hypertension")
  }
  if (pmh.includes("heart failure") || pmh.includes("chf")) {
    profile.cardiovascularRisk = Math.max(profile.cardiovascularRisk, 0.50)
    profile.riskFactors.push("heart failure")
  }

  if (
    pmh.includes("hiv") ||
    pmh.includes("cancer") ||
    pmh.includes("chemotherapy") ||
    meds.includes("prednisone") ||
    meds.includes("immunosuppressant")
  ) {
    profile.immunocompromisedRisk = 0.40
    profile.riskFactors.push("immunocompromised")
  }

  if (patient.pregnant === true || pmh.includes("pregnant") || pmh.includes("pregnancy")) {
    profile.pregnancyRisk = 0.35
    profile.riskFactors.push("pregnant")
  }

  profile.overallRiskScore = Math.min(
    1.0,
    profile.ageRisk * 0.25 +
      profile.metabolicRisk * 0.15 +
      profile.respiratoryRisk * 0.20 +
      profile.cardiovascularRisk * 0.25 +
      profile.immunocompromisedRisk * 0.10 +
      profile.pregnancyRisk * 0.05
  )

  return profile
}

export function adjustDifferentialForRisk(
  differential: any[],
  riskProfile: PatientRiskProfile
): any[] {
  return differential.map((d) => {
    const dx = typeof d === "string" ? d : d.diagnosis ?? "unknown"
    let boost = 0

    if (riskProfile.cardiovascularRisk > 0.3 && dx === "acs") boost += 0.15
    if (riskProfile.respiratoryRisk > 0.3 && dx === "pneumonia") boost += 0.15
    if (riskProfile.immunocompromisedRisk > 0.3) boost += 0.10
    if (riskProfile.ageRisk > 0.3 && ["pneumonia", "acs", "uti"].includes(dx)) boost += 0.10

    const currentScore = typeof d === "number" ? d : d.score ?? d.confidence ?? 0.25
    return typeof d === "string"
      ? { diagnosis: d, score: currentScore + boost }
      : { ...d, score: currentScore + boost, riskBoost: boost }
  })
}
