type SystemDefinition = {
  system: string;
  complaints: string[];
};

export interface GeneratedPack {
  id: string;
  system: string;
  title: string;
  redFlags: string[];
  autoEscalateRules: string[];
  autoReviewRules: string[];
}

const SYSTEMS: SystemDefinition[] = [
  {
    system: "derm",
    complaints: [
      "rash",
      "hives",
      "cellulitis",
      "burn",
      "abscess",
      "itching",
      "skin infection",
      "acne",
      "mole concern",
      "hair loss",
    ],
  },
  {
    system: "pulmonary",
    complaints: [
      "cough",
      "shortness of breath",
      "wheezing",
      "chest congestion",
      "asthma flare",
      "bronchitis",
      "pneumonia concern",
      "covid symptoms",
      "hemoptysis",
      "sleep apnea concern",
    ],
  },
  {
    system: "gi",
    complaints: [
      "abdominal pain",
      "vomiting",
      "diarrhea",
      "constipation",
      "rectal bleeding",
      "reflux",
      "nausea",
      "bloating",
      "ibs symptoms",
      "food poisoning",
    ],
  },
  {
    system: "neuro",
    complaints: [
      "headache",
      "migraine",
      "dizziness",
      "numbness",
      "weakness",
      "seizure",
      "tremor",
      "memory loss",
      "confusion",
      "vision changes",
    ],
  },
  {
    system: "msk",
    complaints: [
      "back pain",
      "knee pain",
      "shoulder pain",
      "ankle injury",
      "wrist pain",
      "neck pain",
      "hip pain",
      "joint swelling",
      "muscle strain",
      "fracture concern",
    ],
  },
  {
    system: "cardio",
    complaints: [
      "chest pain",
      "palpitations",
      "syncope",
      "leg swelling",
      "hypertension",
      "shortness of breath",
      "irregular heartbeat",
      "claudication",
      "heart murmur",
      "dvt concern",
    ],
  },
  {
    system: "gu",
    complaints: [
      "uti symptoms",
      "flank pain",
      "hematuria",
      "dysuria",
      "frequency",
      "incontinence",
      "kidney stone concern",
      "testicular pain",
      "prostate concern",
      "std concern",
    ],
  },
  {
    system: "psych",
    complaints: [
      "anxiety",
      "depression",
      "insomnia",
      "panic attack",
      "suicidal ideation",
      "substance use",
      "grief",
      "ptsd symptoms",
      "anger management",
      "psychosis concern",
    ],
  },
  {
    system: "ent",
    complaints: [
      "sore throat",
      "ear pain",
      "sinus congestion",
      "nosebleed",
      "hearing loss",
      "tinnitus",
      "hoarseness",
      "difficulty swallowing",
      "neck mass",
      "post nasal drip",
    ],
  },
  {
    system: "eye",
    complaints: [
      "red eye",
      "eye pain",
      "vision loss",
      "floaters",
      "eye discharge",
      "itchy eyes",
      "foreign body sensation",
      "double vision",
      "swollen eyelid",
      "dry eyes",
    ],
  },
];

export function generateSystemPacks(): GeneratedPack[] {
  const packs: GeneratedPack[] = [];

  for (const sys of SYSTEMS) {
    for (const complaint of sys.complaints) {
      const id = `${sys.system}_${complaint.replace(/\s+/g, "_").toLowerCase()}`;

      packs.push({
        id,
        system: sys.system,
        title: complaint,
        redFlags: ["severe", "confusion"],
        autoEscalateRules: ["confusion=yes"],
        autoReviewRules: [],
      });
    }
  }

  return packs;
}

export function generateSystemPacksForSystem(system: string): GeneratedPack[] {
  return generateSystemPacks().filter((p) => p.system === system);
}

export function getAvailableSystems(): string[] {
  return SYSTEMS.map((s) => s.system);
}
