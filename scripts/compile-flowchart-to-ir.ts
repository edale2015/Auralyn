/**
 * scripts/compile-flowchart-to-ir.ts
 *
 * Compile a simple text-based clinical flowchart into Guideline IR.
 *
 * Input format (plain text):
 *
 *   TITLE: Acute Sore Throat Flowchart
 *   QUESTION: FEVER | Do you have fever?
 *   QUESTION: COUGH | Do you have cough?
 *   QUESTION: EXUDATE | Do you have tonsillar exudate?
 *   QUESTION: STRIDOR | Do you have stridor?
 *
 *   RED_FLAG: STRIDOR=true => ER_SEND | possible airway compromise
 *
 *   CLUSTER: strep_pharyngitis | PRIMARY | FEVER=true & COUGH=false & EXUDATE=true
 *   CLUSTER: viral_pharyngitis | BENIGN | COUGH=true
 *
 *   DISPOSITION: STRIDOR=true => ER
 *   DISPOSITION: FEVER=true & EXUDATE=true => URGENT_CARE
 *   DISPOSITION: COUGH=true => SELF_CARE
 *
 * Output:
 *   data/complaints/ir/<complaint_id>.json
 *
 * Usage:
 *   npx tsx scripts/compile-flowchart-to-ir.ts sore_throat data/complaints/sources/sore_throat.flow.txt
 *   npx tsx scripts/compile-flowchart-to-ir.ts chest_pain data/complaints/sources/chest_pain.flow.txt --title "Chest Pain Flowchart"
 */

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

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  const sourcePath = argv[1];

  if (!complaintId || !sourcePath) {
    console.error(
      "Usage: npx tsx scripts/compile-flowchart-to-ir.ts <complaint_id> <source.flow.txt> [--title <title>]"
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

function tokenFromExpr(expr: string): string[] {
  const found = new Set<string>();
  const re = /\b[A-Z][A-Z0-9_]{1,40}\b/g;
  for (const m of expr.toUpperCase().matchAll(re)) {
    const tok = m[0];
    if (["ANY", "ALL", "NOT", "TRUE", "FALSE", "ER", "PCP", "URGENT_CARE", "SELF_CARE", "ER_SEND", "URGENT", "ESCALATE"].includes(tok)) {
      continue;
    }
    found.add(tok);
  }
  return [...found];
}

function inferQuestionType(token: string): "yesno" | "number" | "text" {
  if (token.includes("DURATION") || token.endsWith("_DAYS") || token.endsWith("_HOURS")) return "number";
  if (token.includes("TEMP") || token.includes("AGE") || token.includes("SEVERITY")) return "number";
  return "yesno";
}

function friendlyDxLabel(dxId: string): string {
  return dxId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapAction(raw: string): "ER_SEND" | "ESCALATE" | "URGENT" {
  const v = raw.trim().toUpperCase();
  if (v === "ER" || v === "ER_SEND" || v === "EMERGENCY") return "ER_SEND";
  if (v === "URGENT" || v === "URGENT_CARE") return "URGENT";
  return "ESCALATE";
}

function mapDisposition(raw: string): "ER" | "URGENT_CARE" | "PCP" | "SELF_CARE" {
  const v = raw.trim().toUpperCase();
  if (v === "ER" || v === "ER_SEND" || v === "EMERGENCY") return "ER";
  if (v === "URGENT" || v === "URGENT_CARE") return "URGENT_CARE";
  if (v === "PCP" || v === "PRIMARY_CARE") return "PCP";
  return "SELF_CARE";
}

function normalizeBooleanExpr(expr: string): string {
  return expr
    .replace(/\s+AND\s+/gi, " & ")
    .replace(/\s+OR\s+/gi, " | ")
    .replace(/\s*&&\s*/g, " & ")
    .replace(/\s*\|\|\s*/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
}

function compileFlowchartToIr(
  complaintId: string,
  sourcePathRel: string,
  title: string,
  lines: string[]
): GuidelineIR {
  const questions: IRQuestion[] = [];
  const modifiers: IRModifier[] = [];
  const redFlags: IRRedFlag[] = [];
  const clusters: IRCluster[] = [];
  const dispositionLogic: IRDisposition[] = [];
  const unmapped: string[] = [];
  const notes: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line || line.startsWith("#")) continue;

    if (line.toUpperCase().startsWith("TITLE:")) {
      continue;
    }

    if (line.toUpperCase().startsWith("QUESTION:")) {
      const body = line.slice("QUESTION:".length).trim();
      const parts = body.split("|").map((x) => x.trim());
      const token = (parts[0] ?? "").toUpperCase();
      const questionText = parts[1] ?? `Does the patient have ${token.toLowerCase().replace(/_/g, " ")}?`;

      if (token) {
        questions.push({
          token,
          type: inferQuestionType(token),
          question_text: questionText,
          required: true,
          category: "core",
          evidence_for: [],
        });
      } else {
        unmapped.push(line);
      }
      continue;
    }

    if (line.toUpperCase().startsWith("MODIFIER:")) {
      const body = line.slice("MODIFIER:".length).trim();
      const parts = body.split("|").map((x) => x.trim());
      const token = (parts[0] ?? "").toUpperCase();
      const label = parts[1] ?? token;

      if (token) {
        modifiers.push({
          token,
          type: inferQuestionType(token),
          label,
        });
      } else {
        unmapped.push(line);
      }
      continue;
    }

    if (line.toUpperCase().startsWith("RED_FLAG:")) {
      const body = line.slice("RED_FLAG:".length).trim();
      const [lhs, rationaleRaw] = body.split("|").map((x) => x.trim());
      const [exprRaw, actionRaw] = (lhs ?? "").split("=>").map((x) => x.trim());

      if (exprRaw && actionRaw) {
        redFlags.push({
          label: `Red flag: ${exprRaw}`,
          when_text: normalizeBooleanExpr(exprRaw),
          suggested_tokens: tokenFromExpr(exprRaw),
          action: mapAction(actionRaw),
          rationale: rationaleRaw || `Flowchart red flag for ${exprRaw}`,
        });
      } else {
        unmapped.push(line);
      }
      continue;
    }

    if (line.toUpperCase().startsWith("CLUSTER:")) {
      const body = line.slice("CLUSTER:".length).trim();
      const parts = body.split("|").map((x) => x.trim());

      const dxId = parts[0] ?? "";
      const tier = (parts[1] ?? "SECONDARY").toUpperCase() as "PRIMARY" | "SECONDARY" | "BENIGN";
      const expr = normalizeBooleanExpr(parts[2] ?? "");

      if (dxId && expr) {
        const rules = expr.split(/\s*&\s*|\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
        clusters.push({
          dx_id: dxId,
          dx_label: friendlyDxLabel(dxId),
          tier: ["PRIMARY", "SECONDARY", "BENIGN"].includes(tier) ? tier : "SECONDARY",
          evidence_text: tokenFromExpr(expr),
          suggested_rules: rules,
        });
      } else {
        unmapped.push(line);
      }
      continue;
    }

    if (line.toUpperCase().startsWith("DISPOSITION:")) {
      const body = line.slice("DISPOSITION:".length).trim();
      const [exprRaw, dispRaw] = body.split("=>").map((x) => x.trim());

      if (exprRaw && dispRaw) {
        dispositionLogic.push({
          when_text: normalizeBooleanExpr(exprRaw),
          suggested_rules: normalizeBooleanExpr(exprRaw)
            .split(/\s*&\s*|\s*\|\s*/)
            .map((x) => x.trim())
            .filter(Boolean),
          disposition: mapDisposition(dispRaw),
        });
      } else {
        unmapped.push(line);
      }
      continue;
    }

    unmapped.push(line);
  }

  for (const q of questions) {
    q.evidence_for = uniq(
      clusters
        .filter((c) => c.suggested_rules.some((r) => r.toUpperCase().includes(q.token)))
        .map((c) => c.dx_id)
    );
  }

  notes.push("Draft IR generated by compile-flowchart-to-ir.ts");
  notes.push("Flowchart compiler assumes structured source format with QUESTION/CLUSTER/RED_FLAG/DISPOSITION directives.");

  return {
    complaint_id: complaintId,
    display_name: toDisplayName(complaintId),
    source: {
      title,
      source_type: "text",
      path: sourcePathRel,
      compiled_at: new Date().toISOString(),
    },
    modifiers,
    questions,
    red_flags: redFlags,
    clusters,
    disposition_logic: dispositionLogic,
    notes,
    unmapped_phrases: uniq(unmapped),
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
  const lines = raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((x) => x.length > 0);

  let title = args.title ?? `${toDisplayName(args.complaintId)} Flowchart`;

  for (const line of lines) {
    if (line.toUpperCase().startsWith("TITLE:")) {
      title = line.slice("TITLE:".length).trim() || title;
      break;
    }
  }

  const ir = compileFlowchartToIr(
    args.complaintId,
    path.relative(root, sourceAbs),
    title,
    lines
  );

  const outDir = path.join(root, "data", "complaints", "ir");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${args.complaintId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(ir, null, 2) + "\n", "utf8");

  console.log(`Wrote IR: ${outPath}`);
  console.log(`  Questions: ${ir.questions.length}`);
  console.log(`  Modifiers: ${ir.modifiers.length}`);
  console.log(`  Red flags: ${ir.red_flags.length}`);
  console.log(`  Clusters: ${ir.clusters.length}`);
  console.log(`  Disposition rules: ${ir.disposition_logic.length}`);
  console.log(`  Unmapped phrases: ${ir.unmapped_phrases.length}`);
}

main();
