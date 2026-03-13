import { emitClinicalEvent } from "../state/clinicalEventBus";
import { getClinicalState } from "../state/clinicalStateStore";

const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  cough: ["cough", "coughing", "hack", "whooping", "productive", "dry cough"],
  sore_throat: ["sore throat", "throat pain", "throat hurts", "strep", "swallowing", "pharyngitis"],
  sinus_pressure: ["sinus", "congestion", "stuffy", "pressure", "nasal", "post nasal", "runny nose", "sinus pain"],
  ear_pain: ["ear pain", "ear ache", "earache", "ear hurts", "ears hurt", "ear infection", "hearing loss"],
  uti: ["urinary", "burning urination", "uti", "frequent urination", "dysuria", "bladder", "peeing a lot"],
  rash: ["rash", "hives", "skin", "itchy", "itch", "red spots", "bumps", "dermatitis"],
  fever: ["fever", "temperature", "chills", "hot", "burning up", "sweating", "night sweats"],
  chest_pain: ["chest pain", "chest pressure", "chest tightness", "heart", "palpitations", "shortness of breath", "sob"],
  abdominal_pain: ["abdominal", "stomach pain", "belly pain", "gut pain", "stomach ache", "nausea", "vomiting", "diarrhea", "cramping"],
};

const RED_FLAG_PATTERNS: Array<{ pattern: string[]; flag: string; level: "critical" | "urgent" }> = [
  { pattern: ["chest pain", "arm pain"], flag: "Possible ACS — chest pain with arm radiation", level: "critical" },
  { pattern: ["chest pain", "shortness of breath"], flag: "Possible PE or ACS", level: "critical" },
  { pattern: ["shortness of breath", "breathing", "can't breathe"], flag: "Respiratory compromise", level: "critical" },
  { pattern: ["coughing blood", "blood in sputum", "hemoptysis"], flag: "Hemoptysis detected", level: "critical" },
  { pattern: ["high fever", "stiff neck", "photophobia"], flag: "Possible meningitis", level: "critical" },
  { pattern: ["fever", "rash", "petechiae"], flag: "Possible sepsis/meningococcemia", level: "critical" },
  { pattern: ["severe abdominal", "rigid abdomen"], flag: "Possible acute abdomen", level: "urgent" },
  { pattern: ["blood in urine", "hematuria", "flank pain"], flag: "Possible pyelonephritis or nephrolithiasis", level: "urgent" },
  { pattern: ["stroke", "facial droop", "arm weakness", "slurred speech"], flag: "Possible stroke — FAST positive", level: "critical" },
  { pattern: ["anaphylaxis", "swelling throat", "can't swallow"], flag: "Possible anaphylaxis", level: "critical" },
];

const COMPLAINT_QUESTIONS: Record<string, string[]> = {
  cough: [
    "How long have you had this cough?",
    "Is the cough dry or productive (bringing up mucus)?",
    "Do you have a fever with the cough?",
    "Any shortness of breath or chest pain?",
    "Any blood in the mucus when you cough?",
    "Do you smoke or have a history of asthma?",
  ],
  sore_throat: [
    "How long have you had the sore throat?",
    "Do you have a fever?",
    "Do you have swollen glands in your neck?",
    "Any white patches visible in your throat?",
    "Do you have a runny nose or cough alongside the sore throat?",
    "Have you been exposed to anyone with strep throat recently?",
  ],
  sinus_pressure: [
    "How long have you had the sinus pressure?",
    "Do you have facial pain or pressure around your eyes or cheeks?",
    "Any fever?",
    "Is your discharge yellow or green?",
    "Did this follow a recent cold or respiratory infection?",
    "Any tooth pain in your upper teeth?",
  ],
  ear_pain: [
    "How long have you had ear pain?",
    "Is there any discharge from the ear?",
    "Do you have fever?",
    "Any recent cold or upper respiratory infection?",
    "Any hearing loss or muffled hearing?",
    "Is it one ear or both ears?",
  ],
  uti: [
    "How long have you had these urinary symptoms?",
    "Do you have burning or pain when urinating?",
    "Any fever or chills?",
    "Any pain in your back or sides (flank pain)?",
    "Is there blood in your urine?",
    "Are you pregnant or could you be pregnant?",
    "Do you have diabetes or other health conditions?",
  ],
  rash: [
    "How long have you had the rash?",
    "Where on your body is the rash?",
    "Is it itchy, painful, or burning?",
    "Did you use any new soap, lotion, or detergent recently?",
    "Any fever with the rash?",
    "Have you been bitten by any insects or had any outdoor exposure?",
  ],
  fever: [
    "What is your temperature?",
    "How long have you had the fever?",
    "Any other symptoms like cough, sore throat, or body aches?",
    "Have you traveled recently?",
    "Are you on any medications that suppress your immune system?",
    "Any rash, stiff neck, or severe headache?",
  ],
  chest_pain: [
    "How long have you had chest pain?",
    "Is it sharp, pressure-like, or burning?",
    "Does it radiate to your arm, jaw, or back?",
    "Any shortness of breath?",
    "Do you have a history of heart disease or blood clots?",
    "Is the pain worse with breathing or movement?",
  ],
  abdominal_pain: [
    "Where exactly is the pain (upper, lower, right, left)?",
    "How long have you had the pain?",
    "Any nausea, vomiting, or diarrhea?",
    "Any fever?",
    "Is the pain constant or comes and goes?",
    "Any blood in your stool?",
  ],
};

const DEFAULT_QUESTIONS = [
  "Can you tell me more about your symptoms?",
  "How long have you been feeling this way?",
  "On a scale of 1 to 10, how severe are your symptoms?",
  "Do you have any other symptoms?",
  "Do you have any fever?",
];

export interface IntakeSession {
  caseId: string;
  messages: { role: "patient" | "system"; content: string; timestamp: string }[];
  complaint?: string;
  triageLevel: "low" | "moderate" | "high" | "critical";
  redFlags: string[];
  collectedSymptoms: string[];
  questionIndex: number;
  complete: boolean;
}

const sessions: Record<string, IntakeSession> = {};

function getSession(caseId: string): IntakeSession {
  if (!sessions[caseId]) {
    sessions[caseId] = {
      caseId,
      messages: [],
      triageLevel: "low",
      redFlags: [],
      collectedSymptoms: [],
      questionIndex: 0,
      complete: false,
    };
  }
  return sessions[caseId];
}

function detectComplaint(text: string): string | null {
  const lower = text.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const [complaint, keywords] of Object.entries(COMPLAINT_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = complaint;
    }
  }
  return bestScore > 0 ? best : null;
}

function detectRedFlags(text: string): { flag: string; level: "critical" | "urgent" }[] {
  const lower = text.toLowerCase();
  const found: { flag: string; level: "critical" | "urgent" }[] = [];
  for (const { pattern, flag, level } of RED_FLAG_PATTERNS) {
    const matchCount = pattern.filter(p => lower.includes(p)).length;
    const required = pattern.length === 1 ? 1 : pattern.length === 2 ? 2 : Math.ceil(pattern.length * 0.6);
    if (matchCount >= required) {
      found.push({ flag, level });
    }
  }
  return found;
}

function computeTriageLevel(redFlags: { flag: string; level: string }[], complaint: string | null, allText: string): "low" | "moderate" | "high" | "critical" {
  if (redFlags.some(f => f.level === "critical")) return "critical";
  if (redFlags.some(f => f.level === "urgent")) return "high";
  if (complaint === "chest_pain") return "high";
  if (allText.toLowerCase().includes("severe") || allText.toLowerCase().includes("worst")) return "moderate";
  if (complaint === "fever" || complaint === "uti") return "moderate";
  return "low";
}

export async function startIntakeSession(caseId: string, patientInfo?: any): Promise<IntakeSession & { reply: string }> {
  const session = getSession(caseId);
  emitClinicalEvent(caseId, "SESSION_STARTED", { patient: patientInfo });

  const reply = "Hello! I'm your virtual clinical assistant. Please describe your main symptom or what's bothering you today. For example: 'I have a sore throat and fever' or 'I've had a cough for 3 days.'";
  session.messages.push({ role: "system", content: reply, timestamp: new Date().toISOString() });

  return { ...session, reply };
}

export async function processIntakeMessage(params: { caseId: string; message: string }): Promise<{
  reply: string;
  nextQuestion?: string;
  triageLevel: string;
  redFlags: { flag: string; level: string }[];
  complaint?: string;
  complete: boolean;
  session: IntakeSession;
}> {
  const { caseId, message } = params;
  const session = getSession(caseId);
  const timestamp = new Date().toISOString();

  session.messages.push({ role: "patient", content: message, timestamp });
  session.collectedSymptoms.push(message);

  const allText = session.collectedSymptoms.join(" ");
  const newFlags = detectRedFlags(message);
  for (const f of newFlags) {
    if (!session.redFlags.includes(f.flag)) session.redFlags.push(f.flag);
  }

  emitClinicalEvent(caseId, "SYMPTOMS_RECORDED", { symptoms: allText, message });

  if (!session.complaint) {
    const detected = detectComplaint(message);
    if (detected) {
      session.complaint = detected;
      emitClinicalEvent(caseId, "COMPLAINT_IDENTIFIED", { complaint: detected });
    }
  }

  const triageLevel = computeTriageLevel(newFlags, session.complaint ?? null, allText);
  session.triageLevel = triageLevel;

  if (newFlags.length > 0) {
    emitClinicalEvent(caseId, "RED_FLAG_DETECTED", { flags: session.redFlags });
  }

  let reply = "";
  let nextQuestion: string | undefined;
  let complete = false;

  if (triageLevel === "critical") {
    reply = `⚠️ Based on your symptoms, this requires immediate emergency care. Please call 911 or go to your nearest Emergency Department right away. Do not wait.\n\nCritical flag: ${newFlags[0]?.flag ?? "Severe symptoms detected"}`;
    complete = true;
  } else {
    const questions = session.complaint ? (COMPLAINT_QUESTIONS[session.complaint] ?? DEFAULT_QUESTIONS) : DEFAULT_QUESTIONS;
    const asked = session.questionIndex;

    if (asked >= questions.length || (asked >= 4 && session.complaint)) {
      complete = true;
      const triageMessages: Record<string, string> = {
        high: "Thank you for those details. Your symptoms suggest you should be seen today at an urgent care clinic or emergency department. A physician will review your case shortly.",
        moderate: "Thank you. Based on your symptoms, you should speak with a physician today. We'll have someone review your case shortly.",
        low: "Thank you for that information. Your symptoms appear to be mild. A physician will review your case and contact you with guidance.",
      };
      reply = triageMessages[triageLevel] ?? triageMessages.low;
    } else {
      nextQuestion = questions[asked];
      session.questionIndex++;
      const complainPrefix = asked === 0 && session.complaint ? `I see you may be experiencing ${session.complaint.replace(/_/g, " ")}. ` : "";
      reply = `${complainPrefix}${nextQuestion}`;
    }
  }

  session.complete = complete;
  session.messages.push({ role: "system", content: reply, timestamp: new Date().toISOString() });

  return {
    reply,
    nextQuestion,
    triageLevel,
    redFlags: newFlags,
    complaint: session.complaint,
    complete,
    session,
  };
}

export function getIntakeSession(caseId: string): IntakeSession | null {
  return sessions[caseId] ?? null;
}

export function listSessions(): { caseId: string; complaint?: string; triageLevel: string; complete: boolean }[] {
  return Object.values(sessions).map(s => ({ caseId: s.caseId, complaint: s.complaint, triageLevel: s.triageLevel, complete: s.complete }));
}
