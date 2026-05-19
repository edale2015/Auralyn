---
name: auralyn-debug-pipeline
description: Load when a pipeline run produces unexpected output, missing artifacts, wrong disposition, missing red flags, or any anomalous clinical reasoning behavior. Triggers on phrases like "pipeline returning wrong", "no artifacts", "missing red flag", "disposition seems wrong", "encounter not working", "buildSafeDefault returned", "staleConfig", "pipeline exits early", "step 1 only".
---

# Debugging a Pipeline Run

When `POST /api/encounter` returns something unexpected, work through
these in order. Stop at the first one that explains the problem.

## Step 1: Did the pipeline even run all 13 steps?

```bash
# Look at the result envelope
curl -s -X POST localhost:3000/api/encounter \
  -d '{"complaintId":"...","patientInput":{...}}' | jq '{
  stepCount: .stepCount,
  artifactCount: .artifactCount,
  staleConfig: .staleConfig,
  finalDisposition: .finalDisposition
}'
```

**If `stepCount == 1`:** the pipeline took the `buildSafeDefault` exit.
Almost certainly a config-loading failure. Go to Step 2.

**If `stepCount == 13` but `artifactCount` is low (< 8):** rules aren't
firing. Go to Step 4.

**If `staleConfig: true`:** the DB fallback (loadComplaintConfigFromDB)
was used. The pipeline still ran, but check that the DB had rules for
this complaint. Go to Step 3.

## Step 2: Config loading

```bash
# Check the loader's logs (where exactly depends on env)
grep -i "loadComplaintConfig\|Sheets\|fallback" <log-file> | tail -20
```

Common failures:
- **Sheets credentials missing or expired** — `GOOGLE_SHEETS_CREDENTIALS`
  env var. The DB fallback should catch this, but verify.
- **Complaint not registered in Sheets registry tab** — and not in
  `kb_master_rules` either. Check:
  ```sql
  SELECT complaint_id, count(*) FROM kb_master_rules
  WHERE complaint_id = '<id>' GROUP BY complaint_id;
  ```
  If 0, the complaint has no rules. That's the bug.
- **Both Sheets AND DB failed** — `buildSafeDefault` returned. Check
  the catch block in `loadComplaintConfig`.

## Step 3: DB fallback used but pipeline still acting weird

```sql
-- Confirm rules exist for the complaint and are active
SELECT rule_type, count(*), count(*) FILTER (WHERE is_active) as active
FROM kb_master_rules WHERE complaint_id = '<id>'
GROUP BY rule_type;
```

Common issues:
- Most rules `is_active = false` from a bad sync
- `WHEN_EXPR` field is empty (silently never fires — see
  `auralyn-add-rule`)
- `step_number` column out of range (must be 1-13)

## Step 4: Rules exist but artifacts aren't appearing

Pull the prompt preview for the agent you expected to publish:

```bash
curl -s localhost:3000/api/context/$ID/prompts/differential | jq '{
  includedArtifactIds: .includedArtifactIds,
  excluded: .excluded
}'
```

If `includedArtifactIds` is empty but artifacts exist in
`/api/context/$ID/state`, the role's consume contract excludes them.
That's correct behavior — check the `AgentArtifactBus` contracts in
`auralyn-context-engineering`.

If artifacts in `/state` are also empty, the agents aren't publishing.
Check:
1. Is `bus.publish` actually called in each pipeline step?
2. Is the agent reaching that step (check logs for step transitions)
3. Is the publish wrapped in a try/catch that's swallowing the
   `ContractViolation`?

## Step 5: Wrong disposition

```bash
curl -s localhost:3000/api/context/$ID/state | jq '{
  red_flags: .immutables.redFlagsIdentified,
  hard_constraints: .immutables.hardConstraints,
  candidate_dispositions: .working.candidateDispositions,
  decisions: [.artifacts[] | select(.type == "decision")]
}'
```

If the final disposition contradicts the red flags in immutables, the
supervisor gate has a bug — escalation should have fired.

If a `hardStopFired` is reported but disposition rules still ran, that's
correct behavior since F001 (the supervisor gate owns escalation now;
hard stops don't short-circuit disposition).

## Step 6: Missing red flags

A red flag should appear in `immutables.redFlagsIdentified` AND in every
agent's prompt under the `## CLINICAL IMMUTABLES` section.

If it's in immutables but not in the prompt:
- The prompt assembly's "bookend" pattern may have broken — check
  `ClinicalContextManager.serializeImmutables()`

If it's not in immutables at all but should be:
- The red-flag rule didn't fire. Check `WHEN_EXPR`.
- The triage agent skipped publishing the red flag. Check
  `bus.publish` calls in step 2.

## Step 7: When all else fails

```bash
# Pull the entire trace
psql -c "SELECT trace_ref_id FROM encounters WHERE id = '$ID';"
# Then read the S3 object at that ref to see step-by-step what happened
```

The S3 trace is the audit-grade ground truth. Every step's prompt and
response is there. If the trace shows the right inputs but the wrong
output, the bug is in the model call or the agent's response parsing.
If the trace shows the wrong inputs, the bug is upstream of the model.

## What NOT to do

- **Don't modify a test config to "reproduce" a production bug.** Pull
  the real encounter's input from the audit log and test against that.
- **Don't add `console.log` to the production pipeline.** Use the
  telemetry events that already exist (`auralyn.context.*`).
- **Don't bypass the supervisor gate to "see what would happen."** That
  changes the safety profile. Investigate without bypassing.
