import * as fs from "fs/promises";
import * as path from "path";

export interface PatientOutcome {
  id: string;
  caseId: string;
  complaint: string;
  engineDisposition: string;
  actualDisposition: string;
  patientReported: string;
  followupStatus: "pending" | "improved" | "worsened" | "hospitalized" | "no_show";
  physicianNotes: string;
  timestamp: string;
  feedbackLoopTriggered: boolean;
}

const STORE_FILE = path.join(process.cwd(), "patient_outcomes.ndjson");

async function readAll(): Promise<PatientOutcome[]> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

async function append(outcome: PatientOutcome): Promise<void> {
  await fs.appendFile(STORE_FILE, JSON.stringify(outcome) + "\n");
}

async function overwrite(outcomes: PatientOutcome[]): Promise<void> {
  await fs.writeFile(STORE_FILE, outcomes.map(o => JSON.stringify(o)).join("\n") + "\n");
}

export async function listOutcomes(): Promise<PatientOutcome[]> {
  return (await readAll()).reverse();
}

export async function getOutcomeByCaseId(caseId: string): Promise<PatientOutcome | null> {
  const all = await readAll();
  return all.find(o => o.caseId === caseId) ?? null;
}

export async function addOutcome(data: Omit<PatientOutcome, "id" | "timestamp" | "feedbackLoopTriggered">): Promise<PatientOutcome> {
  const outcome: PatientOutcome = {
    ...data,
    id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    feedbackLoopTriggered: data.actualDisposition !== data.engineDisposition || data.followupStatus === "hospitalized" || data.followupStatus === "worsened",
  };
  await append(outcome);
  return outcome;
}

export async function updateOutcome(id: string, patch: Partial<PatientOutcome>): Promise<PatientOutcome | null> {
  const all = await readAll();
  const idx = all.findIndex(o => o.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  await overwrite(all);
  return all[idx];
}

export async function getOutcomeStats() {
  const all = await readAll();
  const total = all.length;
  const hospitalized = all.filter(o => o.followupStatus === "hospitalized").length;
  const worsened = all.filter(o => o.followupStatus === "worsened").length;
  const improved = all.filter(o => o.followupStatus === "improved").length;
  const feedbackTriggered = all.filter(o => o.feedbackLoopTriggered).length;
  const mismatchRate = total > 0 ? ((all.filter(o => o.actualDisposition !== o.engineDisposition).length / total) * 100).toFixed(1) : "0.0";
  return { total, improved, worsened, hospitalized, feedbackTriggered, mismatchRate };
}
