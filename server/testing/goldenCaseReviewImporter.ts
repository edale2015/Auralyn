import * as fs from "fs/promises";
import * as path from "path";

type CsvRow = Record<string, string>;

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

async function loadCsv(filePath: string): Promise<CsvRow[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export async function importGoldenCaseReviewOverrides(
  inputFile = "goldenCaseReviewImportTemplate.csv",
  outputFile = "goldenCaseReviewOverrides.json"
) {
  const inputPath = path.resolve(process.cwd(), "server/testing", inputFile);
  const outputPath = path.resolve(process.cwd(), "server/testing", outputFile);

  const rows = await loadCsv(inputPath);

  const overrides = rows.map((row) => {
    const expectedOverrides: Record<string, any> = {};

    if (row.expected_complaint_id_override) {
      expectedOverrides.complaint_id = row.expected_complaint_id_override;
    }
    if (row.expected_disposition_override) {
      expectedOverrides.disposition = row.expected_disposition_override;
    }
    if (row.expected_clinical_score_name_override) {
      expectedOverrides.clinical_score_name = row.expected_clinical_score_name_override;
    }
    if (row.expected_clinical_score_min_override) {
      const n = Number(row.expected_clinical_score_min_override);
      if (Number.isFinite(n)) expectedOverrides.clinical_score_min = n;
    }

    const redFlags = splitList(row.expected_red_flag_hits_contains_override);
    if (redFlags.length) expectedOverrides.red_flag_hits_contains = redFlags;

    const topDiff = splitList(row.expected_top_differential_contains_override);
    if (topDiff.length) expectedOverrides.top_differential_contains = topDiff;

    const failureTags = splitList(row.failure_tags);

    return {
      id: row.id,
      review_status: row.review_status || "pending",
      reviewer: row.reviewer || "",
      expected_overrides: expectedOverrides,
      failure_tags: failureTags,
      review_notes: row.review_notes || "",
    };
  });

  await fs.writeFile(outputPath, JSON.stringify(overrides, null, 2), "utf8");
  console.log(`Imported review overrides -> ${outputFile}`);

  return {
    outputFile,
    count: overrides.length,
  };
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("goldenCaseReviewImporter");
if (isMainModule) {
  importGoldenCaseReviewOverrides().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
