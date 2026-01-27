# ENT Flu Slice - Medical Triage System

## Overview

This is a medical triage platform that enables physicians to review and approve patient cases submitted via WhatsApp. The system uses a deterministic ENT Flu questionnaire flow through WhatsApp, gathering symptoms and medical information before presenting cases to physicians for final review and disposition.

**Project Name**: env_flu_slice

The core workflow is:
1. Patients message via WhatsApp to start triage
2. System sends a secure link + 6-digit code (30-minute expiry) for grid-based intake
3. Patient opens web intake form, enters code, and answers 19 questions via tri-state checkboxes (Yes/No/Not Sure)
4. System computes proposal with disposition, medication suggestions, and tests to consider
5. Cases are queued for physician review with computed recommendations
6. Physicians approve/reject cases with their own diagnosis and disposition
7. Approved orders/dispositions are sent back to patient via WhatsApp

**Fallback**: If patient can't use the web link, they can reply "questions" to answer via WhatsApp Q&A instead.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query for server state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with custom healthcare-adapted design tokens
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST endpoints under `/api/*`
- **Build**: esbuild for production bundling with selective dependency bundling

### Data Storage
- **Database**: Firebase Firestore (Google Cloud)
- **Admin SDK**: firebase-admin with applicationDefault() credentials
- **Schema Location**: `shared/schema.ts` - TypeScript types for physicians, patients, encounters, orders, and whatsapp_messages
- **Current Storage**: FirebaseStorage class in `server/storage.ts` (Firestore-backed, persistent)
- **Firebase Config**: `server/firebase.ts` - initializes Admin SDK using GOOGLE_SERVICE_ACCOUNT_JSON secret

### Authentication
- Simple username/password login for physicians
- Session stored in localStorage on client
- No session middleware currently implemented on server

### Key Data Models
- **Physicians**: Medical staff who review and approve cases
- **Patients**: Identified by WhatsApp phone number
- **Encounters**: Medical cases with AI diagnosis, urgency levels, and status tracking
- **Orders**: Follow-up actions tied to encounters
- **WhatsApp Messages**: Conversation history for each encounter

## External Dependencies

### AI Integration
- **OpenAI API**: Used for medical triage AI conversations
- **Environment Variables**: 
  - `AI_INTEGRATIONS_OPENAI_API_KEY`
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Messaging Integration
- **Twilio**: WhatsApp messaging for patient communication
- **Environment Variables**:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WHATSAPP_NUMBER`

### Database
- **Firebase Firestore**: Primary database (Google Cloud)
- **Environment Variables**:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (secret) - Service account credentials JSON
  - `FIREBASE_PROJECT_ID` - Firebase project ID (medicalm-dec9d)

### Google Sheets Integration (Flow Questions)
- **Purpose**: Dynamic loading of questionnaire questions from Google Sheets
- **Sheet Tab**: `ENT_FLU_QUESTIONS`
- **Required Columns**: `flow_id`, `order`, `question_id`, `question_text`, `answer_type`, `required`, `active`
- **Optional Columns**: `min`, `max`, `choices`, `help_text`
- **Environment Variables**:
  - `SHEETS_SPREADSHEET_ID` (secret) - Google Sheets spreadsheet ID
- **Caching**: Questions cached for 5 minutes to avoid API quota issues
- **Fallback**: Uses hardcoded flow if Sheets unavailable or not configured
- **Loader**: `server/flows/sheetFlowLoader.ts`

### Google Sheets Integration (Clinical Rules)
- **Purpose**: Dynamic loading of clinical decision rules from Google Sheets
- **Sheet Tab**: `ENT_FLU_RULES`
- **Required Columns**: `rule_key`, `value_type`, `value`, `active`
- **Supported value_type**: `number`, `boolean`, `text`, `json`
- **Configurable Rules**:
  - `TAMIFLU_MAX_DAYS` (number, default: 2) - Max symptom onset days for Tamiflu eligibility
  - `TAMIFLU_REQUIRE_FEVER` (boolean, default: true) - Require fever for Tamiflu
  - `TAMIFLU_REQUIRE_ACHES` (boolean, default: true) - Require aches for Tamiflu
  - `RED_FLAG_DISPOSITION` (text, default: "urgent_or_ed") - Disposition when red flags present
  - `NON_RED_FLAG_DISPOSITION` (text, default: "self_care_with_precautions") - Default disposition
  - `PROPOSE_COVID_TEST` (boolean, default: true) - Whether to propose COVID test
  - `PROPOSE_FLU_TEST_IF_TAMIFLU` (boolean, default: true) - Propose flu test if Tamiflu eligible
- **Caching**: Rules cached for 5 minutes
- **Fallback**: Uses hardcoded defaults if Sheets unavailable
- **Loader**: `server/rules/entFluRuleLoader.ts`

### Replit Integrations
Located in `server/replit_integrations/` and `client/replit_integrations/`:
- **Audio**: Voice chat with speech-to-text and text-to-speech
- **Chat**: Conversation management with streaming responses
- **Image**: Image generation via OpenAI
- **Batch**: Rate-limited batch processing utilities

### Development Tools
- Replit-specific Vite plugins for error overlay and dev banner
- ffmpeg for audio format conversion (available on Replit by default)

## API Routes

### Authentication
- `POST /api/auth/login` - Physician login with username/password

### Encounters
- `GET /api/encounters` - List encounters, accepts `filter` query param (pending, approved, all)
- `GET /api/encounters/:id` - Get encounter with messages and orders
- `POST /api/encounters/:id/approve` - Physician approval of encounter
- `POST /api/encounters/:id/request-info` - Request more info from patient

### Webhooks
- `POST /api/webhooks/whatsapp` - Twilio WhatsApp webhook for incoming messages

### Testing
- `POST /api/test/simulate-message` - Simulate WhatsApp message for testing

## Default Credentials
- Username: admin
- Password: Set via `MD_PASSWORD` environment variable (default: physician123)

## Gold Slice V1

**Status**: Frozen as stable baseline (January 21, 2026)

The current implementation is marked as "Gold Slice V1" - a fully functional, tested end-to-end medical triage system.

### Smoke Test

Run to verify the complete flow:

```bash
npx tsx scripts/smoke-test.ts
```

Expected: 14/14 tests passing (encounter creation, questionnaire, proposal, approval, notifications)

### Key Files

- `scripts/smoke-test.ts` - End-to-end validation script
- `GOLD_SLICE_V1.md` - Detailed documentation of frozen features

## Recent Changes

- 2026-01-27: Grid-based patient intake system
  - New secure intake link+code flow replaces WhatsApp Q&A as primary intake method
  - 48-char hex token + 6-digit code + 30-minute expiry for security
  - PatientIntakePage component with tri-state checkboxes (Yes/No/Not Sure)
  - New endpoints: GET /api/flows/:flowId/questions, POST /api/intake/:token/verify, POST /api/intake/:token/submit
  - WhatsApp webhook now sends link+code, with "questions" fallback to Q&A
  - Intake fields added to encounters: intakeToken, intakeCode, intakeExpiresAt
  - server/intake/intakeAuth.ts for token/code generation utilities
- 2026-01-24: Medication catalog integration (Step 2A)
  - New loader: `server/meds/medCatalog.ts` - loads CLINICAL_MEDICATIONS with 5-min cache
  - `computeProposal()` now returns `medsDetailed` and `avoidDetailed` structured objects
  - Medication pruning via modifiers: pregnancy blocks NSAIDs, HTN/anxiety blocks decongestants, SSRI blocks dextromethorphan
  - Allergy matching: compares patient allergies against medication names
  - Fallback tracking: shows which meds aren't in catalog yet
  - Legacy `meds`/`avoid` arrays preserved for backward compatibility
- 2026-01-24: Patient modifiers extraction (Step 1)
  - New function `buildModifiersFromAnswers()` extracts structured modifiers from questionnaire answers
  - Modifiers include: pregnant, htn, anxiety, ssri_snri, allergies[], onset_days, demographics
  - Persisted to encounter for audit trail and medication pruning
- 2026-01-24: Consolidated clinical data tabs and import endpoints
  - CLINICAL_QUESTIONS, CLINICAL_RULES, CLINICAL_MEDICATIONS, CLINICAL_DIAGNOSES
  - Import endpoints: POST /api/admin/sheets/import-medications, /api/admin/sheets/import-diagnoses
  - Deduplication: Medications by System+Medication_Name+Route, Diagnoses by Diagnosis_ID
  - Admin auth via x-admin-token header
- 2026-01-22: Enhanced rules loader with validation and auditability
  - Schema validation: warns on invalid values (e.g., "two" for number), uses defaults safely
  - Rules version tracking: `RULES_VERSION` row stored in proposal for audit trail
  - Warm cache at startup: questions and rules loaded eagerly to prevent first-request delay
- 2026-01-21: Added sheet-driven clinical rules
  - New loader: `server/rules/entFluRuleLoader.ts`
  - Rules loaded from `ENT_FLU_RULES` sheet tab
  - Configurable: Tamiflu eligibility, disposition rules, test proposals
  - 5-minute caching with safe fallback to hardcoded defaults
  - `computeProposal()` now async, reads rules from Sheets
- 2026-01-21: Added Google Sheets integration for dynamic questions
  - New loader: `server/flows/sheetFlowLoader.ts`
  - Questions loaded from `ENT_FLU_QUESTIONS` sheet tab (19 questions including COVID_POS, FLU_POS)
  - 5-minute caching to avoid API quota issues
  - Falls back to hardcoded flow if Sheets unavailable
  - Added `SHEETS_SPREADSHEET_ID` secret
- 2026-01-21: Gold Slice V1 frozen
  - Created comprehensive smoke test script (14 test cases)
  - All end-to-end flows verified working
  - Firebase Firestore fully operational
  - WhatsApp → Questionnaire → Approval → Notification flow complete
- 2026-01-20: Migrated from PostgreSQL to Firebase Firestore
  - FirebaseStorage class replaces DatabaseStorage
  - In-memory sorting to avoid composite index requirements
  - Numeric IDs with _counters collection for interface compatibility
- 2026-01-20: Replaced GPT with deterministic ENT Flu questionnaire
  - 19-question structured flow for flu-like symptoms
  - Red flag detection (SOB, chest pain, neuro symptoms, dehydration)
  - Tamiflu eligibility calculation (onset ≤2 days + fever + aches)
  - Medication suggestions with pruning based on conditions (pregnancy, HTN, SSRI)
  - COVID/Flu test recommendations
  - Invalid input re-prompting for numeric fields
  - Database persistence for encounter flow state (flowIndex, answers, proposal)
- 2026-01-19: Migrated to PostgreSQL persistence
  - DatabaseStorage class replaces MemStorage
  - Encounters and patients now survive server restarts
- 2026-01-18: Initial MVP implementation
  - Physician login and dashboard
  - Patient queue with urgency badges
  - Case detail panel with physician sign-off form
  - WhatsApp webhook integration with AI triage
  - OpenAI integration for medical triage conversations

## Roadmap (Post Gold Slice)

1. **Sheet-driven questions** - Load ENT flu questions from Google Sheets
2. **ChatGPT phrasing layer** - AI for message polish only (not decisions)
3. **Centor sore throat module** - Next clinical capability