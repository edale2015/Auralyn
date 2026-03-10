import * as fs from "fs/promises";
import * as path from "path";

type CsvRow = Record<string, string>;

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected: Record<string, any>;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((v) => v.trim());
}

function splitList(value: string): string[] {
  return (value || "")
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeJsonParse(value: string): Record<string, any> {
  if (!value || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function loadCsv(filePath: string): Promise<CsvRow[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function rowToGoldenCase(row: CsvRow): GoldenCase {
  const expected: Record<string, any> = {};

  if (row.expected_complaint_id) {
    expected.complaint_id = row.expected_complaint_id;
  }
  if (row.expected_disposition) {
    expected.disposition = row.expected_disposition;
  }
  if (row.expected_clinical_score_name) {
    expected.clinical_score_name = row.expected_clinical_score_name;
  }
  if (row.expected_clinical_score_min) {
    const n = Number(row.expected_clinical_score_min);
    if (Number.isFinite(n)) expected.clinical_score_min = n;
  }

  const redFlags = splitList(row.expected_red_flag_hits_contains);
  if (redFlags.length) expected.red_flag_hits_contains = redFlags;

  const topDiff = splitList(row.expected_top_differential_contains);
  if (topDiff.length) expected.top_differential_contains = topDiff;

  const affirmed = splitList(row.expected_affirmed_symptoms_contains);
  if (affirmed.length) expected.affirmed_symptoms_contains = affirmed;

  const negated = splitList(row.expected_negated_symptoms_contains);
  if (negated.length) expected.negated_symptoms_contains = negated;

  return {
    id: row.id,
    input: {
      rawText: row.raw_text,
      modifiers: safeJsonParse(row.modifiers_json),
    },
    expected,
  };
}

export async function importGoldenCasesFromCsv(
  inputFile = "goldenCases.template.csv",
  outputFile = "goldenCases.imported.json"
) {
  const inputPath = path.resolve(process.cwd(), "server/testing", inputFile);
  const outputPath = path.resolve(process.cwd(), "server/testing", outputFile);

  const rows = await loadCsv(inputPath);
  const cases = rows.map(rowToGoldenCase);

  await fs.writeFile(outputPath, JSON.stringify(cases, null, 2), "utf8");

  console.log(
    `Imported ${cases.length} golden cases from ${inputFile} -> ${outputFile}`
  );

  return {
    inputFile,
    outputFile,
    count: cases.length,
  };
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("goldenCaseImporter");
if (isMainModule) {
  importGoldenCasesFromCsv().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
