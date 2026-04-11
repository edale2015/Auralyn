export interface OverrideInput {
  physicianDecision: string;
  systemDecision: string;
  reason: string;
}

export interface OverrideResult {
  override: boolean;
  discrepancy: boolean;
  reason: string;
  learningSignal: "positive_override" | "negative_override" | "aligned";
  notes: string[];
}

export async function handleOverride(input: OverrideInput): Promise<OverrideResult> {
  const discrepancy = input.physicianDecision !== input.systemDecision;
  const notes: string[] = [];

  let learningSignal: OverrideResult["learningSignal"] = "aligned";

  if (discrepancy) {
    const physicianGaveAntibiotic =
      input.physicianDecision.includes("ANTIBIOTIC") &&
      !input.physicianDecision.includes("NO_ANTIBIOTIC");
    const systemGaveAntibiotic =
      input.systemDecision.includes("ANTIBIOTIC") &&
      !input.systemDecision.includes("NO_ANTIBIOTIC");

    if (physicianGaveAntibiotic && !systemGaveAntibiotic) {
      notes.push("Physician escalated to antibiotic vs system conservative — review threshold.");
      learningSignal = "positive_override";
    } else if (!physicianGaveAntibiotic && systemGaveAntibiotic) {
      notes.push("Physician withheld antibiotic vs system suggestion — conservative override.");
      learningSignal = "negative_override";
    } else {
      notes.push("Disposition variance detected — logging for pattern analysis.");
      learningSignal = "positive_override";
    }

    if (input.reason.trim().length < 10) {
      notes.push("Warning: override reason is too brief for defensible documentation.");
    }
  } else {
    notes.push("Physician aligned with system recommendation.");
  }

  return {
    override: discrepancy,
    discrepancy,
    reason: input.reason,
    learningSignal,
    notes,
  };
}
