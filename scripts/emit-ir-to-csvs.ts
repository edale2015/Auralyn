import fs from "fs";
import path from "path";

type Args = {
  complaintId?: string;
  inPath?: string;
  outDir?: string;
};

type IRModifier = {
  token: string;
  type: "yesno" | "number" | "text";
  label: string;
};

type IRQuestion = {
  token: string;
  type: "yesno" | "number" | "text";
  question_text: string;
  required: boolean;
  category: "modifier" | "core" | "red_flag_probe" | "followup";
  evidence_for: string[];
};

type IRRedFlag = {
  label: string;
  when_text: string;
  suggested_tokens: string[];
  action: "ER_SEND" | "ESCALATE" | "URGENT";
  rationale: string;
  normalized_rules?: string[];
  unresolved_fragments?: string[];
};

type IRCluster = {
  dx_id: string;
  dx_label: string;
  tier: "PRIMARY" | "SECONDARY" | "BENIGN";
  evidence_text: string[];
  suggested_rules: string[];
  normalized_rules?: string[];
  unresolved_fragments?: string[];
};

type IRDisposition = {
  when_text: string;
  suggested_rules: string[];
  disposition: "ER" | "URGENT_CARE" | "PCP" | "SELF_CARE";
  normalized_rules?: string[];
  unresolved_fragments?: string[];
};

type NormalizedIR = {
  complaint_id: string;
  display_name: string;
  source: {
    title: string;
    source_type: "text";
    path: string;
    compiled_at: string;
  };
  modifiers: IRModifier[];
  questions: IRQuestion[];
  red_flags: IRRedFlag[];
  clusters: IRCluster[];
  disposition_logic: IRDisposition[];
  notes: string[];
  unmapped_phrases: string[];
  normalization: {
    normalized_at: string;
    token_dictionary_version: string;
    unresolved_count: number;
  };
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  if (argv[0] && !argv[0].startsWith("--")) args.complaintId = argv[0];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") args.inPath = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
  }

  if (!args.complaintId && !args.inPath) {
    console.error(
      "Usage: npx tsx scripts/emit-ir-to-csvs.ts <complaint_id> [--in <input.json>] [--out-dir <dir>]"
    );
    process.exit(2);
  }

  return args;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function safeUpperToken(s: string): string {
  return (s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function toInputPath(root: string, args: Args): string {
  if (args.inPath) return path.isAbsolute(args.inPath) ? args.inPath : path.join(root, args.inPath);
  return path.join(root, "data", "complaints", "ir_normalized", `${args.complaintId}.json`);
}

function toOutputDir(root: string, args: Args, complaintId: string): string {
  if (args.outDir) return path.isAbsolute(args.outDir) ? args.outDir : path.join(root, args.outDir);
  return path.join(root, "data", "complaints", "emitted", complaintId);
}

function toAnswerType(t: IRQuestion["type"]): string {
  if (t === "number") return "number";
  if (t === "text") return "text";
  return "yesno";
}

function mapDispositionToLevel(d: IRDisposition["disposition"]): string {
  if (d === "ER") return "ER_SEND";
  if (d === "URGENT_CARE") return "URGENT";
  if (d === "PCP") return "PCP";
  return "SELF_CARE";
}

function mapRfAction(a: IRRedFlag["action"]): string {
  if (a === "ER_SEND") return "ER_SEND";
  if (a === "URGENT") return "URGENT";
  return "ESCALATE";
}

function clusterPrefixFor(complaintId: string): string {
  return safeUpperToken(complaintId).slice(0, 18);
}

function emitCoreQuestions(ir: NormalizedIR): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  const allQuestions = uniq(
    [
      ...ir.modifiers.map((m) => ({
        token: m.token,
        type: m.type,
        question_text: m.label,
        required: true,
        category: "modifier" as const,
        evidence_for: [] as string[],
      })),
      ...ir.questions,
    ].map((q) => JSON.stringify(q))
  ).map((s) => JSON.parse(s));

  let askOrder = 10;
  for (const q of allQuestions) {
    rows.push({
      CC_ID: ir.complaint_id,
      VERSION: "v1",
      Q_ID: `Q_${safeUpperToken(ir.complaint_id)}_${safeUpperToken(q.token)}`,
      ASK_ORDER: String(askOrder),
      QUESTION_TEXT: q.question_text,
      ANSWER_TYPE: toAnswerType(q.type),
      REQUIRED: q.required ? "true" : "false",
      ASK_IF: "",
      CATEGORY: q.category,
    });
    askOrder += 10;
  }

  return rows;
}

function emitRedFlagRules(ir: NormalizedIR): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const prefix = clusterPrefixFor(ir.complaint_id);

  let seq = 1;
  for (const rf of ir.red_flags) {
    const exprs = uniq(rf.normalized_rules ?? []);
    const triggerExpr =
      exprs.length === 0
        ? "false"
        : exprs.length === 1
          ? exprs[0]
          : `ANY(${exprs.join(", ")})`;

    rows.push({
      CC_ID: ir.complaint_id,
      RF_ID: `RF_${prefix}_${String(seq).padStart(2, "0")}`,
      TRIGGER_EXPR: triggerExpr,
      SEVERITY: mapRfAction(rf.action),
      ACTION: mapRfAction(rf.action),
      IMMEDIATE_ACTIONS: rf.label,
      RATIONALE: rf.rationale || rf.when_text,
    });

    seq++;
  }

  return rows;
}

function emitClusterScoringRules(ir: NormalizedIR): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const prefix = clusterPrefixFor(ir.complaint_id);

  let seq = 1;
  for (const cl of ir.clusters) {
    const exprs = uniq(cl.normalized_rules ?? []);
    const whenExpr =
      exprs.length === 0
        ? "false"
        : exprs.length === 1
          ? exprs[0]
          : `ALL(${exprs.join(", ")})`;

    const clusterId = `CL_${prefix}_${cl.tier}`;
    const points =
      cl.tier === "PRIMARY"
        ? "120"
        : cl.tier === "SECONDARY"
          ? "80"
          : "40";

    rows.push({
      CC_ID: ir.complaint_id,
      CLUSTER_ID: clusterId,
      RULE_ID: `CSR_${prefix}_${String(seq).padStart(2, "0")}`,
      POINTS: points,
      WHEN_EXPR: whenExpr,
      EVIDENCE_LABEL: cl.dx_id,
    });

    seq++;
  }

  return rows;
}

function emitDispositionRules(ir: NormalizedIR): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const prefix = clusterPrefixFor(ir.complaint_id);

  let seq = 1;
  for (const d of ir.disposition_logic) {
    const exprs = uniq(d.normalized_rules ?? []);
    const whenExpr =
      exprs.length === 0
        ? "false"
        : exprs.length === 1
          ? exprs[0]
          : `ANY(${exprs.join(", ")})`;

    rows.push({
      CC_ID: ir.complaint_id,
      DISP_RULE_ID: `DR_${prefix}_${String(seq).padStart(2, "0")}`,
      PRIORITY: String(1000 - seq),
      WHEN_EXPR: whenExpr,
      DISPOSITION_LEVEL: mapDispositionToLevel(d.disposition),
      RATIONALE_TEMPLATE_ID: "",
      CONFIDENCE_HINT:
        d.disposition === "ER"
          ? "HIGH"
          : d.disposition === "URGENT_CARE"
            ? "MODERATE"
            : "LOW",
    });

    seq++;
  }

  if (rows.length === 0) {
    rows.push({
      CC_ID: ir.complaint_id,
      DISP_RULE_ID: `DR_${prefix}_DEFAULT`,
      PRIORITY: "1",
      WHEN_EXPR: "true",
      DISPOSITION_LEVEL: "SELF_CARE",
      RATIONALE_TEMPLATE_ID: "",
      CONFIDENCE_HINT: "LOW",
    });
  }

  return rows;
}

function emitDxPriority(ir: NormalizedIR): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const prefix = clusterPrefixFor(ir.complaint_id);

  const seen = new Set<string>();
  for (const tier of ["PRIMARY", "SECONDARY", "BENIGN"] as const) {
    const clusterId = `CL_${prefix}_${tier}`;
    if (seen.has(clusterId)) continue;
    seen.add(clusterId);

    rows.push({
      CC_ID: ir.complaint_id,
      CLUSTER_ID: clusterId,
      PRIORITY:
        tier === "PRIMARY"
          ? "100"
          : tier === "SECONDARY"
            ? "70"
            : "50",
    });
  }

  return rows;
}

function buildManifest(
  ir: NormalizedIR,
  files: Record<string, string>,
  counts: Record<string, number>
) {
  return {
    complaint_id: ir.complaint_id,
    display_name: ir.display_name,
    source: ir.source,
    normalization: ir.normalization,
    emitted_at: new Date().toISOString(),
    files,
    counts,
    notes: [
      "Draft emission only. Review before merging into live CSVs.",
      `Unmapped phrases retained: ${ir.unmapped_phrases.length}`,
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inPath = toInputPath(root, args);
  if (!fs.existsSync(inPath)) {
    throw new Error(`Normalized IR not found: ${inPath}`);
  }

  const ir = JSON.parse(fs.readFileSync(inPath, "utf8")) as NormalizedIR;
  const outDir = toOutputDir(root, args, ir.complaint_id);
  fs.mkdirSync(outDir, { recursive: true });

  const coreQuestions = emitCoreQuestions(ir);
  const redFlags = emitRedFlagRules(ir);
  const clusterScoring = emitClusterScoringRules(ir);
  const dispositionRules = emitDispositionRules(ir);
  const dxPriority = emitDxPriority(ir);

  const files: Record<string, string> = {
    core_questions: path.join(outDir, "CORE_QUESTIONS.draft.csv"),
    red_flag_rules: path.join(outDir, "RED_FLAG_RULES.draft.csv"),
    cluster_scoring_rules: path.join(outDir, "CLUSTER_SCORING_RULES.draft.csv"),
    disposition_rules: path.join(outDir, "DISPOSITION_RULES.draft.csv"),
    dx_priority: path.join(outDir, "DX_PRIORITY.draft.csv"),
    manifest: path.join(outDir, "manifest.json"),
  };

  writeCsv(
    files.core_questions,
    ["CC_ID", "VERSION", "Q_ID", "ASK_ORDER", "QUESTION_TEXT", "ANSWER_TYPE", "REQUIRED", "ASK_IF", "CATEGORY"],
    coreQuestions
  );

  writeCsv(
    files.red_flag_rules,
    ["CC_ID", "RF_ID", "TRIGGER_EXPR", "SEVERITY", "ACTION", "IMMEDIATE_ACTIONS", "RATIONALE"],
    redFlags
  );

  writeCsv(
    files.cluster_scoring_rules,
    ["CC_ID", "CLUSTER_ID", "RULE_ID", "POINTS", "WHEN_EXPR", "EVIDENCE_LABEL"],
    clusterScoring
  );

  writeCsv(
    files.disposition_rules,
    ["CC_ID", "DISP_RULE_ID", "PRIORITY", "WHEN_EXPR", "DISPOSITION_LEVEL", "RATIONALE_TEMPLATE_ID", "CONFIDENCE_HINT"],
    dispositionRules
  );

  writeCsv(
    files.dx_priority,
    ["CC_ID", "CLUSTER_ID", "PRIORITY"],
    dxPriority
  );

  const manifest = buildManifest(ir, files, {
    core_questions: coreQuestions.length,
    red_flag_rules: redFlags.length,
    cluster_scoring_rules: clusterScoring.length,
    disposition_rules: dispositionRules.length,
    dx_priority: dxPriority.length,
  });

  fs.writeFileSync(files.manifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Emitted draft CSVs for ${ir.complaint_id}`);
  console.log(`Output dir: ${outDir}`);
  console.log(`CORE_QUESTIONS: ${coreQuestions.length}`);
  console.log(`RED_FLAG_RULES: ${redFlags.length}`);
  console.log(`CLUSTER_SCORING_RULES: ${clusterScoring.length}`);
  console.log(`DISPOSITION_RULES: ${dispositionRules.length}`);
  console.log(`DX_PRIORITY: ${dxPriority.length}`);
  console.log(`Unmapped phrases retained: ${ir.unmapped_phrases.length}`);
}

main();
