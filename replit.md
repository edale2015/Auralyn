# ENT Flu Slice - Medical Triage System

## Overview
This project, "env_flu_slice", is a medical triage platform that streamlines the review and approval of patient cases by physicians. It utilizes WhatsApp as the primary patient interface for a deterministic ENT Flu questionnaire flow. The system gathers symptoms and medical information, generates a proposed diagnosis and treatment plan, and queues cases for physician review. Once a physician approves, the disposition and orders are communicated back to the patient via WhatsApp. The platform aims to efficiently manage medical consultations for flu-like symptoms, with a fallback for patients who prefer WhatsApp-based Q&A.

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
- **Database**: Firebase Firestore
- **Admin SDK**: `firebase-admin`
- **Schema**: Defined in `shared/schema.ts` (physicians, patients, encounters, orders, whatsapp_messages)
- **Cases Collection**: `cases` in Firestore for patient intake workflow

### Authentication
- Simple username/password login for physicians.
- Client-side session storage in localStorage.
- Token-based intake access for patients (6-digit code verification).

### Key Data Models
- **Physicians**: Medical staff for case review.
- **Patients**: Identified by WhatsApp phone number.
- **Encounters**: Medical cases with AI diagnosis, urgency, and status.
- **Orders**: Follow-up actions.
- **WhatsApp Messages**: Conversation history.
- **Cases**: Patient intake workflow with draft/submitted/signed status.

## Patient Website

### Pages
- `/` - Physician login
- `/start` - Patient entry point (enter code or WhatsApp link)
- `/intake/:token` - Code verification + intake form
- `/intake/:token/status` - Case status page (polling for updates)
- `/intake/:token/summary` - Signed visit summary (HTML)
- `/dashboard` - Physician dashboard for case review

### Intake API Endpoints
- `POST /api/intake/:token/verify` - Verify 6-digit code
- `POST /api/intake/:token/save_draft` - Autosave draft answers
- `POST /api/intake/:token/submit` - Submit completed intake
- `GET /api/intake/:token/status` - Get case status
- `GET /api/intake/:token/summary` - Get signed visit summary
- `POST /api/intake/:token/upload` - Upload attachments

### Autosave
- Saves draft every 15 seconds while patient is on form
- Shows save indicator in UI

## EHR Integration (Scaffolding)

### Architecture
Located in `server/integrations/ehr/`:
- `ehrConnector.ts` - Vendor-neutral interface
- `smartDiscovery.ts` - SMART on FHIR discovery
- `fhirClient.ts` - FHIR GET/POST helpers
- `ecwConnector.ts` - eClinicalWorks connector (credential-ready)
- `ehrRegistry.ts` - Vendor registry with env config loader

### Supported Vendors
- eClinicalWorks (ecw) - Ready for credentials
- Athena - Stub (not wired)

### Environment Variables (when ready)
```
EHR_VENDOR=ecw
EHR_FHIR_BASE_URL=https://...
EHR_CLIENT_ID=...
EHR_CLIENT_SECRET=...
EHR_REDIRECT_URI=https://...
EHR_SCOPES=launch/patient openid fhirUser patient/*.read
EHR_ALLOW_WRITES=false
```

## External Dependencies

### AI Integration
- **OpenAI API**: For medical triage AI conversations.

### Messaging Integration
- **Twilio**: For WhatsApp patient communication.

### Database
- **Firebase Firestore**: Primary database.

### Google Sheets Integration
- **Flow Questions**: Dynamically loads questionnaire questions from the `ENT_FLU_QUESTIONS` tab.
- **Clinical Rules**: Dynamically loads clinical decision rules from the `CLINICAL_RULES` tab.
- **Medications**: `CLINICAL_MEDICATIONS` tab
- **Diagnoses**: `CLINICAL_DIAGNOSES` tab

## QA & Testing Pipeline

### Nightly Pipeline
Run: `npx tsx server/scripts/runNightlyPipeline.ts`

Steps:
1. `runNightlyTests.ts` - Generate test scenarios
2. `testRunReport.ts` - Report failures (CSV/HTML)
3. `generatePatchProposals.ts` - Suggest RED_FLAG_QIDS patches
4. `generateMedCleanupProposals.ts` - Medication data cleanup
5. `generateRouterSynonymSuggestions.ts` - Router misroute analysis
6. `generateDailyDigest.ts` - Summary digest
7. (Optional) Auto-promote patches to staging

### Staging Environment
- `SHEETS_SPREADSHEET_ID_STAGING` - Staging spreadsheet ID
- `TEST_SHEET_ENV=staging` - Target staging for tests
- `AUTO_PROMOTE_TO_STAGING=1` - Enable auto-promotion in pipeline

### Regression Gate
Compares before/after test digests and flags regressions:
- `GATE_MAX_FAIL_INCREASE=1` - Max allowed fail count increase
- `GATE_MAX_FAILRATE_INCREASE=0.02` - Max fail rate increase (2%)
- `GATE_MAX_AVGSEV_INCREASE=0.5` - Max avg severity increase
- `GATE_FAIL_ON_REGRESSION=1` - Fail script on regression (for CI alerts)

Outputs:
- `staging_gate.json` - Gate decision with metrics
- Gate result appended to `staging_promotion_report.md`

### Report Output
- Default: `./reports/`
- Configurable: `REPORT_OUTPUT_DIR` env var

## Intake Storage Abstraction

### Architecture
The intake system uses a storage abstraction layer that supports both SQLite and Firestore backends.

Located in `server/intakeStorage/`:
- `index.ts` - Driver selector (based on STORAGE_DRIVER env var)
- `store.ts` - StorageDriver interface definition
- `types.ts` - Shared types for storage operations
- `crypto.ts` - Hash and ID generation utilities
- `sqliteStore.ts` - SQLite implementation
- `firestoreStore.ts` - Firestore implementation

### Environment Variables
```
STORAGE_DRIVER=sqlite   # or "firestore"

# SQLite (default)
DB_PATH=./data.sqlite

# Firestore
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

### Firestore Index Required
When using Firestore driver, you must create a composite index:

**Collection:** `cases`
**Fields:**
- `token` Ascending
- `created_at` Descending

**Query that requires it:** Latest case lookup by token.

**Option 1:** If the index is missing, Firestore returns an error containing a direct link to create it in the Firebase Console.

**Option 2:** Deploy using Firebase CLI:
```bash
firebase deploy --only firestore:indexes
```
The index definition is in `firestore.indexes.json` at the project root.

### Latest Case Tie-Breaker
Cases are retrieved by `token` ordered by `created_at DESC`. If two cases have the same `created_at` (rare but possible under load), the result is non-deterministic. This is acceptable for the current token-per-intake-link design.

### File Uploads (Production Note)
File uploads are stored on local disk (`UPLOAD_DIR`). This works for single-instance deployments.

**Important:** If `STORAGE_DRIVER=firestore` and you deploy multiple instances, local disk files won't be shared. For production multi-instance deployments, migrate to Cloud Storage (Firebase Storage or GCS).

### Routes (Storage-Agnostic)
Located in `server/intake/`:
- `routes.intake.ts` - Verify, save_draft, submit, status, summary endpoints
- `routes.files.ts` - File upload/download endpoints
- `routes.summary.ts` - Provider case view endpoints
- `storage.ts` - File upload directory management
- `pdf.ts` - HTML summary rendering

### Database Tables
- `intake_sessions` - Token-based session management with code verification
- `cases` - Case workflow (draft → submitted → in_review → signed → closed)
- `files` - Uploaded file metadata

### Frontend Components
Located in `client/src/components/intake/`:
- `VerifyCard` - Code verification
- `SymptomGrid` - Yes/No/Not sure symptom grid
- `UploadPanel` - File upload with preview
- `ConsentPanel` - Telehealth + privacy consent
- `ReviewSubmit` - Final review and submission

### Patient Portal Routes
- `/start` - Patient landing page (paste token or link)
- `/simple/:token` - Simple 5-step intake (storage-agnostic)
- `/intake/:token` - Full questionnaire intake (Firestore/Sheets-based)
- `/intake/:token/status` - Case status page
- `/intake/:token/summary` - Signed visit summary

### Session Management
- Sessions expire 30 minutes after verification
- Countdown timer displayed in status bar
- Expired sessions disable form inputs with warning message
- Autosave every 15 seconds with status indicator

### Test Helper
Create test token: `npx tsx server/scripts/createTestToken.ts [token] [code] [expiry_minutes]`

## Recent Changes (2026-02-02)
- Updated patient landing page (/start) with token/URL extraction
- Added session countdown timer after verification
- Added "Saved" indicator for autosave status
- Session expiry disables form inputs with clear warning
- All intake components support disabled state
- Backend verify endpoint returns sessionExpiresAtMs
- Added firebase.json for Firestore index deployment via CLI
- Added Firebase Storage support (UPLOADS_MODE=firebase_storage env var)
- File uploads now support dual mode: local_disk (default) and firebase_storage
- Server-streamed downloads with backward compatibility for legacy local_disk files
- Added EHR Export Pack API endpoints:
  - GET /api/provider/case/:caseId/note - Visit note draft (HPI/ROS/MDM)
  - GET /api/provider/case/:caseId/billing - Billing suggestions (ICD-10/CPT codes)
  - GET /api/provider/case/:caseId/packet - Full intake packet HTML
  - GET /api/provider/case/:caseId/files - List of uploaded attachments
- Added external_ehr schema fields for future EHR linking:
  - vendor: "none" | "athena" | "ecw"
  - patientId, encounterId, lastSyncAt, syncStatus, lastError
- GET /api/intake/_driver returns current storage driver and uploads mode
- Added POST /api/provider/intake/test-token endpoint for one-click test token creation
- Added "Create Test Intake" button to /provider/case page (opens intake in new tab, shows token/code in toast)
- Fixed EHR Export Pack Copy Billing to handle plain text response from backend
- Golden path E2E tested: Create test intake → Complete form → Use Export Pack (Copy Note, Copy Billing, Open Packet, Attachments)

## Cloud Storage Configuration
```
UPLOADS_MODE=firebase_storage
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
```

## EHR Export Pack (Stage 1)
Provider endpoints require X-Provider-Key header matching PROVIDER_API_KEY env var.
Use for copy/paste workflow into eClinicalWorks:
- Copy visit note draft
- Copy billing suggestions
- Download intake packet HTML

## Encounter-Intake Case Linking
Encounters can be linked to intake cases for unified workflow:
- Schema: `encounters.intakeCaseId` field links encounter to intake case
- API: `POST /api/provider/encounter/:encounterId/link-intake` with body `{ intakeCaseId: "..." }`
- API: `DELETE /api/provider/encounter/:encounterId/link-intake` to unlink
- UI: CaseDetail shows LinkIntakeCaseCard when no case linked, EhrExportPack when linked
- ProviderCaseView has "Copy ID" button for easy case ID copying

## Recent Changes (2026-02-01)
- Added SQLite-based intake system with modular routes
- Created intake frontend components (VerifyCard, SymptomGrid, etc.)
- Added file upload capability with multer
- Added patient website with intake flow, status, and summary pages
- Implemented autosave for intake form (15-second interval)
- Created EHR integration scaffolding for eCW/FHIR
- Added Case data model in Firestore
- Enhanced intake API with save_draft, status, summary, upload endpoints
- Added staging regression gate to QA pipeline
- Added database-persisted session verification (verified_at, session_expires_at)
- Added provider authentication (PROVIDER_API_KEY env var required for /api/admin/* endpoints)
- Added automatic DB migrations for existing deployments
- Implemented storage abstraction layer (server/intakeStorage/) supporting SQLite and Firestore
- Refactored intake routes to be storage-driver agnostic (STORAGE_DRIVER env var switches drivers)
