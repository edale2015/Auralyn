import { applyRefinement } from "./adaptiveMappingRefiner";

type ColumnGuess =
  | "complaint"
  | "question"
  | "rule"
  | "modifier"
  | "unknown";

export interface ColumnMapping {
  columnName: string;
  guess: ColumnGuess;
  confidence: number;
}

export interface TabAnalysis {
  tabName: string;
  detectedType: "symptom" | "question" | "modifier" | "algorithm" | "unknown";
  columnMappings: ColumnMapping[];
  confidence: number;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const COLUMN_PATTERNS: { type: ColumnGuess; patterns: string[] }[] = [
  { type: "complaint", patterns: ["complaint", "chief", "symptom"] },
  { type: "question", patterns: ["question", "prompt", "text"] },
  { type: "rule", patterns: ["rule", "redflag", "trigger"] },
  { type: "modifier", patterns: ["modifier", "risk", "factor"] },
];

export function detectColumnType(colName: string): ColumnMapping {
  const refined = applyRefinement(colName);
  if (refined) {
    return {
      columnName: colName,
      guess: refined as ColumnGuess,
      confidence: 1.0,
    };
  }

  const n = normalize(colName);

  for (const group of COLUMN_PATTERNS) {
    for (const p of group.patterns) {
      if (n.includes(p)) {
        return {
          columnName: colName,
          guess: group.type,
          confidence: 0.9,
        };
      }
    }
  }

  return {
    columnName: colName,
    guess: "unknown",
    confidence: 0,
  };
}

export function detectTabType(tabName: string, headers: string[]): TabAnalysis {
  const n = normalize(tabName);

  let detected: TabAnalysis["detectedType"] = "unknown";
  let confidence = 0.5;

  if (n.includes("complaint") || n.includes("symptom")) {
    detected = "symptom";
    confidence = 0.9;
  } else if (n.includes("question")) {
    detected = "question";
    confidence = 0.9;
  } else if (n.includes("modifier")) {
    detected = "modifier";
    confidence = 0.9;
  } else if (n.includes("triage") || n.includes("algorithm")) {
    detected = "algorithm";
    confidence = 0.9;
  }

  const columnMappings = headers.map(detectColumnType);

  return {
    tabName,
    detectedType: detected,
    columnMappings,
    confidence,
  };
}

export function analyzeWorkbook(workbook: Record<string, string[][]>): TabAnalysis[] {
  const analyses: TabAnalysis[] = [];

  for (const [tabName, rows] of Object.entries(workbook)) {
    if (!rows.length) continue;
    const headers = rows[0];
    analyses.push(detectTabType(tabName, headers));
  }

  return analyses;
}
