/**
 * Clinical Query Router — classifies free-text queries into clinical routing categories
 * Deterministic keyword-first classification (no LLM needed for routing)
 * Falls back to pattern scoring for ambiguous queries
 *
 * Routes: ACUTE_HIGH_RISK | GENERAL_MEDICAL | DEVICE_QUERY | OUT_OF_SCOPE
 */

export type QueryRoute =
  | "ACUTE_HIGH_RISK"
  | "GENERAL_MEDICAL"
  | "DEVICE_QUERY"
  | "OUT_OF_SCOPE";

export interface RoutingResult {
  route:       QueryRoute;
  confidence:  number;
  matchedTerms:string[];
  reasoning:   string;
}

const ROUTE_PATTERNS: Record<QueryRoute, string[]> = {
  ACUTE_HIGH_RISK: [
    "chest pain", "sepsis", "stroke", "shortness of breath", "sob",
    "cardiac arrest", "heart attack", "myocardial infarction", "stemi", "afib",
    "respiratory failure", "anaphylaxis", "overdose", "hemorrhage",
    "altered mental status", "hypotension", "shock",
    "trauma", "seizure", "meningitis", "pulmonary embolism",
    "aortic dissection", "ectopic pregnancy", "gi bleed", "hemoptysis",
  ],
  GENERAL_MEDICAL: [
    "diagnosis", "treatment", "symptom", "medication", "dose", "dosing",
    "antibiotic", "pain", "fever", "nausea", "vomiting", "diarrhea",
    "headache", "rash", "cough", "fatigue", "swelling", "infection",
    "diabetes", "hypertension", "asthma", "copd", "uti", "pneumonia",
    "protocol", "guideline", "evidence", "study", "clinical",
  ],
  DEVICE_QUERY: [
    "device", "equipment", "ventilator", "monitor", "pump",
    "defibrillator", "ecg", "ekg", "ultrasound", "x-ray", "imaging",
    "mri", "ct ", "scan", "probe", "catheter", "pacemaker",
    "infusion", "iv pump", "oxygen concentrator",
  ],
  OUT_OF_SCOPE: [
    "weather", "stock", "sports", "recipe", "travel", "joke",
    "politics", "celebrity", "movie", "music", "game", "shopping",
  ],
};

function scoreQuery(lower: string, terms: string[]): { count: number; matched: string[] } {
  const matched = terms.filter((t) => lower.includes(t));
  return { count: matched.length, matched };
}

export function routeQuery(query: string): RoutingResult {
  const lower = query.toLowerCase();

  const scores: Record<QueryRoute, { count: number; matched: string[] }> = {
    ACUTE_HIGH_RISK: scoreQuery(lower, ROUTE_PATTERNS.ACUTE_HIGH_RISK),
    GENERAL_MEDICAL: scoreQuery(lower, ROUTE_PATTERNS.GENERAL_MEDICAL),
    DEVICE_QUERY:    scoreQuery(lower, ROUTE_PATTERNS.DEVICE_QUERY),
    OUT_OF_SCOPE:    scoreQuery(lower, ROUTE_PATTERNS.OUT_OF_SCOPE),
  };

  // Explicit priority: ACUTE_HIGH_RISK always wins if present
  if (scores.ACUTE_HIGH_RISK.count > 0) {
    const c = Math.min(0.99, 0.75 + scores.ACUTE_HIGH_RISK.count * 0.08);
    return {
      route:        "ACUTE_HIGH_RISK",
      confidence:   c,
      matchedTerms: scores.ACUTE_HIGH_RISK.matched,
      reasoning:    `High-risk clinical terms detected: ${scores.ACUTE_HIGH_RISK.matched.join(", ")}`,
    };
  }

  // Find best non-urgent match
  const ranked = (["OUT_OF_SCOPE", "DEVICE_QUERY", "GENERAL_MEDICAL"] as QueryRoute[])
    .map((r) => ({ route: r, ...scores[r] }))
    .sort((a, b) => b.count - a.count);

  const best = ranked[0];

  if (best.count === 0) {
    return {
      route:        "GENERAL_MEDICAL",
      confidence:   0.45,
      matchedTerms: [],
      reasoning:    "No specific pattern matched — defaulting to general medical",
    };
  }

  const confidence = Math.min(0.95, 0.60 + best.count * 0.10);

  return {
    route:        best.route,
    confidence,
    matchedTerms: best.matched,
    reasoning:    `Matched ${best.count} ${best.route} pattern(s): ${best.matched.slice(0, 3).join(", ")}`,
  };
}
