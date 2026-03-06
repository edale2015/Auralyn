import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  draftDir?: string;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/harmonize-compiler-output.ts <complaint_id> [--draft-dir <dir>]"
    );
    process.exit(2);
  }
  let draftDir: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--draft-dir") draftDir = argv[++i];
  }
  return { complaintId, draftDir };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
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

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h] ?? "")).join(","));
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function buildQIdPrefix(complaintId: string): string {
  const map: Record<string, string> = {
    sore_throat: "ST",
    sinus_pressure: "SP",
    cough: "C",
    dysuria: "DYS",
    headache: "HA",
    chest_pain: "CCP",
    abdominal_pain: "ABD",
    back_pain: "BKPN",
    derm_rash: "RASH",
    diarrhea: "DIARRHEA",
    allergic_rhinitis: "AR",
    nasal_congestion: "NC",
    anxiety: "ANX",
    hyperglycemia: "GLU",
    gu_uti_symptoms: "UTI",
  };
  return map[complaintId] ?? complaintId.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 10);
}

function buildTokenMap(existingQuestions: Record<string, string>[], prefix: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const q of existingQuestions) {
    const qId = q.Q_ID ?? "";
    const match = qId.match(/^Q_[A-Z0-9_]+_(.+)$/);
    if (match) {
      const bareToken = match[1];
      map.set(bareToken, qId);
    }
  }

  const synonyms: Record<string, string[]> = {
    FEVER: ["FEVER"],
    COUGH: ["COUGH"],
    SOB: ["SOB", "SHORTNESS_BREATH", "SHORTNESS_OF_BREATH"],
    STRIDOR: ["STRIDOR"],
    EXUDATE: ["EXUDATE", "TONSILLAR_EXUDATE", "TONSILLAR_EXUDATES"],
    TENDER_ANT_CERVICAL: ["TENDER_ANT_CERVICAL", "ANTERIOR_CERVICAL", "ANT_CERVICAL_NODES"],
    PLEURITIC: ["PLEURITIC"],
    DIAPHORESIS: ["DIAPHORESIS", "SWEATING"],
    RADIATION: ["RADIATION", "RADIATE"],
    NECK_STIFFNESS: ["NECK_STIFFNESS", "STIFF_NECK"],
    WORST_HEADACHE: ["WORST_HEADACHE", "THUNDERCLAP"],
    VOMITING: ["VOMITING", "VOMIT"],
    DIARRHEA: ["DIARRHEA"],
    FLANK_PAIN: ["FLANK_PAIN"],
    DYSURIA: ["DYSURIA"],
    ITCHY_EYES: ["ITCHY_EYES"],
    SNEEZING: ["SNEEZING"],
    RUNNY_NOSE: ["RUNNY_NOSE", "RHINORRHEA"],
    FACIAL_PAIN: ["FACIAL_PAIN"],
    DOUBLE_SICKENING: ["DOUBLE_SICKENING"],
    DEHYDRATION: ["DEHYDRATION"],
    CONFUSION: ["CONFUSION", "AMS"],
    NEURO_DEFICIT: ["NEURO_DEFICIT", "FOCAL_DEFICIT"],
    WEAKNESS: ["WEAKNESS", "WEAK"],
    SLURRED_SPEECH: ["SLURRED_SPEECH"],
    CHEST_PAIN: ["CHEST_PAIN"],
    SEVERE_PAIN: ["SEVERE_PAIN", "PAIN_SEVERE"],
    PO_INTAKE_POOR: ["PO_INTAKE_POOR"],
    EXERTIONAL: ["EXERTIONAL", "EXERT"],
    ONE_SIDED_PAIN: ["ONE_SIDED_PAIN"],
    DURATION_DAYS: ["DURATION_DAYS", "DUR"],
    SEVERITY: ["SEVERITY", "SEV"],
    PAIN: ["PAIN"],
  };

  for (const [canon, aliases] of Object.entries(synonyms)) {
    for (const alias of aliases) {
      const existingQId = map.get(alias);
      if (existingQId) {
        for (const a of aliases) {
          if (!map.has(a)) map.set(a, existingQId);
        }
        if (!map.has(canon)) map.set(canon, existingQId);
        break;
      }
    }
  }

  return map;
}

function rewriteExpr(expr: string, tokenMap: Map<string, string>): { rewritten: string; changes: string[] } {
  const changes: string[] = [];
  let result = expr;

  const bareTokenPattern = /\b([A-Z][A-Z0-9_]*)\s*(=|>=|<=|>|<)\s*(true|false|-?\d+(?:\.\d+)?)\b/g;

  result = result.replace(bareTokenPattern, (match, token, op, value) => {
    const mapped = tokenMap.get(token);
    if (mapped) {
      const replacement = `answers.${mapped} ${op}${op === "=" ? "=" : ""} ${value === "true" ? "'yes'" : value === "false" ? "'no'" : value}`;
      changes.push(`${token}${op}${value} → ${replacement}`);
      return replacement;
    }
    return match;
  });

  return { rewritten: result, changes };
}

function harmonizeFile(filePath: string, exprColumns: string[], tokenMap: Map<string, string>): number {
  const csv = readCsv(filePath);
  if (!csv.headers.length) return 0;

  let totalChanges = 0;

  for (const row of csv.rows) {
    for (const col of exprColumns) {
      const val = row[col];
      if (!val || val === "false" || val === "true") continue;

      const { rewritten, changes } = rewriteExpr(val, tokenMap);
      if (changes.length > 0) {
        row[col] = rewritten;
        totalChanges += changes.length;
      }
    }
  }

  if (totalChanges > 0) {
    writeCsv(filePath, csv.headers, csv.rows);
  }

  return totalChanges;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const draftDir = args.draftDir
    ? path.isAbsolute(args.draftDir) ? args.draftDir : path.join(root, args.draftDir)
    : path.join(root, "data", "complaints", "emitted", args.complaintId);

  if (!fs.existsSync(draftDir)) {
    throw new Error(`Draft dir not found: ${draftDir}`);
  }

  const prefix = buildQIdPrefix(args.complaintId);

  const liveQuestionsPath = path.join(root, "server", "data", "csv", "CORE_QUESTIONS.csv");
  const liveQuestions = readCsv(liveQuestionsPath);
  const ccQuestions = liveQuestions.rows.filter((r) => r.CC_ID === args.complaintId);

  const draftQuestionsPath = path.join(draftDir, "CORE_QUESTIONS.draft.csv");
  const draftQuestions = readCsv(draftQuestionsPath);

  const allQuestions = [...ccQuestions, ...draftQuestions.rows];

  const tokenMap = buildTokenMap(allQuestions, prefix);

  console.log(`Token map for ${args.complaintId} (prefix=${prefix}):`);
  console.log(`  Known mappings: ${tokenMap.size}`);

  const filesToHarmonize: Array<{ file: string; exprCols: string[] }> = [
    { file: "CLUSTER_SCORING_RULES.draft.csv", exprCols: ["WHEN_EXPR"] },
    { file: "RED_FLAG_RULES.draft.csv", exprCols: ["TRIGGER_EXPR"] },
    { file: "DISPOSITION_RULES.draft.csv", exprCols: ["WHEN_EXPR"] },
  ];

  let totalChanges = 0;

  for (const spec of filesToHarmonize) {
    const filePath = path.join(draftDir, spec.file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${spec.file}: not found, skipping`);
      continue;
    }
    const changes = harmonizeFile(filePath, spec.exprCols, tokenMap);
    console.log(`  ${spec.file}: ${changes} expression rewrites`);
    totalChanges += changes;
  }

  const qDraft = readCsv(draftQuestionsPath);
  let qRenames = 0;
  if (qDraft.headers.length) {
    for (const row of qDraft.rows) {
      const qId = row.Q_ID ?? "";
      if (!qId.startsWith(`Q_${prefix}_`)) {
        const match = qId.match(/^Q_[A-Z0-9_]+_(.+)$/);
        if (match) {
          const newQId = `Q_${prefix}_${match[1]}`;
          row.Q_ID = newQId;
          qRenames++;
        }
      }
    }
    if (qRenames > 0) {
      writeCsv(draftQuestionsPath, qDraft.headers, qDraft.rows);
    }
    console.log(`  CORE_QUESTIONS.draft.csv: ${qRenames} Q_ID prefix rewrites`);
  }

  console.log(`\nHarmonization complete. Total changes: ${totalChanges + qRenames}`);
}

main();
