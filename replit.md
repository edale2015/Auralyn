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

### EHR Integration
- **Architecture**: Scaffolding for vendor-neutral interface with SMART on FHIR discovery and FHIR client helpers. `eClinicalWorks` connector is credential-ready; `Athena` is a stub. This feature is planned for a later phase.

### Regression Testing Gate
- **Purpose**: Ensures consistent agent behavior with hard and soft failure classifications.
- **Test Cases**: Golden test cases stored in `server/testcases/*.json` with expected outcomes.

### Agent System
- **Routing States**: `INTAKE_PENDING` → `MODIFIERS_PENDING` → `CORE_QS_PENDING` → `SCORING_PENDING` → `REVIEW_REQUIRED`, with emergency and more info paths.
- **AgentAction Types**: NOOP, ASK_QUESTION, REFRAME_QUESTION, COMPUTE_SCORE, FLAG_RED_FLAG, SET_DISPOSITION, ADD_DX, RECOMMEND_ACTIONS, DRAFT_SUMMARY, ESCALATE_TO_CLINICIAN, STOP.
- **LLM-Powered Actions**: `REFRAME_QUESTION` (rephrases clinical questions) and `DRAFT_SUMMARY` (generates clinical or patient-facing summaries).
- **Prompt Template Versioning**: Mandatory `promptTemplateId` and `promptTemplateVersion` for all LLM calls, enabling version tracking and analysis.
- **LLM A/B Testing**: Supports testing different tone profiles (e.g., empathetic, concise) and LLM variants.
- **LLM Guardrails**: Implements per-run budget for LLM calls and tokens, and a circuit breaker for resilience against LLM errors.

### Release Candidate (RC) System
- **RC Run**: Executes all golden scenarios across different LLM variants to generate a report with pass/fail summaries, diffs, latency, and token usage.
- **Replay Mode**: Allows replaying existing traces with new configurations to test changes against real conversation data.
- **PHI-Safe Replay Packs**: Exports redacted replay bundles from traces for safe QA and training without exposing Protected Health Information.
- **Quality Review**: Enables tagging runs as great/ok/bad with validated reasons, providing insights into agent performance.
- **Weekly Improvement Loop**: Automates the process of analyzing "bad" quality reviews, replaying scenarios with alternative configurations, and generating reports to guide improvements.

### Minimum Data Set (MDS) Contract
- **Registry**: Maps complaints to required and nice-to-have questions.
- **Validation**: Ensures required questions are answered before disposition, with an emergency bypass.

### Analytics
- **Conversation Metrics**: Tracks turns-to-completion, required-Q completion, escalation rates, re-ask rates, and dropout rates.
- **Friction Detection**: Identifies potential friction signals in conversations (e.g., profanity, refusals, off-topic replies).
- **Cost/Latency SLA Alerts**: Monitors p95 latency, average tokens/run, circuit breaker triggers, and cost/run, providing warnings or critical alerts.

### Unified Multi-Channel Messaging (`server/channels/`)
- **Architecture**: Unified `MessageEvent` type with channel abstraction (whatsapp/telegram/web/test) and `conversationId` keying as `channel:externalUserId`.
- **Conversation State**: Firestore-cached (in-memory cache + async Firestore snapshots) when `STORAGE_DRIVER=firestore`, otherwise pure in-memory. Last 20 messages cap per conversation. Dedupe keys stored as fields (not doc IDs) for PHI compliance.
- **Dedupe**: Composite keys `channel:messageId:bodyHash` (SHA-256 truncated) with Firestore persistence for cross-restart idempotency. Random Firestore doc IDs with `dedupeKey` as a queryable field.
- **Channel Adapters**: Routes replies to WhatsApp/Twilio or Telegram API based on conversationId prefix.
- **Message Orchestrator**: Shared processing logic (staff commands, menu/flow routing, answer parsing, emergency warnings) extracted from WhatsApp webhook.
- **Feature Flags**: `ENABLE_WHATSAPP_INTAKE`, `ENABLE_TELEGRAM_INTAKE`, `ENABLE_TEST_CONSOLE`, `USE_ORCHESTRATOR_WHATSAPP` for channel-level toggles and migration control.
- **Telegram Integration**: Webhook with secret-token validation and rate limiting (120 req/min per IP).
- **Friction Policy**: Score 5 = concise tone, Score 8 = narrow questions, Score 12 = stop + escalate.
- **Emergency Warnings**: Versioned templates (e.g., `EMERG_WARN_CRITICAL@v3`) with `ruleRef`, severity, and immutable text. Logged with templateId/version/ruleRef/severity/conversationId.
- **Channel Ops Dashboard**: `GET /api/analytics/channel-ops` with per-channel metrics: inbound count, dedupe hits, avg/p95 processing time, friction escalations/stops, circuit breaker activations, LLM budget hits, emergency warnings, plus detailed LLM sub-metrics (callsUsed, tokensUsed, budgetExceededCount, circuitBreakerTrips, fallbackCount, cooldownActive, avg/p95 LLM latency).
- **LLM Ops Wiring**: `recordLLMEvent()` called from `agentLlm.ts` on call_start, call_complete, fallback; from `llmGuardrails.ts` on budget_exceeded, circuit_breaker_trip, circuit_breaker_block. Ops dashboard now reflects actual agent behavior stats.
- **Migration Flag**: `USE_ORCHESTRATOR_WHATSAPP=1` routes WhatsApp messages through unified orchestrator, bypassing legacy handler entirely (early return, no double-handling).

### PHI Retention Policy (`server/channels/retentionPolicy.ts`)
- **Split Storage**: Clinical record (canonical answers, disposition, scores, red flags, traces) retained long-term. Debug telemetry (raw message text in `lastNMessages`, dedupe docs) subject to TTL sweep.
- **TTL Configuration**: `RETENTION_TTL_DAYS` env var (default 7). `ENABLE_MESSAGE_RETENTION=1` to keep raw messages past TTL.
- **Sweep Endpoint**: `POST /api/admin/retention/sweep` (provider auth) — redacts `lastNMessages` from old conversation states and deletes expired dedupe docs. Supports `?dryRun=1` for preview.
- **Config Endpoint**: `GET /api/admin/retention/config` — returns current retention configuration.
- **Dedupe Doc IDs**: Random Firestore doc IDs with `dedupeKey` stored as a queryable field (not doc ID), avoiding PHI-derived identifiers.

### Key Files
- `server/channels/messageEvent.ts` — MessageEvent type, conversationId helpers
- `server/channels/conversationState.ts` — ConversationState store with dedup + friction (Firestore-cached or in-memory)
- `server/channels/messageOrchestrator.ts` — Shared message processing logic
- `server/channels/channelAdapter.ts` — Channel-agnostic sendReply()
- `server/channels/telegramWebhook.ts` — Telegram webhook handler with rate limiting
- `server/channels/telegramSender.ts` — Telegram Bot API sender
- `server/channels/whatsappSender.ts` — WhatsApp/Twilio sender adapter
- `server/channels/featureFlags.ts` — Channel feature flags including USE_ORCHESTRATOR_WHATSAPP
- `server/channels/emergencyWarnings.ts` — Versioned emergency warning templates
- `server/channels/channelOps.ts` — Per-channel ops metrics tracker with LLM sub-metrics
- `server/channels/retentionPolicy.ts` — PHI retention config, TTL sweep logic
- `server/channels/index.ts` — Channel initialization and re-exports
- `server/routes/admin.routes.ts` — Admin retention sweep + config endpoints

## External Dependencies

- **AI Integration**: OpenAI API (via Replit AI Integrations) for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication; Telegram Bot API for Telegram channel.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable).