import fs from "node:fs";
import path from "node:path";

type QRow = {
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

// Pre-warm: populate cache at module load so the first patient message
// never pays the synchronous file-read cost (~4s for 735 rows → 0ms hot path).
loadQuestions();
