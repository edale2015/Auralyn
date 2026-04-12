/**
 * Smart Intake Router — stage-based clinical routing from free-text intake
 * Translates the Python LangGraph intake_node + clinical_router pattern into
 * our TypeScript medical OS pipeline.
 *
 * Flow: analyze text → assign risk → attach option buttons → emit stage decision
 * Stage options: escalation | urgent_booking | routine_booking
 */

import { analyzeSymptomText, type SymptomAnalysisResult } from "./symptomTextAnalyzer";
import { preDispositionHook }                              from "../hooks/preDisposition";
import { logEvent }                                        from "../ops/auditEvents";

export type IntakeStage =
  | "escalation"
  | "urgent_booking"
  | "routine_booking"
  | "complete";

export interface IntakeOption {
  label:  string;
  action: string;
  urgent: boolean;
}

export interface IntakeResponse {
  stage:       IntakeStage;
  message:     string;
  options:     IntakeOption[];
  riskLevel:   SymptomAnalysisResult["riskLevel"];
  redFlags:    string[];
  reasoning:   string;
  confidence:  number;
  disposition: "EMERGENCY" | "URGENT" | "ROUTINE" | "MONITOR";
  safetyHooks: string[];
  analysis:    SymptomAnalysisResult;
}

const STAGE_CONFIG: Record<
  IntakeStage,
  { message: string; options: IntakeOption[]; disposition: IntakeResponse["disposition"] }
> = {
  escalation: {
    disposition: "EMERGENCY",
    message:
      "⚠️ These symptoms may indicate a serious emergency. Please seek immediate medical attention or call 911.",
    options: [
      { label: "Call 911",           action: "call:911",           urgent: true  },
      { label: "Go to ER",           action: "navigate:er",        urgent: true  },
      { label: "Speak to a nurse",   action: "connect:nurse",      urgent: false },
    ],
  },
  urgent_booking: {
    disposition: "URGENT",
    message:
      "Your symptoms suggest you should be seen soon. Let's get you an urgent care appointment right away.",
    options: [
      { label: "Book Urgent Appointment", action: "book:urgent",   urgent: true  },
      { label: "Virtual Visit Now",       action: "start:virtual", urgent: true  },
      { label: "ER if symptoms worsen",   action: "navigate:er",   urgent: false },
    ],
  },
  routine_booking: {
    disposition: "ROUTINE",
    message:
      "This appears to be a routine concern. Would you like to schedule a visit with one of our providers?",
    options: [
      { label: "Book Appointment",  action: "book:routine", urgent: false },
      { label: "View Availability", action: "show:slots",   urgent: false },
      { label: "No thanks",         action: "dismiss",      urgent: false },
    ],
  },
  complete: {
    disposition: "MONITOR",
    message:     "Thank you. Your information has been recorded.",
    options:     [],
  },
};

function classifyStage(riskLevel: SymptomAnalysisResult["riskLevel"]): IntakeStage {
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") return "escalation";
  if (riskLevel === "MODERATE")                         return "urgent_booking";
  return "routine_booking";
}

export function routeIntake(patientId: string, symptomText: string): IntakeResponse {
  const analysis = analyzeSymptomText(symptomText);
  const stage    = classifyStage(analysis.riskLevel);
  const config   = STAGE_CONFIG[stage];

  // Run safety hooks for additional validation
  const hookResult = preDispositionHook(
    {
      patientId,
      redFlags: analysis.redFlags,
      vitals:   {},
    },
    {
      disposition: config.disposition === "EMERGENCY" ? "ER_IMMEDIATE" : "OBSERVE",
      confidence:  analysis.confidence,
    }
  );

  logEvent({
    actor:      "smart_intake_router",
    action:     `intake:${stage}`,
    entityType: "patient",
    entityId:   patientId,
    details:    { riskLevel: analysis.riskLevel, redFlags: analysis.redFlags, stage },
  });

  return {
    stage,
    message:     config.message,
    options:     config.options,
    riskLevel:   analysis.riskLevel,
    redFlags:    analysis.redFlags,
    reasoning:   analysis.reasoning,
    confidence:  analysis.confidence,
    disposition: config.disposition,
    safetyHooks: hookResult.appliedHooks,
    analysis,
  };
}

export function batchRouteIntake(entries: Array<{ patientId: string; symptoms: string }>): IntakeResponse[] {
  return entries.map((e) => routeIntake(e.patientId, e.symptoms));
}
