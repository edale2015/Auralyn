/**
 * harnessEnforcer.ts
 * Drop into: server/harness/harnessEnforcer.ts
 *
 * Addition 2: Safety caps enforcement on every AI agent call.
 * Addition 3: Data context injection into the triage AI.
 *
 * Two exports:
 *
 *   enforceAgentCaps(state)
 *     Call at the start of every agent loop cycle.
 *     Throws HarnessCapExceeded if any cap is breached.
 *     Caps: max_reasoning_steps, max_tool_retries, max_llm_calls_per_case, max_cost_usd
 *
 *   buildClinicalContext(caseDoc, options?)
 *     Call before every LLM clinical reasoning call.
 *     Injects EHR context, KB rules, physician override patterns.
 *     Returns a structured ClinicalContext object ready for prompt injection.
 *
 * Wire into your existing agent loop (server/agent/ or wherever agentBrain runs):
 *   import { enforceAgentCaps, buildClinicalContext } from "../harness/harnessEnforcer";
 *
 *   // At the top of each agent cycle:
 *   enforceAgentCaps(agentState);
 *
 *   // Before each LLM call:
 *   const ctx = await buildClinicalContext(caseDoc);
 *   // Include ctx in your system prompt / user message
 */

import { appendAuditEvent } from "../governance/audit";
import { fetchPatientContext } from "../integrations/ehr/fhirPatientContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentState {
  caseId:          string;
  reasoningSteps:  number;
  toolRetries:     Record<string, number>;  // toolName → retry count
  llmCallCount:    number;
  estimatedCostUsd: number;
}

export class HarnessCapExceeded extends Error {
  constructor(
    public cap:    string,
    public value:  number,
    public limit:  number,
    public caseId: string
  ) {
    super(`[HarnessCap] ${cap} exceeded: ${value}/${limit} for case ${caseId}`);
    this.name = "HarnessCapExceeded";
  }
}

// Caps from AGENTS.md — single source of truth
export const HARNESS_CAPS = {
  MAX_REASONING_STEPS:    5,
  MAX_TOOL_RETRIES:       2,
  MAX_LLM_CALLS_PER_CASE: 8,
  MAX_COST_USD_PER_CASE:  1.50,
} as const;

export interface ClinicalContext {
  // What data is present (for LOW_CONTEXT warning)
  dataQuality: {
    hasEhrMedications: boolean;
    hasEhrAllergies:   boolean;
    hasEhrConditions:  boolean;
    hasPatientAge:     boolean;
    hasPatientSex:     boolean;
    contextLevel:      "full" | "partial" | "minimal";
  };

  // Verified clinical data
  medications: string[];       // labeled: "Lisinopril 10mg daily [source: ehr]"
  allergies:   string[];       // labeled: "Penicillin — rash [source: ehr]"
  conditions:  string[];       // labeled: "Essential hypertension I10 [source: ehr]"
  recentLabs:  string[];       // labeled: "HbA1c 7.8% (high) 2026-03-01 [source: ehr]"

  // Patient demographics
  age?:        number;
  sex?:        string;

  // Override patterns from physician history (last 90 days)
  overridePatterns: string[];  // e.g. "For sore_throat: physician upgraded 34% of self_care to pcp"

  // Formatted prompt block — inject this directly into system/user message
  promptBlock: string;
}

// ─── Addition 2: Safety caps enforcement ─────────────────────────────────────

export function enforceAgentCaps(state: AgentState): void {
  const { caseId, reasoningSteps, toolRetries, llmCallCount, estimatedCostUsd } = state;

  if (reasoningSteps > HARNESS_CAPS.MAX_REASONING_STEPS) {
    triggerCapBreach("MAX_REASONING_STEPS", reasoningSteps, HARNESS_CAPS.MAX_REASONING_STEPS, caseId);
    throw new HarnessCapExceeded("MAX_REASONING_STEPS", reasoningSteps, HARNESS_CAPS.MAX_REASONING_STEPS, caseId);
  }

  for (const [tool, retries] of Object.entries(toolRetries)) {
    if (retries > HARNESS_CAPS.MAX_TOOL_RETRIES) {
      triggerCapBreach(`MAX_TOOL_RETRIES:${tool}`, retries, HARNESS_CAPS.MAX_TOOL_RETRIES, caseId);
      throw new HarnessCapExceeded(`MAX_TOOL_RETRIES:${tool}`, retries, HARNESS_CAPS.MAX_TOOL_RETRIES, caseId);
    }
  }

  if (llmCallCount > HARNESS_CAPS.MAX_LLM_CALLS_PER_CASE) {
    triggerCapBreach("MAX_LLM_CALLS", llmCallCount, HARNESS_CAPS.MAX_LLM_CALLS_PER_CASE, caseId);
    throw new HarnessCapExceeded("MAX_LLM_CALLS", llmCallCount, HARNESS_CAPS.MAX_LLM_CALLS_PER_CASE, caseId);
  }

  if (estimatedCostUsd > HARNESS_CAPS.MAX_COST_USD_PER_CASE) {
    triggerCapBreach("MAX_COST_USD", estimatedCostUsd, HARNESS_CAPS.MAX_COST_USD_PER_CASE, caseId);
    throw new HarnessCapExceeded("MAX_COST_USD", estimatedCostUsd, HARNESS_CAPS.MAX_COST_USD_PER_CASE, caseId);
  }
}

function triggerCapBreach(cap: string, value: number, limit: number, caseId: string): void {
  // Fire-and-forget audit event — non-blocking
  appendAuditEvent({
    actor:      "system",
    action:     "SAFETY_CAP_EXCEEDED",
    entityId:   caseId,
    entityType: "case",
    details: {
      cap,
      value,
      limit,
      action: "ESCALATE_TO_PHYSICIAN",
    },
  }).catch(console.error);

  console.error(`[HarnessCap] BREACH: ${cap} = ${value} (limit: ${limit}) for case ${caseId}`);
}

// ─── Addition 3: Data context injection ──────────────────────────────────────

export async function buildClinicalContext(
  caseDoc: {
    caseId:    string;
    complaint?: { slug?: string } | string;
    answers?:  { structured?: Record<string, any> };
    source?:   { channel?: string; threadId?: string };
  },
  options: {
    ehrPatientId?:  string;
    ehrVendor?:     "ecw" | "athena" | "epic" | "mock";
    ehrToken?:      string;
    physicianId?:   string;
  } = {}
): Promise<ClinicalContext> {

  const structured = caseDoc.answers?.structured ?? {};
  const ehrVendor  = options.ehrVendor ?? "mock";

  // ── Fetch EHR context if patient ID available ────────────────────────────
  let ehrMedications: string[] = [];
  let ehrAllergies:   string[] = [];
  let ehrConditions:  string[] = [];
  let ehrLabs:        string[] = [];
  let ehrAge:         number | undefined;
  let ehrSex:         string | undefined;
  let ehrFetchError:  string | null = null;

  if (options.ehrPatientId) {
    try {
      const ctx = await fetchPatientContext({
        vendor:      ehrVendor,
        patientId:   options.ehrPatientId,
        accessToken: options.ehrToken,
      });

      // Per GP-05: EHR wins for medications and allergies
      ehrMedications = ctx.medications
        .filter(m => m.status === "active")
        .map(m => `${[m.name, m.dose, m.frequency].filter(Boolean).join(" ")} [source: ehr]`);

      ehrAllergies = ctx.allergies
        .filter(a => a.status === "active")
        .map(a => `${a.substance}${a.reaction ? ` — ${a.reaction}` : ""}${a.severity ? ` (${a.severity})` : ""} [source: ehr]`);

      ehrConditions = ctx.conditions
        .filter(c => c.status === "active")
        .map(c => `${c.display}${c.icdCode ? ` ${c.icdCode}` : ""} [source: ehr]`);

      ehrLabs = ctx.labs.map(l =>
        `${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.flag && l.flag !== "normal" ? ` (${l.flag})` : ""} ${l.date.split("T")[0]} [source: ehr]`
      );

      ehrAge = ctx.demographics.age;
      ehrSex = ctx.demographics.sex;

    } catch (err: any) {
      ehrFetchError = err.message;
      console.warn(`[HarnessEnforcer] EHR context fetch failed: ${err.message}`);
    }
  }

  // ── Merge with self-reported data (EHR wins per GP-05) ───────────────────
  // Self-report only used when EHR data absent
  const selfMeds       = Array.isArray(structured.medications) ? structured.medications : [];
  const selfAllergies  = Array.isArray(structured.allergies)   ? structured.allergies   : [];
  const selfConditions = Array.isArray(structured.conditions)  ? structured.conditions  : [];

  const medications = ehrMedications.length > 0
    ? ehrMedications
    : selfMeds.map((m: string) => `${m} [source: self_report]`);

  const allergies = ehrAllergies.length > 0
    ? ehrAllergies
    : selfAllergies.map((a: string) => `${a} [source: self_report]`);

  const conditions = ehrConditions.length > 0
    ? ehrConditions
    : selfConditions.map((c: string) => `${c} [source: self_report]`);

  const age = ehrAge ?? structured.age;
  const sex = ehrSex ?? structured.sex;

  // ── Data quality assessment ───────────────────────────────────────────────
  const hasEhrMedications = ehrMedications.length > 0;
  const hasEhrAllergies   = ehrAllergies.length   > 0;
  const hasEhrConditions  = ehrConditions.length  > 0;
  const hasPatientAge     = age !== undefined;
  const hasPatientSex     = sex !== undefined;

  const ehrScore = [hasEhrMedications, hasEhrAllergies, hasEhrConditions].filter(Boolean).length;
  const contextLevel: "full" | "partial" | "minimal" =
    ehrScore >= 3 && hasPatientAge ? "full" :
    ehrScore >= 1 || hasPatientAge ? "partial" : "minimal";

  // ── Override patterns (last 90 days for this complaint) ──────────────────
  // Stub — in production query audit_hash_chain for physician override patterns
  // grouped by complaint slug. This gives the LLM signal on where it tends to
  // be wrong for this complaint type.
  const complaintSlug = typeof caseDoc.complaint === "string"
    ? caseDoc.complaint
    : caseDoc.complaint?.slug ?? "";

  const overridePatterns: string[] = [];
  // TODO: Query audit_hash_chain WHERE action IN ('CASE_MODIFIED','CASE_REJECTED')
  // AND event_data->>'complaintSlug' = complaintSlug
  // AND timestamp > NOW() - INTERVAL '90 days'
  // Summarize: "Physician upgraded X% of self_care to pcp for this complaint"

  // ── Build prompt block ────────────────────────────────────────────────────
  const contextWarnings: string[] = [];
  if (contextLevel === "minimal") {
    contextWarnings.push("⚠️ LOW_CONTEXT: No EHR data available. All clinical data is patient self-report only. Apply additional caution.");
  }
  if (contextLevel === "partial") {
    contextWarnings.push("⚠️ PARTIAL_CONTEXT: Some EHR data unavailable. Medication safety checks may be incomplete.");
  }
  if (ehrFetchError) {
    contextWarnings.push(`⚠️ EHR_FETCH_ERROR: ${ehrFetchError}`);
  }

  const promptBlock = `
## CLINICAL CONTEXT (Harness-Injected — Do Not Override)
${contextWarnings.length > 0 ? contextWarnings.join("\n") : "✅ Context level: " + contextLevel}

**Patient Demographics:**
${age    ? `- Age: ${age}` : "- Age: unknown"}
${sex    ? `- Sex: ${sex}` : "- Sex: unknown"}

**Verified Medications (${medications.length}):**
${medications.length > 0 ? medications.map(m => `- ${m}`).join("\n") : "- None reported"}

**Verified Allergies (${allergies.length}):**
${allergies.length > 0 ? allergies.map(a => `- ${a}`).join("\n") : "- NKDA (no known drug allergies)"}

**Active Conditions (${conditions.length}):**
${conditions.length > 0 ? conditions.map(c => `- ${c}`).join("\n") : "- None reported"}

**Recent Labs:**
${ehrLabs.length > 0 ? ehrLabs.map(l => `- ${l}`).join("\n") : "- No recent labs available"}

${overridePatterns.length > 0 ? `**Clinical Pattern Note:**\n${overridePatterns.map(p => `- ${p}`).join("\n")}` : ""}

**Standing Orders (from AGENTS.md):**
- You are conservative, evidence-based, fail-safe clinical decision support
- Never set approval fields — physician governs all clinical decisions
- Flag LOW CONFIDENCE when confidence < 0.60
- EHR-verified data supersedes self-report for medication safety
- intendedUse: "clinical_decision_support_only" on all outputs
`.trim();

  return {
    dataQuality: {
      hasEhrMedications,
      hasEhrAllergies,
      hasEhrConditions,
      hasPatientAge,
      hasPatientSex,
      contextLevel,
    },
    medications,
    allergies,
    conditions,
    recentLabs: ehrLabs,
    age,
    sex,
    overridePatterns,
    promptBlock,
  };
}

// ─── Agent state factory ──────────────────────────────────────────────────────
// Use this to initialize AgentState at the start of each case processing loop.

export function createAgentState(caseId: string): AgentState {
  return {
    caseId,
    reasoningSteps:  0,
    toolRetries:     {},
    llmCallCount:    0,
    estimatedCostUsd: 0,
  };
}

export function incrementStep(state: AgentState): AgentState {
  return { ...state, reasoningSteps: state.reasoningSteps + 1 };
}

export function incrementLlmCall(state: AgentState, estimatedCost = 0.02): AgentState {
  return {
    ...state,
    llmCallCount:     state.llmCallCount + 1,
    estimatedCostUsd: state.estimatedCostUsd + estimatedCost,
  };
}

export function incrementToolRetry(state: AgentState, toolName: string): AgentState {
  return {
    ...state,
    toolRetries: {
      ...state.toolRetries,
      [toolName]: (state.toolRetries[toolName] ?? 0) + 1,
    },
  };
}
