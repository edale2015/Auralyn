export type EcwExportTemplateInput = {
  caseId: string;
  patientName?: string;
  dob?: string;
  sex?: string;
  complaintLabel?: string;
  noteDraft?: string;
  physicianSummary?: string;
  engineDisposition?: string;
  finalDisposition?: string;
  dxCandidates?: Array<{ label?: string; dxId?: string }>;
  triggeredRedFlags?: string[];
  returnPrecautions?: string[];
  reviewerName?: string;
  reviewerId?: string;
  reviewerRationale?: string;
  signoffStatus?: string;
  createdAt?: string;
};

function topDxText(dx: Array<{ label?: string; dxId?: string }> = []): string {
  if (!dx.length) return "None listed";
  return dx
    .slice(0, 5)
    .map((d, i) => `${i + 1}. ${d.label || d.dxId || "Unknown"}`)
    .join("\n");
}

export function buildEcwExportText(input: EcwExportTemplateInput): string {
  const lines: string[] = [];

  lines.push("=== ENCOUNTER EXPORT BUNDLE ===");
  lines.push(`Case ID: ${input.caseId}`);
  if (input.createdAt) lines.push(`Created At: ${input.createdAt}`);
  lines.push("");

  lines.push("=== PATIENT ===");
  lines.push(`Name: ${input.patientName || "Unknown"}`);
  if (input.dob) lines.push(`DOB: ${input.dob}`);
  if (input.sex) lines.push(`Sex: ${input.sex}`);
  lines.push("");

  lines.push("=== CHIEF COMPLAINT ===");
  lines.push(input.complaintLabel || "Unknown complaint");
  lines.push("");

  lines.push("=== NOTE DRAFT ===");
  lines.push(input.noteDraft || "No draft note available.");
  lines.push("");

  lines.push("=== ENGINE SUMMARY ===");
  lines.push(`Engine disposition: ${input.engineDisposition || "UNKNOWN"}`);
  lines.push(`Final disposition: ${input.finalDisposition || input.engineDisposition || "UNKNOWN"}`);
  lines.push(`Triggered red flags: ${(input.triggeredRedFlags || []).join(", ") || "none"}`);
  lines.push("Top diagnosis candidates:");
  lines.push(topDxText(input.dxCandidates));
  lines.push("");

  lines.push("=== RETURN PRECAUTIONS ===");
  if ((input.returnPrecautions || []).length) {
    for (const item of input.returnPrecautions || []) lines.push(`- ${item}`);
  } else {
    lines.push("None documented.");
  }
  lines.push("");

  lines.push("=== REVIEW / SIGNOFF ===");
  lines.push(`Status: ${input.signoffStatus || "Not signed off"}`);
  lines.push(`Reviewer: ${input.reviewerName || input.reviewerId || "Unknown reviewer"}`);
  if (input.reviewerRationale) lines.push(`Rationale: ${input.reviewerRationale}`);
  if (input.physicianSummary) {
    lines.push("");
    lines.push("Reviewer Summary:");
    lines.push(input.physicianSummary);
  }

  return lines.join("\n");
}

export function buildEcwExportJson(input: EcwExportTemplateInput) {
  return {
    exportType: "ECW_SIDECAR",
    caseId: input.caseId,
    patient: {
      name: input.patientName,
      dob: input.dob,
      sex: input.sex
    },
    complaint: {
      label: input.complaintLabel
    },
    noteDraft: input.noteDraft,
    physicianSummary: input.physicianSummary,
    engine: {
      disposition: input.engineDisposition,
      finalDisposition: input.finalDisposition || input.engineDisposition,
      dxCandidates: input.dxCandidates || [],
      triggeredRedFlags: input.triggeredRedFlags || [],
      returnPrecautions: input.returnPrecautions || []
    },
    signoff: {
      status: input.signoffStatus,
      reviewerName: input.reviewerName,
      reviewerId: input.reviewerId,
      rationale: input.reviewerRationale
    },
    metadata: {
      createdAt: input.createdAt
    }
  };
}
