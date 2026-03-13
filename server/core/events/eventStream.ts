import * as fs from "fs/promises";
import * as path from "path";

const STREAM_DIR = path.join(process.cwd(), "data", "runtime");
const STREAM_FILE = path.join(STREAM_DIR, "clinical_events.ndjson");

export interface PersistedEvent {
  caseId: string;
  type: string;
  data: Record<string, any>;
  timestamp: string;
  seq?: number;
}

let _seq = 0;

async function ensureDir(): Promise<void> {
  await fs.mkdir(STREAM_DIR, { recursive: true });
}

export async function appendEvent(event: Omit<PersistedEvent, "seq">): Promise<void> {
  try {
    await ensureDir();
    const record: PersistedEvent = { ...event, seq: ++_seq };
    await fs.appendFile(STREAM_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Event stream write failure must never crash the server
  }
}

export async function readAllEvents(): Promise<PersistedEvent[]> {
  try {
    await ensureDir();
    const raw = await fs.readFile(STREAM_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line) as PersistedEvent; }
        catch { return null; }
      })
      .filter((e): e is PersistedEvent => e !== null);
  } catch {
    return [];
  }
}

export async function readEventsByCaseId(caseId: string): Promise<PersistedEvent[]> {
  const all = await readAllEvents();
  return all.filter(e => e.caseId === caseId);
}

export async function rebuildStateFromEvents(caseId: string): Promise<Record<string, any>> {
  const events = await readEventsByCaseId(caseId);
  const state: Record<string, any> = { caseId, events, symptoms: "", complaint: null, differential: [], alerts: [], disposition: null, followUpQuestions: [], redFlags: [], pathway: null };

  for (const event of events) {
    switch (event.type) {
      case "SESSION_STARTED":
        if (event.data.patient) state.patient = event.data.patient;
        if (event.data.complaint) state.complaint = event.data.complaint;
        break;
      case "PATIENT_MESSAGE":
        state.symptoms = ((state.symptoms ?? "") + " " + (event.data.message ?? "")).trim();
        state.intakeMessages = [...(state.intakeMessages ?? []), { role: "patient", content: event.data.message, timestamp: event.timestamp }];
        break;
      case "COMPLAINT_IDENTIFIED":
        state.complaint = event.data.complaint;
        break;
      case "DIFFERENTIAL_UPDATED":
        state.differential = event.data.differential;
        break;
      case "ALERTS_UPDATED":
        state.alerts = event.data.alerts;
        break;
      case "RED_FLAG_DETECTED":
        state.redFlags = [...new Set([...(state.redFlags ?? []), ...(event.data.flags ?? [])])];
        break;
      case "DISPOSITION_SET":
        state.disposition = event.data.disposition;
        break;
      case "HYBRID_REASONING_COMPLETE":
        state.hybridResult = event.data.result;
        break;
      case "UNCERTAINTY_DETECTED":
        if (event.data.nextQuestion) {
          state.followUpQuestions = [...(state.followUpQuestions ?? []), event.data.nextQuestion];
        }
        break;
      case "FOLLOWUP_QUESTION_SUGGESTED":
        state.pendingQuestion = event.data.question;
        state.followUpQuestions = [...(state.followUpQuestions ?? []), event.data.question.text];
        break;
      case "FOLLOWUP_QUESTION_ANSWERED":
        state.pendingQuestion = null;
        state.answeredQuestions = [...(state.answeredQuestions ?? []), { questionId: event.data.questionId, answer: event.data.answer }];
        break;
      case "CARE_PATHWAY_STARTED":
        state.pathway = event.data.pathway;
        break;
      case "PATHWAY_EXECUTED":
        state.pathway = event.data.result;
        break;
      case "NOTE_READY":
        state.chartNote = event.data.note;
        break;
      case "DISCHARGE_READY":
        state.dischargeText = event.data.text;
        break;
      case "MEDICATION_PLAN":
        state.medicationPlan = event.data.medication;
        break;
      case "OUTCOME_RECORDED":
        state.outcomeData = { actualDisposition: event.data.finalDisposition, followupStatus: event.data.followupStatus };
        break;
    }
  }

  return state;
}

export async function getStreamStats(): Promise<{ totalEvents: number; totalCases: number; sizeBytes: number; oldestEvent?: string; newestEvent?: string }> {
  const events = await readAllEvents();
  const cases = new Set(events.map(e => e.caseId));
  let sizeBytes = 0;
  try { const stat = await fs.stat(STREAM_FILE); sizeBytes = stat.size; } catch {}
  return {
    totalEvents: events.length,
    totalCases: cases.size,
    sizeBytes,
    oldestEvent: events[0]?.timestamp,
    newestEvent: events[events.length - 1]?.timestamp,
  };
}

export async function getEventTimeline(caseId?: string): Promise<PersistedEvent[]> {
  return caseId ? readEventsByCaseId(caseId) : readAllEvents();
}

export async function readEvents(caseId?: string): Promise<PersistedEvent[]> {
  return caseId ? readEventsByCaseId(caseId) : readAllEvents();
}

export async function readEventsSince(offset: number, caseId?: string): Promise<PersistedEvent[]> {
  const all = await readAllEvents();
  const filtered = caseId ? all.filter(e => e.caseId === caseId) : all;
  return filtered.filter(e => (e.seq ?? 0) > offset);
}

export async function getLastSeq(): Promise<number> {
  const all = await readAllEvents();
  return all.reduce((max, e) => Math.max(max, e.seq ?? 0), 0);
}
