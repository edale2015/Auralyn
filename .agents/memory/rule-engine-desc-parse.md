---
name: Rule engine logic_description parsing
description: How chest-pain (and similar) boolean red-flag rules store conditions — and how evaluateRule must handle null question_dependencies.
---

## The rule
When `kb_master_rules` rows have `logic_type = "boolean"` AND both `input_fields` and `question_dependencies` are NULL, their actual trigger condition lives in `logic_description` as a JS-like boolean expression:

```
answers.Q_CP_EXERTIONAL == 'yes' && (answers.Q_CP_RADIATES == 'yes' || answers.Q_CP_DIAPHORESIS == 'yes') → ACS pattern
```

**Why:** The seed/import pipeline stored conditions only in the human-readable description column, leaving the structured dep columns empty.

## How to apply
`evaluateRule` in `server/clinical/ruleExecutionEngine.ts` now calls `evalLogicDescription(description, inputs)` before falling back:
1. Strip the `→ explanation` suffix.
2. Replace every `answers.FIELD == 'yes'` token with `true` or `false` from live inputs.
3. Validate remaining string matches `[^truefalse\s&|!()]` — if any unexpected chars, abort (return null → safe default).
4. Evaluate with `new Function(...)` (safe: no variables, only boolean algebra).
5. **Safe default**: if description can't be parsed AND rule is `red_flag` or `CRITICAL` → return `false` (never false-positive escalate).

## Test confirmation
Three-case automated test (`server/test/chestPainPipelineTest.ts`):
- Case A (ACS): ER_NOW, hardStop=YES — correct
- Case B (PE-risk): ER_NOW, hardStop=YES — correct  
- Case C (MSK, low-risk): HOME_CARE, no hardStop — correct (was wrongly ER_NOW before fix)
