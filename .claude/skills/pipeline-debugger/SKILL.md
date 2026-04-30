# Pipeline Debugger Skill
# Type: Runbook
#
# DESCRIPTION (for Claude Code skill discovery):
# Takes a symptom (wrong disposition, case stuck in queue, follow-up not sent,
# drift canary failure, harness cap exceeded) and conducts a structured
# investigation across the audit chain, producing a diagnosis report.
# Trigger: "debug case", "why did this case", "follow-up not sent",
#          "canary failed", "wrong disposition", "case stuck"

## How to Debug a Clinical Pipeline Issue

### Step 1: Get the Case ID

If you have a case ID, start with the audit chain:

```sql
-- Full audit trail for a case
SELECT event_type, actor, event_data, timestamp
FROM audit_hash_chain
WHERE entity_id = '<case_id>'
   OR event_data->>'caseId' = '<case_id>'
ORDER BY timestamp ASC;
```

Look for the sequence of events. A healthy case should show:
1. `INTAKE_RECEIVED` or equivalent
2. `ONTOLOGY_GATE1_PASSED`
3. `HARNESS_CONTEXT_INJECTED`
4. `SKILLS_INJECTED` (if active skills for this complaint)
5. `GEOMETRIC_REASONING_INJECTED`
6. `CLINICAL_BRAIN_COMPLETE`
7. `UNCERTAINTY_SAMPLED`
8. `CASE_APPROVED` / `CASE_MODIFIED` / `CASE_REJECTED` (physician action)
9. `DISCHARGE_DELIVERED` (if WhatsApp)
10. `FOLLOW_UP_ENROLLED` (if eligible)

### Step 2: Identify the Break Point

Missing event = the break happened before that event.

| Missing Event | Likely Cause |
|---|---|
| `ONTOLOGY_GATE1_PASSED` | Case failed Gate 1 — check ontology violations |
| `HARNESS_CONTEXT_INJECTED` | EHR context fetch failed — check vendor config |
| `CLINICAL_BRAIN_COMPLETE` | LLM call failed or cap exceeded — check gateway logs |
| `UNCERTAINTY_SAMPLED` | Secondary model call failed — check OPENAI_API_KEY |
| Physician action missing | Case still in queue — physician hasn't reviewed |
| `DISCHARGE_DELIVERED` missing | Gate 3 blocked — check physician actor |
| `FOLLOW_UP_ENROLLED` missing | Gate 4 blocked or ineligible disposition |

### Step 3: Check Specific Failure Patterns

**Harness cap exceeded:**
```sql
SELECT event_data FROM audit_hash_chain
WHERE event_type = 'SAFETY_CAP_EXCEEDED'
  AND entity_id = '<case_id>';
```

**Ontology violation:**
```sql
SELECT event_data FROM audit_hash_chain
WHERE event_type IN ('ONTOLOGY_GATE1_BLOCKED', 'ONTOLOGY_TRIAGE_BLOCKED',
                     'DISCHARGE_ONTOLOGY_BLOCKED')
  AND entity_id = '<case_id>';
```

**LLM gateway failover:**
```sql
SELECT event_data FROM audit_hash_chain
WHERE event_type = 'LLM_GATEWAY_FAILOVER'
  AND timestamp > NOW() - INTERVAL '24 hours';
```

**Self-healing incidents:**
```sql
SELECT event_data FROM audit_hash_chain
WHERE event_type IN ('SELF_HEAL_SUCCEEDED', 'SELF_HEAL_FAILED')
  AND timestamp > NOW() - INTERVAL '24 hours';
```

### Step 4: Debug Follow-Up Not Sent

```sql
-- Check enrollment exists
SELECT * FROM follow_up_enrollments WHERE case_id = '<case_id>';

-- Check messages scheduled
SELECT * FROM follow_up_responses
WHERE enrollment_id = (SELECT id FROM follow_up_enrollments WHERE case_id = '<case_id>');

-- Check BullMQ job audit
SELECT event_data FROM audit_hash_chain
WHERE event_type = 'FOLLOW_UP_MESSAGE_SENT'
  AND event_data->>'caseId' = '<case_id>';
```

If enrollment exists but messages weren't sent: BullMQ worker may have been down.
Check: `GET /api/infra/status` → look at `bullmq_follow_up_worker` service health.

### Step 5: Debug Drift Canary Failure

```sql
-- Find the failed canary run
SELECT event_data FROM audit_hash_chain
WHERE event_type = 'DRIFT_CHECK_COMPLETED'
ORDER BY timestamp DESC LIMIT 1;

-- event_data.failedCanaries contains the canary IDs that failed
```

For each failed canary:
1. Look at the canary definition in `server/harness/driftCheck.ts`
2. Check what the expected disposition/confidence was
3. Run the case manually through the pipeline to reproduce
4. Check if any KB rules for this complaint were modified recently

### Output Format

Produce a structured diagnosis report:

```
## Pipeline Debug Report
Case ID: <id>
Investigated: <timestamp>

### Audit Trail Summary
<list the key events found, in order>

### Break Point
<which event is missing and why>

### Root Cause
<specific diagnosis>

### Recommended Fix
<what to do>

### Related Issues
<any other anomalies found in the audit trail>
```
