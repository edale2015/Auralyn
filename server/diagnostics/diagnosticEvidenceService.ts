export interface DiagnosticEvidence {
  fever: boolean
  cough: boolean
  shortnessBreath: boolean
  chestPain: boolean
  neckStiffness: boolean
  radiation: boolean
  diaphoresis: boolean
  soreThroat: boolean
  abdPain: boolean
  nausea: boolean
  headache: boolean
  trismus: boolean
  thunderclap: boolean
  dysuria: boolean
  productive: boolean
  wheezing: boolean
  pleuriticPain: boolean
  [key: string]: boolean
}

export function extractDiagnosticEvidence(state: any): DiagnosticEvidence {
  const text = [
    state.symptoms ?? "",
    state.chiefComplaint ?? "",
    ...(state.intakeMessages ?? []).map((m: any) => m.content ?? m.text ?? ""),
  ]
    .join(" ")
    .toLowerCase()

  const has = (...kws: string[]) => kws.some((k) => text.includes(k))

  return {
    fever: has("fever", "febrile", "temperature", "chills"),
    cough: has("cough", "coughing"),
    shortnessBreath: has("shortness of breath", "short of breath", "dyspnea", "breathless", "sob"),
    chestPain: has("chest pain", "chest hurt", "chest tightness", "chest pressure"),
    neckStiffness: has("stiff neck", "neck stiffness", "nuchal rigidity", "meningismus"),
    radiation: has("radiation", "radiating", "jaw pain", "arm pain", "left arm"),
    diaphoresis: has("diaphoresis", "sweating", "sweat", "drenching sweat"),
    soreThroat: has("sore throat", "throat pain", "pharyngitis", "odynophagia"),
    abdPain: has("abdominal pain", "stomach pain", "belly pain", "abdominal cramp"),
    nausea: has("nausea", "vomiting", "nauseous", "vomit"),
    headache: has("headache", "head pain", "migraine", "cephalgia"),
    trismus: has("trismus", "jaw", "opening mouth", "difficulty opening", "locked jaw"),
    thunderclap: has("thunderclap", "worst headache", "sudden headache", "explosive headache"),
    dysuria: has("dysuria", "burning urination", "painful urination", "urinary burn"),
    productive: has("productive", "phlegm", "sputum", "coughing up"),
    wheezing: has("wheeze", "wheezing", "whistling breath"),
    pleuriticPain: has("pleuritic", "pain with breathing", "worse with breath"),
  }
}
