/**
 * sprintContractSystem.ts
 * Drop into: server/harness/sprintContractSystem.ts
 *
 * Implementation B: Sprint Contract System for Auralyn Development
 *
 * Used for building new Auralyn features — NOT for patient triage.
 * When adding a new complaint pathway, clinical protocol, or system feature,
 * the Planner decomposes it into verifiable sprint contracts.
 * The Generator implements each sprint. The Evaluator verifies against
 * clinical acceptance criteria before any sprint is marked complete.
 *
 * This is the article's architecture applied correctly — to software development,
 * not to real-time clinical decisions.
 *
 * USAGE:
 *   const executor = new SprintContractExecutor();
 *   await executor.run({
 *     goal: "Add asthma-COPD overlap syndrome complaint pathway",
 *     clinicalScope: "Adult patients, urgent care setting, GINA/GOLD guidelines",
 *     acceptanceCriteria: ["Red flags identified", "Disposition rules complete", "Follow-up protocol defined"],
 *   });
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs   from "fs";
import * as path from "path";
import { appendAuditEvent } from "../governance/audit";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevelopmentGoal {
  goal:                string;
  clinicalScope:       string;
  acceptanceCriteria:  string[];
  maxSprints?:         number;     // default 5
  maxRoundsPerSprint?: number;     // default 7
}

export interface ClinicalSprintContract {
  sprintId:      number;
  featureScope:  string;
  deliverables:  string[];
  verificationMethods: string[];
  passThresholds: {
    clinicalAccuracy:   number;   // 0-1
    guidelineCompliant: boolean;
    safetyGatesPresent: boolean;
    physicianGateRequired: boolean;
  };
  edgeCaseTraps: string[];
  mustInclude:   string[];        // from AGENTS.md golden principles
  mustAvoid:     string[];
}

export interface SprintResult {
  sprintId:      number;
  contract:      ClinicalSprintContract;
  implementation: string;         // generated artifact (rules, code, or protocol)
  evaluation:    SprintEvaluation;
  roundCount:    number;
  passed:        boolean;
}

export interface SprintEvaluation {
  passed:             boolean;
  score:              number;     // 0-1
  clinicalSafetyPass: boolean;
  guidelineAligned:   boolean;
  physicianGateVerified: boolean;
  failureReasons:     string[];
  feedback:           string;
}

// ─── Progress file management (filesystem-as-memory) ─────────────────────────
// Per the article: "The filesystem becomes the agent's long-term memory."
// Context resets between sprints — Progress File carries continuity.

const HARNESS_DIR = path.join(process.cwd(), ".harness");

function ensureHarnessDir() {
  if (!fs.existsSync(HARNESS_DIR)) fs.mkdirSync(HARNESS_DIR, { recursive: true });
}

function writeProgressFile(runId: string, data: object) {
  ensureHarnessDir();
  fs.writeFileSync(
    path.join(HARNESS_DIR, `${runId}-progress.json`),
    JSON.stringify(data, null, 2)
  );
}

function readProgressFile(runId: string): any | null {
  const p = path.join(HARNESS_DIR, `${runId}-progress.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeChangeLog(runId: string, entry: string) {
  ensureHarnessDir();
  const p = path.join(HARNESS_DIR, `${runId}-changelog.md`);
  fs.appendFileSync(p, `\n## ${new Date().toISOString()}\n${entry}\n`);
}

// ─── Planner ──────────────────────────────────────────────────────────────────

async function planSprints(goal: DevelopmentGoal): Promise<ClinicalSprintContract[]> {
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 3000,
    system: `You are the Planner for Auralyn's clinical feature development harness.
Auralyn is a multi-tenant urgent care AI triage system.

Your job: Decompose a clinical development goal into 3-5 sprint contracts.
Each sprint should be implementable and verifiable independently.

MANDATORY requirements for every sprint contract (from AGENTS.md):
mustInclude:
  - Physician gate (physicianApproved boolean, defaults false)
  - appendAuditEvent() on every clinical state change
  - intendedUse: "clinical_decision_support_only" label
  - Confidence score on every AI output
  - Fail-closed safety defaults

mustAvoid:
  - Any auto-approval without physician actor ID
  - PHI in audit logs (use scrubPhi())
  - LLM calls before deterministic red-flag evaluation
  - Tool calls exceeding max_tool_retries: 2

Return ONLY valid JSON array of ClinicalSprintContract objects. No markdown.`,
    messages: [{
      role:    "user",
      content: `Decompose this clinical development goal into sprint contracts:\n\nGoal: ${goal.goal}\nClinical Scope: ${goal.clinicalScope}\nAcceptance Criteria: ${goal.acceptanceCriteria.join(", ")}\n\nReturn JSON array of ClinicalSprintContract objects.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Generator ────────────────────────────────────────────────────────────────

async function generateSprintImplementation(
  contract:    ClinicalSprintContract,
  progressLog: string,
  roundNum:    number
): Promise<string> {

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `You are the Generator for Auralyn's clinical feature development harness.
Implement the sprint contract deliverables.

Prior work context (from Progress File):
${progressLog}

You are implementing for an urgent care AI triage system. Every deliverable must:
- Follow the mustInclude requirements in the sprint contract
- Avoid the mustAvoid requirements in the sprint contract  
- Be implementable in TypeScript/Node.js/PostgreSQL/React
- Follow Auralyn's established patterns (Drizzle ORM, TanStack Query, shadcn/ui)

Round ${roundNum}: ${roundNum > 1 ? "Revise based on Evaluator feedback." : "Initial implementation."}

Return your implementation as structured text — code, rules, or protocol as appropriate.`,
    messages: [{
      role:    "user",
      content: `Implement this sprint contract:\n\n${JSON.stringify(contract, null, 2)}\n\nDeliver all items in featureScope.`,
    }],
  });

  return response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

async function evaluateSprintImplementation(
  contract:       ClinicalSprintContract,
  implementation: string,
  roundNum:       number
): Promise<SprintEvaluation> {

  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 2000,
    system: `You are the Evaluator for Auralyn's clinical feature development harness.
You are skeptical by design. Your job is to find clinical safety failures, not validate effort.

CRITICAL CLINICAL EVALUATION CRITERIA:
1. Is the physician gate structurally enforced? (not advisory — structural)
2. Does every AI output have a confidence score?
3. Are red-flag rules deterministic and evaluated BEFORE any LLM call?
4. Is PHI protection explicit (scrubPhi() called on logged content)?
5. Does every clinical event have an appendAuditEvent() call?
6. Are fail-closed defaults present? (errors escalate to physician, not fail open)

A medical system that fails open on errors is more dangerous than one that is too conservative.
Flag any ambiguity in safety gates as a FAIL.

Return ONLY valid JSON SprintEvaluation object. No markdown.`,
    messages: [{
      role:    "user",
      content: `Evaluate this implementation for sprint ${contract.sprintId}:\n\nContract: ${JSON.stringify(contract, null, 2)}\n\nImplementation:\n${implementation}\n\nReturn SprintEvaluation JSON.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Sprint executor ──────────────────────────────────────────────────────────

async function executeSprintWithAdversarialLoop(
  contract:   ClinicalSprintContract,
  runId:      string,
  maxRounds:  number
): Promise<SprintResult> {

  let implementation = "";
  let evaluation: SprintEvaluation = {
    passed: false, score: 0, clinicalSafetyPass: false,
    guidelineAligned: false, physicianGateVerified: false,
    failureReasons: [], feedback: "",
  };
  let roundNum = 0;

  const progress = readProgressFile(runId);
  const progressLog = progress
    ? `Completed sprints: ${progress.completedSprints?.join(", ") ?? "none"}`
    : "No prior sprints completed.";

  while (!evaluation.passed && roundNum < maxRounds) {
    roundNum++;
    console.log(`[SprintContract] Sprint ${contract.sprintId} — Round ${roundNum}/${maxRounds}`);

    // Generator implements
    implementation = await generateSprintImplementation(contract, progressLog, roundNum);

    // Evaluator challenges
    evaluation = await evaluateSprintImplementation(contract, implementation, roundNum);

    console.log(`[SprintContract] Sprint ${contract.sprintId} Round ${roundNum}: score=${evaluation.score.toFixed(2)} safetyPass=${evaluation.clinicalSafetyPass} physicianGate=${evaluation.physicianGateVerified}`);

    if (!evaluation.clinicalSafetyPass || !evaluation.physicianGateVerified) {
      console.warn(`[SprintContract] CLINICAL SAFETY FAILURE in sprint ${contract.sprintId} round ${roundNum}: ${evaluation.failureReasons.join(", ")}`);
    }
  }

  writeChangeLog(runId, `Sprint ${contract.sprintId} completed in ${roundNum} rounds. Passed: ${evaluation.passed}. Score: ${evaluation.score.toFixed(2)}`);

  return {
    sprintId:       contract.sprintId,
    contract,
    implementation,
    evaluation,
    roundCount:     roundNum,
    passed:         evaluation.passed,
  };
}

// ─── Main executor class ──────────────────────────────────────────────────────

export class SprintContractExecutor {
  async run(goal: DevelopmentGoal): Promise<{
    runId:    string;
    results:  SprintResult[];
    summary:  string;
    allPassed: boolean;
  }> {
    const runId      = `sprint-run-${Date.now()}`;
    const maxSprints = goal.maxSprints          ?? 5;
    const maxRounds  = goal.maxRoundsPerSprint  ?? 7;

    console.log(`[SprintContract] Starting run ${runId}: ${goal.goal}`);

    // Initialize progress file (filesystem-as-memory)
    writeProgressFile(runId, {
      goal,
      startedAt:        new Date().toISOString(),
      completedSprints: [],
      status:           "planning",
    });

    // Planner decomposes into sprint contracts
    const contracts = await planSprints(goal);
    console.log(`[SprintContract] Planner created ${contracts.length} sprints`);

    writeProgressFile(runId, {
      goal,
      startedAt:        new Date().toISOString(),
      completedSprints: [],
      totalSprints:     contracts.length,
      status:           "executing",
    });

    const results: SprintResult[] = [];

    for (const contract of contracts.slice(0, maxSprints)) {
      const result = await executeSprintWithAdversarialLoop(contract, runId, maxRounds);
      results.push(result);

      // Update progress file after each sprint (crash recovery)
      const current = readProgressFile(runId);
      writeProgressFile(runId, {
        ...current,
        completedSprints: [...(current?.completedSprints ?? []), contract.sprintId],
      });

      await appendAuditEvent({
        actor:      "system",
        action:     "SPRINT_COMPLETED",
        entityId:   runId,
        entityType: "development",
        details: {
          sprintId:   contract.sprintId,
          passed:     result.passed,
          score:      result.evaluation.score,
          roundCount: result.roundCount,
          clinicalSafetyPass: result.evaluation.clinicalSafetyPass,
        },
      }).catch(console.error);
    }

    const allPassed  = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;

    const summary = `Sprint run ${runId} complete: ${passedCount}/${results.length} sprints passed. Clinical safety: ${results.every(r => r.evaluation.clinicalSafetyPass) ? "ALL PASSED" : "FAILURES DETECTED — manual review required"}.`;

    writeProgressFile(runId, {
      goal,
      completedAt: new Date().toISOString(),
      status:      allPassed ? "complete" : "needs_review",
      summary,
    });

    writeChangeLog(runId, summary);

    await appendAuditEvent({
      actor:      "system",
      action:     "SPRINT_RUN_COMPLETED",
      entityId:   runId,
      entityType: "development",
      details: {
        goal:         goal.goal,
        sprintsTotal: results.length,
        sprintsPassed: passedCount,
        allPassed,
      },
    }).catch(console.error);

    return { runId, results, summary, allPassed };
  }
}
