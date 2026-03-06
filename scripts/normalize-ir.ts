import fs from "fs";
import path from "path";

type RuleLike = string;

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

type GuidelineIR = {
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
};

type NormalizedIR = GuidelineIR & {
  normalization: {
    normalized_at: string;
    token_dictionary_version: string;
    unresolved_count: number;
  };
};

type Args = {
  complaintId?: string;
  inPath?: string;
  outPath?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  if (argv[0] && !argv[0].startsWith("--")) args.complaintId = argv[0];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") args.inPath = argv[++i];
    else if (a === "--out") args.outPath = argv[++i];
  }

  if (!args.complaintId && !args.inPath) {
    console.error(
      "Usage: npx tsx scripts/normalize-ir.ts <complaint_id> [--in <input.json>] [--out <output.json>]"
    );
    process.exit(2);
  }

  return args;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function normalizeText(s: string): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

function toInputPath(root: string, args: Args): string {
  if (args.inPath) return path.isAbsolute(args.inPath) ? args.inPath : path.join(root, args.inPath);
  return path.join(root, "data", "complaints", "ir", `${args.complaintId}.json`);
}

function toOutputPath(root: string, args: Args): string {
  if (args.outPath) return path.isAbsolute(args.outPath) ? args.outPath : path.join(root, args.outPath);
  return path.join(root, "data", "complaints", "ir_normalized", `${args.complaintId}.json`);
}

const TOKEN_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  { pattern: /\bshortness of breath\b|\bdifficulty breathing\b|\bsob\b/gi, replacement: "SOB=true" },
  { pattern: /\bstridor\b/gi, replacement: "STRIDOR=true" },
  { pattern: /\bfever\b/gi, replacement: "FEVER=true" },
  { pattern: /\babsence of cough\b|\bno cough\b|\bcough absent\b/gi, replacement: "COUGH=false" },
  { pattern: /\bcough\b/gi, replacement: "COUGH=true" },
  { pattern: /\btonsillar exudates?\b|\bexudates?\b/gi, replacement: "EXUDATE=true" },
  { pattern: /\btender anterior cervical adenopathy\b|\btender anterior cervical nodes?\b/gi, replacement: "TENDER_ANT_CERVICAL=true" },
  { pattern: /\bpleuritic\b|\bpain with breathing\b|\bpain worse with breathing\b/gi, replacement: "PLEURITIC=true" },
  { pattern: /\bdiaphoresis\b|\bsweating\b/gi, replacement: "DIAPHORESIS=true" },
  { pattern: /\bradiation\b|\bradiates\b/gi, replacement: "RADIATION=true" },
  { pattern: /\bneck stiffness\b|\bstiff neck\b/gi, replacement: "NECK_STIFFNESS=true" },
  { pattern: /\bworst headache\b|\bthunderclap\b/gi, replacement: "WORST_HEADACHE=true" },
  { pattern: /\bvomiting\b|\bvomit\b/gi, replacement: "VOMITING=true" },
  { pattern: /\bdiarrhea\b/gi, replacement: "DIARRHEA=true" },
  { pattern: /\bflank pain\b/gi, replacement: "FLANK_PAIN=true" },
  { pattern: /\bdysuria\b|\bpainful urination\b|\bburning urination\b/gi, replacement: "DYSURIA=true" },
  { pattern: /\bitchy eyes\b/gi, replacement: "ITCHY_EYES=true" },
  { pattern: /\bsneezing\b/gi, replacement: "SNEEZING=true" },
  { pattern: /\brunny nose\b|\brhinorrhea\b/gi, replacement: "RUNNY_NOSE=true" },
  { pattern: /\bfacial pain\b|\bfacial pressure\b|\bface pain\b/gi, replacement: "FACIAL_PAIN=true" },
  { pattern: /\bdouble sickening\b|\bworsening after initial improvement\b/gi, replacement: "DOUBLE_SICKENING=true" },
  { pattern: /\bdehydration\b/gi, replacement: "DEHYDRATION=true" },
  { pattern: /\baltered mental status\b|\bconfusion\b/gi, replacement: "CONFUSION=true" },
  { pattern: /\bneurologic deficit\b|\bfocal neurologic deficit\b|\bfocal deficit\b/gi, replacement: "NEURO_DEFICIT=true" },
  { pattern: /\bweakness\b/gi, replacement: "WEAKNESS=true" },
  { pattern: /\bslurred speech\b/gi, replacement: "SLURRED_SPEECH=true" },
  { pattern: /\bchest pain\b/gi, replacement: "CHEST_PAIN=true" },
  { pattern: /\bsevere pain\b/gi, replacement: "SEVERE_PAIN=true" },
  { pattern: /\bunable to tolerate oral intake\b|\bpoor oral intake\b/gi, replacement: "PO_INTAKE_POOR=true" },
  { pattern: /\bexertional\b/gi, replacement: "EXERTIONAL=true" },
  { pattern: /\bone[- ]sided pain\b|\bunilateral pain\b/gi, replacement: "ONE_SIDED_PAIN=true" },
];

const NUMERIC_PATTERNS: Array<{
  pattern: RegExp;
  toExpr: (m: RegExpMatchArray) => string;
}> = [
  {
    pattern: /\bmore than (\d+)\s+days?\b/gi,
    toExpr: (m) => `DURATION_DAYS>${m[1]}`,
  },
  {
    pattern: /\b(\d+)\+?\s*days?\b/gi,
    toExpr: (m) => `DURATION_DAYS>=${m[1]}`,
  },
  {
    pattern: /\bgreater than (\d+)\b/gi,
    toExpr: (m) => `VALUE>${m[1]}`,
  },
  {
    pattern: /\bfever above (\d+(?:\.\d+)?)\s*(?:c|°c)\b/gi,
    toExpr: (m) => `TEMP_C>${m[1]}`,
  },
  {
    pattern: /\bfever above (\d+(?:\.\d+)?)\s*(?:f|°f)\b/gi,
    toExpr: (m) => `TEMP_F>${m[1]}`,
  },
];

function extractDirectExpressions(text: string): string[] {
  const normalized = normalizeText(text);
  const found: string[] = [];

  const direct = normalized.match(/\b[A-Z][A-Z0-9_]*\s*(?:=|>=|<=|>|<)\s*(?:true|false|-?\d+(?:\.\d+)?)\b/g);
  if (direct) found.push(...direct.map((s) => s.replace(/\s+/g, "")));

  for (const spec of NUMERIC_PATTERNS) {
    for (const m of normalized.matchAll(spec.pattern)) {
      found.push(spec.toExpr(m));
    }
  }

  for (const spec of TOKEN_PATTERNS) {
    if (spec.pattern.test(normalized)) {
      spec.pattern.lastIndex = 0;
      found.push(spec.replacement);
    }
  }

  return uniq(found);
}

function removeMappedFragments(text: string): string {
  let s = normalizeText(text);

  s = s.replace(/\b[A-Z][A-Z0-9_]*\s*(?:=|>=|<=|>|<)\s*(?:true|false|-?\d+(?:\.\d+)?)\b/g, " ");

  for (const spec of NUMERIC_PATTERNS) {
    s = s.replace(spec.pattern, " ");
  }
  for (const spec of TOKEN_PATTERNS) {
    s = s.replace(spec.pattern, " ");
  }

  s = s
    .replace(/\b(and|or|with|without|include|includes|including|suggesting|suggests|require|requires|for|of|possible|likely|reasonable|evaluation)\b/gi, " ")
    .replace(/[,:;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

function normalizeRuleList(rules: RuleLike[]): { normalized: string[]; unresolved: string[] } {
  const normalized: string[] = [];
  const unresolved: string[] = [];

  for (const raw of rules) {
    const text = normalizeText(raw);
    if (!text) continue;

    const exprs = extractDirectExpressions(text);
    normalized.push(...exprs);

    const remainder = removeMappedFragments(text);
    if (remainder && remainder.length >= 4) {
      unresolved.push(remainder);
    }
  }

  return {
    normalized: uniq(normalized),
    unresolved: uniq(unresolved),
  };
}

function enrichQuestionsFromNormalizedRules(ir: GuidelineIR): GuidelineIR {
  const existingTokens = new Set(ir.questions.map((q) => q.token));

  function maybeAddQuestion(token: string) {
    if (existingTokens.has(token)) return;
    if (!/^[A-Z][A-Z0-9_]*$/.test(token)) return;

    const q =
      token === "DURATION_DAYS"
        ? {
            token,
            type: "number" as const,
            question_text: "How many days have symptoms been present?",
            required: true,
            category: "core" as const,
            evidence_for: [] as string[],
          }
        : {
            token,
            type: "yesno" as const,
            question_text: `Does the patient have ${token.toLowerCase().replace(/_/g, " ")}?`,
            required: true,
            category: "followup" as const,
            evidence_for: [] as string[],
          };

    ir.questions.push(q);
    existingTokens.add(token);
  }

  const buckets: Array<Array<string | undefined>> = [
    ...ir.clusters.map((c) => c.normalized_rules),
    ...ir.red_flags.map((r) => r.normalized_rules),
    ...ir.disposition_logic.map((d) => d.normalized_rules),
  ];

  for (const rules of buckets) {
    for (const expr of rules ?? []) {
      const m = expr.match(/^([A-Z][A-Z0-9_]*)\s*(?:=|>=|<=|>|<)/);
      if (m) maybeAddQuestion(m[1]);
    }
  }

  return ir;
}

function normalizeIr(ir: GuidelineIR): NormalizedIR {
  let unresolvedCount = 0;

  for (const cluster of ir.clusters) {
    const result = normalizeRuleList([
      ...(cluster.suggested_rules ?? []),
      ...(cluster.evidence_text ?? []),
    ]);
    cluster.normalized_rules = result.normalized;
    cluster.unresolved_fragments = result.unresolved;
    unresolvedCount += result.unresolved.length;
  }

  for (const rf of ir.red_flags) {
    const result = normalizeRuleList([
      rf.when_text,
      ...(rf.suggested_tokens ?? []),
    ]);
    rf.normalized_rules = result.normalized;
    rf.unresolved_fragments = result.unresolved;
    unresolvedCount += result.unresolved.length;
  }

  for (const disp of ir.disposition_logic) {
    const result = normalizeRuleList([
      disp.when_text,
      ...(disp.suggested_rules ?? []),
    ]);
    disp.normalized_rules = result.normalized;
    disp.unresolved_fragments = result.unresolved;
    unresolvedCount += result.unresolved.length;
  }

  enrichQuestionsFromNormalizedRules(ir);

  for (const q of ir.questions) {
    const tokenPrefix = `${q.token}=`;
    const numericPrefix = `${q.token}`;
    q.evidence_for = uniq(
      ir.clusters
        .filter((c) =>
          (c.normalized_rules ?? []).some(
            (r) =>
              r.startsWith(tokenPrefix) ||
              r.startsWith(`${numericPrefix}>`) ||
              r.startsWith(`${numericPrefix}<`)
          )
        )
        .map((c) => c.dx_id)
    );
  }

  const globalUnmapped = uniq([
    ...(ir.unmapped_phrases ?? []),
    ...ir.clusters.flatMap((c) => c.unresolved_fragments ?? []),
    ...ir.red_flags.flatMap((r) => r.unresolved_fragments ?? []),
    ...ir.disposition_logic.flatMap((d) => d.unresolved_fragments ?? []),
  ]);

  return {
    ...ir,
    unmapped_phrases: globalUnmapped,
    normalization: {
      normalized_at: new Date().toISOString(),
      token_dictionary_version: "v1-inline",
      unresolved_count: unresolvedCount,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inPath = toInputPath(root, args);
  const outPath = toOutputPath(root, args);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input IR not found: ${inPath}`);
  }

  const raw = fs.readFileSync(inPath, "utf8");
  const ir = JSON.parse(raw) as GuidelineIR;

  const normalized = normalizeIr(ir);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");

  console.log(`Wrote normalized IR: ${outPath}`);
  console.log(`Questions: ${normalized.questions.length}`);
  console.log(`Clusters: ${normalized.clusters.length}`);
  console.log(`Red flags: ${normalized.red_flags.length}`);
  console.log(`Disposition rules: ${normalized.disposition_logic.length}`);
  console.log(`Unresolved count: ${normalized.normalization.unresolved_count}`);
  console.log(`Unmapped phrases: ${normalized.unmapped_phrases.length}`);
}

main();
