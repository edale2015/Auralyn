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

## External Dependencies

- **AI Integration**: OpenAI API for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable, defaults to local disk for single instances).