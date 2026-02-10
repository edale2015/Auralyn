# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that streamlines patient case review and approval by physicians. It uses WhatsApp for a deterministic ENT Flu questionnaire flow, collecting symptoms and medical information to generate proposed diagnoses and treatment plans. Cases are then queued for physician review, and upon approval, dispositions and orders are communicated back to the patient via WhatsApp. The platform aims for efficient management of flu-like symptom consultations, with a fallback for WhatsApp-based Q&A.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **UI/UX**: shadcn/ui (built on Radix UI) with Tailwind CSS and custom healthcare design tokens.
- **Key Pages**: Physician login, patient entry, intake form, case status, signed visit summary, physician dashboard, and Trace Viewer with LLM variant filtering.

### Backend
- **Framework**: Express 5 on Node.js with TypeScript.
- **API Pattern**: REST endpoints (`/api/*`).
- **Agentic Spine**: Uses a constrained agent architecture for deterministic medical triage decisions, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. It incorporates Centor score calculation, red flag detection, and a supervisor gate for patient-visible outputs.
- **LLM Integration**: Supports LLM-powered actions for rephrasing questions and drafting summaries, using Replit AI Integrations (OpenAI-compatible) with model `gpt-5-mini`. Includes rate limiting, per-run budgets, and circuit breaker for resilience.

### Data Storage
- **Database**: Firebase Firestore (primary) and SQLite (for intake storage abstraction, configurable).
- **Schema**: Defined for physicians, patients, encounters, orders, WhatsApp messages, and cases.
- **Trace Storage**: Agent traces and LLM call logs are collected in Firestore (or in-memory for dev).

### Authentication
- **Provider Login**: Password-only session-based authentication via HMAC-signed httpOnly cookies.
- **Patient Access**: Token-based intake access with 6-digit code verification.
- **API Key Fallback**: `X-Provider-Key` for development/scripts.

### EHR Integration
- **Architecture**: Scaffolding for vendor-neutral interface with SMART on FHIR discovery and FHIR client helpers. `eClinicalWorks` connector is credential-ready; `Athena` is a stub. This feature is planned for a later phase.

### Regression Testing Gate
- **Purpose**: Ensures consistent agent behavior with hard and soft failure classifications.
- **Endpoints**: `/api/test/rules/snapshot`, `/api/test/agent-run`, `/api/test/compare`.
- **Test Cases**: Golden test cases stored in `server/testcases/*.json` with expected outcomes.
- **Normalized Output**: Agent runs return normalized `final` output including disposition, diagnosis, scores, and red flags.
- **Production Safety**: Test routes disabled in production unless `ENABLE_TEST_ROUTES=1` is set.

### Configuration
- **Validation**: Zod-based environment variable validation at startup.
- **Firebase**: Lazy initialization, consumers use `getFirestore()`.
- **Google Sheets**: Centralized singleton client for loading rules, medications, and diagnoses.

## Agent System

### Routing States
- `INTAKE_PENDING` → `MODIFIERS_PENDING` → `CORE_QS_PENDING` → `SCORING_PENDING` → `REVIEW_REQUIRED`
- Emergency path: `EMERGENT_ESCALATION`
- More info path: `MORE_INFO_REQUIRED`

### AgentAction Types
NOOP, ASK_QUESTION, REFRAME_QUESTION, COMPUTE_SCORE, FLAG_RED_FLAG, SET_DISPOSITION, ADD_DX, RECOMMEND_ACTIONS, DRAFT_SUMMARY, ESCALATE_TO_CLINICIAN, STOP

### LLM-Powered Actions
- **REFRAME_QUESTION**: Router selects this instead of ASK_QUESTION when `cfg.llm.enabled` is true. Calls OpenAI to rephrase clinical questions with tone profiles. Falls back to original prompt on LLM error or guardrail violation.
- **DRAFT_SUMMARY**: When LLM is enabled, generates actual clinical or patient-facing summaries via OpenAI. Falls back to placeholder when LLM is off.
- **LLM Client**: `server/agent/llm/agentLlm.ts` — uses Replit AI Integrations (OpenAI-compatible, no API key needed). Model: gpt-5-mini.
- **Logging**: Every LLM call is logged via `buildLlmCallLogEntry()` → `getLlmCallLog().log()` with mandatory `promptTemplateId` + `promptTemplateVersion`, input/output hashes, token counts, latency, and step linking. OutputText is redacted in production (REDACT_LLM_LOGS=true or NODE_ENV=production).

### Prompt Template Versioning
- **Mandatory Fields**: Every LLM call must include `promptTemplateId` and `promptTemplateVersion` in the log entry
- **Current Templates**: `reframe_question@v1`, `draft_summary_clinician@v1`, `draft_summary_patient@v1`
- **RC Report Integration**: RC reports include `templateVersionDeltas` showing call counts, avg latency, and token usage per template version
- **Schema Enforcement**: `buildLlmCallLogEntry()` requires both fields at compile time

### LLM A/B Testing
- **Tone Profiles**: empathetic, concise, pediatric, elderly — configurable via `cfg.llm.toneProfile`
- **WhatsApp Commands**: `!scenario run <id> --llm=on|off --tone=empathetic|concise|pediatric|elderly --seed=N`
- **Trace Metadata**: Each run stores `llmConfig` in `StoredTrace.metadata` for comparison
- **UI Filtering**: Trace Viewer has LLM variant filter dropdown to compare LLM on/off and tone variants

### LLM Guardrails (`server/agent/llm/llmGuardrails.ts`)
- **Per-run budget**: Max 10 LLM calls and 4000 tokens per agent run
- **Circuit breaker**: If 5+ LLM errors in 60s, disables LLM calls for 120s with automatic fallback
- **Monitoring**: `GET /api/analytics/llm-guardrails` returns circuit status and config

### Agent Endpoints
- `POST /api/agent/next` - Plan next action (provider auth required)
- `POST /api/agent/execute` - Execute single action (provider auth required)
- `POST /api/agent/run` - Full agent loop (provider auth required)

### Security Invariants
- Router never emits REFRAME_QUESTION unless questionId is in ALLOWED_QUESTION_IDS set
- LLM log outputText is redacted in production (only hashes stored)
- Provider auth required on all agent, trace, analytics, and LLM log endpoints
- Test routes disabled in production unless ENABLE_TEST_ROUTES=1

## Release Candidate (RC) System

### RC Run (`server/rc/rcRunner.ts`)
- **WhatsApp Command**: `!rc run` — runs all golden scenarios across 3 LLM variants (off, empathetic, concise)
- **API**: `POST /api/rc/run` — returns full RC report
- **Report Contents**: pass/fail summary, top 10 diffs, latency stats (mean/median/p95), token totals + cost estimate, friction rate, template version deltas
- **Cross-variant Comparison**: LLM variants compared against LLM-off baseline for safety regressions
- **MDS Enforcement**: RC suite validates Minimum Data Set completion per complaint, hard-fails if required questions missing (unless emergent)

### Replay Mode (`server/rc/replayRunner.ts`)
- **API**: `POST /api/replay/:runId` — replays an existing trace through new config
- **Config Options**: toneProfile, llmEnabled, model, temperature, seed
- **Output**: New trace + diff against original (hard/soft failures)
- **Use Case**: Test ruleset/tone/model changes against real conversation data without messaging patients

### PHI-Safe Replay Packs (`server/rc/replayPacks.ts`)
- **API**: `POST /api/replay-packs/export/:runId` — exports redacted replay bundle from trace
- **API**: `GET /api/replay-packs/:packId` — retrieve a stored replay pack
- **API**: `GET /api/replay-packs` — list all replay packs
- **API**: `POST /api/replay-packs/:packId/run` — rerun a pack through new config
- **PHI Redaction**: Strips phone numbers, emails, SSNs, addresses, dates, and name prefixes from transcripts
- **Contents**: redacted transcript, case state snapshot, extracted answers, demographics, rulesetHash
- **Use Case**: Safe QA and future training without accessing original patient messages

### Quality Review (`server/analytics/qualityReview.ts`)
- **API**: `POST /api/traces/:runId/review` — tag run as great/ok/bad with validated reason
- **API**: `GET /api/traces/:runId/review` — get existing review
- **API**: `GET /api/analytics/quality-reviews` — summary with ratings distribution and top reasons
- **UI**: Quality Review panel in Trace Detail view with rating buttons and reason selector
- **Predefined Reasons**: "too many questions", "missed key question", "tone annoyed patient", "premature escalation", "not empathic enough", "incorrect disposition", "excellent flow", "other"

### Weekly Improvement Loop (`server/rc/weeklyImprovement.ts`)
- **API**: `POST /api/rc/weekly-improvement` — runs full weekly improvement cycle
- **Process**: Pull top 20 "bad" quality reviews → cluster by reason + chief complaint + friction → replay each cluster with 2-3 alternative configs → run RC gate → compute metric deltas
- **Report Contents**: Week N number, clusters analyzed, replay results per config, RC gate pass/fail, metric deltas (turns-to-completion, escalation, friction, dropout), promotion decision
- **Promotion Gate**: Changes only promoted if RC suite passes after replaying improvements

## Minimum Data Set (MDS) Contract (`server/rules/minimumDataSet.ts`)
- **Registry**: Complaint → required questions + nice-to-have questions mapping
- **Supported Complaints**: sore_throat, ear_pain, nasal_congestion, cough
- **Validation**: `validateMinimumDataSet()` checks answered questions against required set
- **Emergency Bypass**: MDS check passes automatically for emergent cases
- **API**: `GET /api/mds/registry` — view all complaint data sets
- **RC Integration**: RC suite hard-fails if required questions not collected before disposition (unless emergent)

## Analytics

### Conversation Metrics (`server/analytics/conversationMetrics.ts`)
- `GET /api/analytics/conversation-metrics?from=...&to=...` — returns:
  - turns-to-completion (mean, median, p90)
  - required-Q completion %
  - escalation-to-staff rate
  - re-ask rate (same question asked twice)
  - dropout rate (conversation ended before completion)

### Friction Detection (`server/analytics/frictionDetector.ts`)
- `GET /api/analytics/friction/:runId` — heuristic-based friction signals per conversation:
  - profanity/insults detection
  - refusal phrases ("not answering", "stop asking")
  - off-topic replies
  - very long rambling messages (>500 chars)

### Cost/Latency SLA Alerts (`server/analytics/slaAlerts.ts`)
- **API**: `GET /api/analytics/sla-status` — provider-only SLA health check
- **Thresholds**: p95 latency > 15s, avg tokens/run > 2000, circuit breaker > 3/day, cost/run > $0.05
- **Alert Severities**: warning (1x threshold), critical (2x threshold)
- **Metrics**: p95 latency, avg tokens/run, avg cost/run, circuit breaker triggers today
- **Use Case**: Dashboard banner for providers to monitor spend and UX health

## Unified Multi-Channel Messaging (`server/channels/`)

### Architecture
- **Message Event**: Unified `MessageEvent` type with channel abstraction (whatsapp/telegram/web/test) and `conversationId` keying as `channel:externalUserId`
- **Conversation State**: In-memory store with message deduplication (TTL-based, 5min window, 10K max), friction tracking, tone profile management, and `lastNMessages` buffer
- **Channel Adapters**: `sendReply()` routes to WhatsApp/Twilio or Telegram API based on conversationId prefix
- **Message Orchestrator**: Shared processing logic (staff commands, menu/flow routing, answer parsing, emergency warnings) extracted from WhatsApp webhook
- **Feature Flags**: `ENABLE_WHATSAPP_INTAKE`, `ENABLE_TELEGRAM_INTAKE`, `ENABLE_TEST_CONSOLE` for channel-level toggles

### Telegram Integration
- **Webhook**: `POST /api/webhooks/telegram` with secret-token header validation
- **Restrictions**: Only private (1:1) chats; group messages rejected with informational reply
- **Env Vars**: `TELEGRAM_BOT_TOKEN` (required), `TELEGRAM_WEBHOOK_SECRET` (optional), `STAFF_TELEGRAM_IDS` (comma-separated)

### Friction Policy
- Score 5: Tone switches to "concise"
- Score 8: Narrow questions (reduce branching)
- Score 12: Stop agent, escalation message sent, conversation paused for staff follow-up

### Key Files
- `server/channels/messageEvent.ts` — MessageEvent type, conversationId helpers
- `server/channels/conversationState.ts` — ConversationState store with dedup + friction
- `server/channels/messageOrchestrator.ts` — Shared message processing logic
- `server/channels/channelAdapter.ts` — Channel-agnostic sendReply()
- `server/channels/telegramWebhook.ts` — Telegram webhook handler
- `server/channels/telegramSender.ts` — Telegram Bot API sender
- `server/channels/whatsappSender.ts` — WhatsApp/Twilio sender adapter
- `server/channels/featureFlags.ts` — Channel feature flags
- `server/channels/index.ts` — Channel initialization and re-exports

## External Dependencies

- **AI Integration**: OpenAI API (via Replit AI Integrations) for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication; Telegram Bot API for Telegram channel.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable).
