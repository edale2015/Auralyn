export interface RiskFactor {
  reason: string
  weight: number
}

export interface DispositionRisk {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "critical"
  factors: RiskFactor[]
  recommendedDisposition: string
}

const DX_RISK_WEIGHTS: Record<string, number> = {
  acs: 0.85,
  meningitis: 0.90,
  subarachnoid_hemorrhage: 0.95,
  pulmonary_embolism: 0.75,
  pneumonia: 0.40,
  appendicitis: 0.65,
  peritonsillar_abscess: 0.55,
  strep_pharyngitis: 0.15,
  viral_uri: 0.05,
  uti: 0.20,
  gerd: 0.08,
  musculoskeletal: 0.06,
  tension_headache: 0.05,
  migraine: 0.12,
  bronchitis: 0.10,
}

export function estimateDispositionRisk(
  differential: any[],
  patientRiskProfile?: Record<string, number>
): DispositionRisk {
  const factors: RiskFactor[] = []
  let riskScore = 0

  for (const d of differential.slice(0, 5)) {
    const dx = typeof d === "string" ? d : d.diagnosis ?? "unknown"
    const weight = DX_RISK_WEIGHTS[dx] ?? 0.1
    const confidence = d.confidence ?? d.score ?? d.calibratedScore ?? 0.25

    if (weight > 0.3) {
      riskScore += weight * confidence
      factors.push({ reason: `${dx} (conf ${(confidence * 100).toFixed(0)}%)`, weight })
    }
  }

  if (patientRiskProfile) {
    for (const [risk, value] of Object.entries(patientRiskProfile)) {
      if (value > 0) {
        riskScore += value * 0.5
        factors.push({ reason: `patient risk: ${risk}`, weight: value })
      }
    }
  }

  riskScore = Math.min(1.0, riskScore)

  let riskLevel: DispositionRisk["riskLevel"] = "low"
  let recommendedDisposition = "self_care"

  if (riskScore >= 0.75) {
    riskLevel = "critical"
    recommendedDisposition = "er_now"
  } else if (riskScore >= 0.5) {
    riskLevel = "high"
    recommendedDisposition = "er_now"
  } else if (riskScore >= 0.25) {
    riskLevel = "moderate"
    recommendedDisposition = "urgent_care"
  }

  return { riskScore, riskLevel, factors, recommendedDisposition }
}
