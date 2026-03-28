export interface ClinicalTrial {
  id:           string;
  title:        string;
  conditions:   string[];
  keywords:     string[];
  ageMin:       number;
  ageMax:       number;
  phase:        "I" | "II" | "III" | "IV" | "N/A";
  status:       "recruiting" | "active" | "completed" | "suspended";
  sponsor:      string;
  location:     string;
  url:          string;
}

export interface TrialMatchInput {
  condition:  string;
  keywords?:  string[];
  age:        number;
  icd10?:     string;
}

export interface TrialMatchResult {
  trial:         ClinicalTrial;
  matchScore:    number;
  matchReasons:  string[];
}

const TRIAL_REGISTRY: ClinicalTrial[] = [
  {
    id: "NCT-001", title: "AI-Assisted ENT Triage Efficacy Study",
    conditions: ["otitis media", "sinusitis", "pharyngitis", "ent"], keywords: ["ai triage", "ent", "auralyn"],
    ageMin: 18, ageMax: 85, phase: "III", status: "recruiting",
    sponsor: "Auralyn Health", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-001",
  },
  {
    id: "NCT-002", title: "Pediatric Otitis Media Watchful Waiting vs Antibiotics",
    conditions: ["otitis media", "ear infection"], keywords: ["pediatric", "antibiotic"],
    ageMin: 0, ageMax: 12, phase: "III", status: "recruiting",
    sponsor: "NYU Langone", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-002",
  },
  {
    id: "NCT-003", title: "Influenza A Rapid Antiviral Dosing Protocol",
    conditions: ["influenza", "flu", "influenza a", "influenza b"], keywords: ["oseltamivir", "antiviral"],
    ageMin: 18, ageMax: 99, phase: "II", status: "active",
    sponsor: "CDC / NIH", location: "Multi-site", url: "https://clinicaltrials.gov/ct2/show/NCT-003",
  },
  {
    id: "NCT-004", title: "COVID-19 Long-Hauler Olfactory Recovery Trial",
    conditions: ["covid", "covid-19", "loss of smell", "anosmia"], keywords: ["olfactory", "recovery", "parosmia"],
    ageMin: 18, ageMax: 70, phase: "II", status: "recruiting",
    sponsor: "Columbia University", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-004",
  },
  {
    id: "NCT-005", title: "Strep Throat Single-Dose Amoxicillin vs Standard 10-Day",
    conditions: ["strep", "strep throat", "group a streptococcus", "pharyngitis"], keywords: ["amoxicillin", "antibiotic", "penicillin"],
    ageMin: 5, ageMax: 65, phase: "III", status: "recruiting",
    sponsor: "Mount Sinai", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-005",
  },
  {
    id: "NCT-006", title: "Asthma Biologic Therapy in Adult Urban Cohort",
    conditions: ["asthma"], keywords: ["dupilumab", "biologic", "ige"],
    ageMin: 18, ageMax: 75, phase: "IV", status: "recruiting",
    sponsor: "Weill Cornell", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-006",
  },
  {
    id: "NCT-007", title: "Type 2 Diabetes GLP-1 Optimization",
    conditions: ["diabetes", "type 2 diabetes", "t2dm"], keywords: ["semaglutide", "glp-1", "insulin"],
    ageMin: 30, ageMax: 80, phase: "IV", status: "active",
    sponsor: "NYU Grossman", location: "New York, NY", url: "https://clinicaltrials.gov/ct2/show/NCT-007",
  },
];

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[-_]/g, " ");
}

export function matchTrials(input: TrialMatchInput): TrialMatchResult[] {
  const cond    = normalize(input.condition);
  const kws     = (input.keywords ?? []).map(normalize);
  const results: TrialMatchResult[] = [];

  for (const trial of TRIAL_REGISTRY) {
    if (trial.status === "completed" || trial.status === "suspended") continue;
    if (input.age < trial.ageMin || input.age > trial.ageMax) continue;

    const matchReasons: string[] = [];
    let score = 0;

    const condMatch = trial.conditions.some(c => normalize(c).includes(cond) || cond.includes(normalize(c)));
    if (condMatch) { score += 50; matchReasons.push(`Condition match: ${input.condition}`); }

    for (const kw of kws) {
      const kwMatch = trial.keywords.some(k => normalize(k).includes(kw) || kw.includes(normalize(k)));
      if (kwMatch) { score += 20; matchReasons.push(`Keyword: ${kw}`); }
    }

    if (input.icd10) {
      const icdPrefix = input.icd10.slice(0, 3).toLowerCase();
      const icdMatch: Record<string, string[]> = { j06: ["uri","pharyngitis","ent"], h66: ["otitis"], j09: ["influenza"], j10: ["influenza"], u07: ["covid"], j01: ["sinusitis"], j02: ["pharyngitis","strep"] };
      const mapped = icdMatch[icdPrefix];
      if (mapped?.some(k => trial.conditions.some(c => normalize(c).includes(k)))) {
        score += 15; matchReasons.push(`ICD-10 match: ${input.icd10}`);
      }
    }

    if (score > 0) results.push({ trial, matchScore: Math.min(100, score), matchReasons });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

export function getTrialRegistry(): ClinicalTrial[] {
  return [...TRIAL_REGISTRY];
}
