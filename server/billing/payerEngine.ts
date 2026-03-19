export interface PayerRule {
  name: string;
  preferredCPT: string[];
  requiresModifier25: boolean;
  strictICD: boolean;
  telehealthPolicy: "strict" | "lenient";
  baselineReimbursement: Record<string, number>;
}

const PAYER_RULES: Record<string, PayerRule> = {
  medicare: {
    name: "Medicare",
    preferredCPT: ["99213", "99214"],
    requiresModifier25: true,
    strictICD: true,
    telehealthPolicy: "strict",
    baselineReimbursement: { "99213": 75, "99214": 110, "99215": 145, "99284": 200, "99285": 280 },
  },
  medicaid: {
    name: "Medicaid",
    preferredCPT: ["99213", "99214"],
    requiresModifier25: true,
    strictICD: true,
    telehealthPolicy: "strict",
    baselineReimbursement: { "99213": 55, "99214": 80, "99215": 105, "99284": 150, "99285": 210 },
  },
  aetna: {
    name: "Aetna",
    preferredCPT: ["99213", "99214", "99215"],
    requiresModifier25: false,
    strictICD: false,
    telehealthPolicy: "lenient",
    baselineReimbursement: { "99213": 90, "99214": 130, "99215": 175, "99284": 250, "99285": 350 },
  },
  united: {
    name: "UnitedHealthcare",
    preferredCPT: ["99213", "99214"],
    requiresModifier25: false,
    strictICD: true,
    telehealthPolicy: "lenient",
    baselineReimbursement: { "99213": 85, "99214": 125, "99215": 165, "99284": 240, "99285": 330 },
  },
  cigna: {
    name: "Cigna",
    preferredCPT: ["99213", "99214", "99215"],
    requiresModifier25: false,
    strictICD: false,
    telehealthPolicy: "lenient",
    baselineReimbursement: { "99213": 88, "99214": 128, "99215": 170, "99284": 245, "99285": 340 },
  },
  bcbs: {
    name: "BlueCross BlueShield",
    preferredCPT: ["99213", "99214"],
    requiresModifier25: true,
    strictICD: true,
    telehealthPolicy: "strict",
    baselineReimbursement: { "99213": 82, "99214": 120, "99215": 160, "99284": 230, "99285": 320 },
  },
  humana: {
    name: "Humana",
    preferredCPT: ["99213", "99214"],
    requiresModifier25: false,
    strictICD: false,
    telehealthPolicy: "lenient",
    baselineReimbursement: { "99213": 80, "99214": 115, "99215": 155, "99284": 220, "99285": 310 },
  },
  self_pay: {
    name: "Self-Pay",
    preferredCPT: ["99213", "99214", "99215"],
    requiresModifier25: false,
    strictICD: false,
    telehealthPolicy: "lenient",
    baselineReimbursement: { "99213": 150, "99214": 225, "99215": 350, "99284": 400, "99285": 600 },
  },
};

export interface PayerOptimization {
  payer: string;
  payerName: string;
  changes: string[];
  modifier?: string;
  adjustedCpt?: string;
  warnings: string[];
}

export function optimizeForPayer(
  icd10: string,
  cpt: string,
  payer: string,
  opts?: { triage?: string; confidence?: number },
): PayerOptimization {
  const rule = PAYER_RULES[payer.toLowerCase()] || PAYER_RULES.medicare;
  const changes: string[] = [];
  const warnings: string[] = [];
  let adjustedCpt = cpt;
  let modifier: string | undefined;

  if (!rule.preferredCPT.includes(cpt)) {
    const triageLower = (opts?.triage || "").toLowerCase();
    if (triageLower === "emergency" || triageLower === "er" || triageLower === "er_now") {
      adjustedCpt = "99284";
    } else {
      adjustedCpt = rule.preferredCPT[0];
    }
    changes.push(`CPT adjusted ${cpt}→${adjustedCpt} for ${rule.name} preference`);
  }

  if (rule.requiresModifier25) {
    modifier = "25";
    changes.push(`Modifier 25 added (${rule.name} requires separate E/M)`);
  }

  if (rule.strictICD && icd10 === "R69") {
    warnings.push(`ICD R69 (unspecified) may be denied by ${rule.name} — requires specific diagnosis code`);
  }

  if (rule.telehealthPolicy === "strict" && opts?.triage === "telemed") {
    warnings.push(`${rule.name} has strict telehealth policy — ensure documentation meets place-of-service requirements`);
  }

  return { payer: payer.toLowerCase(), payerName: rule.name, changes, modifier, adjustedCpt, warnings };
}

export function getPayerRule(payer: string): PayerRule | undefined {
  return PAYER_RULES[payer.toLowerCase()];
}

export function listPayers(): Array<{ id: string; name: string }> {
  return Object.entries(PAYER_RULES).map(([id, rule]) => ({ id, name: rule.name }));
}

export function getPayerReimbursement(payer: string, cpt: string): number {
  const rule = PAYER_RULES[payer.toLowerCase()];
  if (!rule) return 75;
  return rule.baselineReimbursement[cpt] || 75;
}
