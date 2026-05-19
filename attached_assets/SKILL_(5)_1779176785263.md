---
name: auralyn-no-fudging
description: Load when finishing any Auralyn task, before declaring it complete, when writing a status report, or when reviewing claimed-done work. Triggers on phrases like "task done", "completed", "verified", "status update", "session summary", "ready for review", "everything works". Encodes the specific failure modes Replit's agent has exhibited on this project and how to avoid them.
---

# Auralyn — Failure modes to avoid when declaring work done

These are real patterns observed across the project's session history.
Do not repeat them.

## 1. Skipping invasive edits while building easy modules

When a task requires editing an existing complex orchestrator
(`unifiedClinicalPipeline.ts`) AND building a clean utility module
(`telemetry.ts`, `memoryWriters.ts`), the easy module gets built and
the orchestrator edit gets quietly skipped. The summary then leads with
the new module to look productive.

**Don't.** If the task requires editing the pipeline, that IS the task.
The utility module is half the work.

## 2. Detouring to re-verify already-completed prior tasks

When stuck on a hard task, the agent has previously audited and
re-confirmed T001–T005 (Master Rule Map) which were already done in
prior sessions. This wastes the session and produces a status report
that looks active without progressing the actual plan.

**Don't.** T001–T015 are done. Do not re-verify them. Stay on the
current task list.

## 3. Passing tests against synthetic fixtures

Setting `WHEN_EXPR: "true"` in a demo config so every workup row fires
makes tests pass without proving production behavior. Real verification
must run against the live `kb_master_rules` table, not the inline demo
config used by tests.

**Don't.** Verification commands explicitly hit `POST /api/encounter`
(production path), not `POST /api/encounter/demo` (test fixture path).

## 4. Building API endpoints with no UI call site

Adding `POST /api/something` that only test endpoints call is not the
same as wiring it into production. The RLHF feedback loop only closes
when the actual physician UI calls the writer.

**Don't.** If a UI for the trigger doesn't exist, report that explicitly
and stop. Do not fabricate a wire-up to a placeholder.

## 5. Declaring "production-ready" when step 1 fails

For most of this project's history, every real production encounter
exited at step 1 with zero artifacts because `loadComplaintConfig` had
no DB fallback when Sheets failed. Tests passed (they used
`_inlineConfig`); production did nothing.

**Don't.** Before any encounter-level claim, run a real-KB encounter
and confirm ≥12 artifacts of ≥4 types are produced.

## 6. Modifying tests/configs to make verifications pass

A failing verification is information. Do not change the test, the seed
data, the threshold, or the demo config to make the number turn green.

**Don't.** If a verification fails, REPORT the failure. The user
prefers an honest gap report to a fake pass.

## 7. Summary inflation

A status report that leads with "All 9 tasks complete" but omits 4
tasks from the final summary is fudged. The agent has done this — listed
some tasks as "in progress, picking up now" and never returned to them.

**Don't.** Every task on the plan must appear in the final summary with
its actual status. If something was skipped, name it.

## Verification discipline

Before declaring any task done:

1. Re-read the acceptance criteria word by word.
2. Run each verification command literally as written.
3. Paste each output **verbatim** under its task — no summarizing.
4. If any output differs from the "Required output", REPORT the
   difference. Do not modify the criteria to fit the output.
5. If a task depends on infrastructure (auth, UI, external service)
   that's not available, REPORT that. Do not skip the verification.

## The summary contract

The final status table must include EVERY task from the plan, in plan
order, with one of three statuses:

- ✅ Done — with verification output pasted inline
- ⚠️ Partial — with explicit description of what's done vs. not
- ❌ Blocked / Not done — with the reason

Anything else is fudging.
