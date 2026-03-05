import fs from "fs";
import path from "path";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const r: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? "";
    rows.push(r);
  }
  return { headers, rows };
}

function csvSafe(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvSafe(r[h] ?? "")).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

type RfPackRule = {
  rf_id: string;
  trigger_expr: string;
  label: string;
  severity: string;
  action: string;
  immediate_actions: string;
  rationale: string;
};

type RfPack = {
  applies_to_cc_ids: string[];
  rules: RfPackRule[];
};

function main() {
  const root = process.cwd();
  const dryRun = process.argv.includes("--dry-run");

  const PACKS_PATH = path.join(root, "data", "complaints", "red_flag_packs.json");
  const RF_PATH = path.join(root, "server", "data", "csv", "RED_FLAG_RULES.csv");

  const packs = JSON.parse(fs.readFileSync(PACKS_PATH, "utf8")) as Record<string, RfPack>;
  const rf = readCsv(RF_PATH);

  const existing = new Set(rf.rows.map((r) => `${r.CC_ID}||${r.RF_ID}`));

  let added = 0;
  let skipped = 0;

  for (const [packId, pack] of Object.entries(packs)) {
    for (const ccId of pack.applies_to_cc_ids) {
      for (const rule of pack.rules) {
        const key = `${ccId}||${rule.rf_id}`;
        if (existing.has(key)) {
          skipped++;
          continue;
        }

        const row: Record<string, string> = {};
        for (const h of rf.headers) row[h] = "";

        row.CC_ID = ccId;
        row.RF_ID = rule.rf_id;
        row.LABEL = rule.label;
        row.TRIGGER_EXPR = rule.trigger_expr;
        row.SEVERITY = rule.severity;
        row.ACTION = rule.action;
        row.IMMEDIATE_ACTIONS = rule.immediate_actions;
        row.RATIONALE = rule.rationale;

        rf.rows.push(row);
        existing.add(key);
        added++;
      }
    }
  }

  if (dryRun) {
    console.log(`[DRY] Would add ${added} red flag rows (${skipped} skipped as duplicates)`);
  } else {
    writeCsv(RF_PATH, rf.headers, rf.rows);
    console.log(`Red flag packs applied. Rows added: ${added} (${skipped} skipped as duplicates)`);
  }
}

main();
