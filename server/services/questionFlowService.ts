import fs from "node:fs";
import path from "node:path";

export type QRow = {
  CC_ID: string;
  Q_ID: string;
  QUESTION_TEXT: string;
  ANSWER_TYPE: string;
  REQUIRED: string;
  ASK_ORDER: number;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

let CACHE: QRow[] | null = null;

function loadQuestions(): QRow[] {
  if (CACHE) return CACHE;
  const p = path.resolve("server/data/csv/CORE_QUESTIONS.csv");
  const text = fs.readFileSync(p, "utf8").trim();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const idx = (k: string) => header.indexOf(k);

  CACHE = lines
    .slice(1)
    .map((line) => {
      const c = splitCsvLine(line);
      return {
        CC_ID: c[idx("CC_ID")] ?? "",
        Q_ID: c[idx("Q_ID")] ?? "",
        QUESTION_TEXT: c[idx("QUESTION_TEXT")] ?? "",
        ANSWER_TYPE: c[idx("ANSWER_TYPE")] ?? "boolean",
        REQUIRED: c[idx("REQUIRED")] ?? "FALSE",
        ASK_ORDER: Number(c[idx("ASK_ORDER")] ?? "999"),
      };
    })
    .filter((r) => r.CC_ID && r.Q_ID)
    .sort((a, b) => a.ASK_ORDER - b.ASK_ORDER);

  return CACHE;
}

function isRequired(v: string): boolean {
  const x = (v ?? "").toUpperCase().trim();
  return x === "TRUE" || x === "1" || x === "YES";
}

export function getRequiredQuestions(complaintSlug: string): QRow[] {
  return loadQuestions().filter(
    (q) => q.CC_ID === complaintSlug && isRequired(q.REQUIRED)
  );
}

export function getNextRequiredQuestion(params: {
  complaintSlug: string;
  answers: Record<string, any>;
}): QRow | null {
  const req = getRequiredQuestions(params.complaintSlug);
  for (const q of req) {
    if (params.answers[q.Q_ID] === undefined) return q;
  }
  return null;
}

// Keywords that mark a question as safety-critical — these are sent ALONE,
// never batched with other questions, so the patient's answer is unambiguous.
const SAFETY_CRITICAL_KEYWORDS = [
  "thunderclap",
  "worst headache",
  "worst pain of",
  "worst of your life",
  "worst of his life",
  "worst of her life",
  "neurological",
  "deficit",
  "facial droop",
  "arm weakness",
  "leg weakness",
  "slurred speech",
  "cannot breathe",
  "can't breathe",
  "unable to breathe",
  "chest pressure",
  "chest tightness",
  "coughing blood",
  "vomiting blood",
  "unconscious",
  "passing out",
  "loss of consciousness",
];

export function isSafetyCriticalQuestion(q: QRow): boolean {
  const text = q.QUESTION_TEXT.toLowerCase();
  return SAFETY_CRITICAL_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Returns the next 1–3 unanswered required questions for batching.
 * - If the next question is safety-critical it is always returned alone.
 * - Otherwise up to `maxBatchSize` consecutive non-critical questions are returned.
 */
export function getNextQuestionBatch(params: {
  complaintSlug: string;
  answers: Record<string, any>;
  maxBatchSize?: number;
}): QRow[] {
  const { complaintSlug, answers, maxBatchSize = 3 } = params;
  const required  = getRequiredQuestions(complaintSlug);
  const unanswered = required.filter((q) => answers[q.Q_ID] === undefined);
  if (unanswered.length === 0) return [];

  const first = unanswered[0];
  if (isSafetyCriticalQuestion(first)) return [first];

  const batch: QRow[] = [first];
  for (let i = 1; i < unanswered.length && batch.length < maxBatchSize; i++) {
    const q = unanswered[i];
    if (isSafetyCriticalQuestion(q)) break;
    batch.push(q);
  }
  return batch;
}

// Pre-warm: populate cache at module load so the first patient message
// never pays the synchronous file-read cost (~4s for 735 rows → 0ms hot path).
loadQuestions();
