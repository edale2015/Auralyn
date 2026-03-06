import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  sourcePath: string;
  title?: string;
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
};

type IRCluster = {
  dx_id: string;
  dx_label: string;
  tier: "PRIMARY" | "SECONDARY" | "BENIGN";
  evidence_text: string[];
  suggested_rules: string[];
};

type IRDisposition = {
  when_text: string;
  suggested_rules: string[];
  disposition: "ER" | "URGENT_CARE" | "PCP" | "SELF_CARE";
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

type ParsedLine = {
  raw: string;
  indent: number;
  kind: "TITLE" | "QUESTION" | "EDGE" | "UNKNOWN";
  content: string;
};

type QuestionNode = {
  token: string;
  questionText: string;
  indent: number;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  const sourcePath = argv[1];
  if (!complaintId || !sourcePath) {
    console.error(
      "Usage: npx tsx scripts/compile-ascii-tree-to-ir.ts <complaint_id> <source.tree.txt> [--title <title>]"
    );
    process.exit(2);
  }

  let title: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--title") title = argv[++i];
  }

  return { complaintId, sourcePath, title };
}

function toDisplayName(complaintId: string): string {
  return complaintId
    .split("_")
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function safeUpperToken(s: string): string {
  return (s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function prettyDxLabel(dxId: string): string {
  return dxId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferQuestionType(token: string): "yesno" | "number" | "text" {
  const t = safeUpperToken(token);
  if (t.includes("DURATION") || t.endsWith("_DAYS") || t.endsWith("_HOURS")) return "number";
  if (t.includes("AGE") || t.includes("TEMP") || t.includes("SEVERITY")) return "number";
  return "yesno";
}

function mapRfAction(raw: string): "ER_SEND" | "ESCALATE" | "URGENT" {
  const v = safeUpperToken(raw);
  if (v === "ER" || v === "ER_SEND" || v === "EMERGENCY") return "ER_SEND";
  if (v === "URGENT" || v === "URGENT_CARE") return "URGENT";
  return "ESCALATE";
}

function mapDisposition(raw: string): "ER" | "URGENT_CARE" | "PCP" | "SELF_CARE" {
  const v = safeUpperToken(raw);
  if (v === "ER" || v === "ER_SEND" || v === "EMERGENCY") return "ER";
  if (v === "URGENT" || v === "URGENT_CARE") return "URGENT_CARE";
  if (v === "PCP" || v === "PRIMARY_CARE") return "PCP";
  return "SELF_CARE";
}

function parseLine(raw: string): ParsedLine {
  const leadingSpaces = raw.match(/^ */)?.[0].length ?? 0;
  const indent = Math.floor(leadingSpaces / 2);
  const text = raw.trim();

  if (!text) return { raw, indent, kind: "UNKNOWN", content: text };
  if (text.toUpperCase().startsWith("TITLE:")) {
    return { raw, indent, kind: "TITLE", content: text.slice("TITLE:".length).trim() };
  }
  if (text.toUpperCase().startsWith("Q:")) {
    return { raw, indent, kind: "QUESTION", content: text.slice("Q:".length).trim() };
  }
  if (/^(yes|no)\s*->/i.test(text)) {
    return { raw, indent, kind: "EDGE", content: text };
  }

  return { raw, indent, kind: "UNKNOWN", content: text };
}

function parseQuestion(content: string): { token: string; questionText: string } | null {
  const parts = content.split("|").map((x) => x.trim());
  const token = safeUpperToken(parts[0] ?? "");
  const questionText =
    parts[1] ?? `Does the patient have ${token.toLowerCase().replace(/_/g, " ")}?`;
  if (!token) return null;
  return { token, questionText };
}

function parseEdge(content: string): { branch: "yes" | "no"; target: string } | null {
  const m = content.match(/^(yes|no)\s*->\s*(.+)$/i);
  if (!m) return null;
  return { branch: m[1].toLowerCase() as "yes" | "no", target: m[2].trim() };
}

function parseLeaf(target: string):
  | { kind: "DX"; dxId: string; tier: "PRIMARY" | "SECONDARY" | "BENIGN" }
  | { kind: "DISP"; disposition: "ER" | "URGENT_CARE" | "PCP" | "SELF_CARE" }
  | { kind: "RF"; label: string; action: "ER_SEND" | "ESCALATE" | "URGENT"; rationale: string }
  | { kind: "QINLINE"; token: string; questionText: string }
  | null {
  const t = target.trim();

  if (/^DX:/i.test(t)) {
    const body = t.slice(3).trim();
    const parts = body.split("|").map((x) => x.trim());
    const dxId = (parts[0] ?? "").trim();
    const tierRaw = safeUpperToken(parts[1] ?? "SECONDARY") as "PRIMARY" | "SECONDARY" | "BENIGN";
    const tier = ["PRIMARY", "SECONDARY", "BENIGN"].includes(tierRaw) ? tierRaw : "SECONDARY";
    if (!dxId) return null;
    return { kind: "DX", dxId, tier };
  }

  if (/^DISP:/i.test(t)) {
    const body = t.slice(5).trim();
    return { kind: "DISP", disposition: mapDisposition(body) };
  }

  if (/^RF:/i.test(t)) {
    const body = t.slice(3).trim();
    const parts = body.split("|").map((x) => x.trim());
    const label = parts[0] ?? "red_flag";
    const action = mapRfAction(parts[1] ?? "ESCALATE");
    const rationale = parts[2] ?? label;
    return { kind: "RF", label, action, rationale };
  }

  if (/^Q:/i.test(t)) {
    const q = parseQuestion(t.slice(2).trim());
    if (!q) return null;
    return { kind: "QINLINE", token: q.token, questionText: q.questionText };
  }

  return null;
}

function buildConditionPath(stack: Array<{ token: string; answer: "yes" | "no" }>): string[] {
  return stack.map((x) => `${x.token}=${x.answer === "yes" ? "true" : "false"}`);
}

function compileAsciiTreeToIr(
  complaintId: string,
  sourcePathRel: string,
  title: string,
  rawLines: string[]
): GuidelineIR {
  const lines = rawLines
    .map(parseLine)
    .filter((x) => x.content.length > 0 && !x.content.startsWith("#"));

  const questions: IRQuestion[] = [];
  const modifiers: IRModifier[] = [];
  const redFlags: IRRedFlag[] = [];
  const clusters: IRCluster[] = [];
  const dispositionLogic: IRDisposition[] = [];
  const unmapped: string[] = [];
  const notes: string[] = [];

  const questionStack: QuestionNode[] = [];
  const conditionStack: Array<{ token: string; answer: "yes" | "no"; indent: number }> = [];

  function popToIndent(indent: number) {
    while (questionStack.length && questionStack[questionStack.length - 1].indent >= indent) {
      questionStack.pop();
    }
    while (conditionStack.length && conditionStack[conditionStack.length - 1].indent >= indent) {
      conditionStack.pop();
    }
  }

  for (const line of lines) {
    if (line.kind === "TITLE") continue;

    if (line.kind === "QUESTION") {
      popToIndent(line.indent + 1);

      const q = parseQuestion(line.content);
      if (!q) {
        unmapped.push(line.raw.trim());
        continue;
      }

      if (!questions.some((x) => x.token === q.token)) {
        questions.push({
          token: q.token,
          type: inferQuestionType(q.token),
          question_text: q.questionText,
          required: true,
          category: "core",
          evidence_for: []
        });
      }

      questionStack.push({
        token: q.token,
        questionText: q.questionText,
        indent: line.indent
      });

      continue;
    }

    if (line.kind === "EDGE") {
      const edge = parseEdge(line.content);
      if (!edge) {
        unmapped.push(line.raw.trim());
        continue;
      }

      const parentQuestion = [...questionStack].reverse().find((q) => q.indent < line.indent || q.indent === line.indent - 1);
      if (!parentQuestion) {
        unmapped.push(line.raw.trim());
        continue;
      }

      while (conditionStack.length && conditionStack[conditionStack.length - 1].indent >= line.indent) {
        conditionStack.pop();
      }

      conditionStack.push({
        token: parentQuestion.token,
        answer: edge.branch,
        indent: line.indent
      });

      const leaf = parseLeaf(edge.target);
      if (!leaf) {
        unmapped.push(line.raw.trim());
        continue;
      }

      if (leaf.kind === "QINLINE") {
        if (!questions.some((x) => x.token === leaf.token)) {
          questions.push({
            token: leaf.token,
            type: inferQuestionType(leaf.token),
            question_text: leaf.questionText,
            required: true,
            category: "followup",
            evidence_for: []
          });
        }

        questionStack.push({
          token: leaf.token,
          questionText: leaf.questionText,
          indent: line.indent + 1
        });

        continue;
      }

      const rules = buildConditionPath(conditionStack);

      if (leaf.kind === "DX") {
        clusters.push({
          dx_id: leaf.dxId,
          dx_label: prettyDxLabel(leaf.dxId),
          tier: leaf.tier,
          evidence_text: conditionStack.map((x) => x.token),
          suggested_rules: rules
        });
        continue;
      }

      if (leaf.kind === "DISP") {
        dispositionLogic.push({
          when_text: rules.join(" & "),
          suggested_rules: rules,
          disposition: leaf.disposition
        });
        continue;
      }

      if (leaf.kind === "RF") {
        redFlags.push({
          label: leaf.label.replace(/_/g, " "),
          when_text: rules.join(" & "),
          suggested_tokens: conditionStack.map((x) => x.token),
          action: leaf.action,
          rationale: leaf.rationale
        });
        continue;
      }
    }

    if (line.kind === "UNKNOWN") {
      unmapped.push(line.raw.trim());
    }
  }

  for (const q of questions) {
    q.evidence_for = uniq(
      clusters
        .filter((c) => c.suggested_rules.some((r) => r.toUpperCase().startsWith(`${q.token}=`)))
        .map((c) => c.dx_id)
    );
  }

  notes.push("Draft IR generated by compile-ascii-tree-to-ir.ts");
  notes.push("ASCII tree compiler assumes 2-space indentation and yes/no branch syntax.");

  return {
    complaint_id: complaintId,
    display_name: toDisplayName(complaintId),
    source: {
      title,
      source_type: "text",
      path: sourcePathRel,
      compiled_at: new Date().toISOString()
    },
    modifiers,
    questions,
    red_flags: redFlags,
    clusters,
    disposition_logic: dispositionLogic,
    notes,
    unmapped_phrases: uniq(unmapped)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const sourceAbs = path.isAbsolute(args.sourcePath)
    ? args.sourcePath
    : path.join(root, args.sourcePath);

  if (!fs.existsSync(sourceAbs)) {
    throw new Error(`Source not found: ${sourceAbs}`);
  }

  const raw = fs.readFileSync(sourceAbs, "utf8");
  const rawLines = raw.split(/\r?\n/);

  let title = args.title ?? `${toDisplayName(args.complaintId)} ASCII Tree`;
  for (const line of rawLines) {
    const t = normalizeLine(line);
    if (t.toUpperCase().startsWith("TITLE:")) {
      title = t.slice("TITLE:".length).trim() || title;
      break;
    }
  }

  const ir = compileAsciiTreeToIr(
    args.complaintId,
    path.relative(root, sourceAbs),
    title,
    rawLines
  );

  const outDir = path.join(root, "data", "complaints", "ir");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${args.complaintId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(ir, null, 2) + "\n", "utf8");

  console.log(`Wrote IR: ${outPath}`);
  console.log(`Questions: ${ir.questions.length}`);
  console.log(`Red flags: ${ir.red_flags.length}`);
  console.log(`Clusters: ${ir.clusters.length}`);
  console.log(`Disposition rules: ${ir.disposition_logic.length}`);
  console.log(`Unmapped phrases: ${ir.unmapped_phrases.length}`);
}

main();
