import path from "path";
import { loadCsvFile } from "../../data/csvLoader";

export interface SyntheticCase {
  caseId: string;
  complaintId: string;
  answers: Record<string, unknown>;
  expectedDisposition?: string;
  metadata: { generated: true; seed: number };
}

interface QuestionDef {
  qId: string;
  answerType: string;
  required: boolean;
  askIf: string;
  category: string;
}

interface DispositionRule {
  ruleId: string;
  priority: number;
  whenExpr: string;
  dispositionLevel: string;
}

const CSV_DIR = path.resolve(process.cwd(), "server/data/csv");

let questionsCache: Record<string, QuestionDef[]> | null = null;
let dispositionCache: Record<string, DispositionRule[]> | null = null;

function loadQuestionsByComplaint(): Record<string, QuestionDef[]> {
  if (questionsCache) return questionsCache;
  const rows = loadCsvFile(path.join(CSV_DIR, "CORE_QUESTIONS.csv"));
  const map: Record<string, QuestionDef[]> = {};
  for (const row of rows) {
    const ccId = row.CC_ID;
    if (!ccId) continue;
    if (!map[ccId]) map[ccId] = [];
    map[ccId].push({
      qId: row.Q_ID,
      answerType: (row.ANSWER_TYPE || "tri").toLowerCase(),
      required: row.REQUIRED === "TRUE",
      askIf: row.ASK_IF || "true",
      category: row.CATEGORY || "",
    });
  }
  questionsCache = map;
  return map;
}

function loadDispositionsByComplaint(): Record<string, DispositionRule[]> {
  if (dispositionCache) return dispositionCache;
  const rows = loadCsvFile(path.join(CSV_DIR, "DISPOSITION_RULES.csv"));
  const map: Record<string, DispositionRule[]> = {};
  for (const row of rows) {
    const ccId = row.CC_ID;
    if (!ccId) continue;
    if (!map[ccId]) map[ccId] = [];
    map[ccId].push({
      ruleId: row.DISP_RULE_ID,
      priority: parseInt(row.PRIORITY, 10) || 99,
      whenExpr: row.WHEN_EXPR || "true",
      dispositionLevel: row.DISPOSITION_LEVEL || "routine",
    });
  }
  for (const ccId of Object.keys(map)) {
    map[ccId].sort((a, b) => a.priority - b.priority);
  }
  dispositionCache = map;
  return map;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateRandomAnswer(answerType: string, rand: () => number): unknown {
  switch (answerType) {
    case "tri": {
      const r = rand();
      if (r < 0.4) return "yes";
      if (r < 0.8) return "no";
      return "unsure";
    }
    case "boolean":
    case "bool":
      return rand() < 0.5 ? "yes" : "no";
    case "number": {
      const r = rand();
      if (r < 0.3) return Math.floor(rand() * 3) + 1;
      if (r < 0.6) return Math.floor(rand() * 7) + 3;
      if (r < 0.85) return Math.floor(rand() * 14) + 7;
      return Math.floor(rand() * 30) + 14;
    }
    case "select":
    case "choice":
      return rand() < 0.5 ? "yes" : "no";
    default:
      return rand() < 0.5 ? "yes" : "no";
  }
}

function evaluateSimpleCondition(
  expr: string,
  answers: Record<string, unknown>,
): boolean {
  if (!expr || expr === "true") return true;
  if (expr === "false") return false;

  // FIX: was `new Function(...)` — a tampered CSV file could achieve server-side
  // code execution. Replaced with vm.runInNewContext() using a restricted sandbox
  // that only exposes interpolated string/number literals (no globals, no require).
  try {
    const safeExpr = expr
      .replace(/answers\.(\w+)/g, (_, key) => {
        const val = answers[key];
        if (val === undefined || val === null) return "undefined";
        if (typeof val === "number") return String(val);
        return `"${String(val).replace(/"/g, '\\"')}"`;
      })
      .replace(/scores\.\w+/g, "0")
      .replace(/redFlagGate\.gateResult/g, '"NONE"');

    // Sandbox has no prototype chain and no Node.js globals
    const sandbox = Object.create(null);
    const script  = new (require("vm").Script)(`!!(${safeExpr})`, { filename: "synthetic-case-rule" });
    return script.runInNewContext(sandbox, { timeout: 20 });
  } catch {
    return false;
  }
}

function estimateDisposition(
  complaintId: string,
  answers: Record<string, unknown>,
): string | undefined {
  const dispMap = loadDispositionsByComplaint();
  const rules = dispMap[complaintId];
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    if (evaluateSimpleCondition(rule.whenExpr, answers)) {
      return rule.dispositionLevel;
    }
  }

  return "routine";
}

export function generateSyntheticCases(
  complaintId: string,
  count = 10,
): SyntheticCase[] {
  const qMap = loadQuestionsByComplaint();
  const questions = qMap[complaintId];
  const cases: SyntheticCase[] = [];

  if (!questions || questions.length === 0) {
    for (let i = 0; i < count; i++) {
      const seed = Date.now() + i;
      cases.push({
        caseId: `synth_${complaintId}_${seed}`,
        complaintId,
        answers: {},
        metadata: { generated: true, seed },
      });
    }
    return cases;
  }

  for (let i = 0; i < count; i++) {
    const seed = Date.now() + i;
    const rand = seededRandom(seed);
    const answers: Record<string, unknown> = {};

    for (const q of questions) {
      const shouldAsk = evaluateSimpleCondition(q.askIf, answers);
      if (!shouldAsk && !q.required) continue;

      if (!q.required && rand() < 0.3) continue;

      answers[q.qId] = generateRandomAnswer(q.answerType, rand);
    }

    const expectedDisposition = estimateDisposition(complaintId, answers);

    cases.push({
      caseId: `synth_${complaintId}_${seed}`,
      complaintId,
      answers,
      expectedDisposition,
      metadata: { generated: true, seed },
    });
  }

  return cases;
}

export function listAvailableComplaints(): string[] {
  const qMap = loadQuestionsByComplaint();
  return Object.keys(qMap).sort();
}

export function clearSyntheticCaches(): void {
  questionsCache = null;
  dispositionCache = null;
}
