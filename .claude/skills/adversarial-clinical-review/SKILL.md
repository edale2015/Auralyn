# Adversarial Clinical Review Skill
# Type: Code Quality & Code Review
#
# DESCRIPTION (for Claude Code skill discovery):
# Spawns a sub-agent to review clinical code changes with "fresh eyes" —
# specifically looking for patient safety regressions, PHI exposure,
# physician gate bypasses, and missing audit events.
# Use before any PR that touches: pipeline.ts, review.routes.ts,
# followUpService.ts, ontologyFirewall.ts, or any component displaying patient data.
# Trigger: "review clinical change", "check safety regression", "pre-PR review"

## How This Skill Works

This skill uses an adversarial sub-agent pattern:
the primary agent writes the code; the adversarial reviewer critiques it
with no memory of the effort involved.

The reviewer's ONLY job is finding failures. It is not polite.

## Instructions for Claude Code

When this skill is invoked:

1. **Read the diff** — identify all files changed in the current working tree
   (`git diff HEAD` or the files explicitly provided)

2. **Launch adversarial review** — analyze the diff against these five categories:

### Category 1: Clinical Safety Regressions
- Does any new code path allow SELF_CARE disposition when red flags are present?
- Does any new physician action work without checking `req.user?.id`?
- Does any new code set `physicianApproved: true` without a physician actor?
- Does any new LLM call bypass `llmGateway.complete()`?
- Does any new `enforceAgentCaps` call appear correctly in loop tops?

### Category 2: PHI Exposure
- Do any new `appendAuditEvent()` calls include patient names, phones, or symptom free text?
- Do any new log statements include PHI?
- Are new API responses stripping PHI before returning to client?

### Category 3: Ontology Drift
- Does any new code create a local DISPOSITION_MAP instead of using OntologyFieldMapper?
- Does any new code hardcode a disposition string instead of using canonical values?
- Does any new component display a disposition without resolving through ontology?

### Category 4: Audit Chain Gaps
- Does every new clinical state change have a corresponding `appendAuditEvent()` call?
- Is the audit event fired AFTER the action succeeds (not before)?
- Does the audit event use the correct action string (SCREAMING_SNAKE_CASE)?

### Category 5: Route Security
- Does every new route have `requireAuth, requireAnyRole(...), requireCsrf`?
- Are new admin-only routes protected with appropriate role checks?
- Are any new endpoints missing input validation?

3. **Score each category** 0-10 (10 = no issues found)

4. **Iterate until trivial** — apply fixes for any score below 7, re-review,
   repeat until all scores are ≥ 8 or remaining issues are cosmetic

## Output Format

```
## Adversarial Clinical Review

### Category Scores
- Clinical Safety: X/10
- PHI Exposure: X/10
- Ontology Drift: X/10
- Audit Chain: X/10
- Route Security: X/10

### Issues Found (iterate until empty)

**[SEVERITY: CRITICAL|HIGH|MEDIUM|LOW]**
File: server/routes/example.ts:42
Issue: [description]
Fix: [specific fix]

### Verdict
PASS (all ≥8) | NEEDS_REVISION (any <7) | BLOCK (any critical issue)
```

## Gotchas for the Reviewer

**False negative to watch for:** Code that passes type checking but bypasses
the physician gate by passing `physicianId = req.body.overrideId` instead
of `req.user?.id`. Always check the source of physicianId.

**False negative to watch for:** An `appendAuditEvent()` call inside a
try-catch that swallows the error — the audit event fires but failures are hidden.
The audit chain must always write; failures should log but not be silently swallowed.

**False negative to watch for:** A new component that displays `caseDoc.triage.disposition`
directly as a string instead of resolving through `_ont.dispositionLabel` or
`OntologyFieldMapper.dispositionLabel()`. Raw disposition strings shown to physicians
bypass the semantic contract.
