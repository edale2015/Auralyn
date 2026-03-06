import fs from "fs";
import path from "path";

type Args = {
  complaintId?: string;
  draftDir?: string;
  outDir?: string;
};

type TableSpec = {
  name: string;
  livePath: string;
  draftPath: string;
  keyCols: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  if (argv[0] && !argv[0].startsWith("--")) args.complaintId = argv[0];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--draft-dir") args.draftDir = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
  }

  if (!args.complaintId && !args.draftDir) {
    console.error(
      "Usage: npx tsx scripts/review-emitted-drafts.ts <complaint_id> [--draft-dir <dir>] [--out-dir <dir>]"
    );
    process.exit(2);
  }

  return args;
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
      } else {
        inQuotes = !inQuotes;
      }
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
  if (!fs.existsSync(filePath)) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }

  return { headers, rows };
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function stableRowString(row: Record<string, string>, headers: string[]): string {
  return headers.map((h) => `${h}=${row[h] ?? ""}`).join("||");
}

function makeKey(row: Record<string, string>, keyCols: string[]): string {
  return keyCols.map((k) => row[k] ?? "").join("||");
}

function normalizeRowToHeaders(row: Record<string, string>, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) out[h] = row[h] ?? "";
  return out;
}

function unionHeaders(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function reviewTable(spec: TableSpec, outDir: string) {
  const live = readCsv(spec.livePath);
  const draft = readCsv(spec.draftPath);

  if (!draft.headers.length) {
    return {
      table: spec.name,
      draft_present: false,
      live_present: live.headers.length > 0,
      new_rows: 0,
      conflict_rows: 0,
      exact_rows: 0,
    };
  }

  const mergedHeaders = unionHeaders(live.headers, draft.headers);

  const liveMap = new Map<string, Record<string, string>>();
  for (const row of live.rows) {
    liveMap.set(makeKey(row, spec.keyCols), normalizeRowToHeaders(row, mergedHeaders));
  }

  const newRows: Record<string, string>[] = [];
  const conflicts: Record<string, string>[] = [];
  let exact = 0;

  for (const row of draft.rows) {
    const normDraft = normalizeRowToHeaders(row, mergedHeaders);
    const key = makeKey(normDraft, spec.keyCols);

    const liveRow = liveMap.get(key);
    if (!liveRow) {
      newRows.push(normDraft);
      continue;
    }

    const same =
      stableRowString(liveRow, mergedHeaders) ===
      stableRowString(normDraft, mergedHeaders);
    if (same) {
      exact++;
      continue;
    }

    const conflictRow: Record<string, string> = {};
    for (const k of spec.keyCols) conflictRow[`KEY_${k}`] = normDraft[k] ?? "";
    for (const h of mergedHeaders) {
      conflictRow[`LIVE_${h}`] = liveRow[h] ?? "";
      conflictRow[`DRAFT_${h}`] = normDraft[h] ?? "";
    }
    conflicts.push(conflictRow);
  }

  const newPath = path.join(outDir, `${spec.name}.new.csv`);
  const conflictPath = path.join(outDir, `${spec.name}.conflicts.csv`);

  writeCsv(newPath, mergedHeaders, newRows);

  const conflictHeaders = [
    ...spec.keyCols.map((k) => `KEY_${k}`),
    ...mergedHeaders.flatMap((h) => [`LIVE_${h}`, `DRAFT_${h}`]),
  ];
  writeCsv(conflictPath, conflictHeaders, conflicts);

  return {
    table: spec.name,
    draft_present: true,
    live_present: live.headers.length > 0,
    new_rows: newRows.length,
    conflict_rows: conflicts.length,
    exact_rows: exact,
    files: {
      new: newPath,
      conflicts: conflictPath,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const complaintId =
    args.complaintId ??
    path.basename(
      path.isAbsolute(args.draftDir!) ? args.draftDir! : path.join(root, args.draftDir!)
    );

  const draftDir = args.draftDir
    ? path.isAbsolute(args.draftDir)
      ? args.draftDir
      : path.join(root, args.draftDir)
    : path.join(root, "data", "complaints", "emitted", complaintId);

  const outDir = args.outDir
    ? path.isAbsolute(args.outDir)
      ? args.outDir
      : path.join(root, args.outDir)
    : path.join(root, "data", "complaints", "review", complaintId);

  if (!fs.existsSync(draftDir)) {
    throw new Error(`Draft dir not found: ${draftDir}`);
  }

  const liveBase = path.join(root, "server", "data", "csv");

  const tables: TableSpec[] = [
    {
      name: "CORE_QUESTIONS",
      livePath: path.join(liveBase, "CORE_QUESTIONS.csv"),
      draftPath: path.join(draftDir, "CORE_QUESTIONS.draft.csv"),
      keyCols: ["CC_ID", "Q_ID"],
    },
    {
      name: "RED_FLAG_RULES",
      livePath: path.join(liveBase, "RED_FLAG_RULES.csv"),
      draftPath: path.join(draftDir, "RED_FLAG_RULES.draft.csv"),
      keyCols: ["CC_ID", "RF_ID"],
    },
    {
      name: "CLUSTER_SCORING_RULES",
      livePath: path.join(liveBase, "CLUSTER_SCORING_RULES.csv"),
      draftPath: path.join(draftDir, "CLUSTER_SCORING_RULES.draft.csv"),
      keyCols: ["CC_ID", "RULE_ID"],
    },
    {
      name: "DISPOSITION_RULES",
      livePath: path.join(liveBase, "DISPOSITION_RULES.csv"),
      draftPath: path.join(draftDir, "DISPOSITION_RULES.draft.csv"),
      keyCols: ["CC_ID", "DISP_RULE_ID"],
    },
    {
      name: "DX_PRIORITY",
      livePath: path.join(liveBase, "DX_PRIORITY.csv"),
      draftPath: path.join(draftDir, "DX_PRIORITY.draft.csv"),
      keyCols: ["CC_ID", "CLUSTER_ID"],
    },
  ];

  fs.mkdirSync(outDir, { recursive: true });

  const results = tables.map((t) => reviewTable(t, outDir));

  const summary = {
    complaint_id: complaintId,
    draft_dir: draftDir,
    out_dir: outDir,
    reviewed_at: new Date().toISOString(),
    tables: results,
    totals: {
      new_rows: results.reduce((a, r) => a + r.new_rows, 0),
      conflict_rows: results.reduce((a, r) => a + r.conflict_rows, 0),
      exact_rows: results.reduce((a, r) => a + r.exact_rows, 0),
    },
  };

  fs.writeFileSync(
    path.join(outDir, "review_summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );

  console.log(`Review bundle created: ${outDir}`);
  console.log(`New rows: ${summary.totals.new_rows}`);
  console.log(`Conflicts: ${summary.totals.conflict_rows}`);
  console.log(`Exact matches: ${summary.totals.exact_rows}`);
}

main();
