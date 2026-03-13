export interface DifferentialCandidate {
  diagnosis: string
  score: number
  signals: string[]
  icdHint?: string
}

interface SignalRule {
  symptom: string
  boost: number
  signal: string
}

const COMPLAINT_RULES: Record<string, {
  baseSet: Array<{ diagnosis: string; base: number; icd?: string }>
  signals: SignalRule[]
  ageBoosts?: Array<{ diagnosis: string; minAge?: number; maxAge?: number; boost: number }>
  sexBoosts?: Array<{ diagnosis: string; sex: string; boost: number }>
}> = {
  sore_throat: {
    baseSet: [
      { diagnosis: "Strep Pharyngitis", base: 0.40, icd: "J02.0" },
      { diagnosis: "Viral Pharyngitis", base: 0.50, icd: "J02.9" },
      { diagnosis: "Infectious Mononucleosis", base: 0.15, icd: "B27.9" },
      { diagnosis: "Peritonsillar Abscess", base: 0.05, icd: "J36" },
      { diagnosis: "Epiglottitis", base: 0.03, icd: "J05.1" },
    ],
    signals: [
      { symptom: "fever", boost: 0.30, signal: "fever present" },
      { symptom: "white patches", boost: 0.25, signal: "tonsillar exudate" },
      { symptom: "swollen glands", boost: 0.20, signal: "anterior cervical LAD" },
      { symptom: "no cough", boost: 0.20, signal: "cough absent (Centor)" },
      { symptom: "cough", boost: -0.15, signal: "cough present (viral)" },
      { symptom: "fatigue", boost: 0.10, signal: "systemic fatigue" },
      { symptom: "difficulty swallowing", boost: 0.15, signal: "odynophagia" },
      { symptom: "drooling", boost: 0.25, signal: "possible epiglottitis" },
      { symptom: "uvular deviation", boost: 0.35, signal: "peritonsillar abscess" },
      { symptom: "trismus", boost: 0.30, signal: "jaw trismus" },
    ],
    ageBoosts: [
      { diagnosis: "Strep Pharyngitis", minAge: 5, maxAge: 15, boost: 0.15 },
      { diagnosis: "Infectious Mononucleosis", minAge: 15, maxAge: 30, boost: 0.20 },
    ],
  },

  cough: {
    baseSet: [
      { diagnosis: "Viral Upper Respiratory Infection", base: 0.55, icd: "J06.9" },
      { diagnosis: "Viral Bronchitis", base: 0.40, icd: "J20.9" },
      { diagnosis: "Community Acquired Pneumonia", base: 0.15, icd: "J18.9" },
      { diagnosis: "Asthma Exacerbation", base: 0.10, icd: "J45.901" },
      { diagnosis: "COVID-19", base: 0.10, icd: "U07.1" },
      { diagnosis: "Pertussis", base: 0.05, icd: "A37.90" },
    ],
    signals: [
      { symptom: "fever", boost: 0.25, signal: "fever (bacterial vs viral)" },
      { symptom: "shortness of breath", boost: 0.30, signal: "dyspnea" },
      { symptom: "chest pain", boost: 0.20, signal: "pleuritic chest pain" },
      { symptom: "productive", boost: 0.15, signal: "productive cough" },
      { symptom: "green", boost: 0.15, signal: "purulent sputum" },
      { symptom: "yellow", boost: 0.10, signal: "colored sputum" },
      { symptom: "wheezing", boost: 0.25, signal: "wheezing" },
      { symptom: "paroxysmal", boost: 0.20, signal: "paroxysmal cough (whooping)" },
      { symptom: "whooping", boost: 0.35, signal: "whooping cough" },
      { symptom: "night sweats", boost: 0.15, signal: "night sweats (TB/lymphoma)" },
      { symptom: "hemoptysis", boost: 0.30, signal: "hemoptysis" },
      { symptom: "travel", boost: 0.10, signal: "travel history" },
    ],
    ageBoosts: [
      { diagnosis: "Community Acquired Pneumonia", minAge: 65, boost: 0.20 },
      { diagnosis: "Pertussis", maxAge: 6, boost: 0.30 },
    ],
  },

  headache: {
    baseSet: [
      { diagnosis: "Tension Headache", base: 0.50, icd: "G44.209" },
      { diagnosis: "Migraine", base: 0.30, icd: "G43.909" },
      { diagnosis: "Sinusitis", base: 0.20, icd: "J01.90" },
      { diagnosis: "Hypertensive Headache", base: 0.10, icd: "R51" },
      { diagnosis: "Subarachnoid Hemorrhage", base: 0.02, icd: "I60.9" },
      { diagnosis: "Meningitis", base: 0.03, icd: "G03.9" },
    ],
    signals: [
      { symptom: "worst headache", boost: 0.50, signal: "thunderclap headache → SAH" },
      { symptom: "thunderclap", boost: 0.55, signal: "thunderclap onset" },
      { symptom: "stiff neck", boost: 0.40, signal: "meningismus" },
      { symptom: "neck stiffness", boost: 0.40, signal: "neck stiffness" },
      { symptom: "photophobia", boost: 0.25, signal: "photophobia" },
      { symptom: "nausea", boost: 0.15, signal: "nausea/vomiting" },
      { symptom: "aura", boost: 0.30, signal: "migraine aura" },
      { symptom: "unilateral", boost: 0.20, signal: "unilateral pain (migraine)" },
      { symptom: "throbbing", boost: 0.20, signal: "throbbing character" },
      { symptom: "sinus pressure", boost: 0.25, signal: "frontal sinus pressure" },
      { symptom: "band-like", boost: 0.20, signal: "band-like tension character" },
      { symptom: "fever", boost: 0.20, signal: "fever with headache" },
      { symptom: "vision changes", boost: 0.20, signal: "visual symptoms" },
      { symptom: "confusion", boost: 0.35, signal: "altered mentation" },
    ],
  },

  fever: {
    baseSet: [
      { diagnosis: "Viral Syndrome", base: 0.50, icd: "B34.9" },
      { diagnosis: "Influenza", base: 0.30, icd: "J11.1" },
      { diagnosis: "COVID-19", base: 0.20, icd: "U07.1" },
      { diagnosis: "Bacterial Infection (unspecified)", base: 0.15, icd: "A49.9" },
      { diagnosis: "Urinary Tract Infection", base: 0.10, icd: "N39.0" },
    ],
    signals: [
      { symptom: "myalgia", boost: 0.25, signal: "myalgias (influenza)" },
      { symptom: "body aches", boost: 0.20, signal: "body aches" },
      { symptom: "rigors", boost: 0.20, signal: "rigors (bacterial)" },
      { symptom: "dysuria", boost: 0.35, signal: "dysuria → UTI" },
      { symptom: "cough", boost: 0.15, signal: "respiratory symptoms" },
      { symptom: "sore throat", boost: 0.15, signal: "pharyngeal involvement" },
      { symptom: "rash", boost: 0.20, signal: "exanthem" },
      { symptom: "petechiae", boost: 0.45, signal: "petechiae → meningococcal" },
      { symptom: "stiff neck", boost: 0.40, signal: "meningismus" },
      { symptom: "confusion", boost: 0.35, signal: "altered mentation" },
    ],
    ageBoosts: [
      { diagnosis: "Influenza", minAge: 65, boost: 0.15 },
      { diagnosis: "Bacterial Infection (unspecified)", maxAge: 3, boost: 0.30 },
    ],
  },

  ear_pain: {
    baseSet: [
      { diagnosis: "Acute Otitis Media", base: 0.45, icd: "H66.9" },
      { diagnosis: "Otitis Externa", base: 0.35, icd: "H60.9" },
      { diagnosis: "TMJ Syndrome", base: 0.15, icd: "M26.60" },
      { diagnosis: "Referred Pain (dental/throat)", base: 0.10, icd: "H92.0" },
    ],
    signals: [
      { symptom: "discharge", boost: 0.25, signal: "ear discharge" },
      { symptom: "hearing loss", boost: 0.20, signal: "conductive hearing loss" },
      { symptom: "fever", boost: 0.25, signal: "fever → AOM" },
      { symptom: "swimming", boost: 0.30, signal: "swimmer's ear" },
      { symptom: "jaw pain", boost: 0.25, signal: "TMJ involvement" },
      { symptom: "itching", boost: 0.20, signal: "pruritus → OE" },
      { symptom: "dizziness", boost: 0.15, signal: "vestibular symptoms" },
    ],
    ageBoosts: [
      { diagnosis: "Acute Otitis Media", maxAge: 6, boost: 0.25 },
    ],
  },

  abdominal_pain: {
    baseSet: [
      { diagnosis: "Gastroenteritis", base: 0.40, icd: "K59.1" },
      { diagnosis: "Irritable Bowel Syndrome", base: 0.25, icd: "K58.9" },
      { diagnosis: "Appendicitis", base: 0.10, icd: "K37" },
      { diagnosis: "Peptic Ulcer Disease", base: 0.10, icd: "K27.9" },
      { diagnosis: "Cholecystitis", base: 0.08, icd: "K81.9" },
      { diagnosis: "Kidney Stone", base: 0.08, icd: "N20.0" },
    ],
    signals: [
      { symptom: "right lower quadrant", boost: 0.35, signal: "RLQ pain → appendicitis" },
      { symptom: "periumbilical", boost: 0.20, signal: "periumbilical → appendicitis" },
      { symptom: "right upper quadrant", boost: 0.30, signal: "RUQ → cholecystitis" },
      { symptom: "rebound", boost: 0.35, signal: "rebound tenderness → peritonitis" },
      { symptom: "vomiting", boost: 0.15, signal: "nausea/vomiting" },
      { symptom: "diarrhea", boost: 0.25, signal: "diarrhea → gastroenteritis" },
      { symptom: "bloody stool", boost: 0.30, signal: "hematochezia" },
      { symptom: "fever", boost: 0.20, signal: "fever → infectious/surgical" },
      { symptom: "flank", boost: 0.25, signal: "flank pain → urolithiasis" },
      { symptom: "radiation", boost: 0.20, signal: "radiating pain → colic" },
      { symptom: "fatty food", boost: 0.25, signal: "fat-related → biliary" },
    ],
    sexBoosts: [
      { diagnosis: "Cholecystitis", sex: "female", boost: 0.10 },
    ],
  },

  chest_pain: {
    baseSet: [
      { diagnosis: "Musculoskeletal Chest Pain", base: 0.45, icd: "M94.0" },
      { diagnosis: "GERD / Esophageal Spasm", base: 0.25, icd: "K21.0" },
      { diagnosis: "Acute Coronary Syndrome", base: 0.10, icd: "I25.10" },
      { diagnosis: "Pulmonary Embolism", base: 0.05, icd: "I26.99" },
      { diagnosis: "Pericarditis", base: 0.05, icd: "I30.9" },
    ],
    signals: [
      { symptom: "crushing", boost: 0.35, signal: "crushing chest pain → ACS" },
      { symptom: "radiation arm", boost: 0.35, signal: "radiation to arm → ACS" },
      { symptom: "diaphoresis", boost: 0.30, signal: "diaphoresis → ACS" },
      { symptom: "shortness of breath", boost: 0.25, signal: "dyspnea" },
      { symptom: "pleuritic", boost: 0.25, signal: "pleuritic → PE/pericarditis" },
      { symptom: "worse lying flat", boost: 0.20, signal: "positional → pericarditis" },
      { symptom: "heartburn", boost: 0.30, signal: "burning → GERD" },
      { symptom: "palpitations", boost: 0.20, signal: "palpitations" },
      { symptom: "leg swelling", boost: 0.20, signal: "DVT → PE" },
      { symptom: "recent surgery", boost: 0.25, signal: "recent surgery → PE" },
    ],
    ageBoosts: [
      { diagnosis: "Acute Coronary Syndrome", minAge: 45, boost: 0.20 },
    ],
    sexBoosts: [
      { diagnosis: "Acute Coronary Syndrome", sex: "male", boost: 0.10 },
    ],
  },

  urinary: {
    baseSet: [
      { diagnosis: "Urinary Tract Infection", base: 0.55, icd: "N39.0" },
      { diagnosis: "Pyelonephritis", base: 0.15, icd: "N10" },
      { diagnosis: "Kidney Stone", base: 0.15, icd: "N20.0" },
      { diagnosis: "Prostatitis", base: 0.10, icd: "N41.0" },
      { diagnosis: "Interstitial Cystitis", base: 0.08, icd: "N30.10" },
    ],
    signals: [
      { symptom: "dysuria", boost: 0.30, signal: "dysuria → UTI/STI" },
      { symptom: "frequency", boost: 0.25, signal: "urinary frequency" },
      { symptom: "fever", boost: 0.30, signal: "fever → pyelonephritis" },
      { symptom: "flank pain", boost: 0.35, signal: "CVA tenderness → pyelonephritis" },
      { symptom: "hematuria", boost: 0.25, signal: "hematuria → stone/tumor" },
      { symptom: "colicky", boost: 0.30, signal: "colicky → urolithiasis" },
      { symptom: "discharge", boost: 0.30, signal: "urethral discharge → STI" },
    ],
    sexBoosts: [
      { diagnosis: "Prostatitis", sex: "male", boost: 0.20 },
      { diagnosis: "Urinary Tract Infection", sex: "female", boost: 0.10 },
    ],
  },

  rash: {
    baseSet: [
      { diagnosis: "Contact Dermatitis", base: 0.35, icd: "L25.9" },
      { diagnosis: "Eczema", base: 0.25, icd: "L30.9" },
      { diagnosis: "Viral Exanthem", base: 0.20, icd: "B09" },
      { diagnosis: "Urticaria", base: 0.20, icd: "L50.9" },
      { diagnosis: "Cellulitis", base: 0.10, icd: "L03.90" },
      { diagnosis: "Tinea Corporis", base: 0.10, icd: "B35.4" },
    ],
    signals: [
      { symptom: "itching", boost: 0.20, signal: "pruritic → allergic/eczema" },
      { symptom: "fever", boost: 0.25, signal: "fever → viral/infectious" },
      { symptom: "spreading", boost: 0.20, signal: "spreading → cellulitis" },
      { symptom: "warmth", boost: 0.20, signal: "warm → cellulitis" },
      { symptom: "bullseye", boost: 0.50, signal: "target lesion → Lyme disease" },
      { symptom: "blisters", boost: 0.25, signal: "vesicular → varicella/zoster" },
      { symptom: "shingles", boost: 0.40, signal: "dermatomal → herpes zoster" },
      { symptom: "contact", boost: 0.30, signal: "contact exposure" },
      { symptom: "ring", boost: 0.25, signal: "annular → tinea" },
    ],
    ageBoosts: [
      { diagnosis: "Eczema", maxAge: 12, boost: 0.15 },
    ],
  },

  dizziness: {
    baseSet: [
      { diagnosis: "Benign Paroxysmal Positional Vertigo", base: 0.35, icd: "H81.10" },
      { diagnosis: "Vestibular Neuritis", base: 0.20, icd: "H81.20" },
      { diagnosis: "Meniere's Disease", base: 0.10, icd: "H81.0" },
      { diagnosis: "Orthostatic Hypotension", base: 0.20, icd: "I95.1" },
      { diagnosis: "Labyrinthitis", base: 0.15, icd: "H83.09" },
      { diagnosis: "Central Vertigo (CVA/TIA)", base: 0.05, icd: "R42" },
    ],
    signals: [
      { symptom: "positional", boost: 0.30, signal: "positional → BPPV" },
      { symptom: "spinning", boost: 0.20, signal: "true vertigo" },
      { symptom: "hearing loss", boost: 0.25, signal: "sensorineural hearing loss" },
      { symptom: "tinnitus", boost: 0.25, signal: "tinnitus → Meniere's" },
      { symptom: "nausea", boost: 0.15, signal: "nausea" },
      { symptom: "on standing", boost: 0.30, signal: "orthostatic" },
      { symptom: "double vision", boost: 0.35, signal: "diplopia → central" },
      { symptom: "facial numbness", boost: 0.35, signal: "cranial nerve → central" },
      { symptom: "ataxia", boost: 0.35, signal: "ataxia → cerebellar" },
    ],
  },

  back_pain: {
    baseSet: [
      { diagnosis: "Lumbar Muscle Strain", base: 0.50, icd: "M54.5" },
      { diagnosis: "Lumbar Disc Herniation", base: 0.20, icd: "M51.16" },
      { diagnosis: "Lumbar Spinal Stenosis", base: 0.10, icd: "M48.06" },
      { diagnosis: "Pyelonephritis", base: 0.08, icd: "N10" },
      { diagnosis: "Vertebral Compression Fracture", base: 0.05, icd: "M80.08" },
    ],
    signals: [
      { symptom: "radiation leg", boost: 0.30, signal: "radiculopathy" },
      { symptom: "sciatica", boost: 0.35, signal: "sciatic distribution" },
      { symptom: "fever", boost: 0.30, signal: "fever → infectious/discitis" },
      { symptom: "dysuria", boost: 0.30, signal: "urinary symptoms → pyelonephritis" },
      { symptom: "bowel", boost: 0.40, signal: "bowel/bladder → cauda equina" },
      { symptom: "bladder", boost: 0.40, signal: "bladder dysfunction → cauda equina" },
      { symptom: "numbness", boost: 0.25, signal: "neurological deficit" },
      { symptom: "weakness", boost: 0.30, signal: "motor weakness" },
      { symptom: "trauma", boost: 0.25, signal: "traumatic mechanism" },
      { symptom: "osteoporosis", boost: 0.25, signal: "osteoporosis → compression fracture" },
    ],
    ageBoosts: [
      { diagnosis: "Vertebral Compression Fracture", minAge: 65, boost: 0.20 },
      { diagnosis: "Lumbar Spinal Stenosis", minAge: 60, boost: 0.15 },
    ],
  },
}

function symMatch(symptoms: string, symptom: string): boolean {
  return symptoms.toLowerCase().includes(symptom.toLowerCase())
}

export function aggregateDifferential(params: {
  complaint: string
  symptoms: string
  age?: number
  sex?: string
  features?: string[]
  similarityVotes?: Array<{ diagnosis: string; score: number }>
}): DifferentialCandidate[] {
  const { complaint, symptoms, age, sex, similarityVotes = [] } = params
  const symsLower = symptoms.toLowerCase()

  const ruleset = COMPLAINT_RULES[complaint]
  if (!ruleset) {
    return [{ diagnosis: "Unknown Complaint", score: 0.5, signals: ["complaint not in registry"] }]
  }

  const scores: Record<string, { score: number; signals: string[]; icd?: string }> = {}

  for (const base of ruleset.baseSet) {
    scores[base.diagnosis] = { score: base.base, signals: [], icd: base.icd }
  }

  for (const rule of ruleset.signals) {
    if (symMatch(symsLower, rule.symptom)) {
      for (const dx of ruleset.baseSet) {
        if (scores[dx.diagnosis]) {
          scores[dx.diagnosis].score += rule.boost
          scores[dx.diagnosis].signals.push(rule.signal)
        }
      }
    }
  }

  if (age !== undefined && ruleset.ageBoosts) {
    for (const ab of ruleset.ageBoosts) {
      if (scores[ab.diagnosis]) {
        const inRange =
          (ab.minAge === undefined || age >= ab.minAge) &&
          (ab.maxAge === undefined || age <= ab.maxAge)
        if (inRange) {
          scores[ab.diagnosis].score += ab.boost
          scores[ab.diagnosis].signals.push(`age ${age} in range`)
        }
      }
    }
  }

  if (sex && ruleset.sexBoosts) {
    for (const sb of ruleset.sexBoosts) {
      if (scores[sb.diagnosis] && sex.toLowerCase().startsWith(sb.sex)) {
        scores[sb.diagnosis].score += sb.boost
        scores[sb.diagnosis].signals.push(`sex: ${sex}`)
      }
    }
  }

  for (const vote of similarityVotes) {
    const name = vote.diagnosis.toLowerCase()
    for (const dx of Object.keys(scores)) {
      if (dx.toLowerCase().includes(name) || name.includes(dx.toLowerCase().split(" ")[0])) {
        scores[dx].score += vote.score * 0.4
        scores[dx].signals.push(`similar case vote (${vote.score.toFixed(2)})`)
      }
    }
  }

  return Object.entries(scores)
    .map(([diagnosis, v]) => ({
      diagnosis,
      score: Math.min(1, Math.max(0, v.score)),
      signals: [...new Set(v.signals)],
      icdHint: v.icd,
    }))
    .sort((a, b) => b.score - a.score)
}
