import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import type { CaseTriage, Disposition, Confidence } from "../models/caseTypes";
import { logInteraction } from "./interactionAuditService";

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
  sessionId?: string;
  caseId?: string;
  channel?: "telegram" | "whatsapp" | "web" | "api";
}): Promise<CaseTriage> {
  const sessionId = params.sessionId ?? `API_${Date.now()}`;
  const channel = params.channel ?? "api";
  const rawText = buildNarrativeText(params.complaintSlug, params.answers);

  const orchestrator = new ClinicalSkillOrchestrator();
  const t0 = Date.now();

  const state = await orchestrator.run({
    caseId: params.caseId ?? sessionId,
    rawText,
    modifiers: { complaint_override: params.complaintSlug },
    knownFacts: {},
    priorSkillOutputs: {},
    config: { strictMode: false, enableAudit: false },
  });

  const latencyMs = Date.now() - t0;
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

  const skillSequence = Object.keys(sr).join(" > ");
  const responseText = `disposition=${rawDisp} | confidence=${confidence} | skills=[${skillSequence}] | red_flags=${rawFlags.join(",")}`;

  logInteraction({
    sessionId,
    caseId: params.caseId,
    channel,
    direction: "llm_call",
    skillName: "orchestrator",
    promptText: rawText,
    responseText,
    modelUsed: "clinical-orchestrator-v1",
    latencyMs,
  }).catch(() => {});

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
