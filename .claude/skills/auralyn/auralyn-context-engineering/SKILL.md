---
name: auralyn-context-engineering
description: Load when working on Auralyn's context engineering module (server/context/), the unified clinical pipeline, agent orchestration, prompt assembly, the artifact bus, memory writes, the compactor, or context telemetry. Triggers on phrases like "context manager", "artifact bus", "compactor", "agent prompt", "supervisor gate", "memory writer", "prefix stability", or any file path under server/context/.
---

# Auralyn Context Engineering — Architecture Reference

## The four-tier context model

Every encounter has four tiers with strict promotion rules:

1. **Immutables** — chief complaint, allergies, current meds, presenting
   vitals, red flags identified, hard constraints. Always in every
   prompt, bookended at top AND bottom of the user message. Never
   compacted. Once a red flag is added, NO agent or process removes it.

2. **Working** — current differential, pending questions, answered
   questions, candidate dispositions. Active reasoning. Compactable.

3. **Artifacts** — typed durable outputs from agents. Survive compaction.
   How agents communicate. Seven types: `validated_finding`,
   `kb_retrieval`, `ruled_out`, `calculation`, `decision`, `uncertainty`,
   `failed_attempt`, plus `compaction_summary` emitted by the compactor.

4. **Trace** — raw step-by-step model interaction. Goes to S3 audit sink
   (`traceRefId`). **NEVER included in prompts.** Only used for
   regulatory audit.

## Role contracts (AgentArtifactBus)

Each role has strict produce/consume contracts. The bus throws on
violation — never catch and swallow.

| Role | Produces | Consumes |
|------|----------|----------|
| triage | validated_finding | (none) |
| differential | validated_finding, kb_retrieval, ruled_out, calculation, uncertainty, failed_attempt | same as produces |
| disposition | decision, uncertainty | validated_finding, kb_retrieval, ruled_out, calculation, uncertainty |
| billing | decision | validated_finding, decision **only** |
| supervisor | ruled_out, decision, uncertainty | all 7 + compaction_summary |

## What already exists (do not rebuild)

| File | Purpose |
|------|---------|
| `server/context/ClinicalContextManager.ts` | Single prompt assembly point: `assemblePromptFor(role, instruction)` |
| `server/context/AgentArtifactBus.ts` | Typed pub/sub with contract enforcement |
| `server/context/ContextCompactor.ts` | **Deterministic** compaction — never calls an LLM |
| `server/context/RoleScopedToolRegistry.ts` | Per-role tool subsetting; `buildDefaultRegistry()` |
| `server/context/ClinicalMemoryStore.ts` | Cross-encounter memory |
| `server/context/PostgresMemoryPersistence.ts` | PG adapter for memory store |
| `server/context/memoryWriters.ts` | 4 writers: `writeSupervisorDispositionOverride`, `writeSupervisorHardConstraint`, `writeTenantProtocol`, `writeGlobalGuideline` |
| `server/context/telemetry.ts` | 7 metric types + 24h ring buffer |
| `server/jobs/contextMetricsAggregate.ts` | Daily roll-up to `context_metrics_daily` |
| `server/clinical/loadComplaintConfigFromDB.ts` | DB fallback (kb_master_rules) when Sheets unavailable |

## Telemetry — the 7 metric types

- `auralyn.context.prompt_tokens` (tagged by role)
- `auralyn.context.artifacts_published` (tagged by type)
- `auralyn.context.artifacts_excluded_for_budget`
- `auralyn.context.compaction_event` (tagged by pre_step)
- `auralyn.context.bus_contract_violation`
- `auralyn.context.memory_hits` (tagged by scope)
- `auralyn.context.prefix_stability`

## Memory scopes — precedence rules

When the same memory `key` exists at multiple scopes:
**physician > tenant > global** (most specific wins).

Memory status lifecycle: `active → shadow → revoked`. Demotion sweep
runs daily at 03:00 UTC, advisory-lock guarded.

## Critical bug class

The pipeline MUST work when Google Sheets is unavailable.
`loadComplaintConfig` tries Sheets first, then falls back to
`loadComplaintConfigFromDB` reading from `kb_master_rules`. When
fallback is used, `staleConfig: true` is set. **Never assume Sheets is
available in any production path.**

## Hard rules for changes here

1. **The compactor never calls an LLM.** Model-generated summaries can
   silently drop findings. Compaction is rule-based only.
2. **Bus contract violations throw.** Never wrap publish() in a try/catch
   that swallows the error.
3. **All agent prompts go through `assemblePromptFor`.** Never let an
   agent construct its prompt string by concatenating fields.
4. **Red flags in immutables are permanent.** Even the supervisor cannot
   remove them.
