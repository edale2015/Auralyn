import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import type { CaseTriage, Disposition, Confidence } from "../models/caseTypes";

function normalizeDisposition(raw: string): Disposition {
  const s = (raw ?? "").toLowerCase().replace(/[\s_-]+/g, "_");
  if (s === "er_send" || s === "emerg" || s === "emergency") return "er_send";
  if (s === "urgent_care" || s === "urgent") return "urgent_care";
  if (s === "pcp" || s === "routine" || s === "primary_care") return "pcp";
  if (s === "self_care" || s === "telehealth" || s === "home") return "self_care";
  return "urgent_care";
}

function normalizeConfidence(raw: string): Confidence {
  const s = (raw ?? "").toUpperCase();
  if (s === "HIGH") return "HIGH";
  if (s === "MODERATE" || s === "MEDIUM") return "MODERATE";
  return "LOW";
}

function buildNarrativeText(
  complaintSlug: string,
  answers: Record<string, unknown>
): string {
  const complaint = complaintSlug.replace(/_/g, " ");
  const lines: string[] = [`Chief complaint: ${complaint}.`];
  for (const [key, value] of Object.entries(answers)) {
    const label = key.replace(/^Q_/, "").replace(/_/g, " ").toLowerCase();
    lines.push(`${label}: ${value}`);
  }
  return lines.join(" ");
}

export async function runOrchestratorTriage(params: {
  complaintSlug: string;
  answers: Record<string, unknown>;
}): Promise<CaseTriage> {
  const rawText = buildNarrativeText(params.complaintSlug, params.answers);
  const orchestrator = new ClinicalSkillOrchestrator();
  const state = await orchestrator.run({
    caseId: `INTAKE_${Date.now()}`,
    rawText,
    modifiers: { complaint_override: params.complaintSlug },
    knownFacts: {},
    priorSkillOutputs: {},
    config: { strictMode: false, enableAudit: false },
  });

  const sr = state.skillResults ?? {};
  const rawDisp =
    state.finalDisposition ??
    sr.determine_disposition?.result?.disposition ??
    "urgent_care";
  const rawFlags: string[] =
    sr.detect_red_flags?.result?.triggered_flags ??
    sr.detect_red_flags?.result?.red_flags ??
    [];

  const disposition = normalizeDisposition(rawDisp);
  const confidence = normalizeConfidence(
    sr.apply_clinical_score?.result?.confidence ?? "LOW"
  );

  return {
    disposition,
    topCluster: sr.identify_chief_complaint?.result?.complaint_id ?? params.complaintSlug,
    confidence,
    tieBreak: "none",
    margin: 0,
    rfTriggered: rawFlags,
    explanation: {
      topRules: [],
      topSuppressors: [],
      rfTriggered: rawFlags,
      tieBreak: "none",
      margin: 0,
      confidence,
    },
    engineVersion: {
      rulesetVersion: "orchestrator-v1",
      dxPriorityVersion: "orchestrator-v1",
    },
  };
}
