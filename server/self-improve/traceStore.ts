import * as fs from "fs/promises";
import * as path from "path";

export interface ClinicalTrace {
  case_id: string;
  timestamp: string;
  complaint: string;
  channel: "web" | "telegram" | "whatsapp" | "synthetic" | "manual";
  patient_context: {
    age?: number;
    sex?: string;
    pregnant?: boolean;
  };
  modifier_intake: {
    pmh?: string[];
    medications?: string[];
    allergies?: string[];
  };
  questions_asked: Array<{
    question_id: string;
    text: string;
    answer: string;
    order: number;
  }>;
  signals_detected: string[];
  rules_triggered: Array<{
    rule_id: string;
    table: string;
    result: "triggered" | "not_triggered";
  }>;
  differential_scores: Array<{
    diagnosis: string;
    score: number;
  }>;
  final_output: {
    disposition: string;
    confidence: "low" | "medium" | "high";
    review_required: boolean;
  };
  missing_expected_data: string[];
  runtime_flags: string[];
  duration_ms?: number;
}

const TRACES_DIR = path.join(process.cwd(), "data", "traces");
const TRACES_INDEX = path.join(process.cwd(), "data", "traces_index.ndjson");

const inMemory: Map<string, ClinicalTrace> = new Map();

async function ensureDir() {
  await fs.mkdir(TRACES_DIR, { recursive: true });
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
}

export async function saveTrace(trace: ClinicalTrace): Promise<void> {
  await ensureDir();
  inMemory.set(trace.case_id, trace);
  const filePath = path.join(TRACES_DIR, `${trace.case_id}.json`);
  await fs.writeFile(filePath, JSON.stringify(trace, null, 2), "utf8");
  const indexLine = JSON.stringify({
    case_id: trace.case_id,
    complaint: trace.complaint,
    disposition: trace.final_output.disposition,
    timestamp: trace.timestamp,
    channel: trace.channel,
  }) + "\n";
  await fs.appendFile(TRACES_INDEX, indexLine, "utf8").catch(() => {});
}

export async function loadTrace(caseId: string): Promise<ClinicalTrace | null> {
  if (inMemory.has(caseId)) return inMemory.get(caseId)!;
  try {
    const filePath = path.join(TRACES_DIR, `${caseId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const trace = JSON.parse(raw) as ClinicalTrace;
    inMemory.set(caseId, trace);
    return trace;
  } catch {
    return null;
  }
}

export async function loadAllTraces(): Promise<ClinicalTrace[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(TRACES_DIR);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    const traces: ClinicalTrace[] = [];
    for (const f of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(TRACES_DIR, f), "utf8");
        traces.push(JSON.parse(raw));
      } catch {}
    }
    return traces.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

export async function loadTracesByComplaint(complaint: string): Promise<ClinicalTrace[]> {
  const all = await loadAllTraces();
  return all.filter(t => t.complaint === complaint);
}

export function buildTraceFromSession(
  caseId: string,
  complaint: string,
  channel: ClinicalTrace["channel"],
  symptoms: string[],
  disposition: string,
  differential: Array<{ diagnosis: string; confidence: number }>,
  patientContext?: ClinicalTrace["patient_context"],
  modifiers?: ClinicalTrace["modifier_intake"],
  durationMs?: number
): ClinicalTrace {
  return {
    case_id: caseId,
    timestamp: new Date().toISOString(),
    complaint,
    channel,
    patient_context: patientContext ?? {},
    modifier_intake: modifiers ?? {},
    questions_asked: symptoms.map((s, i) => ({
      question_id: `SYM_${i}`,
      text: s,
      answer: "yes",
      order: i,
    })),
    signals_detected: symptoms,
    rules_triggered: [],
    differential_scores: differential.map(d => ({ diagnosis: d.diagnosis, score: d.confidence })),
    final_output: {
      disposition,
      confidence: "medium",
      review_required: false,
    },
    missing_expected_data: [],
    runtime_flags: [],
    duration_ms: durationMs,
  };
}
