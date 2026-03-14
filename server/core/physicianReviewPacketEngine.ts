export type ReviewPacketInput = {
  caseId?: string;
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions?: Record<string, any>;
  contradiction?: {
    hasErrors: boolean;
    conflicts?: Array<{ message: string; severity: string }>;
    hasWarnings?: boolean;
  } | null;
  safetyOverride?: {
    triggered: boolean;
    ruleId?: string;
    reason?: string;
    disposition?: string;
  } | null;
  risk?: {
    overallRisk: string;
    riskFactors: Array<{ label: string; severity: string; reason: string }>;
    supervisionFlags?: string[];
  };
  temporal?: {
    onsetCategory: string;
    trajectory: string;
    temporalSignals: Array<{ label: string; weight: number; reason: string }>;
    warnings?: string[];
  };
  aggregatedDifferentials?: Array<{ diagnosis: string; score: number }>;
  tests?: Array<{ test?: string; name?: string; urgency?: string; priority?: string }>;
  treatments?: Array<string | { treatmentName?: string; treatment?: string }>;
  returnPrecautions?: Array<string | { precautions?: string[] }>;
  supervisor?: {
    supervisorDecision: string;
    reasons: string[];
    blockers: string[];
    physicianReviewReasons: string[];
    confidenceBand?: string;
  };
  guideline?: {
    passed: boolean;
    violations: string[];
    reviewFlags: string[];
    matches?: string[];
  };
};

export type PhysicianReviewPacket = {
  summary: string;
  acuityBanner: "EMERGENT" | "HIGH RISK" | "PHYSICIAN REVIEW" | "WORKUP NEEDED" | "LOWER ACUITY";
  topDifferential: string[];
  criticalFindings: string[];
  temporalContext: string[];
  riskContext: string[];
  testsToConsider: string[];
  candidateTreatments: string[];
  returnPrecautions: string[];
  dischargeLimits: string[];
  physicianQuestions: string[];
  guidelineViolations: string[];
  auditSummary: Record<string, string>;
};

function normaliseTreatment(t: string | { treatmentName?: string; treatment?: string }): string {
  if (typeof t === "string") return t;
  return t.treatmentName ?? t.treatment ?? "";
}

function normaliseTest(t: { test?: string; name?: string; urgency?: string; priority?: string }): string {
  const name    = t.test ?? t.name ?? "";
  const urgency = t.urgency ?? t.priority ?? "routine";
  return `${name} [${urgency}]`;
}

export function physicianReviewPacketEngine(input: ReviewPacketInput): PhysicianReviewPacket {
  const topDifferential = (input.aggregatedDifferentials || [])
    .slice(0, 5)
    .map((d) => `${d.diagnosis} (${d.score.toFixed(3)})`);

  // ── Critical Findings ─────────────────────────────────────────────────────
  const criticalFindings: string[] = [];

  if (input.contradiction?.hasErrors) {
    for (const c of input.contradiction.conflicts ?? []) {
      if (c.severity === "error") criticalFindings.push(`Contradiction: ${c.message}`);
    }
  }

  if (input.safetyOverride?.triggered) {
    criticalFindings.push(
      `Safety override: ${input.safetyOverride.ruleId} — ${input.safetyOverride.reason || "emergency trigger"}`
    );
  }

  for (const rf of input.risk?.riskFactors ?? []) {
    if (rf.severity === "high") criticalFindings.push(`Risk: ${rf.label} — ${rf.reason}`);
  }

  for (const v of input.guideline?.violations ?? []) {
    criticalFindings.push(`Guideline violation: ${v}`);
  }

  // ── Temporal Context ──────────────────────────────────────────────────────
  const temporalContext: string[] = [];
  if (input.temporal) {
    temporalContext.push(
      `Onset: ${input.temporal.onsetCategory}, Trajectory: ${input.temporal.trajectory}`
    );
    for (const sig of input.temporal.temporalSignals) {
      temporalContext.push(`${sig.label} (weight ${sig.weight}): ${sig.reason}`);
    }
    for (const w of input.temporal.warnings ?? []) {
      temporalContext.push(`⚠ ${w}`);
    }
  }

  // ── Risk Context ──────────────────────────────────────────────────────────
  const riskContext: string[] = [];
  if (input.risk) {
    riskContext.push(`Overall risk: ${input.risk.overallRisk}`);
    for (const f of input.risk.riskFactors) {
      riskContext.push(`${f.label} [${f.severity}]: ${f.reason}`);
    }
    if ((input.risk.supervisionFlags ?? []).length > 0) {
      riskContext.push(`Supervision flags: ${input.risk.supervisionFlags!.join(", ")}`);
    }
  }

  // ── Tests & Treatments ────────────────────────────────────────────────────
  const testsToConsider      = (input.tests ?? []).map(normaliseTest);
  const candidateTreatments  = (input.treatments ?? []).map(normaliseTreatment).filter(Boolean);
  const returnPrecautionsOut = (input.returnPrecautions ?? []).flatMap((rp) => {
    if (typeof rp === "string") return [rp];
    return rp.precautions ?? [];
  });

  // ── Discharge Limits ──────────────────────────────────────────────────────
  const dischargeLimits: string[] = [];
  if (input.supervisor?.supervisorDecision !== "SAFE_FOR_PROTOCOLIZED_CARE") {
    dischargeLimits.push(`Supervisor: ${input.supervisor?.supervisorDecision}`);
  }
  for (const b of input.supervisor?.blockers ?? [])               dischargeLimits.push(b);
  for (const r of input.supervisor?.physicianReviewReasons ?? []) dischargeLimits.push(r);

  // ── Physician Questions ───────────────────────────────────────────────────
  const physicianQuestions: string[] = [];
  if (input.temporal?.onsetCategory === "hyperacute") {
    physicianQuestions.push("Does the onset timing imply vascular or other emergent pathology?");
  }
  if (input.risk?.overallRisk === "high") {
    physicianQuestions.push("Do comorbidities lower the threshold for escalation or imaging?");
  }
  if (input.guideline && !input.guideline.passed) {
    physicianQuestions.push("Does the plan need to be adjusted to match approved protocol?");
  }
  if ((input.aggregatedDifferentials ?? []).length >= 2) {
    physicianQuestions.push("What is the safest disposition given the competing differentials?");
  }
  if (input.risk?.supervisionFlags?.includes("pregnancy")) {
    physicianQuestions.push("Is this complaint safe to manage outpatient given pregnancy?");
  }
  if (input.risk?.supervisionFlags?.includes("anticoagulated")) {
    physicianQuestions.push("Does anticoagulation change the imaging threshold for this presentation?");
  }

  // ── Acuity Banner ────────────────────────────────────────────────────────
  const acuityBanner: PhysicianReviewPacket["acuityBanner"] =
    input.safetyOverride?.triggered                                        ? "EMERGENT"           :
    input.risk?.overallRisk === "high"                                     ? "HIGH RISK"          :
    input.supervisor?.supervisorDecision === "NEEDS_PHYSICIAN_REVIEW"      ? "PHYSICIAN REVIEW"   :
    input.supervisor?.supervisorDecision === "NEEDS_WORKUP"                ? "WORKUP NEEDED"      :
    "LOWER ACUITY";

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary =
    `Complaint: ${input.complaint}. ` +
    `Top differential: ${topDifferential[0] || "none"}. ` +
    `Acuity: ${acuityBanner}. ` +
    `Supervisor: ${input.supervisor?.supervisorDecision || "unknown"}. ` +
    `Confidence: ${input.supervisor?.confidenceBand || "unknown"}.`;

  // ── Audit Summary ─────────────────────────────────────────────────────────
  const auditSummary: Record<string, string> = {
    caseId:          input.caseId ?? "unknown",
    complaint:       input.complaint,
    acuity:          acuityBanner,
    supervisorDecision: input.supervisor?.supervisorDecision ?? "unknown",
    guidelinesPassed: String(input.guideline?.passed ?? true),
    riskLevel:       input.risk?.overallRisk ?? "unknown",
    onsetCategory:   input.temporal?.onsetCategory ?? "unknown",
    trajectory:      input.temporal?.trajectory ?? "unknown",
  };

  return {
    summary,
    acuityBanner,
    topDifferential,
    criticalFindings,
    temporalContext,
    riskContext,
    testsToConsider,
    candidateTreatments,
    returnPrecautions: returnPrecautionsOut,
    dischargeLimits,
    physicianQuestions,
    guidelineViolations: input.guideline?.violations ?? [],
    auditSummary,
  };
}
