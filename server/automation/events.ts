/**
 * Automation Domain Events — Packet 20 Pipeline Integration
 *
 * These event types and topic names define the contract between the Automation
 * Layer and the rest of the system (Event Bus, Oversight, Meta-Learning).
 *
 * Usage:
 *   - Publish via the automationQueue (queue.ts)
 *   - Consume in oversightAgent (autonomousOversightAgent.ts)
 *   - Feed into meta-learning cycle for selector_drift insights
 */

export type AutomationEvent =
  | {
      type:       "TEMPLATE_RUN_REQUEST";
      templateId: string;
      payload:    Record<string, unknown>;
      traceId:    string;
      patientId?: string;
      clinicId?:  string;
    }
  | {
      type:          "TEMPLATE_RUN_RESULT";
      templateId:    string;
      ok:            boolean;
      result?:       unknown;
      error?:        string;
      durationMs?:   number;
      healedCount?:  number;   // how many selectors were healed during this run
      traceId:       string;
    }
  | {
      type:       "TEMPLATE_VALIDATION_RESULT";
      templateId: string;
      ok:         boolean;
      issues:     Array<{ step: number; selector?: string; error: string }>;
      traceId:    string;
    }
  | {
      type:         "SELECTOR_DRIFT_DETECTED";
      templateId:   string;
      selector:     string;
      confidence:   number;
      attempts:     number;
      traceId:      string;
    };

export const TOPICS = {
  RUN:        "automation.run",
  RESULT:     "automation.result",
  VALIDATION: "automation.validation",
  DRIFT:      "automation.selector_drift",
} as const;
