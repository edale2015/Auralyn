import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error("Usage: npx tsx scripts/merge-approved-drafts.ts <complaint_id> [--dry-run]");
    process.exit(2);
  }
  return { complaintId, dryRun: argv.includes("--dry-run") };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const r: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? "";
    rows.push(r);
  }

  return { headers, rows };
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const r of rows) {
    const cols = headers.map((h) => {
      const v = r[h] ?? "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    });
    lines.push(cols.join(","));
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function backupFile(filePath: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(path.dirname(filePath), "_tx_backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.bak.${ts}`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const reviewDir = path.join(root, "data", "complaints", "review", args.complaintId);
  const liveDir = path.join(root, "server", "data", "csv");

  if (!fs.existsSync(reviewDir)) {
    throw new Error(`Review bundle not found: ${reviewDir}`);
  }

  const files = fs.readdirSync(reviewDir).filter((f) => f.endsWith(".new.csv"));

  let totalAdded = 0;

  for (const f of files) {
    const table = f.replace(".new.csv", "");
    const draftPath = path.join(reviewDir, f);
    const livePath = path.join(liveDir, `${table}.csv`);

    const draft = readCsv(draftPath);
    const live = readCsv(livePath);

    if (!draft.headers.length || draft.rows.length === 0) {
      console.log(`${table}: nothing new`);
      continue;
    }

    const mergedHeaders = [...new Set([...live.headers, ...draft.headers])];

    const liveSet = new Set(
      live.rows.map((r) => JSON.stringify(mergedHeaders.map((h) => r[h] ?? "")))
    );

    const toAdd: Record<string, string>[] = [];

    for (const row of draft.rows) {
      const norm = mergedHeaders.map((h) => row[h] ?? "");
      const key = JSON.stringify(norm);

      if (!liveSet.has(key)) {
        const newRow: Record<string, string> = {};
        mergedHeaders.forEach((h, i) => (newRow[h] = norm[i]));
        toAdd.push(newRow);
      }
    }

    if (toAdd.length === 0) {
      console.log(`${table}: nothing new (all duplicates)`);
      continue;
    }

    if (args.dryRun) {
      console.log(`${table}: ${toAdd.length} new rows (dry-run, not written)`);
    } else {
      if (fs.existsSync(livePath)) {
        const backup = backupFile(livePath);
        console.log(`  backup: ${path.relative(root, backup)}`);
      }
      const mergedRows = [...live.rows, ...toAdd];
      writeCsv(livePath, mergedHeaders, mergedRows);
      console.log(`${table}: ${toAdd.length} new rows merged`);
    }

    totalAdded += toAdd.length;
  }

  console.log(`\nMerge ${args.dryRun ? "(dry-run) " : ""}complete. Rows added: ${totalAdded}`);
}

main();
