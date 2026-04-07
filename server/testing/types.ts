export type Tri = "Yes" | "No" | "Not sure";

export type Scenario = {
  runId: string;
  ts: number;
  system: string;
  flowId: string;
  chiefComplaint: string;
  routerText: string;
  answers: Record<string, Tri>;
  modifiers?: Record<string, any>;
  tags?: string[];
};

export type SystemOutput = {
  disposition: string;
  redFlag: boolean;
  raw: any;
};

export type Expected = {
  expectedDisposition: "urgent_or_ed" | "routine_or_supportive";
  reasons: string[];
};

export type Score = {
  pass: boolean;
  severity: number;
  issues: { code: string; message: string }[];
};

export type TestRunRecord = {
  runId: string;
  ts: number;
  system: string;
  flowId: string;
  chiefComplaint: string;
  routerText: string;
  answers: Record<string, Tri>;
  modifiers?: Record<string, any>;
  expected: Expected;
  output: SystemOutput;
  score: Score;
  tags?: string[];
};

// ── Packet 13: System Test Harness types ────────────────────────────────────

import type { PosteriorAnalysis } from "../clinical/posteriorAnalysis";
import type { DecisionContext } from "../clinical/finalDecisionEngine";
import type { NodeExecutionResult } from "../services/complaintNodeRunner";
import type { ParsedComplaint } from "../clinical/complaintResolver";

export interface SystemTestCase {
  id: string;

  input: {
    message: string;
    patientContext?: {
      caseId?: string;
      patientId?: string;
      symptoms?: string[];
      scores?: Record<string, number>;
      [key: string]: any;
    };
  };

  expected: {
    disposition?: string;
    primaryDiagnosis?: string;
    mustIncludeDifferential?: string[];
    mustNotIncludeDifferential?: string[];
    requiresPhysicianReview?: boolean;
    mustTriggerSafetyGate?: boolean;
  };

  metadata?: {
    category: "safe" | "edge" | "high_risk" | "regression";
    description?: string;
  };
}

export interface SystemRunResult {
  caseId: string;
  parsed?: ParsedComplaint;
  resolvedComplaint?: string;
  nodeTrace: NodeExecutionResult[];
  posterior?: PosteriorAnalysis;
  decision?: DecisionContext;
  patientResponse?: string;
  errors: string[];
}

export interface ValidationResult {
  passed: boolean;
  failures: string[];
}

export interface SuiteRunResult {
  id: string;
  passed: boolean;
  failures: string[];
  trace: SystemRunResult;
}
