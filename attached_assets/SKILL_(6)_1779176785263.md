---
name: auralyn-session-plan
description: Use this skill whenever the user asks for a session plan, task plan, work plan, next tasks, or anything Replit's agent is expected to execute. Triggers on phrases like "session plan", "T### plan", "next tasks", "add to backlog", "give Replit tasks", "write instructions for Replit". Generates plans in the exact format Replit's agent acts on — freeform prose requests are interpreted as completed deliverables and ignored.
---

# Auralyn Session Plan Format

## When to use

Generate a session plan whenever the user wants work executed by Replit's
agent on the Auralyn project. The agent only acts on plans structured this
way. Prose requests for action have been ignored as "documentation
describing completed work."

## Task ID prefixes

- **T###** — Build tasks (new features, integrations)
- **V###** — Verification tasks (evidence collection, no new code)
- **F###** — Fix tasks (bug remediation against verified gaps)

Continue numbering from the last session — never restart at T001 unless
the user explicitly asks.

## Exact block format

Each task uses this exact structure:

```
## T### — Short imperative description

**Status:** ⏳ Not started

**Files to find first:** (only when paths are uncertain — instruct the
agent to locate them before editing, don't guess)

**Files to create:** (specific paths under server/ or client/)

**Files to modify:** (specific paths)

**Acceptance criteria:**
1. Concrete, testable assertion
2. Concrete, testable assertion
3. ...

**Verification:**
```bash
# Exact runnable commands — bash, curl, psql, npm test
```

**Required output:** (literal text or numeric thresholds — never "looks
correct" or "passes")

**Dependencies:** (other T### tasks, or "none")
```

## Required sections in every plan

1. **Header** explaining what session this continues from and the goal
2. **Each task** in the format above
3. **Summary checklist** with `- [ ]` items for all tasks
4. **Hard rules** section (load `auralyn-no-fudging` skill for these)
5. **Order** section: explicit "Start with T### because it unblocks ..."
6. **Final gap closure verification** — a single shell command that
   prints `GAP CLOSURE VERIFIED` only if all criteria hold

## Auralyn-specific verification patterns

For pipeline work, the canonical verification is:
```bash
ENCOUNTER_ID=$(curl -s -X POST localhost:3000/api/encounter \
  -H "Content-Type: application/json" \
  -d '{"complaintId":"chest_pain","patientInput":{"age":58,"sex":"M","vitals":{"hr":96,"sbp":158,"dbp":92,"spo2":97}}}' \
  | jq -r '.sessionId')

curl -s localhost:3000/api/context/$ENCOUNTER_ID/state | jq '{
  total: (.artifacts | length),
  types: ([.artifacts[].type] | unique),
  type_count: ([.artifacts[].type] | unique | length)
}'
```

Healthy: `total ≥ 12`, `type_count ≥ 4`.

For memory writes:
```bash
psql -c "SELECT key, scope, verified_by FROM clinical_memory
WHERE created_at > now() - interval '5 minutes';"
```

## What NOT to do

- Do not use freeform prose ("Could you have Replit do X"). The agent
  ignores requests not in the T### format.
- Do not skip verification commands. "Add tests" without a `npm test`
  command in the Verification block is not actionable.
- Do not write tasks that would require fabricating UI wire-ups. If a
  task wires a writer to a UI that doesn't exist, the task itself must
  include "if no UI exists, report and stop."
