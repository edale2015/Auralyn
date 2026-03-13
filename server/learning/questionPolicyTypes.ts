export interface QuestionPolicy {
  question: string
  complaint: string
  weight: number
  timesAsked: number
  timesImproved: number
  avgEntropyReduction: number
  avgDiagnosisShift: number
  lastUpdated: string
}

export interface QuestionImpact {
  question: string
  caseId: string
  complaint: string
  entropyBefore: number
  entropyAfter: number
  entropyReduction: number
  topDxBefore: string
  topDxAfter: string
  diagnosisShifted: boolean
  dispositionChanged: boolean
  timestamp: string
}

export interface PolicyUpdateResult {
  question: string
  complaint: string
  previousWeight: number
  newWeight: number
  deltaWeight: number
  reason: string
}
