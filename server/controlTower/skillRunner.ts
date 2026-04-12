/**
 * Skill Runner — runs all applicable clinical skills against a patient
 * Skills are lightweight, deterministic clinical decision modules.
 * Results feed into the agent loop and control tower.
 */

import { detectSepsis, type SepsisSkillInput } from "../skills/sepsisDetection";

export interface SkillRunInput {
  id:          string;
  vitals:      Record<string, any>;
  complaint?:  string;
  symptoms?:   string[];
  history?:    any[];
}

export interface SkillRunOutput {
  patientId:     string;
  skillsRun:     string[];
  outputs:       any[];
  highRiskFlags: string[];
  runAt:         string;
}

export function runSkills(patient: SkillRunInput): SkillRunOutput {
  const outputs: any[]       = [];
  const skillsRun: string[]  = [];
  const highRiskFlags: string[] = [];

  // Trigger sepsis detection if fever / respiratory complaint / abnormal vitals
  const triggerSepsis =
    (patient.complaint ?? "").toLowerCase().includes("fever") ||
    (patient.symptoms ?? []).some((s) => ["fever", "chills", "infection"].includes(s.toLowerCase())) ||
    (patient.vitals.temp ?? 98.6) > 100.4 ||
    (patient.vitals.hr  ?? 70)   > 100;

  if (triggerSepsis) {
    const input: SepsisSkillInput = { vitals: { ...patient.vitals, sbp: patient.vitals.systolicBP ?? patient.vitals.sbp }, complaint: patient.complaint, symptoms: patient.symptoms };
    const result = detectSepsis(input);
    outputs.push(result);
    skillsRun.push("sepsis-detection");
    if (result.risk === "HIGH")     highRiskFlags.push("SEPSIS_HIGH_RISK");
    if (result.risk === "MODERATE") highRiskFlags.push("SEPSIS_MODERATE_RISK");
  }

  // Future skills will be added here (HEART score, CURB-65, CENTOR, etc.)

  return { patientId: patient.id, skillsRun, outputs, highRiskFlags, runAt: new Date().toISOString() };
}
