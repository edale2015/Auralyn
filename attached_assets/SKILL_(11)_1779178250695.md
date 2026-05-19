---
name: auralyn-add-rule
description: Load when adding, modifying, or migrating rules in kb_master_rules. Triggers on phrases like "add a rule", "new rule", "new diagnosis rule", "new red flag", "new workup", "new disposition", "new question", "rule_type", "RULE_####", "WHEN_EXPR", "create rule", "migrate rule".
---

# Adding a New Rule to kb_master_rules

## Required fields (30-column table)

Every rule needs at minimum:
- `rule_id` — `RULE_####` format, 4-digit zero-padded, next available
- `complaint_id` — the chief complaint this rule applies to
- `rule_type` — one of: `diagnosis`, `question`, `medication`,
  `workup`, `disposition`, `red_flag`, `modifier`, `cluster_scoring`
- `step_number` — which of the 13 pipeline steps this rule fires at
- `WHEN_EXPR` — the firing condition (see below — this is where bugs
  happen)
- `priority` — execution order within a step
- `is_active` — boolean, defaults true
- `provenance_source` — citation: KB chunk id, guideline reference, or
  physician name
- `safety_level` — `informational`, `routine`, `critical`

## The WHEN_EXPR gotcha (most common bug)

The expression evaluator is `evaluateRowExpr` in
`server/clinical/ruleExpressionEvaluator.ts`. It reads the **WHEN_EXPR**
field. It does NOT read `WHEN`, `WHEN_CONDITION`, `CONDITION`, or any
other variant.

**Wrong (silently never fires):**
```
WHEN: "age > 65"
```

**Right:**
```
WHEN_EXPR: "age > 65"
```

When adding rules via SQL, double-check the column name. When adding via
the admin UI, the form should be labeled correctly but verify the
generated row.

## WHEN_EXPR syntax

Supported operators:
- Comparison: `>`, `<`, `>=`, `<=`, `==`, `!=`
- Boolean: `&&`, `||`, `!`
- Membership: `in (...)`
- Field access: `vitals.spo2`, `patient.age`, `medications[*].name`

Supported context variables:
- `age` (years)
- `sex` (`'M'` | `'F'` | `'Other'`)
- `vitals.hr`, `vitals.sbp`, `vitals.dbp`, `vitals.rr`, `vitals.spo2`,
  `vitals.temp_c`, `vitals.pain`
- `complaint_id` (string)
- `findings[*]` (array of validated findings)
- `medications[*].name`
- `pmh[*]`
- `red_flags[*].id`

Always test with `POST /api/master-rules/dry-run` before activating.

## Rule type → step number quick reference

| rule_type | typical steps |
|-----------|---------------|
| red_flag | 2, 4, 6 |
| question | 4, 8 |
| workup | 7, 10 |
| diagnosis | 6, 9 |
| medication | 10, 12 |
| disposition | 11, 12 |
| modifier | 6, 9, 11 |
| cluster_scoring | 6 |

## Adding via SQL (with verification)

```sql
INSERT INTO kb_master_rules (
  rule_id, complaint_id, rule_type, step_number,
  WHEN_EXPR, priority, is_active,
  provenance_source, safety_level,
  -- ... other columns per the rule_type
)
VALUES (...);

-- Immediately verify the WHEN_EXPR is the column name used:
SELECT rule_id, WHEN_EXPR FROM kb_master_rules
WHERE rule_id = 'RULE_####';
-- WHEN_EXPR must be non-null
```

## After adding any rule

1. **Dry-run** the pipeline for a representative encounter to confirm
   the rule fires when expected:
   ```bash
   curl -X POST localhost:3000/api/master-rules/dry-run \
     -d '{"complaintId":"<id>","patientInput":{...}}' | jq
   ```

2. **Sync to Sheets** if Sheets is the source of truth in this env:
   ```bash
   curl -X POST localhost:3000/api/master-rules/export-to-sheets
   ```

3. **Confirm the rule appears in the pipeline trace** for a real
   encounter:
   ```bash
   curl localhost:3000/api/master-rules/pipeline/<complaint_id> | jq
   ```

## Safety: never bypass the dry-run

A rule that fires unexpectedly in production is a clinical safety
event. Always dry-run before marking `is_active=true`. If the dry-run
shows the rule firing in scenarios you didn't intend, **narrow the
WHEN_EXPR**, do not loosen the dry-run criteria.
