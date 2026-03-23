import { clinicalSafetyCheck } from "../clinical/guardrails";
import { RoboticController } from "../robotics/roboticController";
import { analyzeFrame } from "../robotics/vision";

const roboticController = new RoboticController();

export interface PatientInput {
  patientId: string;
  complaints: string[];
  vitalSigns?: {
    temperature?: number;
    heartRate?: number;
    oxygenSaturation?: number;
  };
  age?: number;
  riskFactors?: string[];
}

export interface ClinicalDecision {
  triage: "immediate" | "urgent" | "routine" | "non-urgent";
  riskScore: number;
  recommendedActions: string[];
  roboticActionsTriggered: string[];
  guardrailsPassed: boolean;
  guardrailWarnings: string[];
  replayId?: string;
}

const ACTION_TO_TOOL: Record<string, "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope"> = {
  otoscopy: "otoscope",
  oral_exam: "oral_camera",
  ekg_assist: "ekg_camera",
  auscultation: "stethoscope",
};

function scoreTriage(complaints: string[], riskFactors: string[] = []): { triage: ClinicalDecision["triage"]; riskScore: number } {
  const urgentComplaints = new Set(["chest_pain", "breathlessness", "seizure", "stroke", "syncope"]);
  const routineComplaints = new Set(["ear_pain", "sore_throat", "cough", "headache"]);

  const hasUrgent = complaints.some(c => urgentComplaints.has(c));
  const riskBoost = riskFactors.length * 0.05;

  if (hasUrgent) return { triage: "immediate", riskScore: Math.min(0.95, 0.8 + riskBoost) };
  if (complaints.some(c => routineComplaints.has(c))) return { triage: "routine", riskScore: Math.min(0.5, 0.3 + riskBoost) };
  return { triage: "urgent", riskScore: Math.min(0.75, 0.55 + riskBoost) };
}

function selectActions(complaints: string[]): string[] {
  const actionMap: Record<string, string[]> = {
    ear_pain: ["otoscopy"],
    sore_throat: ["oral_exam"],
    chest_pain: ["ekg_assist", "auscultation"],
    breathlessness: ["auscultation"],
    cough: ["auscultation"],
    fever: ["otoscopy", "oral_exam"],
  };

  const actions = new Set<string>();
  for (const c of complaints) {
    for (const a of actionMap[c] ?? []) actions.add(a);
  }
  return [...actions];
}

export async function executeClinicalAction(patient: PatientInput): Promise<ClinicalDecision> {
  const { triage, riskScore } = scoreTriage(patient.complaints, patient.riskFactors);
  const recommendedActions = selectActions(patient.complaints);
  const roboticActionsTriggered: string[] = [];
  const guardrailWarnings: string[] = [];

  const safetyResult = clinicalSafetyCheck({
    type: recommendedActions[0] ?? "assessment",
    riskScore,
    requiresConsent: true,
    invasive: recommendedActions.some(a => ["otoscopy", "oral_exam", "swab"].includes(a)),
    patientId: patient.patientId,
  });

  if (!safetyResult.allowed) {
    return {
      triage,
      riskScore,
      recommendedActions,
      roboticActionsTriggered: [],
      guardrailsPassed: false,
      guardrailWarnings: [safetyResult.reason ?? "Blocked by guardrails"],
    };
  }

  if (safetyResult.warnings) guardrailWarnings.push(...safetyResult.warnings);

  const safety = {
    estopActive: false,
    humanPresent: true,
    clinicianApproved: true,
    collisionRisk: "LOW" as const,
    withinSafeZone: true,
  };

  for (const action of recommendedActions) {
    const tool = ACTION_TO_TOOL[action];
    if (!tool) continue;

    const visionResult = await analyzeFrame({ tool, patientId: patient.patientId });

    if (visionResult.safeToApproach) {
      const result = await roboticController.issueCommand(
        { type: "setMode", mode: "GUIDED_POSITION", issuedBy: "decisionBridge" },
        safety
      );
      if (result.ok) roboticActionsTriggered.push(`${action} (${tool})`);
    } else {
      guardrailWarnings.push(`Vision confidence too low for ${action} — skipped robotic approach`);
    }
  }

  return {
    triage,
    riskScore,
    recommendedActions,
    roboticActionsTriggered,
    guardrailsPassed: true,
    guardrailWarnings,
  };
}
