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

### Unified Multi-Channel Messaging
- **Architecture**: Unified `MessageEvent` type with channel abstraction (whatsapp/telegram/web/test) and `conversationId` keying.
- **Conversation State**: In-memory store with message deduplication, friction tracking, tone profile management, and `lastNMessages` buffer, with optional Firestore caching.
- **Channel Adapters**: Routes replies to WhatsApp/Twilio or Telegram API based on conversationId.
- **Message Orchestrator**: Handles shared processing logic like staff commands, menu/flow routing, answer parsing, and emergency warnings.
- **Telegram Integration**: Webhook with secret-token validation and rate limiting.
- **Friction Policy**: Implements rules to adapt conversation tone and branching based on friction scores, escalating to staff if necessary.
- **Emergency Warnings**: Uses versioned, template-driven warnings with immutable text.

## External Dependencies

- **AI Integration**: OpenAI API (via Replit AI Integrations) for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication; Telegram Bot API for Telegram channel.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable).