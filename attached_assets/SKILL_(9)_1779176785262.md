---
name: auralyn-regulatory
description: Load when discussing FDA, 510(k), SaMD classification, HIPAA, BAA, Row-Level Security, multi-tenant isolation, audit chain, FHIR, or anything regulatory. Triggers on phrases like "510(k)", "FDA", "SaMD", "HIPAA", "BAA", "RLS", "audit chain", "FHIR", "compliance", "regulatory", "tenant isolation", "PHI".
---

# Auralyn — Regulatory Context

## Posture summary

- **Product class:** Class II SaMD (Software as a Medical Device)
- **Pathway:** 510(k) submission in progress
- **PHI:** HIPAA-compliant infrastructure with Business Associate
  Agreement in place
- **Tenant isolation:** Postgres Row-Level Security on every
  PHI-touching table
- **Audit:** Write-once S3 sink for every clinical reasoning step,
  referenced from each encounter via `traceRefId`
- **EHR interop:** HL7 FHIR R4

## What this means for code changes

### Anything touching encounter data
- New tables containing encounter data require RLS policies BEFORE
  merge, not after
- Queries must run with `app.tenant_id` (and `app.physician_id` for
  physician-scope rows) set on the session
- No "service role bypass" patterns that skip RLS

### Anything involving LLM reasoning on clinical content
- Must flow through `ClinicalContextManager.assemblePromptFor(role, ...)`
- The supervisor gate (between steps 11 and 12) must be on the path to
  any disposition that escalates care
- Outputs become artifacts via `AgentArtifactBus`, not free text passed
  forward

### Anything touching the audit chain or compactor
- Changes require documentation for the 510(k) submission
- The audit chain is append-only — never modify or rewrite historical
  entries
- The compactor is deterministic (rule-based, no LLM) — preserve this
  property

### Anything ingesting third-party data
- Sources must be public domain OR licensed (no scraping UpToDate,
  DynaMed, Epocrates, etc.)
- Preferred: openFDA API, CDC Open Data, USPSTF, DailyMed, RxNorm,
  NLM E-utilities, AHRQ — these are public-domain or properly
  programmatic
- Every ingested item must write to `clinical_memory` with
  `verifiedBy: "external_guideline"` and a citable `source` field

### Anything related to physician identity
- NPI registry (`npiregistry.cms.hhs.gov`) is the authoritative source
- Provider data flows through existing physician auth — no parallel
  user systems

## RLS policy pattern

For tables holding PHI or encounter data:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <table>_tenant_isolation ON <table>
  FOR ALL TO authenticated_app
  USING (tenant_id = current_setting('app.tenant_id'));

-- For physician-scope rows (e.g., RLHF deltas):
CREATE POLICY <table>_physician_isolation ON <table>
  FOR ALL TO authenticated_app
  USING (
    tenant_id = current_setting('app.tenant_id')
    AND (
      physician_id IS NULL
      OR physician_id = current_setting('app.physician_id')
    )
  );
```

## Documentation that exists for 510(k)

When making architectural changes, consider impact on:
- Pipeline orchestration documentation
- Multi-agent role contract documentation
- Audit chain integrity documentation
- Supervisor gate documentation
- Memory store conflict resolution documentation
- RLS policy documentation

If a change affects any of these, the change needs corresponding
documentation update — not just a code commit.

## Things that block clinical deployment

- Any path that produces clinical recommendations without supervisor
  gate review
- Any data flow that moves PHI outside its encounter scope
- Any model call that bypasses `assemblePromptFor`
- Any tool that fails silently rather than emitting a `failed_attempt`
  artifact
- Any rule that fires without provenance (source citation, rule id, or
  physician input attribution)

When in doubt, flag for explicit decision rather than assuming
"probably fine."
