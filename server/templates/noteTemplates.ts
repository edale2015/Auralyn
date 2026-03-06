export type NoteTemplateInput = {
  patientName?: string;
  ageYears?: number;
  sex?: string;
  complaintLabel?: string;
  answers?: Record<string, unknown>;
  dxCandidates?: Array<{ label?: string; dxId?: string }>;
  triggeredRedFlags?: string[];
  recommendedDisposition?: string;
  winningClusterId?: string;
  returnPrecautions?: string[];
  physicianSummary?: string;
};

function formatAnswers(answers: Record<string, unknown> = {}): string[] {
  return Object.entries(answers)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
}

function formatDx(dxCandidates: Array<{ label?: string; dxId?: string }> = []): string[] {
  return (dxCandidates || []).slice(0, 5).map((d) => d.label || d.dxId || "Unknown");
}

export function buildHpiSection(input: NoteTemplateInput): string {
  const bits: string[] = [];

  if (input.ageYears || input.sex) {
    bits.push(
      `${input.ageYears ? `${input.ageYears}-year-old` : "Patient"}${input.sex ? ` ${input.sex}` : ""}`
    );
  } else {
    bits.push("Patient");
  }

  bits.push(`presents with ${input.complaintLabel || "a medical concern"}.`);

  const answerLines = formatAnswers(input.answers);
  if (answerLines.length) {
    bits.push(`Relevant structured intake findings: ${answerLines.join("; ")}.`);
  }

  return bits.join(" ");
}

export function buildAssessmentSection(input: NoteTemplateInput): string {
  const dx = formatDx(input.dxCandidates);
  const lines: string[] = [];

  lines.push(`Primary complaint: ${input.complaintLabel || "Unknown complaint"}.`);

  if (dx.length) {
    lines.push(`Top differential considerations: ${dx.join(", ")}.`);
  }

  if (input.winningClusterId) {
    lines.push(`Engine-selected cluster: ${input.winningClusterId}.`);
  }

  if ((input.triggeredRedFlags || []).length) {
    lines.push(`Red flags identified: ${input.triggeredRedFlags!.join(", ")}.`);
  } else {
    lines.push(`No engine red flags triggered.`);
  }

  return lines.join(" ");
}

export function buildPlanSection(input: NoteTemplateInput): string {
  const lines: string[] = [];

  lines.push(`Recommended disposition: ${input.recommendedDisposition || "UNKNOWN"}.`);

  if ((input.returnPrecautions || []).length) {
    lines.push(`Return precautions: ${input.returnPrecautions!.join("; ")}.`);
  }

  if (input.physicianSummary) {
    lines.push(`Reviewer summary: ${input.physicianSummary}`);
  }

  return lines.join(" ");
}

export function buildFullDraftNote(input: NoteTemplateInput): string {
  const sections = [
    `CHIEF COMPLAINT\n${input.complaintLabel || "Unknown complaint"}`,
    `HPI\n${buildHpiSection(input)}`,
    `ASSESSMENT\n${buildAssessmentSection(input)}`,
    `PLAN\n${buildPlanSection(input)}`
  ];

  return sections.join("\n\n");
}
