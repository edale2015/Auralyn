# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform designed to streamline patient case review and approval by physicians. It uses WhatsApp for a deterministic ENT Flu questionnaire flow, collecting symptoms and medical information to generate proposed diagnoses and treatment plans. Cases are then queued for physician review, and upon approval, dispositions and orders are communicated back to the patient via WhatsApp. The platform's primary goal is efficient management of flu-like symptom consultations, with a fallback for WhatsApp-based Q&A.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with custom healthcare design tokens
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST endpoints (`/api/*`)
- **Build**: esbuild

### Data Storage
- **Database**: Firebase Firestore (primary) and SQLite (for intake storage abstraction)
- **Schema**: Defined in `shared/schema.ts` for physicians, patients, encounters, orders, whatsapp_messages, and cases.
- **Intake Storage Abstraction**: Supports both SQLite and Firestore backends, configurable via `STORAGE_DRIVER` environment variable.

### Authentication
- **Provider Login**: Password-only session-based authentication using HMAC-signed httpOnly cookies with a 12-hour TTL.
- **Patient Access**: Token-based intake access with 6-digit code verification.
- **API Key Fallback**: `X-Provider-Key` header for scripts/dev, disabled in production.

### Key Data Models
- **Physicians**: Medical staff.
- **Patients**: Identified by WhatsApp phone number.
- **Encounters**: Medical cases with AI diagnosis, urgency, and status.
- **Orders**: Follow-up actions.
- **WhatsApp Messages**: Conversation history.
- **Cases**: Patient intake workflow (draft/submitted/signed status).

### Patient Website
- **Pages**: Physician login (`/`), patient entry (`/start`), intake form (`/intake/:token`), case status (`/intake/:token/status`), signed visit summary (`/intake/:token/summary`), and physician dashboard (`/dashboard`).
- **Autosave**: Draft answers are autosaved every 15 seconds during patient intake.

### EHR Integration (Scaffolding)
- **Architecture**: Vendor-neutral interface (`ehrConnector.ts`) with SMART on FHIR discovery and FHIR client helpers.
- **Connectors**: eClinicalWorks (ecw) is credential-ready; Athena is a stub.
- **Registry**: Vendor registry with environment configuration loading.

## Regression Testing Gate

### Test Endpoints
- `GET /api/test/rules/snapshot?sheetEnv=staging` - Returns ruleset hash, tab metadata (row counts, hashes) for reproducible test runs
- `POST /api/test/agent-run` - Runs agentic loop for synthetic case payloads with normalized output and execution trace
- `POST /api/test/compare` - Compares baseline vs candidate runs with hard/soft failure classification

### Auth for Test Endpoints
- Requires `x-test-token` header (matches `TEST_EXEC_TOKEN` env var) OR valid provider session cookie

### Test Case Schema
Golden test cases stored in `server/testcases/*.json` using `TestCaseV1` schema with:
- `id`, `label`, `chiefComplaint`
- `case.demographics`, `case.modifiers`, `case.answers`
- `expected` (optional): disposition, redFlagsPresent, scores
- `tags` for filtering

### Hard vs Soft Failures
**Hard Fails (block promotion):**
- DISPOSITION_CHANGED_UP (less safe)
- RED_FLAG_REMOVED
- SCORE_CHANGED
- UNKNOWN_DISPOSITION

**Soft Fails (flag for review):**
- DISPOSITION_CHANGED_DOWN (more conservative)
- DX_CHANGED
- RED_FLAG_ADDED
- TRACE_STEP_COUNT_CHANGED

### Normalized Output
Agent run returns `normalized.final` with:
- `disposition`: final disposition string
- `dx`: array of diagnosis cluster IDs
- `scores`: record of computed scores (e.g., centor)
- `redFlags`: array of triggered red flag QIDs
- `hash`: SHA256 of normalized output for strict comparison

## Agentic Spine Architecture

The system uses a constrained agent architecture for deterministic medical triage decisions.

### Core Components
- **shared/agentTypes.ts**: CaseState (single source of truth), AgentAction discriminated union (10 action types), AgentRunConfig schemas
- **server/agent/router.ts**: Constrained next-action picker with chiefComplaint normalization (handles "sore throat", "sore_throat", "pharyngitis")
- **server/agent/executors.ts**: Action execution with trace capture
- **server/agent/runtime.ts**: Agent loop (plan/act/observe) with max step guard
- **server/agent/scoring/centor.ts**: Centor score calculation (fever + no cough + exudate + tender nodes + age adjustment)
- **server/agent/safety/redFlags.ts**: Red flag detection (single authority)
- **server/agent/safety/supervisor.ts**: Gate for patient-visible outputs

### CaseState Routing States
- `INTAKE_PENDING` → `MODIFIERS_PENDING` → `CORE_QS_PENDING` → `SCORING_PENDING` → `REVIEW_REQUIRED`
- Emergency path: `EMERGENT_ESCALATION`
- More info path: `MORE_INFO_NEEDED`

### AgentAction Types
NOOP, ASK_QUESTION, COMPUTE_SCORE, FLAG_RED_FLAG, SET_DISPOSITION, ADD_DX, RECOMMEND_ACTIONS, DRAFT_SUMMARY, ESCALATE_TO_CLINICIAN, STOP

### Agent Endpoints
- `POST /api/agent/next` - Plan next action (provider auth required)
- `POST /api/agent/execute` - Execute single action (provider auth required)
- `POST /api/agent/run` - Full agent loop (provider auth required)

### Design Decisions
- Router is single source for red flag detection (executor removed duplicate checks)
- Supervisor gate blocks patient-visible outputs if red flags present or no disposition set
- ChiefComplaint normalization handles synonyms (sore throat/pharyngitis → sore_throat)

## Initialization & Configuration

### Config Validation (`server/config.ts`)
- Zod-based env var validation at startup, feature-gated:
  - `STORAGE_DRIVER=firestore` → requires `FIREBASE_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `ENABLE_TWILIO=1` → requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  - `SHEETS_SPREADSHEET_ID` → optional, enables Sheets integration

### Firebase Admin (`server/firebase.ts`)
- Lazy initialization: `initFirebase()` called explicitly in `server/index.ts` only when `STORAGE_DRIVER=firestore`
- Consumers use `getFirestore()` (lazy getter) instead of importing `db` directly
- Service account loaded from `GOOGLE_SERVICE_ACCOUNT_JSON` secret (JSON string, not file path)

### Google Sheets Client (`server/sheets/sheetsClient.ts`)
- Centralized singleton: `getSheetsClient()` (read-only) and `getSheetsClientRW()` (read-write)
- All loaders (`sheetFlowLoader`, `entFluRuleLoader`, `medCatalog`, `diagnosisCatalog`, `sheetHelper`, `sheetsAgent`) use this singleton
- Auth from `GOOGLE_SERVICE_ACCOUNT_JSON` secret with ADC fallback

### Health Endpoints
- `GET /api/healthz` — always available, returns `{ok, ts, uptime}`
- `GET /api/healthz/deps` — checks Firestore connectivity, Sheets read, Twilio config; returns latency per dependency

## Route Authentication Matrix

All routes are protected with appropriate middleware:

| Route Pattern | Auth Middleware | Notes |
|---|---|---|
| `GET /api/healthz` | None (public) | Basic health check |
| `GET /api/healthz/deps` | None (public) | Dependency health check |
| `POST /api/auth/login` | None (public) | Login endpoint |
| `GET/POST /api/encounters/*` | `requireProviderAuth` | Provider session or API key (dev only) |
| `POST /api/review/*` | `requireProviderAuth` | Provider session or API key (dev only) |
| `POST /api/agent/*` | `requireProviderAuth` | Provider session required |
| `POST /api/webhooks/whatsapp` | `validateTwilioSignature` | Twilio HMAC-SHA1 signature validation |
| `POST /api/test/simulate-message` | `requireProviderAuth` | Provider session or API key (dev only) |
| `GET/POST /api/test/*` (regression) | `requireTestAuth` | `x-test-token` header or provider session |
| `POST /api/admin/*` | `requireAdmin` | `x-admin-token` header required, no default fallback |
| `GET/POST /api/intake/:token/*` | Token + 6-digit code | Patient session verification |
| `GET /api/flows/:flowId/questions` | None (public) | Flow question definitions |
| `GET /api/traces` | `requireProviderAuth` | List agent traces with filters |
| `GET /api/traces/:runId` | `requireProviderAuth` | Get full trace detail |

### API Key Fallback
- `X-Provider-Key` header accepted in development only
- Automatically disabled when `NODE_ENV=production`
- Can be force-disabled with `ALLOW_PROVIDER_KEY_FALLBACK=0`

## Storage Architecture

- **Primary**: Firebase Firestore (`STORAGE_DRIVER=firestore`)
- **Dev/test alternative**: SQLite (`STORAGE_DRIVER=sqlite`)
- **Decision**: Firestore is the production storage layer; SQLite exists for local development and testing without cloud dependencies
- **Note**: The codebase contains a Drizzle/Postgres schema (`shared/schema.ts`) used for type definitions and insert schemas; it is not an active storage backend

## EHR Integration (Phase 4 — Not in v1)

EHR/FHIR integration is scaffolded but not functional in v1:
- **Architecture**: Vendor-neutral interface (`ehrConnector.ts`) with SMART on FHIR discovery and FHIR client helpers
- **Connectors**: eClinicalWorks (ecw) is credential-ready; Athena is a stub
- **Registry**: Vendor registry with environment configuration loading
- **Status**: No EHR routes are exposed. This is intentionally deferred to Phase 4 to focus v1 on WhatsApp intake, triage, and physician review workflows
- **Phase 4 scope**: Expose FHIR patient search, encounter push, order sync endpoints; complete Athena connector; add SMART on FHIR launch flow

## Agent Trace & Testing Infrastructure

### WhatsApp Staff Commands
Staff-only commands recognized in the WhatsApp webhook (gated to `STAFF_WHATSAPP_NUMBERS` env var):
- `!scenario list` - List available golden test cases
- `!scenario run <id>` - Run a test scenario through the agent loop, persist trace, return results
- `!trace last` - View the most recent trace summary
- `!trace <runId>` - View a specific trace by run ID
- `!case <caseId>` - List all traces for a case

### Trace Storage
- **Collection**: `agentTraces` (Firestore) / in-memory (dev)
- **Fields**: runId, caseId, scenarioId, isTest, chiefComplaint, steps[], events[], normalized (disposition/dx/scores/redFlags), normalizedHash, stopReason, sheetEnv, rulesetHash, commitSha, createdAt
- **Backend**: `server/traces/traceStore.ts` with Firestore and in-memory implementations

### Test Cases
- Located in `server/testcases/*.json` following `TestCaseV1` schema
- Loader: `server/testcases/loader.ts` with caching and ID/filename lookup
- Golden cases: centor_high_score, red_flag_sob, routine_uri

### Trace Viewer UI
- Route: `/debug/traces` (provider auth required via API)
- Features: List view with search/filter, detail view with step-by-step timeline, scores, red flags, events
- Component: `client/src/pages/TraceViewer.tsx`

### ConversationTurnLog
- **Collection**: `conversationTurnLogs` (Firestore) / in-memory (dev)
- **Fields**: id, caseId, encounterId, channel, sender, messageText, timestamp, agentActionId, questionId, llmUsed, llmModel, latencyMs, tokensIn/Out, patientResponseTimeMs, frictionSignals
- **Friction detection**: profanity, very_short, long_rant, refusal
- **Backend**: `server/traces/conversationLog.ts`

## External Dependencies

- **AI Integration**: OpenAI API for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable, defaults to local disk for single instances).