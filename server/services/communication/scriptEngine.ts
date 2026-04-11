import { detectTone, ToneType } from "./toneDetector";
import { getScriptVariant } from "./scriptVariants";

export const TRIGGER_COMPLAINTS = ["cough", "sinus", "uri", "upper respiratory", "sore throat", "cold"];
export const TRIGGER_VISIT_MIN = 3;
export const TRIGGER_DURATION_MAX_DAYS = 14;

export interface ScriptInput {
  complaint: string;
  visitCount: number;
  durationDays: number;
  priorAntibiotics: boolean;
  patientText?: string;
}

export interface ScriptOutput {
  script: string;
  tone: ToneType;
  variant: string;
  triggered: boolean;
  triggerReasons: string[];
}

export function isRepeatVisitTrigger(input: Pick<ScriptInput, "complaint" | "visitCount" | "durationDays">): boolean {
  const complaintMatch = TRIGGER_COMPLAINTS.some(c => input.complaint.toLowerCase().includes(c));
  return (
    input.visitCount >= TRIGGER_VISIT_MIN &&
    input.durationDays <= TRIGGER_DURATION_MAX_DAYS &&
    complaintMatch
  );
}

export function generateCommunicationScript(input: ScriptInput): ScriptOutput {
  const triggered = isRepeatVisitTrigger(input);

  if (!triggered) {
    return {
      script: "",
      tone: "neutral",
      variant: "none",
      triggered: false,
      triggerReasons: [],
    };
  }

  const triggerReasons: string[] = [
    `visit_count:${input.visitCount}`,
    `duration_days:${input.durationDays}`,
    `complaint:${input.complaint}`,
  ];
  if (input.priorAntibiotics) triggerReasons.push("prior_antibiotics");

  const tone = detectTone(input.patientText || "");
  const variant = getScriptVariant({ tone, complaint: input.complaint, priorAntibiotics: input.priorAntibiotics });

  return {
    script: variant.script,
    tone,
    variant: variant.name,
    triggered: true,
    triggerReasons,
  };
}
