export interface TemporalEntry {
  timestamp: string
  text: string
  daysFromStart: number
}

export interface TemporalProgression {
  timeline: TemporalEntry[]
  presentSymptoms: string[]
  progression: Record<string, boolean>
  durationDays: number
  worsening: boolean
  rapidOnset: boolean
  progressionSignal: "rapid_deterioration" | "gradual_worsening" | "stable" | "improving" | "unknown"
}

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  fever: ["fever", "temperature", "febrile", "chills"],
  sob: ["shortness of breath", "breathless", "dyspnea", "short of breath"],
  cough: ["cough", "coughing"],
  chestPain: ["chest pain", "chest pressure", "chest tightness"],
  soreThroat: ["sore throat", "throat pain", "odynophagia"],
  headache: ["headache", "head pain"],
  nausea: ["nausea", "vomiting", "nauseous"],
  fatigue: ["fatigue", "tired", "exhausted", "weak"],
  confusion: ["confused", "confusion", "disoriented", "altered"],
}

export function analyzeTemporalProgression(events: any[]): TemporalProgression {
  const messageEvents = events
    .filter((e) => e.type === "PATIENT_MESSAGE")
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  if (!messageEvents.length) {
    return {
      timeline: [],
      presentSymptoms: [],
      progression: {},
      durationDays: 0,
      worsening: false,
      rapidOnset: false,
      progressionSignal: "unknown",
    }
  }

  const startTime = new Date(messageEvents[0].timestamp).getTime()
  const timeline: TemporalEntry[] = messageEvents.map((e) => ({
    timestamp: e.timestamp,
    text: e.data?.message ?? e.payload?.message ?? "",
    daysFromStart: Math.floor(
      (new Date(e.timestamp).getTime() - startTime) / (1000 * 60 * 60 * 24)
    ),
  }))

  const fullText = timeline.map((t) => t.text).join(" ").toLowerCase()
  const progression: Record<string, boolean> = {}
  const presentSymptoms: string[] = []

  for (const [symptom, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    const found = keywords.some((k) => fullText.includes(k))
    progression[symptom] = found
    if (found) presentSymptoms.push(symptom)
  }

  const durationDays = extractDurationDays(fullText)

  const worseningKeywords = ["worsening", "worse", "getting worse", "deteriorating", "spreading"]
  const improvingKeywords = ["improving", "better", "getting better", "resolved"]
  const worsening = worseningKeywords.some((k) => fullText.includes(k))
  const improving = improvingKeywords.some((k) => fullText.includes(k))

  const rapidOnset =
    fullText.includes("sudden") ||
    fullText.includes("immediately") ||
    fullText.includes("all of a sudden") ||
    fullText.includes("thunderclap") ||
    durationDays <= 1

  let progressionSignal: TemporalProgression["progressionSignal"] = "stable"
  if (progression.fever && progression.sob && progression.chestPain) {
    progressionSignal = "rapid_deterioration"
  } else if (worsening) {
    progressionSignal = "gradual_worsening"
  } else if (improving) {
    progressionSignal = "improving"
  } else if (rapidOnset) {
    progressionSignal = "rapid_deterioration"
  }

  return {
    timeline,
    presentSymptoms,
    progression,
    durationDays,
    worsening,
    rapidOnset,
    progressionSignal,
  }
}

function extractDurationDays(text: string): number {
  const dayMatch = text.match(/(\d+)\s*day/)
  const weekMatch = text.match(/(\d+)\s*week/)

  if (weekMatch) return parseInt(weekMatch[1]) * 7
  if (dayMatch) return parseInt(dayMatch[1])

  if (text.includes("hours ago") || text.includes("this morning") || text.includes("today")) {
    return 0
  }
  return 1
}

export function getTemporalDiagnosticAdjustments(
  progression: TemporalProgression
): Record<string, number> {
  const adjustments: Record<string, number> = {}

  if (progression.progression.fever && progression.progression.sob && progression.durationDays >= 3) {
    adjustments["pneumonia"] = 0.25
  }

  if (progression.rapidOnset && progression.progression.headache) {
    adjustments["subarachnoid_hemorrhage"] = 0.35
    adjustments["meningitis"] = 0.20
  }

  if (progression.progression.chestPain && progression.rapidOnset) {
    adjustments["acs"] = 0.30
  }

  if (progression.durationDays > 7 && progression.progression.cough) {
    adjustments["pneumonia"] = (adjustments["pneumonia"] ?? 0) + 0.15
  }

  if (progression.progressionSignal === "rapid_deterioration") {
    adjustments["acs"] = (adjustments["acs"] ?? 0) + 0.1
    adjustments["pulmonary_embolism"] = (adjustments["pulmonary_embolism"] ?? 0) + 0.1
    adjustments["meningitis"] = (adjustments["meningitis"] ?? 0) + 0.1
  }

  return adjustments
}
