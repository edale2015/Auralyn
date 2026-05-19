---
name: auralyn-kb-architecture
description: Load when working with kb_master_rules, the rule execution engine, complaint configurations, the 13-step pipeline, Google Sheets KB sync, or any rule-evaluation expression. Triggers on phrases like "kb_master_rules", "rule execution", "complaint config", "pipeline step", "WHEN_EXPR", "rule_type", "loadComplaintConfig", "Sheets sync", "rule engine".
---

# Auralyn Knowledge Base — Architecture Reference

## kb_master_rules table

- 30 columns
- 8,413 active rules
- 1,025 complaints covered
- Source: synced from `kb_red_flag_rules`, `kb_diagnosis_rules`,
  `kb_treatment_rules`, `kb_disposition_rules`, `kb_workup_rules`,
  `kb_questions`, `kb_modifiers`

## Eight rule types and current counts

| rule_type | count |
|-----------|-------|
| diagnosis | 2,579 |
| question | 2,051 |
| medication | 1,495 |
| workup | 1,067 |
| disposition | 658 |
| red_flag | 486 |
| modifier | 43 |
| cluster_scoring | 34 |

## Five named seed rules (sanity check)

`RULE_0001` (hypoxia O2 < 92%), `RULE_0042`, `RULE_0079`, `RULE_0156`,
`RULE_0401` (CAP antibiotics). If T001 is being audited, these must
exist.

## 13-step pipeline (`ruleExecutionEngine.executePipeline`)

Steps execute in order. CRITICAL red flags (`ER_NOW`, `ED_NOW`,
`CALL_911`) trigger a hard stop at the relevant step — BUT disposition
rules still run. The supervisor gate (between steps 11 and 12) owns
escalation.

Each step produces artifacts via `AgentArtifactBus` per its role
contract (see `auralyn-context-engineering`).

## The WHEN_EXPR gotcha

The expression evaluator is `evaluateRowExpr`. It checks the
`WHEN_EXPR` field — **NOT** `WHEN`. Setting `WHEN: "true"` silently
never fires; the row appears to be inactive. This was a real bug in
the demo config that caused billing-vs-differential artifact filtering
to look broken.

When writing or migrating rules, always confirm the expression field
name. Wrong: `WHEN: "age > 65"`. Right: `WHEN_EXPR: "age > 65"`.

## Config loading flow

```
loadComplaintConfig(complaintId)
  ├── try: registry lookup → Google Sheets fetch
  │     └── on success: return ComplaintConfig
  │     └── on miss: try loadComplaintConfigFromDB
  ├── catch (Sheets error): try loadComplaintConfigFromDB
  └── if DB also fails or returns 0 rows: buildSafeDefault
```

When the DB fallback is used:
- `scoringModule: 'db_fallback'` marker is set on the config
- Pipeline detects this and sets `staleConfig: true` on the result
- Telemetry event `auralyn.context.config_fallback_used` is emitted

## Critical operational fact

`POST /api/encounter` is the production path. `POST /api/encounter/demo`
uses `_inlineConfig` to bypass config loading entirely — it's a test
fixture. Verifications that need to prove the production path works
MUST hit `/api/encounter`, not `/api/encounter/demo`.

## API endpoints under /api/master-rules/

11 endpoints registered:
- `GET /` — list with filters
- `GET /stats` — counts by type/safety
- `GET /:rule_id` — single rule (all 27 fields)
- `POST /` — create
- `PATCH /:rule_id` — update
- `GET /pipeline/:complaint_id` — ordered 13-step view
- `POST /dry-run` — full pipeline simulation
- `POST /export-to-sheets` — 27-column write
- `POST /sync-from-source` — re-sync from source KB tables
- `GET /flowchart/:complaint_id` — GPT-4o flowchart (cached)
- `GET /complaints` — coverage by complaint

## Sheet export

`server/scripts/exportMasterRulesToSheets.ts` — exact 27-column header
order, clears and rewrites the `MASTER_RULE_MAP` tab. Do not change the
column order without coordinating; downstream tooling depends on it.
