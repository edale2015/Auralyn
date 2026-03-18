export interface PatientMessage {
  role: "patient" | "system" | "doctor";
  text: string;
  at: string;
}

export interface SymptomAnswer {
  key: string;
  value: string | boolean | number | null;
}

export interface IntakeDraft {
  patientId: string;
  source: "sms" | "whatsapp" | "web";
  chiefComplaint: string;
  age?: number;
  sex?: string;
  symptomDuration?: string;
  answers: SymptomAnswer[];
  transcript: PatientMessage[];
  redFlags: string[];
  missingCriticalData: string[];
}

const RED_FLAG_PATTERNS = [
  { pattern: /chest pain|pressure in chest/i, flag: "chest_pain" },
  { pattern: /shortness of breath|can't breathe|trouble breathing/i, flag: "sob" },
  { pattern: /fainting|passed out|syncope/i, flag: "syncope" },
  { pattern: /one sided weakness|slurred speech/i, flag: "stroke_symptoms" },
  { pattern: /severe abdominal pain/i, flag: "severe_abdominal_pain" },
  { pattern: /pregnant and bleeding/i, flag: "pregnancy_bleeding" },
];

export function parseSmartIntake(patientId: string, source: "sms" | "whatsapp" | "web", transcript: PatientMessage[]): IntakeDraft {
  const allText = transcript.map((t) => t.text).join(" ");
  const chiefComplaint = extractChiefComplaint(allText);
  const age = extractAge(allText);
  const sex = extractSex(allText);
  const symptomDuration = extractDuration(allText);
  const redFlags = extractRedFlags(allText);

  const answers: SymptomAnswer[] = [];
  if (age != null) answers.push({ key: "age", value: age });
  if (sex) answers.push({ key: "sex", value: sex });
  if (symptomDuration) answers.push({ key: "duration", value: symptomDuration });

  const missingCriticalData: string[] = [];
  if (age == null) missingCriticalData.push("age");
  if (!chiefComplaint || chiefComplaint === "general_medical_question") missingCriticalData.push("chief_complaint");

  return { patientId, source, chiefComplaint: chiefComplaint || "general_medical_question", age, sex, symptomDuration, answers, transcript, redFlags, missingCriticalData };
}

function extractChiefComplaint(text: string): string {
  const complaintMap = ["cough", "sore throat", "fever", "rash", "urinary burning", "ear pain", "eye redness", "abdominal pain", "vomiting", "diarrhea", "back pain", "headache", "refill"];
  const lower = text.toLowerCase();
  return complaintMap.find((c) => lower.includes(c)) || inferComplaint(lower);
}

function inferComplaint(text: string): string {
  if (/pee burns|burning when urinate|uti/i.test(text)) return "urinary burning";
  if (/runny nose|congestion|cold/i.test(text)) return "cough";
  if (/itchy spots|red bumps/i.test(text)) return "rash";
  return "general_medical_question";
}

function extractAge(text: string): number | undefined {
  const match = text.match(/\b(\d{1,3})\s*(yo|year old|years old)\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractSex(text: string): string | undefined {
  if (/\bfemale\b|\bwoman\b|\bgirl\b/i.test(text)) return "female";
  if (/\bmale\b|\bman\b|\bboy\b/i.test(text)) return "male";
  return undefined;
}

function extractDuration(text: string): string | undefined {
  const match = text.match(/\b(\d+)\s*(day|days|week|weeks|month|months)\b/i);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

function extractRedFlags(text: string): string[] {
  return RED_FLAG_PATTERNS.filter((x) => x.pattern.test(text)).map((x) => x.flag);
}

export function getNextBestQuestion(draft: IntakeDraft): string | null {
  if (!draft.age) return "What is the patient's age?";
  if (draft.chiefComplaint === "general_medical_question") return "What is the main symptom today?";
  if (draft.chiefComplaint === "cough" && !hasAnswer(draft, "sob")) return "Any shortness of breath, chest pain, or fever?";
  if (draft.chiefComplaint === "urinary burning" && !hasAnswer(draft, "pregnancy_status")) return "Any fever, back pain, vomiting, or pregnancy?";
  if (draft.chiefComplaint === "rash" && !hasAnswer(draft, "rash_red_flags")) return "Any mouth sores, facial swelling, trouble breathing, or severe pain?";
  return null;
}

function hasAnswer(draft: IntakeDraft, key: string) {
  return draft.answers.some((a) => a.key === key);
}
