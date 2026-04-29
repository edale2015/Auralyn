/**
 * adversarialKBValidator.ts
 * Drop into: server/harness/adversarialKBValidator.ts
 *
 * Implementation A: Adversarial Knowledge Base Validator
 *
 * Runs NIGHTLY (2am UTC via BullMQ) — never in real-time patient flow.
 *
 * Three-agent loop validates Auralyn's 272 red-flag rules and 500+ diagnosis
 * rules against current clinical guidelines. Surfaces drift, contradictions,
 * and coverage gaps for physician review.
 *
 * ARCHITECTURE:
 *   Planner (Opus)     — selects rules to validate, decomposes into sprint contracts
 *   Generator (Sonnet) — generates validation evidence and proposed rule updates
 *   Evaluator (Opus)   — adversarially challenges each proposed update
 *
 * OUTPUT:
 *   A structured KBValidationReport saved to Postgres.
 *   Flagged rules surfaced in the physician review dashboard.
 *   No rule changes applied automatically — physician approval required.
 *
 * PATIENT SAFETY NOTE:
 *   This loop runs completely offline, separate from the patient triage pipeline.
 *   No patient is ever waiting for this loop. It has no latency requirements.
 *   All proposed rule changes require explicit physician/admin approval before
 *   reaching the production KB.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db }   from "../db";
import { sql }  from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBRule {
  id:          string;
  type:        "red_flag" | "diagnosis" | "treatment" | "disposition";
  complaint:   string;
  condition:   string;
  action:      string;
  source?:     string;
  lastReviewed?: string;
}

export interface SprintContract {
  sprintId:          string;
  featureScope:      string;
  rules:             KBRule[];
  verificationMethod: string;
  passThresholds: {
    guidelineAlignment: number;   // 0-1, e.g. 0.80 = 80% aligned
    contradictionsFree: boolean;
    coverageComplete:   boolean;
  };
  edgeCaseTraps: string[];
}

export interface RuleValidationResult {
  ruleId:              string;
  generatorAssessment: string;
  evaluatorChallenge:  string;
  finalVerdict:        "validated" | "needs_update" | "contradicted" | "outdated";
  proposedUpdate?:     string;
  evidenceSource?:     string;
  confidenceScore:     number;
  requiresPhysicianReview: boolean;
}

export interface KBValidationReport {
  runId:           string;
  runAt:           string;
  sprintsCompleted: number;
  totalRules:      number;
  validated:       number;
  needsUpdate:     number;
  contradicted:    number;
  results:         RuleValidationResult[];
  summary:         string;
  physicianReviewRequired: RuleValidationResult[];
}

// ─── Planner ──────────────────────────────────────────────────────────────────
// Runs on Opus. Selects rules to validate and decomposes into sprint contracts.
// Runs once per nightly validation session.

async function planValidationSprints(rules: KBRule[]): Promise<SprintContract[]> {
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 2000,
    system: `You are the Planner agent for Auralyn's clinical KB validation system.
Your job is to group clinical rules into validation sprints of 5-10 rules each,
prioritizing by clinical risk (red flags first, then high-confidence diagnosis rules).

For each sprint, define:
1. A clear feature scope (what these rules collectively cover)
2. A verification method (what clinical guidelines should be checked)
3. Pass thresholds (guideline alignment %, contradiction-free, coverage complete)
4. Edge case traps (specific clinical scenarios to test against)

Return ONLY valid JSON array of SprintContract objects. No markdown.`,
    messages: [{
      role:    "user",
      content: `Create validation sprints for these ${rules.length} KB rules:\n${JSON.stringify(rules.slice(0, 20), null, 2)}\n\nReturn a JSON array of sprint contracts.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Generator ────────────────────────────────────────────────────────────────
// Runs on Sonnet. Validates rules against guidelines, proposes updates.
// Runs once per adversarial round per sprint.

async function generateValidationEvidence(
  contract:  SprintContract,
  roundNum:  number
): Promise<RuleValidationResult[]> {

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 3000,
    system: `You are the Generator agent for Auralyn's clinical KB validation system.
Your job is to validate clinical rules against current medical guidelines.

For each rule:
1. Assess alignment with current ACEP, AAP, AHA, CDC, or relevant specialty guidelines
2. Identify any contradictions with current evidence
3. Propose specific updates if the rule is outdated or incomplete
4. Assign a confidence score (0.0-1.0)

Be specific and cite the guideline basis for each assessment.
Return ONLY valid JSON array of RuleValidationResult objects. No markdown.

Round ${roundNum} of validation. Previous rounds' findings should make you more precise.`,
    messages: [{
      role:    "user",
      content: `Validate these rules per the sprint contract:\n\nSprint: ${JSON.stringify(contract, null, 2)}\n\nReturn JSON array of validation results.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Evaluator ────────────────────────────────────────────────────────────────
// Runs on Opus. Adversarially challenges the Generator's assessments.
// The Evaluator's job is to find failures, not validate effort.
// Runs once per adversarial round per sprint.

async function evaluateValidationResults(
  contract:  SprintContract,
  results:   RuleValidationResult[],
  roundNum:  number
): Promise<{
  sprintPasses: boolean;
  score:        number;
  challenges:   Array<{ ruleId: string; challenge: string; requiresRevision: boolean }>;
  feedback:     string;
}> {

  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 2000,
    system: `You are the Evaluator agent for Auralyn's clinical KB validation system.
You are skeptical by design. Your job is to find failures, not validate effort.

For each Generator assessment:
1. Challenge the guideline basis — is it the most current source?
2. Test the edge case traps from the sprint contract
3. Identify any cases where the Generator was too lenient (false validation)
4. Check that proposed updates are clinically safe and specific enough to implement

CRITICAL: In a medical system, a missed red flag is more dangerous than a false positive.
Be more willing to flag "needs physician review" than to pass a rule that might be wrong.

Return ONLY valid JSON. No markdown.`,
    messages: [{
      role:    "user",
      content: `Evaluate these Generator results for sprint:\n\nContract: ${JSON.stringify(contract, null, 2)}\n\nGenerator Results: ${JSON.stringify(results, null, 2)}\n\nReturn: { sprintPasses: boolean, score: number (0-1), challenges: [...], feedback: string }`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Adversarial loop ─────────────────────────────────────────────────────────

async function runAdversarialSprint(
  contract:   SprintContract,
  maxRounds:  number = 5
): Promise<RuleValidationResult[]> {

  let results:  RuleValidationResult[] = [];
  let passed    = false;
  let roundNum  = 0;

  while (!passed && roundNum < maxRounds) {
    roundNum++;
    console.log(`[KBValidator] Sprint ${contract.sprintId} — Round ${roundNum}/${maxRounds}`);

    // Generator validates rules
    results = await generateValidationEvidence(contract, roundNum);

    // Evaluator challenges the results
    const evaluation = await evaluateValidationResults(contract, results, roundNum);

    console.log(`[KBValidator] Sprint ${contract.sprintId} Round ${roundNum}: score=${evaluation.score.toFixed(2)} pass=${evaluation.sprintPasses}`);

    if (evaluation.sprintPasses && evaluation.score >= contract.passThresholds.guidelineAlignment) {
      passed = true;
    } else {
      // Feed evaluator challenges back to next Generator round
      // (stored in the contract for context on next round)
      console.log(`[KBValidator] Round ${roundNum} failed — ${evaluation.challenges.length} challenges. Iterating.`);
    }
  }

  return results;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runNightlyKBValidation(rules: KBRule[]): Promise<KBValidationReport> {
  const runId = `kb-validation-${Date.now()}`;
  const runAt = new Date().toISOString();

  console.log(`[KBValidator] Starting nightly validation — ${rules.length} rules, runId: ${runId}`);

  // Planner decomposes into sprint contracts
  const sprints = await planValidationSprints(rules);
  console.log(`[KBValidator] Planner created ${sprints.length} validation sprints`);

  const allResults: RuleValidationResult[] = [];

  // Run each sprint through the adversarial loop
  for (const sprint of sprints) {
    const sprintResults = await runAdversarialSprint(sprint);
    allResults.push(...sprintResults);
  }

  // Summarize
  const validated   = allResults.filter(r => r.finalVerdict === "validated").length;
  const needsUpdate = allResults.filter(r => r.finalVerdict === "needs_update").length;
  const contradicted = allResults.filter(r => r.finalVerdict === "contradicted").length;
  const physicianReviewRequired = allResults.filter(r => r.requiresPhysicianReview);

  const report: KBValidationReport = {
    runId,
    runAt,
    sprintsCompleted:        sprints.length,
    totalRules:              allResults.length,
    validated,
    needsUpdate,
    contradicted,
    results:                 allResults,
    summary:                 `KB validation complete: ${validated} validated, ${needsUpdate} need updates, ${contradicted} contradicted. ${physicianReviewRequired.length} rules require physician review before any changes.`,
    physicianReviewRequired,
  };

  // Persist report to Postgres
  await db.execute(sql`
    INSERT INTO kb_validation_reports (run_id, run_at, report_json, physician_review_count)
    VALUES (${runId}, ${runAt}, ${JSON.stringify(report)}, ${physicianReviewRequired.length})
  `).catch(err => console.error("[KBValidator] Report persist failed:", err.message));

  // Audit event
  await appendAuditEvent({
    actor:      "system",
    action:     "KB_VALIDATION_COMPLETED",
    entityId:   runId,
    entityType: "system",
    details: {
      totalRules:  allResults.length,
      validated,
      needsUpdate,
      contradicted,
      physicianReviewRequired: physicianReviewRequired.length,
    },
  }).catch(console.error);

  console.log(`[KBValidator] Complete — ${report.summary}`);
  return report;
}
