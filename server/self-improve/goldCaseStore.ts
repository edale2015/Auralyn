import * as fs from "fs/promises";
import * as path from "path";

export interface GoldCase {
  case_id: string;
  complaint: string;
  description: string;
  patient_context?: { age?: number; sex?: string; pregnant?: boolean };
  presented_symptoms: string[];
  expected_disposition: string;
  expected_top_diagnoses: string[];
  required_questions: string[];
  forbidden_misses: string[];
  clinical_notes?: string;
  added_at: string;
  source: "manual" | "physician_review" | "synthetic";
}

export interface ComparisonResult {
  case_id: string;
  pass: boolean;
  disposition_match: boolean;
  diagnosis_match: boolean;
  required_questions_missing: string[];
  dangerous_miss: boolean;
  undertriage: boolean;
  overtriage: boolean;
  summary: string;
}

const GOLD_PATH = path.join(process.cwd(), "data", "golden_cases.json");

const BUILT_IN_CASES: GoldCase[] = [
  {
    case_id: "GT_ST_0001",
    complaint: "sore_throat",
    description: "Young adult with severe sore throat + drooling + muffled voice — PTA pattern",
    patient_context: { age: 26, sex: "female" },
    presented_symptoms: ["Fever", "Difficulty swallowing", "Exudate", "No cough"],
    expected_disposition: "urgent_care",
    expected_top_diagnoses: ["peritonsillar_abscess", "Group A Streptococcus (Strep)"],
    required_questions: ["fever", "drooling", "muffled voice", "swallowing"],
    forbidden_misses: ["red_flag_missed", "undertriage"],
    clinical_notes: "Drooling + muffled voice in sore throat = PTA until proven otherwise",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_ST_0002",
    complaint: "sore_throat",
    description: "Adolescent with viral pharyngitis — Centor score 0",
    patient_context: { age: 19, sex: "male" },
    presented_symptoms: ["Cough present", "Rhinorrhea", "No fever"],
    expected_disposition: "home_care",
    expected_top_diagnoses: ["Viral Pharyngitis"],
    required_questions: ["cough", "fever"],
    forbidden_misses: ["overtriage"],
    clinical_notes: "Cough + no fever = viral. No strep testing needed.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_COUGH_0001",
    complaint: "cough",
    description: "Adult with fever + productive cough + dyspnea — possible pneumonia",
    patient_context: { age: 55, sex: "male" },
    presented_symptoms: ["Fever", "Shortness of breath", "Sputum production", "Duration > 7 days"],
    expected_disposition: "urgent_care",
    expected_top_diagnoses: ["Community-Acquired Pneumonia"],
    required_questions: ["shortness of breath", "fever duration", "sputum color", "chest pain"],
    forbidden_misses: ["undertriage", "missed_red_flag"],
    clinical_notes: "CURB-65 evaluation needed. Pulse ox critical.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_COUGH_0002",
    complaint: "cough",
    description: "Young adult with dry cough, no fever, 5 days — viral bronchitis",
    patient_context: { age: 28, sex: "female" },
    presented_symptoms: ["No fever", "Night symptoms"],
    expected_disposition: "home_care",
    expected_top_diagnoses: ["Viral URTI / Bronchitis"],
    required_questions: ["fever", "duration", "shortness of breath"],
    forbidden_misses: ["overtriage"],
    clinical_notes: "No red flags. Supportive care.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_CP_0001",
    complaint: "chest_pain",
    description: "50yo male with crushing chest pain + diaphoresis + arm radiation — ACS",
    patient_context: { age: 52, sex: "male" },
    presented_symptoms: ["Shortness of breath", "Diaphoresis", "Radiation to arm/jaw"],
    expected_disposition: "er_now",
    expected_top_diagnoses: ["ACS / NSTEMI"],
    required_questions: ["radiation", "diaphoresis", "duration", "nitro response"],
    forbidden_misses: ["undertriage", "red_flag_missed"],
    clinical_notes: "STEMI equivalent until ECG rules out. Aspirin immediately.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_CP_0002",
    complaint: "chest_pain",
    description: "30yo with sharp pleuritic chest pain, no risk factors — MSK vs viral pleuritis",
    patient_context: { age: 30, sex: "female" },
    presented_symptoms: ["Pleuritic"],
    expected_disposition: "urgent_care",
    expected_top_diagnoses: ["Musculoskeletal / Costochondritis"],
    required_questions: ["reproducible with palpation", "radiation", "shortness of breath"],
    forbidden_misses: ["red_flag_missed"],
    clinical_notes: "PERC score needed to rule out PE before calling MSK.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_UTI_0001",
    complaint: "uti",
    description: "Young female with dysuria + frequency + urgency, no fever — uncomplicated UTI",
    patient_context: { age: 24, sex: "female" },
    presented_symptoms: ["Dysuria", "Frequency", "Urgency"],
    expected_disposition: "routine",
    expected_top_diagnoses: ["Uncomplicated UTI (Cystitis)"],
    required_questions: ["fever", "flank pain", "pregnancy"],
    forbidden_misses: ["missed_red_flag"],
    clinical_notes: "No fever or flank pain = uncomplicated. Nitrofurantoin 5 days.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_UTI_0002",
    complaint: "uti",
    description: "Female with UTI + fever + flank pain — pyelonephritis",
    patient_context: { age: 35, sex: "female" },
    presented_symptoms: ["Dysuria", "Frequency", "Urgency", "Fever/chills", "Flank pain"],
    expected_disposition: "urgent_care",
    expected_top_diagnoses: ["Pyelonephritis"],
    required_questions: ["fever", "flank pain", "nausea/vomiting", "CVA tenderness"],
    forbidden_misses: ["undertriage", "missed_red_flag"],
    clinical_notes: "Systemic UTI requires IV antibiotics if vomiting or sepsis signs.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_FEVER_0001",
    complaint: "fever",
    description: "Adult with fever + stiff neck + photophobia — meningitis concern",
    patient_context: { age: 21, sex: "male" },
    presented_symptoms: ["Neck stiffness", "Confusion"],
    expected_disposition: "er_now",
    expected_top_diagnoses: ["Early Bacterial Sepsis"],
    required_questions: ["neck stiffness", "photophobia", "rash", "confusion"],
    forbidden_misses: ["undertriage", "missed_red_flag", "red_flag_missed"],
    clinical_notes: "Kernig/Brudzinski signs + fever = meningitis workup immediately.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
  {
    case_id: "GT_FEVER_0002",
    complaint: "fever",
    description: "Child with fever + cough, 3 days, well-appearing — viral syndrome",
    patient_context: { age: 8, sex: "male" },
    presented_symptoms: ["Cough"],
    expected_disposition: "home_care",
    expected_top_diagnoses: ["Viral Syndrome"],
    required_questions: ["duration", "rash", "neck stiffness", "immunocompromised"],
    forbidden_misses: ["overtriage"],
    clinical_notes: "Well-appearing child with viral URI. Monitor for worsening.",
    added_at: "2026-03-01T00:00:00Z",
    source: "physician_review",
  },
];

let cachedCases: Map<string, GoldCase> = new Map();
let loaded = false;

async function loadCases(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await fs.readFile(GOLD_PATH, "utf8");
    const stored: GoldCase[] = JSON.parse(raw);
    for (const c of stored) cachedCases.set(c.case_id, c);
  } catch {}
  for (const c of BUILT_IN_CASES) {
    if (!cachedCases.has(c.case_id)) cachedCases.set(c.case_id, c);
  }
  loaded = true;
}

async function persist(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(GOLD_PATH, JSON.stringify(Array.from(cachedCases.values()), null, 2), "utf8");
}

export async function getGoldCase(caseId: string): Promise<GoldCase | null> {
  await loadCases();
  return cachedCases.get(caseId) ?? null;
}

export async function listGoldCases(complaint?: string): Promise<GoldCase[]> {
  await loadCases();
  const all = Array.from(cachedCases.values());
  return complaint ? all.filter(c => c.complaint === complaint) : all;
}

export async function addGoldCase(gc: Omit<GoldCase, "added_at">): Promise<GoldCase> {
  await loadCases();
  const full: GoldCase = { ...gc, added_at: new Date().toISOString() };
  cachedCases.set(full.case_id, full);
  await persist();
  return full;
}

const DISPOSITION_SEVERITY: Record<string, number> = {
  home_care: 0, routine: 1, telehealth_followup: 1,
  urgent_care: 2, prescription: 2,
  er_now: 3, er_send: 3,
};

export function compareToGold(trace: { case_id: string; complaint: string; final_output: { disposition: string }; differential_scores: Array<{ diagnosis: string; score: number }>; questions_asked: Array<{ text: string }> }, gold: GoldCase): ComparisonResult {
  const predictedDisp = trace.final_output.disposition;
  const expectedDisp = gold.expected_disposition;
  const dispositionMatch = predictedDisp === expectedDisp;

  const diagnosesFound = trace.differential_scores.map(d => d.diagnosis.toLowerCase());
  const diagnosisMatch = gold.expected_top_diagnoses.some(dx =>
    diagnosesFound.some(d => d.includes(dx.toLowerCase()) || dx.toLowerCase().includes(d.split(" ")[0].toLowerCase()))
  );

  const questionsAsked = trace.questions_asked.map(q => q.text.toLowerCase());
  const requiredQuestionsMissing = gold.required_questions.filter(rq =>
    !questionsAsked.some(qa => qa.includes(rq.toLowerCase()))
  );

  const predictedSev = DISPOSITION_SEVERITY[predictedDisp] ?? 1;
  const expectedSev = DISPOSITION_SEVERITY[expectedDisp] ?? 1;
  const undertriage = predictedSev < expectedSev;
  const overtriage = predictedSev > expectedSev + 1;

  const dangerousMiss =
    gold.forbidden_misses.includes("undertriage") && undertriage ||
    gold.forbidden_misses.includes("red_flag_missed") && requiredQuestionsMissing.length > 0 ||
    gold.forbidden_misses.includes("missed_red_flag") && undertriage;

  const pass = dispositionMatch && diagnosisMatch && requiredQuestionsMissing.length === 0 && !dangerousMiss;

  const issues: string[] = [];
  if (!dispositionMatch) issues.push(`disposition mismatch (predicted: ${predictedDisp}, expected: ${expectedDisp})`);
  if (!diagnosisMatch) issues.push(`missed expected diagnoses: ${gold.expected_top_diagnoses.join(", ")}`);
  if (requiredQuestionsMissing.length > 0) issues.push(`missing required questions: ${requiredQuestionsMissing.join(", ")}`);
  if (dangerousMiss) issues.push("DANGEROUS MISS detected");

  return {
    case_id: trace.case_id,
    pass,
    disposition_match: dispositionMatch,
    diagnosis_match: diagnosisMatch,
    required_questions_missing: requiredQuestionsMissing,
    dangerous_miss: dangerousMiss,
    undertriage,
    overtriage,
    summary: pass ? "All checks passed." : `Failed: ${issues.join("; ")}.`,
  };
}
