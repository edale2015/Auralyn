# ─────────────────────────────────────────────────────────────────────────────
# PATCH: CLAUDE.md — Add Karpathy Behavioral Rules Section
#
# Add this section to your existing CLAUDE.md, after the Design System section
# and before the AI/CDS Rules section.
#
# These rules govern how Claude Code behaves when generating Auralyn code.
# They are separate from AGENTS.md, which governs the clinical AI at runtime.
#
# WHY THESE MATTER FOR AURALYN SPECIFICALLY:
# Auralyn has 6 active safety gates (G1-G6), a 13-step clinical pipeline,
# a physician gate that must never be bypassed, and audit events on every
# clinical state change. A coding agent that adds "helpful" abstractions,
# refactors neighboring files, or makes assumptions without asking can
# silently break any of these. The Karpathy rules prevent exactly this.
# ─────────────────────────────────────────────────────────────────────────────

## Developer Behavior Rules (Karpathy)

These four rules apply to every code generation task in Auralyn.
They are not suggestions. Violating them in a clinical codebase has
patient safety consequences.

### Rule 1 — Think before coding. Ask when ambiguous.

Before writing any code:
- State your assumptions explicitly
- If the request could be interpreted two ways, ask which one before proceeding
- If a simpler approach exists, propose it first
- Stop when confused. Name what is unclear. Do not pick an interpretation and run.

**Auralyn-specific:** If a request touches the physician gate, audit chain,
or ontology firewall, always confirm the intended behavior before implementing.
These are structural safety constraints — wrong assumptions here break G1-G6.

### Rule 2 — Simplicity first. Write the minimum code that solves the problem.

- No speculative abstractions
- No flexibility nobody asked for
- No helper classes that expose methods that will never be called
- Test: would a senior engineer call this overcomplicated?

**Auralyn-specific:** The pipeline already has 13 steps, 6 KB tables,
4 ontology gates, and a 27-column rule schema. Every new abstraction
adds surface area for clinical logic errors. Add nothing that was not asked for.

### Rule 3 — Surgical changes. Touch only what the task requires.

- Do not improve neighboring code
- Do not refactor what is not broken
- Do not reformat files that are not part of the task
- Every changed line must trace back to the explicit request

**Auralyn-specific:** The verify-gates.ts script catches regressions on
every pipeline PR. Surgical changes keep the gate results stable.
Scope creep that touches pipeline.ts, review.routes.ts, or ontologyFirewall.ts
without being asked is a patient safety risk.

### Rule 4 — Goal-driven execution. Turn vague instructions into verifiable targets.

Before writing a line of code, restate the goal as a testable outcome:

- "Add validation" → "Write a validator that rejects X input and passes Y input, then wire it to route Z"
- "Fix the bug" → "The bug is: [specific behavior]. Fix is: [specific change]. Test: [specific assertion]"
- "Improve performance" → "The bottleneck is [identified location]. Change is [specific optimization]. Measure: [before/after metric]"

**Auralyn-specific:** Every clinical feature must have a verifiable outcome
before implementation begins. The verify-gates.ts script is the verifiable
target for safety-critical changes.

---

## Auralyn-Specific Additions to the Karpathy Rules

These extend the four rules with Auralyn context that general rules cannot cover.

**Never add a direct anthropic.messages.create() call.**
All LLM calls go through llmGateway.complete(). Adding a direct SDK call
breaks G6 and removes failover, audit logging, and cost tracking.
Run: `grep -r "anthropic.messages.create" server/ --include="*.ts"`
Should return 0 results (exception: researchRadar.ts documented exception).

**Never set physicianApproved: true without a physician actor.**
If a task requires auto-approving something, stop and ask.
The physician gate is structural. There is no legitimate reason to bypass it.

**Never create a local DISPOSITION_MAP.**
All disposition values resolve through OntologyFieldMapper.
Run: `grep -r "DISPOSITION_MAP" client/src server/ --include="*.ts" --include="*.tsx"`
Should return 0 results outside the ontology directory.

**Always append an audit event after clinical state changes.**
Every new route or service that changes clinical state needs a corresponding
appendAuditEvent() call. If you are writing a clinical route without one,
you are not done.

**Always run the safety verifier after pipeline changes.**
```
npx tsx .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts
```
All 6 gates must pass before a PR is ready.
