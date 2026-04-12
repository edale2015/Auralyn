/**
 * Symptom Text Analyzer — natural language co-occurrence red flag detection
 * Works on free-text symptom descriptions (chat input, patient narratives, EMS notes)
 * Uses a RED_FLAGS dictionary: primary condition → list of co-occurring danger signals
 *
 * Different from the structured redFlagsMaster (which needs CaseState):
 * this runs on raw strings — useful for intake chat, voice-to-text, and free-form notes.
 */

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface SymptomAnalysisResult {
  riskLevel:        RiskLevel;
  redFlags:         string[];
  primaryConditions:string[];
  coOccurrences:    Array<{ primary: string; flag: string }>;
  confidence:       number;
  reasoning:        string;
  analyzedAt:       string;
}

/**
 * Red flag dictionary:
 * key   = primary complaint (must appear in text)
 * value = dangerous co-occurring symptoms that escalate risk
 */
const RED_FLAGS: Record<string, string[]> = {
  "chest pain": [
    "shortness of breath", "sob", "radiating pain", "radiation to arm",
    "radiation to jaw", "diaphoresis", "sweating", "nausea", "syncope",
    "palpitations", "pressure", "tightness",
  ],
  "fever": [
    "confusion", "altered mental status", "hypotension", "low blood pressure",
    "tachycardia", "rapid heart rate", "stiff neck", "rash", "petechiae",
    "difficulty breathing", "rigors", "chills",
  ],
  "cough": [
    "hemoptysis", "blood", "severe shortness of breath", "severe sob",
    "coughing up blood", "respiratory distress", "stridor", "wheezing",
    "night sweats", "weight loss",
  ],
  "headache": [
    "worst headache", "thunderclap", "vision changes", "diplopia",
    "vomiting", "neck stiffness", "focal weakness", "confusion",
    "seizure", "sudden onset",
  ],
  "abdominal pain": [
    "rigid abdomen", "rebound tenderness", "blood in stool", "melena",
    "hematemesis", "pulsatile mass", "vomiting blood", "black stool",
  ],
  "back pain": [
    "urinary incontinence", "bowel incontinence", "leg weakness", "saddle anesthesia",
    "pulsatile mass", "tearing pain", "radiation to legs",
  ],
  "shortness of breath": [
    "chest pain", "cannot speak full sentences", "accessory muscle use",
    "cyanosis", "stridor", "wheezing", "hemoptysis", "orthopnea",
  ],
  "stroke": [
    "facial droop", "arm weakness", "speech difficulty", "sudden onset",
    "one-sided weakness", "vision loss", "confusion",
  ],
  "pregnancy": [
    "bleeding", "severe abdominal pain", "decreased fetal movement",
    "hypertension", "headache", "vision changes", "edema",
  ],
  "diabetic": [
    "altered consciousness", "confusion", "fruity breath", "ketones",
    "excessive thirst", "frequent urination", "dka",
  ],
};

/** Standalone high-escalation terms that trigger HIGH regardless of co-occurrence */
const AUTO_HIGH_TERMS: string[] = [
  "cannot breathe", "can't breathe", "passing out", "unconscious",
  "unresponsive", "seizing", "seizure", "stroke", "anaphylaxis",
  "allergic reaction", "overdose", "suicidal", "trauma", "accident",
];

/** Terms that immediately bump to CRITICAL */
const AUTO_CRITICAL_TERMS: string[] = [
  "cardiac arrest", "not breathing", "no pulse", "cpr", "911",
  "anaphylaxis with swelling", "airway", "choking", "drowning",
];

export function analyzeSymptomText(text: string): SymptomAnalysisResult {
  const lower = text.toLowerCase();

  const coOccurrences: Array<{ primary: string; flag: string }> = [];
  const primaryConditions: string[] = [];

  for (const [primary, flags] of Object.entries(RED_FLAGS)) {
    if (lower.includes(primary)) {
      primaryConditions.push(primary);
      for (const flag of flags) {
        if (lower.includes(flag)) {
          coOccurrences.push({ primary, flag });
        }
      }
    }
  }

  const redFlags = coOccurrences.map((c) => c.flag);
  const uniqueRedFlags = [...new Set(redFlags)];

  // Auto-critical check first
  const autoCritical = AUTO_CRITICAL_TERMS.some((t) => lower.includes(t));
  const autoHigh     = AUTO_HIGH_TERMS.some((t)     => lower.includes(t));

  let riskLevel: RiskLevel;
  let reasoning: string;
  let confidence: number;

  if (autoCritical) {
    riskLevel  = "CRITICAL";
    reasoning  = "Life-threatening emergency term detected — immediate 911";
    confidence = 0.98;
  } else if (uniqueRedFlags.length >= 2) {
    riskLevel  = "CRITICAL";
    reasoning  = `${uniqueRedFlags.length} co-occurring red flags: ${uniqueRedFlags.slice(0, 3).join(", ")}`;
    confidence = Math.min(0.97, 0.80 + uniqueRedFlags.length * 0.05);
  } else if (uniqueRedFlags.length === 1 || autoHigh) {
    riskLevel  = "HIGH";
    reasoning  = uniqueRedFlags.length === 1
      ? `Red flag co-occurrence: ${primaryConditions[0]} + ${uniqueRedFlags[0]}`
      : "High-acuity term detected";
    confidence = 0.82;
  } else if (primaryConditions.length > 0) {
    riskLevel  = "MODERATE";
    reasoning  = `Concerning primary condition without red flag co-occurrence: ${primaryConditions.join(", ")}`;
    confidence = 0.70;
  } else {
    riskLevel  = "LOW";
    reasoning  = "No red flag conditions or co-occurrences detected";
    confidence = 0.65;
  }

  return {
    riskLevel,
    redFlags:          uniqueRedFlags,
    primaryConditions,
    coOccurrences,
    confidence,
    reasoning,
    analyzedAt:        new Date().toISOString(),
  };
}
