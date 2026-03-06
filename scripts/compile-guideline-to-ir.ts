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
      "Usage: npx tsx scripts/compile-guideline-to-ir.ts <complaint_id> <source.txt> [--title <title>]"
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

function pushUniqueBy<T>(arr: T[], item: T, keyFn: (x: T) => string) {
  const key = keyFn(item);
  if (!arr.some((x) => keyFn(x) === key)) arr.push(item);
}

const TOKEN_MAP: Array<{
  pattern: RegExp;
  token: string;
  type?: "yesno" | "number" | "text";
  question?: string;
}> = [
  { pattern: /\bfever\b/i, token: "FEVER", type: "yesno", question: "Do you have fever?" },
  { pattern: /\bcough\b/i, token: "COUGH", type: "yesno", question: "Do you have cough?" },
  {
    pattern: /\bshortness of breath\b|\bdifficulty breathing\b|\bsob\b/i,
    token: "SOB",
    type: "yesno",
    question: "Do you have shortness of breath?",
  },
  {
    pattern: /\bstridor\b/i,
    token: "STRIDOR",
    type: "yesno",
    question: "Do you have stridor or noisy breathing?",
  },
  {
    pattern: /\btonsillar exudate\b|\bexudate\b/i,
    token: "EXUDATE",
    type: "yesno",
    question: "Do you see or were you told you have tonsillar exudate?",
  },
  {
    pattern: /\btender anterior cervical\b|\banterior cervical adenopathy\b/i,
    token: "TENDER_ANT_CERVICAL",
    type: "yesno",
    question: "Do you have tender anterior cervical nodes?",
  },
  {
    pattern: /\bright chest pain\b|\bpleuritic\b|\bpain with breathing\b/i,
    token: "PLEURITIC",
    type: "yesno",
    question: "Is the pain worse with breathing?",
  },
  {
    pattern: /\bdiaphoresis\b|\bsweating\b/i,
    token: "DIAPHORESIS",
    type: "yesno",
    question: "Are you having unusual sweating?",
  },
  {
    pattern: /\bradiation\b|\bradiates\b/i,
    token: "RADIATION",
    type: "yesno",
    question: "Does the pain radiate anywhere?",
  },
  {
    pattern: /\bneck stiffness\b|\bstiff neck\b/i,
    token: "NECK_STIFFNESS",
    type: "yesno",
    question: "Do you have neck stiffness?",
  },
  {
    pattern: /\bworst headache\b|\bthunderclap\b/i,
    token: "WORST_HEADACHE",
    type: "yesno",
    question: "Is this the worst headache of your life or thunderclap onset?",
  },
  {
    pattern: /\bvomiting\b|\bvomit\b/i,
    token: "VOMITING",
    type: "yesno",
    question: "Do you have vomiting?",
  },
  {
    pattern: /\bdiarrhea\b/i,
    token: "DIARRHEA",
    type: "yesno",
    question: "Do you have diarrhea?",
  },
  {
    pattern: /\bflank pain\b/i,
    token: "FLANK_PAIN",
    type: "yesno",
    question: "Do you have flank pain?",
  },
  {
    pattern: /\bdysuria\b|\bpainful urination\b|\bburning urination\b/i,
    token: "DYSURIA",
    type: "yesno",
    question: "Do you have painful urination?",
  },
  {
    pattern: /\bitchy eyes\b/i,
    token: "ITCHY_EYES",
    type: "yesno",
    question: "Do you have itchy eyes?",
  },
  {
    pattern: /\bsneezing\b/i,
    token: "SNEEZING",
    type: "yesno",
    question: "Do you have sneezing?",
  },
  {
    pattern: /\brunny nose\b|\brhinorrhea\b/i,
    token: "RUNNY_NOSE",
    type: "yesno",
    question: "Do you have a runny nose?",
  },
  {
    pattern: /\bfacial pain\b|\bface pain\b/i,
    token: "FACIAL_PAIN",
    type: "yesno",
    question: "Do you have facial pain or pressure?",
  },
  {
    pattern: /\bdouble sickening\b|\bworsening after initial improvement\b/i,
    token: "DOUBLE_SICKENING",
    type: "yesno",
    question: "Did symptoms improve and then worsen again?",
  },
  {
    pattern: /\bduration\b|\bdays\b|\bmore than \d+ days\b/i,
    token: "DURATION_DAYS",
    type: "number",
    question: "How many days have symptoms been present?",
  },
  {
    pattern: /\bage\b/i,
    token: "AGE_Y",
    type: "number",
    question: "What is the age in years?",
  },
  {
    pattern: /\bimmunocompromised\b|\bimmunosuppressed\b/i,
    token: "IMMUNOCOMP",
    type: "yesno",
    question: "Are you immunocompromised?",
  },
];

const RED_FLAG_HINTS: Array<{
  pattern: RegExp;
  label: string;
  action: "ER_SEND" | "ESCALATE" | "URGENT";
  rationale: string;
}> = [
  {
    pattern: /\bairway compromise\b|\bstridor\b|\bunable to breathe\b/i,
    label: "Airway compromise",
    action: "ER_SEND",
    rationale: "Possible airway emergency",
  },
  {
    pattern: /\bdehydration\b|\bsevere dehydration\b/i,
    label: "Severe dehydration",
    action: "URGENT",
    rationale: "Risk of volume depletion",
  },
  {
    pattern: /\baltered mental status\b|\bconfusion\b/i,
    label: "Altered mental status",
    action: "ER_SEND",
    rationale: "High-risk neurologic/systemic sign",
  },
  {
    pattern: /\bneurologic deficit\b|\bfocal deficit\b|\bweakness\b|\bslurred speech\b/i,
    label: "Neurologic deficit",
    action: "ER_SEND",
    rationale: "Possible stroke or CNS emergency",
  },
  {
    pattern: /\bmeningismus\b|\bneck stiffness\b/i,
    label: "Possible meningitis",
    action: "ER_SEND",
    rationale: "Possible CNS infection",
  },
  {
    pattern: /\bchest pain\b/i,
    label: "Chest pain",
    action: "ESCALATE",
    rationale: "May require urgent cardiac/pulmonary evaluation",
  },
];

const DX_HINTS: Array<{
  pattern: RegExp;
  dx_id: string;
  dx_label: string;
  tier: "PRIMARY" | "SECONDARY" | "BENIGN";
}> = [
  {
    pattern: /\bstrep\b|\bstreptococcal pharyngitis\b/i,
    dx_id: "strep_pharyngitis",
    dx_label: "Strep pharyngitis",
    tier: "PRIMARY",
  },
  {
    pattern: /\bviral pharyngitis\b/i,
    dx_id: "viral_pharyngitis",
    dx_label: "Viral pharyngitis",
    tier: "BENIGN",
  },
  {
    pattern: /\ballergic rhinitis\b/i,
    dx_id: "allergic_rhinitis",
    dx_label: "Allergic rhinitis",
    tier: "SECONDARY",
  },
  {
    pattern: /\bacute bacterial sinusitis\b|\bbacterial sinusitis\b/i,
    dx_id: "acute_bacterial_sinusitis",
    dx_label: "Acute bacterial sinusitis",
    tier: "PRIMARY",
  },
  {
    pattern: /\bviral rhinosinusitis\b|\bviral uri\b/i,
    dx_id: "viral_rhinosinusitis",
    dx_label: "Viral rhinosinusitis",
    tier: "BENIGN",
  },
  {
    pattern: /\bpneumonia\b/i,
    dx_id: "pneumonia",
    dx_label: "Pneumonia",
    tier: "PRIMARY",
  },
  {
    pattern: /\basthma\b/i,
    dx_id: "asthma_exacerbation",
    dx_label: "Asthma exacerbation",
    tier: "SECONDARY",
  },
  {
    pattern: /\bmigraine\b/i,
    dx_id: "migraine",
    dx_label: "Migraine",
    tier: "SECONDARY",
  },
  {
    pattern: /\bmeningitis\b/i,
    dx_id: "meningitis",
    dx_label: "Meningitis",
    tier: "PRIMARY",
  },
  {
    pattern: /\bcystitis\b|\buti\b/i,
    dx_id: "cystitis",
    dx_label: "Cystitis",
    tier: "PRIMARY",
  },
  {
    pattern: /\bpyelonephritis\b/i,
    dx_id: "pyelonephritis",
    dx_label: "Pyelonephritis",
    tier: "SECONDARY",
  },
];

function extractQuestions(lines: string[]): IRQuestion[] {
  const out: IRQuestion[] = [];

  for (const line of lines) {
    for (const m of TOKEN_MAP) {
      if (m.pattern.test(line) && m.question && m.type) {
        pushUniqueBy(
          out,
          {
            token: m.token,
            type: m.type,
            question_text: m.question,
            required: true,
            category: "core" as const,
            evidence_for: [],
          },
          (x) => x.token
        );
      }
    }
  }

  return out;
}

function extractModifiers(lines: string[]): IRModifier[] {
  const out: IRModifier[] = [];

  for (const line of lines) {
    for (const m of TOKEN_MAP) {
      if (!m.type) continue;
      if (!m.pattern.test(line)) continue;
      if (m.token === "AGE_Y" || m.token === "IMMUNOCOMP") {
        pushUniqueBy(
          out,
          {
            token: m.token,
            type: m.type,
            label: m.token === "AGE_Y" ? "Age in years" : "Immunocompromised",
          },
          (x) => x.token
        );
      }
    }
  }

  return out;
}

function extractRedFlags(lines: string[]): IRRedFlag[] {
  const out: IRRedFlag[] = [];

  for (const line of lines) {
    for (const hint of RED_FLAG_HINTS) {
      if (!hint.pattern.test(line)) continue;

      const suggestedTokens = TOKEN_MAP
        .filter((m) => m.pattern.test(line))
        .map((m) => m.token);

      pushUniqueBy(
        out,
        {
          label: hint.label,
          when_text: line,
          suggested_tokens: uniq(suggestedTokens),
          action: hint.action,
          rationale: hint.rationale,
        },
        (x) => x.label
      );
    }
  }

  return out;
}

function extractClusters(lines: string[]): IRCluster[] {
  const out: IRCluster[] = [];

  for (const line of lines) {
    for (const hint of DX_HINTS) {
      if (!hint.pattern.test(line)) continue;

      const suggestedRules = TOKEN_MAP
        .filter((m) => m.pattern.test(line))
        .map((m) => `${m.token}=true`);

      const evidenceText = uniq(
        TOKEN_MAP.filter((m) => m.pattern.test(line)).map((m) => m.token)
      );

      const existing = out.find((x) => x.dx_id === hint.dx_id);
      if (existing) {
        existing.evidence_text = uniq([...existing.evidence_text, ...evidenceText]);
        existing.suggested_rules = uniq([...existing.suggested_rules, ...suggestedRules]);
      } else {
        out.push({
          dx_id: hint.dx_id,
          dx_label: hint.dx_label,
          tier: hint.tier,
          evidence_text: evidenceText,
          suggested_rules: suggestedRules,
        });
      }
    }
  }

  return out;
}

function extractDispositionLogic(lines: string[]): IRDisposition[] {
  const out: IRDisposition[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    let disposition: IRDisposition["disposition"] | null = null;
    if (/\bemergency\b|\ber\b|\bed\b|\bimmediate evaluation\b/.test(lower))
      disposition = "ER";
    else if (/\burgent care\b|\burgent evaluation\b/.test(lower))
      disposition = "URGENT_CARE";
    else if (/\bpcp\b|\bprimary care\b|\boutpatient\b/.test(lower))
      disposition = "PCP";
    else if (/\bself care\b|\bsupportive care\b|\bhome care\b/.test(lower))
      disposition = "SELF_CARE";

    if (!disposition) continue;

    const suggestedRules = TOKEN_MAP
      .filter((m) => m.pattern.test(line))
      .map((m) => `${m.token}=true`);

    pushUniqueBy(
      out,
      {
        when_text: line,
        suggested_rules: suggestedRules,
        disposition,
      },
      (x) => `${x.disposition}||${x.when_text}`
    );
  }

  return out;
}

function extractUnmappedPhrases(lines: string[], ir: GuidelineIR): string[] {
  const unmapped: string[] = [];
  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (normalized.length < 12) continue;

    const hasKnownToken = TOKEN_MAP.some((m) => m.pattern.test(normalized));
    const hasKnownDx = DX_HINTS.some((d) => d.pattern.test(normalized));
    const hasKnownRf = RED_FLAG_HINTS.some((r) => r.pattern.test(normalized));

    if (!hasKnownToken && !hasKnownDx && !hasKnownRf) {
      unmapped.push(normalized);
    }
  }

  return uniq(unmapped).slice(0, 50);
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

  const ir: GuidelineIR = {
    complaint_id: args.complaintId,
    display_name: toDisplayName(args.complaintId),
    source: {
      title: args.title ?? `${toDisplayName(args.complaintId)} Guideline`,
      source_type: "text",
      path: path.relative(root, sourceAbs),
      compiled_at: new Date().toISOString(),
    },
    modifiers: extractModifiers(lines),
    questions: extractQuestions(lines),
    red_flags: extractRedFlags(lines),
    clusters: extractClusters(lines),
    disposition_logic: extractDispositionLogic(lines),
    notes: [
      "Draft IR generated by compile-guideline-to-ir.ts",
      "Review suggested_rules and unmapped_phrases before emitting engine CSVs",
    ],
    unmapped_phrases: [],
  };

  for (const q of ir.questions) {
    q.evidence_for = ir.clusters
      .filter((c) => c.suggested_rules.some((r) => r.startsWith(`${q.token}=`)))
      .map((c) => c.dx_id);
  }

  ir.unmapped_phrases = extractUnmappedPhrases(lines, ir);

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
