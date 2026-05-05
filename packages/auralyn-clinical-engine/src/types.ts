/**
 * types.ts — Auralyn Clinical Pipeline Engine
 * All shared TypeScript types for the 13-step clinical rule execution pipeline.
 */

// ─── Rule types ───────────────────────────────────────────────────────────────

export type RuleType =
  | "diagnosis"
  | "modifier"
  | "question"
  | "workup"
  | "medication"
  | "red_flag"
  | "cluster_scoring"
  | "disposition"
  | "plan";

export type SafetyLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export type LogicType =
  | "boolean"
  | "threshold"
  | "scoring"
  | "mapping"
  | "conditional";

export type DispositionCode =
  | "ER_NOW"
  | "ED_NOW"
  | "CALL_911"
  | "URGENT_CARE"
  | "ADMIT"
  | "HOME_CARE"
  | "FOLLOW_UP_48H"
  | "FOLLOW_UP_72H"
  | "TELEMEDICINE";

// ─── Master Rule (27-column schema) ──────────────────────────────────────────

export interface MasterRule {
  rule_id:                string;
  rule_name:              string;
  rule_type:              RuleType;
  priority:               number;
  complaint_id:           string | null;
  cluster_id:             string | null;
  diagnosis_id:           string | null;
  modifier_dependencies:  string[];
  question_dependencies:  string[];
  red_flag_dependencies:  string[];
  input_fields:           string[];
  logic_description:      string;
  logic_type:             LogicType;
  source_tab:             string;
  target_tabs:            string[];
  outputs:                Record<string, any>;
  disposition_impact:     DispositionCode | null;
  medication_impact:      string | null;
  workup_impact:          string | null;
  safety_level:           SafetyLevel;
  override_rules:         string[];
  confidence_weight:      number;
  active:                 boolean;
  version:                string;
  last_updated:           string;
  owner:                  string;
  notes:                  string;
}

// ─── Pipeline inputs ──────────────────────────────────────────────────────────

export interface PipelineInputs {
  [key: string]: string | number | boolean;
}

// ─── Pipeline step result ─────────────────────────────────────────────────────

export interface FiredRule {
  rule_id:            string;
  rule_name:          string;
  safety_level:       SafetyLevel;
  logic_type:         LogicType;
  outputs:            Record<string, any>;
  disposition_impact: DispositionCode | null;
  confidence_weight:  number;
}

export interface StepResult {
  step:           number;
  name:           string;
  ruleType:       string;
  rulesEvaluated: number;
  rulesFired:     FiredRule[];
  outputs:        Record<string, any>;
  redFlagHit:     boolean;
  escalation:     string | null;
  summary:        string;
}

// ─── Final pipeline result ────────────────────────────────────────────────────

export interface PipelineResult {
  ok:               boolean;
  complaint_id:     string;
  inputs:           PipelineInputs;
  executedAt:       string;
  hardStop:         boolean;
  hardStopReason:   string | null;
  finalDisposition: DispositionCode | "HOME_CARE";
  steps:            StepResult[];
  totalRulesFired:  number;
  criticalFlagsHit: string[];
}

// ─── Clinical decision tree (flowchart) ──────────────────────────────────────

export interface FlowNode {
  id:       string;
  type:     "start" | "decision" | "process" | "action" | "terminal";
  label:    string;
  detail?:  string[];
  next_id?: string;
  yes_id?:  string;
  no_id?:   string;
}

export interface Flowchart {
  title:    string;
  start_id: string;
  nodes:    FlowNode[];
}

// ─── Pipeline step definition ─────────────────────────────────────────────────

export interface PipelineStepDef {
  step:     number;
  name:     string;
  ruleType: RuleType | null;
}
