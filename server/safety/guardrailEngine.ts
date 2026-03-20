import type { AutonomyDecision } from "../autonomy/autonomyEngine";

interface GuardrailInput {
  diagnosis?: string;
  meds?: string[];
  answers?: Record<string, any>;
  complaint?: string;
}

interface GuardrailResult {
  override: boolean;
  reason?: string;
  severity?: "HIGH" | "MEDIUM" | "LOW";
  rule?: string;
}

interface GuardrailRule {
  id: string;
  description: string;
  check: (input: GuardrailInput) => GuardrailResult;
}

const GUARDRAIL_RULES: GuardrailRule[] = [
  {
    id: "GR001",
    description: "Cough suppression contraindicated in pneumonia",
    check: ({ diagnosis, meds }) => {
      if (
        diagnosis?.toLowerCase().includes("pneumonia") &&
        meds?.some(m => ["cough_suppressant", "dextromethorphan", "codeine", "dxm"].includes(m.toLowerCase()))
      ) {
        return { override: true, reason: "Cough suppressants are contraindicated in pneumonia — may impair mucus clearance", severity: "HIGH", rule: "GR001" };
      }
      return { override: false };
    },
  },
  {
    id: "GR002",
    description: "NSAIDs contraindicated with suspected GI bleed or renal failure",
    check: ({ diagnosis, meds, answers }) => {
      const hasNSAID = meds?.some(m => ["ibuprofen", "naproxen", "aspirin", "indomethacin", "nsaid"].includes(m.toLowerCase()));
      const hasGIBleed = diagnosis?.toLowerCase().includes("gi_bleed") || answers?.blackStool || answers?.bloodVomit;
      const hasRenalFailure = answers?.creatinine > 2.0 || answers?.dialysis;
      if (hasNSAID && (hasGIBleed || hasRenalFailure)) {
        return { override: true, reason: "NSAID use contraindicated: suspected GI bleed or renal insufficiency detected", severity: "HIGH", rule: "GR002" };
      }
      return { override: false };
    },
  },
  {
    id: "GR003",
    description: "Antibiotic without confirmed bacterial indicator",
    check: ({ diagnosis, meds }) => {
      const hasAntibiotic = meds?.some(m => ["amoxicillin", "azithromycin", "ciprofloxacin", "doxycycline"].includes(m.toLowerCase()));
      const likelyViral = diagnosis?.toLowerCase().includes("viral") || diagnosis?.toLowerCase().includes("uri");
      if (hasAntibiotic && likelyViral) {
        return { override: true, reason: "Antibiotic prescribed for likely viral illness — stewardship concern, requires physician review", severity: "MEDIUM", rule: "GR003" };
      }
      return { override: false };
    },
  },
  {
    id: "GR004",
    description: "Beta-blockers contraindicated in active bronchospasm/asthma",
    check: ({ diagnosis, meds, answers }) => {
      const hasBetaBlocker = meds?.some(m => ["metoprolol", "atenolol", "propranolol", "carvedilol"].includes(m.toLowerCase()));
      const hasAsthma = diagnosis?.toLowerCase().includes("asthma") || answers?.asthmaHistory || answers?.bronchospasm;
      if (hasBetaBlocker && hasAsthma) {
        return { override: true, reason: "Beta-blocker contraindicated in active bronchospasm — may worsen airway obstruction", severity: "HIGH", rule: "GR004" };
      }
      return { override: false };
    },
  },
  {
    id: "GR005",
    description: "Opioids in elderly with fall risk — high caution",
    check: ({ meds, answers }) => {
      const hasOpioid = meds?.some(m => ["oxycodone", "hydrocodone", "morphine", "codeine", "tramadol"].includes(m.toLowerCase()));
      const isElderly = (answers?.ageYears ?? 0) >= 75;
      const hasFallRisk = answers?.fallHistory || answers?.gaitInstability;
      if (hasOpioid && isElderly && hasFallRisk) {
        return { override: true, reason: "Opioid use in elderly patient with documented fall risk — mandatory physician review", severity: "HIGH", rule: "GR005" };
      }
      return { override: false };
    },
  },
  {
    id: "GR006",
    description: "Quinolone in tendinopathy / tendon rupture history",
    check: ({ meds, answers }) => {
      const hasQuinolone = meds?.some(m => ["ciprofloxacin", "levofloxacin", "moxifloxacin"].includes(m.toLowerCase()));
      const hasTendonRisk = answers?.tendonRupture || answers?.tendinopathyHistory;
      if (hasQuinolone && hasTendonRisk) {
        return { override: true, reason: "Fluoroquinolones contraindicated with tendinopathy/tendon rupture history — FDA black box warning", severity: "HIGH", rule: "GR006" };
      }
      return { override: false };
    },
  },
];

export interface GuardrailCheckResult {
  passed: boolean;
  overrides: Array<{ rule: string; reason: string; severity: string }>;
}

export function runGuardrailChecks(input: GuardrailInput): GuardrailCheckResult {
  const overrides: Array<{ rule: string; reason: string; severity: string }> = [];

  for (const rule of GUARDRAIL_RULES) {
    const result = rule.check(input);
    if (result.override && result.reason) {
      overrides.push({
        rule: result.rule ?? rule.id,
        reason: result.reason,
        severity: result.severity ?? "MEDIUM",
      });
    }
  }

  return { passed: overrides.length === 0, overrides };
}

export function applyGuardrailGate(
  currentDecision: AutonomyDecision,
  input: GuardrailInput
): AutonomyDecision {
  if (currentDecision.mode === "ESCALATE") return currentDecision;

  const result = runGuardrailChecks(input);
  if (result.passed) return currentDecision;

  const topSeverity = result.overrides.some(o => o.severity === "HIGH") ? "HIGH" : "MEDIUM";
  const reasons = result.overrides.map(o => `[${o.rule}] ${o.reason}`).join("; ");

  return {
    mode: topSeverity === "HIGH" ? "ESCALATE" : "REVIEW",
    reason: `Guardrail override (${topSeverity}): ${reasons}`,
  };
}
