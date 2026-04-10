import fs from "fs";
import readline from "readline";

export interface IngestResult<T> {
  count:    number;
  records:  T[];
  errors:   Array<{ line: number; raw: string; error: string }>;
  duration: number;
}

export function ingestNdjson<T = Record<string, unknown>>(filePath: string): IngestResult<T> {
  const start   = Date.now();
  const raw     = fs.readFileSync(filePath, "utf-8").trim();
  const lines   = raw.split("\n");
  const records: T[] = [];
  const errors: IngestResult<T>["errors"] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (e: any) {
      errors.push({ line: i + 1, raw: line.slice(0, 80), error: e.message });
    }
  }

  return { count: records.length, records, errors, duration: Date.now() - start };
}

export async function ingestNdjsonStream<T = Record<string, unknown>>(
  filePath: string,
  onRecord: (record: T, index: number) => Promise<void> | void
): Promise<{ count: number; errors: number; duration: number }> {
  const start = Date.now();
  let count = 0;
  let errors = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let i = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as T;
      await onRecord(record, i++);
      count++;
    } catch {
      errors++;
    }
  }

  return { count, errors, duration: Date.now() - start };
}

export function ingestCsv(filePath: string, delimiter = ","): IngestResult<Record<string, string>> {
  const start  = Date.now();
  const lines  = fs.readFileSync(filePath, "utf-8").trim().split("\n");
  const errors: IngestResult<Record<string, string>>["errors"] = [];

  if (lines.length === 0) return { count: 0, records: [], errors, duration: 0 };

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    if (cols.length !== headers.length) {
      errors.push({ line: i + 1, raw: lines[i].slice(0, 80), error: "column count mismatch" });
      continue;
    }
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cols[j].trim().replace(/^"|"$/g, "");
    }
    records.push(record);
  }

  return { count: records.length, records, errors, duration: Date.now() - start };
}
