import * as fs from "fs/promises";
import * as path from "path";

const TIMELINE_FILE = path.join("data", "symptom_timelines.ndjson");

export interface TimelineEvent {
  caseId: string;
  day: number;
  symptom: string;
  severity?: "mild" | "moderate" | "severe";
  timestamp: string;
}

export interface TimelineProgression {
  caseId: string;
  events: TimelineEvent[];
  durationDays: number;
  progressionSignal: string;
  riskFlag: boolean;
  riskReason: string;
}

const CONCERNING_PROGRESSIONS: Array<{ pattern: string[]; signal: string; risk: boolean }> = [
  { pattern: ["cough","fever","shortness_of_breath"], signal: "Cough → Fever → SOB over days suggests pneumonia progression", risk: true },
  { pattern: ["cough","fever","confusion"],           signal: "Cough + Fever + Confusion suggests sepsis or severe pneumonia", risk: true },
  { pattern: ["fever","rash","confusion"],            signal: "Fever → Rash → Confusion suggests meningococcemia or severe infection", risk: true },
  { pattern: ["headache","fever","neck_stiffness"],   signal: "Headache → Fever → Neck stiffness progression suggests meningitis", risk: true },
  { pattern: ["cough","sore_throat"],                 signal: "Sore throat followed by cough suggests viral URI progression", risk: false },
  { pattern: ["fever","fatigue"],                     signal: "Fever with fatigue suggests viral illness, monitoring recommended", risk: false },
];

async function loadTimelines(): Promise<TimelineEvent[]> {
  try {
    const raw = await fs.readFile(TIMELINE_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

export async function addTimelineEvent(
  caseId: string,
  day: number,
  symptom: string,
  severity?: TimelineEvent["severity"]
): Promise<TimelineEvent> {
  await fs.mkdir("data", { recursive: true });
  const event: TimelineEvent = {
    caseId, day,
    symptom: symptom.toLowerCase().replace(/\s+/g,"_"),
    severity,
    timestamp: new Date().toISOString(),
  };
  await fs.appendFile(TIMELINE_FILE, JSON.stringify(event) + "\n", "utf8");
  return event;
}

export async function getCaseProgression(caseId: string): Promise<TimelineProgression> {
  const all = await loadTimelines();
  const events = all
    .filter(e => e.caseId === caseId)
    .sort((a, b) => a.day - b.day);

  const symptoms = events.map(e => e.symptom);
  const durationDays = events.length > 0 ? Math.max(...events.map(e => e.day)) - Math.min(...events.map(e => e.day)) : 0;

  let progressionSignal = "No notable progression pattern detected.";
  let riskFlag = false;
  let riskReason = "";

  for (const prog of CONCERNING_PROGRESSIONS) {
    const matchCount = prog.pattern.filter(p => symptoms.includes(p)).length;
    if (matchCount >= Math.ceil(prog.pattern.length * 0.67)) {
      progressionSignal = prog.signal;
      riskFlag = prog.risk;
      riskReason = prog.risk ? prog.signal : "";
      break;
    }
  }

  if (durationDays >= 7 && symptoms.includes("cough")) {
    riskFlag = true;
    riskReason = "Cough persisting 7+ days warrants further evaluation";
    progressionSignal = riskReason;
  }

  return { caseId, events, durationDays, progressionSignal, riskFlag, riskReason };
}

export async function getAllTimelines(): Promise<Record<string, TimelineProgression>> {
  const all = await loadTimelines();
  const caseIds = [...new Set(all.map(e => e.caseId))];
  const result: Record<string, TimelineProgression> = {};
  for (const id of caseIds) result[id] = await getCaseProgression(id);
  return result;
}
