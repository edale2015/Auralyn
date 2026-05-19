---
name: auralyn-clinical-safety
description: Load when modifying anything that touches clinical reasoning, the rule engine, the pipeline orchestrator, kb_master_rules, PHI handling, disposition logic, or the audit chain. Triggers on phrases like "clinical", "disposition", "red flag", "PHI", "audit", "supervisor", "compaction", "rule engine", "patient data".
---

# Auralyn — Clinical Safety Invariants

These are non-negotiable. If a proposed change would cause any of these
to maybe-sometimes-occasionally not hold, the change is a NO regardless
of how convenient or "clean" it makes the code.

## 1. Red flags identified during an encounter are permanent

Once a red flag is added to `immutables.redFlagsIdentified`, no agent,
no compactor, no override removes it. Not the differential agent, not
the disposition agent, not even the supervisor. The patient's clinical
risk profile only grows during an encounter — it never shrinks.

## 2. Hard constraints added by supervisor are permanent

Once `addHardConstraint(...)` is called, the constraint persists in
immutables for the duration of the encounter. It appears in every
subsequent agent's prompt, bookended top and bottom.

## 3. Compaction is deterministic

`ContextCompactor.compact()` is rule-based. It does not call an LLM. It
does not summarize findings via an AI model. Model-based compaction can
silently drop a critical finding into a fluent summary — and that's a
patient safety event. Never introduce LLM calls into the compactor.

## 4. PHI never leaves the encounter

`clinical_memory` is for preferences, protocols, guidelines, and RLHF
deltas — never for patient-specific information. Memory writers MUST
reject any payload containing PHI. Encounter data lives in the encounter
record, audit data in the S3 trace sink, both with RLS.

## 5. The audit trail is write-once

`traceRefId` points to an S3 object that is append-only. Compaction does
NOT modify or rewrite trace entries. The trace is the ground truth for
regulatory review.

## 6. Disposition rules always run

Never short-circuit the pipeline before disposition logic completes with
a forced ER_SEND or any other hard-stop override. The supervisor gate
(between steps 11 and 12) owns escalation decisions. Earlier hard-stops
hide reasoning that's required for documentation.

This was a real bug — the prior pipeline forced `ER_SEND` at step 6 and
gated step 9 disposition on `if (!hardStopFired)`. Both were removed.
Do not reintroduce them.

## 7. Multi-tenant isolation is non-negotiable

Every PHI-touching table has Row-Level Security. Every query runs with
`app.tenant_id` (and `app.physician_id` where relevant) set. A change
that bypasses RLS — "just for this query" — is a HIPAA incident waiting
to happen. Not acceptable.

## 8. Tool calls have fail-closed defaults

When a clinical tool (KB search, risk calculator, protocol lookup)
fails or times out, the pipeline does not silently continue with empty
results. A `failed_attempt` artifact is published, and the supervisor
gate sees it. Silent tool failures are worse than loud ones in
safety-critical systems.

## When in doubt

Ask: "If this change were wrong, could a patient be harmed?" If yes,
the change needs supervisor (Dale) review and an explicit decision —
not "it should be fine."
