# CLAUDE.md — Auralyn Medical Triage SaaS
> Sanitized project context bundle. No secrets, PHI, or credentials.
> Generated: 2026-04-26 | Version: v2-hardened

---

## 1. CURRENT PROJECT SUMMARY

### What this system does
**Auralyn** is a HIPAA-targeted, multi-tenant medical triage SaaS built for high-volume urgent care. The primary deployment target is New York City urgent care clinics — initially ENT/flu-like symptom triage — with a single physician overseeing 500+ patients per day.

The system ingests patient complaints via WhatsApp, a web intake portal, or clinic staff, routes them through an AI-powered clinical decision pipeline, surfaces a structured proposal to the supervising physician for review, and persists a tamper-evident audit trail of every decision.

### Who uses it
| Role | Description |
|------|-------------|
| **Patient** | Submits symptoms via WhatsApp or web portal intake wizard |
| **Physician** | Reviews AI-generated proposals, approves/rejects, co-signs ICU/critical flags |
| **Admin** | Full system access — user management, knowledge base, audit review, model governance |
| **Staff / Clinician** | Intake support, case monitoring, non-clinical operations |
| **Viewer** | Read-only observability |

### Main workflows
1. **WhatsApp Intake** — Patient texts clinic → Twilio webhook → AI collects adaptive questionnaire → encounters record created → physician review queue
2. **Web Portal Intake** — Patient fills multi-step intake form → AI triage → clinical proposal → physician dashboard
3. **Physician Review Loop** — Physician sees AI disposition + confidence score → approves/modifies/rejects → signed audit entry appended
4. **Autonomous Agent Brain** — Continuous loop that processes simulated and live patient vitals, scores risk (LOW/MODERATE/HIGH/CRITICAL), routes to ICU or ER, and emits real-time WebSocket events
5. **Knowledge Base Management** — Admin curates complaint packs, red-flag rules, diagnosis rules, treatment templates in Google Sheets; KB synced on demand
6. **Federated Learning** — Local clinic model weights federated globally across multi-tenant nodes on a scheduled cycle

### Highest-risk areas
- **Physician approval gate** — AI diagnoses must never auto-approve without `physicianApproved: true`
- **Audit hash chain** — Tamper-evident chain in Postgres; any break is a HIPAA audit failure
- **ICU/Critical routing** — `safetyGate()` blocks ICU transfers without physician co-signature
- **PHI in WebSocket streams** — `patientStream.ts` scrubs PHI before broadcast; vitals require opt-in env flag
- **Rate limiting on clinical routes** — CSRF + rate limiter + JWT on all state-mutating endpoints

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI Components** | shadcn/ui (Radix UI primitives) + Tailwind CSS v4 |
| **State / Data fetching** | TanStack Query v5 |
| **Routing** | Wouter |
| **Forms** | react-hook-form + Zod + @hookform/resolvers |
| **Charts** | Recharts, Framer Motion |
| **Backend** | Express.js (Node.js 20) + TypeScript (tsx runtime in dev) |
| **Database** | PostgreSQL 16 (Replit-managed) |
| **ORM** | Drizzle ORM + drizzle-zod |
| **Auth** | JWT (jsonwebtoken) via httpOnly cookie + CSRF double-submit + role-based middleware |
| **Session store** | connect-pg-simple (Postgres-backed express-session for legacy paths) |
| **Cache / Queue** | Upstash Redis (REST) + ioredis + BullMQ (graceful degradation if Redis is unavailable) |
| **WebSockets** | ws library — multiple namespaced endpoints (`/ws/control-tower`, `/ws/monitor`, `/ws/patient-stream`, `/ws/orchestration`, `/ws/live-simulation`, `/ws/multimodal`, `/ws/webrtc`) |
| **File Storage** | AWS S3 (via @aws-sdk/client-s3) |
| **Secrets Management** | AWS Secrets Manager (@aws-sdk/client-secrets-manager) |
| **AI / LLM** | OpenAI (gpt-4o, gpt-4o-mini), Anthropic Claude (claude-opus-4-5), LangChain + LangGraph |
| **SMS / Messaging** | Twilio (WhatsApp inbound/outbound) |
| **Email** | (Configured via env — SendGrid pattern) |
| **Observability** | OpenTelemetry (OTLP HTTP exporter), custom metric counters |
| **Google integrations** | googleapis (Sheets — KB sync; Drive) |
| **Firebase** | firebase-admin (Firestore for intake storage, Storage bucket) |
| **Healthcare integrations** | FHIR (internal routes), SMART on FHIR (Epic EHR), HL7-style HL7v2/EDI transforms |
| **Hosting / Deployment** | Replit Autoscale (target), `npm run build` → `node dist/index.cjs` |
| **Payments** | None in current codebase (billing intelligence dashboard exists but is reporting-only) |
| **Robotics** | Custom robot control WebSocket API (non-clinical) |

---

## 3. REPO STRUCTURE

```
/ (project root)
├── client/                          # React frontend (Vite root)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── App.tsx                  # Root router (142 routes)
│       ├── routes/
│       │   └── routeRegistry.ts     # ROUTES constant — all path strings
│       ├── layouts/
│       │   └── AppLayout.tsx        # Sidebar + shell wrapper
│       ├── context/
│       │   └── AuthContext.tsx      # JWT auth context, login/logout
│       ├── lib/
│       │   ├── queryClient.ts       # TanStack Query + CSRF header injection
│       │   └── correlation.ts       # Correlation ID generation
│       ├── hooks/                   # Custom React hooks
│       ├── components/              # Shared UI components (200+)
│       │   ├── ui/                  # shadcn primitives
│       │   └── physician/           # Physician-specific widgets
│       └── pages/                   # Page components (one per route, 150+)
│           ├── Login.tsx
│           ├── ClinicalWorkbench.tsx
│           ├── OperationsCockpit.tsx
│           ├── AgentBrainPage.tsx   # Agentic Brain dashboard
│           ├── PhysicianDashboard.tsx
│           ├── ReviewQueueV2.tsx    # /review — case review queue
│           └── ... (150+ more pages)
│
├── server/                          # Express backend
│   ├── index.ts                     # App entry — registers all routes, starts WS servers
│   ├── routes.ts                    # Core API routes (primary route file)
│   ├── routes.auth.ts               # Legacy auth routes (deprecated, shimmed)
│   ├── db.ts                        # Drizzle DB connection
│   ├── storage.ts                   # IStorage interface + Postgres implementation
│   ├── vite.ts                      # Vite dev server integration
│   ├── static.ts                    # Static file serving for production
│   │
│   ├── agents/                      # Multi-agent orchestration
│   │   ├── brainOrchestrator.ts     # Main agent cycle: risk → ICU → safety → routing
│   │   ├── clinicalDecisionBridge.ts # LLM ↔ rule-based risk bridge
│   │   ├── persistentLoopState.ts   # Agent loop state → Postgres
│   │   └── ... (50+ agent files)
│   │
│   ├── audit/                       # HIPAA audit chain
│   │   ├── hashChain.ts             # Persistent tamper-evident SHA-256 chain (Postgres)
│   │   ├── auditLogger.ts           # Structured audit logger
│   │   └── externalAuditStore.ts    # HMAC-signed external audit records
│   │
│   ├── security/                    # Auth + security primitives
│   │   ├── session.ts               # requireAuth, requireCsrf, requireAnyRole, JWT verify
│   │   ├── rateLimit.ts             # Per-route rate limiters
│   │   ├── phi.ts                   # PHI scrubber, publicPatientRef()
│   │   └── authCookies.ts           # setAuthCookies(), clearAuthCookies()
│   │
│   ├── routes/                      # Route modules (100+ files)
│   │   ├── roleAuth.ts              # POST /api/roleAuth/login|refresh, GET /me
│   │   ├── agentBrainRoutes.ts      # /api/agent-brain/* (auth + CSRF + rate-limit)
│   │   └── ... (100+ route files)
│   │
│   ├── services/                    # Business logic services
│   │   ├── authService.ts           # JWT sign/verify, demo user store, bcrypt
│   │   └── ... (many services)
│   │
│   ├── simulation/                  # Digital twin + trajectory simulation
│   │   ├── digitalTwinEngine.ts
│   │   └── trajectoryDigitalTwin.ts
│   │
│   ├── ws/                          # WebSocket servers
│   │   └── patientStream.ts         # PHI-scrubbed patient event broadcast
│   │
│   ├── middleware/                  # Express middleware
│   │   ├── requireRole.ts
│   │   └── rateLimiter.ts
│   │
│   ├── kb/                          # Clinical knowledge base runtime
│   ├── clinical/                    # Clinical reasoning engine
│   ├── ehr/                         # EHR integration (Epic SMART, FHIR)
│   └── ... (100+ more subdirectories)
│
├── shared/                          # Shared types and schema
│   ├── schema.ts                    # ALL Drizzle table definitions + Zod schemas (1800+ lines)
│   ├── types.ts                     # Shared TypeScript types
│   ├── complaints.ts                # Complaint pack definitions
│   └── ...
│
├── migrations/                      # SQL migration files (run via psql directly)
│   └── 20260424_agent_brain_hardening.sql
│
├── CLAUDE.md                        # This file
├── AURALYN_CODE_REVIEW_SLICES.md    # Claude architecture review slices
├── CLAUDE_ARCHITECTURE_REVIEW_V2.md # Full 10-phase hardening plan
├── brain_memory.ndjson              # Agent brain persistent memory log
├── artifacts/                       # Calibration, drift, gate reports
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
└── .replit                          # Replit workflow config
```

---

## 4. EXISTING CLAUDE.md

This IS the first CLAUDE.md for this project. Previously there was none.

---

## 5. PACKAGE AND CONFIG FILES

### package.json (sanitized)
```json
{
  "name": "rest-express",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "tsx script/build.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  }
}
```
Key dependencies: `express`, `drizzle-orm`, `drizzle-zod`, `zod`, `jsonwebtoken`, `bcrypt`, `react`, `@tanstack/react-query`, `wouter`, `ws`, `bullmq`, `ioredis`, `@upstash/redis`, `openai`, `@anthropic-ai/sdk`, `twilio`, `firebase-admin`, `googleapis`, `passport`, `express-session`, `multer`, `vitest`, `playwright`

### tsconfig.json
- Target: ES2020, strict mode ON, `moduleResolution: bundler`
- Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

### vite.config.ts
- Plugins: `@vitejs/plugin-react`, Replit dev banner + cartographer (dev only)
- Aliases: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`
- Root: `client/`, builds to `dist/public/`
- `fs.strict: true` — no dotfile access

### drizzle.config.ts
- Schema: `./shared/schema.ts`
- Dialect: PostgreSQL
- Output: `./migrations/`
- Credentials: `DATABASE_URL=[REDACTED]`

### .replit
```
modules = ["nodejs-20", "web", "postgresql-16"]
run = "npm run dev"
[[ports]]
localPort = 5000   # Express (serves both API + Vite)
externalPort = 80
[[ports]]
localPort = 24678  # Vite HMR
externalPort = 3000
[deployment]
deploymentTarget = "autoscale"
run = ["node", "./dist/index.cjs"]
build = ["npm", "run", "build"]
```

---

## 6. BUILD, RUN, TEST, AND DEPLOY COMMANDS

```bash
# Install dependencies
npm install

# Run locally (dev) — starts Express + Vite on port 5000
npm run dev

# TypeScript type-check
npm run check

# Build for production
npm run build

# Run production build
npm run start

# Database schema push (NEW tables only — safe for additive changes)
npm run db:push

# Database schema push with overrides (use with caution)
npm run db:push --force

# Run SQL migrations directly (preferred for schema changes per project policy)
psql "$DATABASE_URL" -f migrations/<migration_file>.sql

# Run tests (vitest)
npx vitest

# Run Playwright e2e tests
npx playwright test

# Lint / format — no dedicated script; use tsc for type checking
npm run check
```

**IMPORTANT — Database migrations policy:**
> **NEVER use `npm run db:push`** on tables with existing data unless the change is purely additive.
> For schema changes to existing tables: write a `migrations/YYYYMMDD_description.sql` file and run via `psql "$DATABASE_URL"`.
> For brand-new tables: `npm run db:push --force` is safe.

---

## 7. DATABASE AND DATA MODEL

### Database
PostgreSQL 16 (Replit-managed). Connection via `DATABASE_URL=[REDACTED]`.

### Core tables (from `shared/schema.ts`)

| Table | Purpose | PHI? |
|-------|---------|------|
| `physicians` | Provider accounts (username, hashed password, specialty) | No |
| `patients` | Patient records (phone number, name) | **Yes** |
| `encounters` | Medical cases — chief complaint, AI diagnosis, physician approval | **Yes** |
| `orders` | Prescriptions, labs, referrals tied to encounters | **Yes** |
| `whatsapp_messages` | WhatsApp message log per patient/encounter | **Yes** |
| `users` | Admin/staff user accounts | No |
| `audit_logs` | Tamper-evident hash chain of all clinical events | Semi (anonymized) |
| `outcomes` | Patient outcome tracking | **Yes** |
| `weights` | ML model weight snapshots | No |
| `engine_logs` | AI engine decision logs | Semi |
| `simulations` | Simulation run results | No |
| `model_versions` | Model versioning metadata | No |
| `patient_sessions` | Active patient portal sessions | **Yes** |
| `alert_logs` | Clinical alert events | Semi |
| `system_snapshots` | System state snapshots for replay | No |
| `autonomy_metrics` | Autonomous agent performance metrics | No |
| `clinic_sites` | Multi-tenant clinic registry | No |
| `clinic_patients` | Per-clinic patient roster | **Yes** |
| `clinic_encounters` | Per-clinic encounter records | **Yes** |
| `clinic_intake_sessions` | Portal intake sessions | **Yes** |
| `kb_complaints` | Knowledge base complaint packs | No |
| `kb_questions` | Adaptive questionnaire questions | No |
| `kb_red_flag_rules` | Red flag clinical rules (272 rules) | No |
| `kb_diagnosis_rules` | Diagnosis rules (500 diagnoses) | No |
| `kb_treatment_rules` | Treatment templates | No |
| `kb_disposition_rules` | Discharge/referral rules | No |
| `agent_loop_state` | Persistent autonomous loop state | No |
| `agent_cycle_results` | Per-cycle agent decision records | Semi |
| `idempotency_keys` | Prevents duplicate API submissions | No |
| `fda_experiments` | FDA-mode experiment tracking | No |

### Key schema patterns
```typescript
// All Drizzle tables use createInsertSchema from drizzle-zod
// Insert types omit auto-generated fields (id, createdAt, updatedAt, approvedAt)
// Select types use typeof table.$inferSelect
```

### Audit log schema
```typescript
auditLogs = pgTable("audit_logs", {
  id:        serial("id").primaryKey(),
  hash:      text("hash").notNull(),        // SHA-256 of (prevHash + entry)
  prevHash:  text("prev_hash").notNull(),   // chain link
  traceId:   text("trace_id").notNull(),
  step:      text("step").notNull(),
  input:     jsonb("input"),
  output:    jsonb("output"),
  metadata:  jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`)
})
```

---

## 8. AUTHORIZATION AND ROLES

### Roles
```
admin      — full system access, KB management, model governance, audit
physician  — case review + approval, ICU co-signature, clinical brain
staff      — intake support, case monitoring (no approval authority)
patient    — portal intake only
nurse      — subset of staff (legacy)
viewer     — read-only observability
```

### Authentication flow
1. Client POSTs `{ email, password }` to `POST /api/roleAuth/login`
2. `authService` validates credentials via bcrypt against demo users (dev) or DB (prod)
3. Server signs JWT (HS256, 12h expiry) and sets `httpOnly; Secure; SameSite=Strict` cookie
4. Refresh token (7d) issued separately
5. Every protected API call reads JWT from cookie (primary) or `Authorization: Bearer` header (transition fallback while localStorage removal is in progress)
6. CSRF double-submit: POST/PUT/PATCH/DELETE routes require `x-csrf-token` header matching `csrf_token` cookie

### Route protection middleware
```typescript
requireAuth          // Validates JWT — 401 if missing/invalid
requireAnyRole([...]) // Checks role — 403 if insufficient
requireCsrf          // CSRF double-submit check — 403 if mismatch
```

### Bearer fallback
- `ALLOW_BEARER_AUTH_FALLBACK` env var — defaults to `true` during localStorage migration
- Set to `"false"` to enforce cookie-only auth in production

### Demo accounts (dev only — overridable via env)
```
admin@example.com     / admin123    (role: admin)
physician@example.com / physician123 (role: physician)
staff@example.com     / staff123    (role: staff)
patient@example.com   / patient123  (role: patient)
```
Override passwords via: `DEMO_PASSWORD_ADMIN`, `DEMO_PASSWORD_PHYSICIAN`, etc.

### Clinic login (separate)
- Single shared clinic password (`CLINIC_PASSWORD` env var)
- Used for kiosk/reception desk flows — grants `staff` role scoped to a single clinic site

### Multi-tenancy
- `clinic_sites` table — each clinic has a `clinicSiteId`
- JWT payload includes `organizationId` and `clinicSiteId`
- Most clinical data queries filter by `clinicSiteId` to isolate tenants

### No MFA currently implemented
- MFA is a known roadmap item before production go-live

---

## 9. PHI / HIPAA / MEDICAL SAFETY AREAS

### PHI storage
- **Postgres tables:** `patients.name`, `patients.phone_number`, `encounters.*` (all clinical fields), `orders.*`, `whatsapp_messages.message_body`, `clinic_patients.*`, `clinic_encounters.*`, `clinic_intake_sessions.*`
- **Firebase Firestore:** Intake session data (via `IntakeStorage` driver)
- **Firebase Storage:** Patient-uploaded documents

### PHI display
- Physician Dashboard — patient name, chief complaint, AI diagnosis, vitals
- Review Queue — patient reference + encounter summary
- WebSocket patient stream — scrubbed before broadcast; real PHI never sent over WS unless `AURALYN_WS_ALLOW_VITALS=true` is set

### PHI sent externally
- **Twilio:** WhatsApp messages (patient symptoms, names) — BAA required
- **OpenAI / Anthropic:** Chief complaint + conversation history for AI triage — BAA required
- **Firebase:** Intake session data — BAA required
- **Epic/FHIR:** Clinical summaries via EHR integration — BAA required

### Audit logging
- Every clinical event appended to `audit_logs` via `appendAuditEvent()`
- SHA-256 hash chain — each entry hashes (prevHash + entry content)
- Persisted to Postgres with Postgres advisory lock (prevents chain forks on concurrent writes)
- In-memory cache of last 500 entries for fast reads
- Legacy `logEvent()` shim preserved for backward compatibility — new code must use `appendAuditEvent()`

### PHI scrubbing
- `server/security/phi.ts` — `scrubPhi(text)` replaces known PHI patterns
- `publicPatientRef(id)` — generates non-reversible patient reference for logs/WS
- `scrubCycleForApi(cycle)` — strips vitals from agent cycle results before API response

### Encryption
- JWT: HS256 signed (32+ char secret required)
- Passwords: bcrypt (SALT_ROUNDS=12)
- Database: at-rest encryption via Replit/cloud provider
- Transport: HTTPS enforced in production (Replit Autoscale)
- Audit HMAC: `AUDIT_HMAC_SECRET` for external audit store signatures

### File upload safeguards
- `multer` with file type + size validation
- Files stored to Firebase Storage (not local filesystem in production)
- Download requires authenticated session + ownership check

### Data retention
- No automated deletion policy currently implemented (roadmap item)
- Audit logs: permanent (never deleted — HIPAA requirement)

### Consent
- Patient consent captured in `clinic_intake_sessions` (`consentGiven: boolean`)
- Consent timestamp recorded

### Emergency access
- Not yet implemented — roadmap item
- Physician can override AI risk score to CRITICAL manually

### HIPAA status
- **Target:** HIPAA-ready (BAAs with Twilio, OpenAI, Anthropic, Firebase required before production)
- **Current state:** Development — audit chain and PHI controls implemented; BAA contracts pending

---

## 10. API ROUTES

### Auth
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| POST | `/api/roleAuth/login` | None | No | Email+password login → JWT cookie |
| POST | `/api/roleAuth/refresh` | None | No | Refresh JWT |
| GET | `/api/roleAuth/me` | Any role | No | Current user info |
| POST | `/api/auth/login` | None | No | Legacy physician login (deprecated) |

### Agent Brain
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| GET | `/api/agent-brain/status` | admin/physician | No | Loop state, cycle count |
| GET | `/api/agent-brain/insights` | admin/physician | Scrubbed | Recent clinical insights |
| GET | `/api/agent-brain/cycle-results` | admin/physician | Scrubbed | Recent cycle results |
| GET | `/api/agent-brain/audit` | admin/physician | No | Audit chain (last N entries) |
| GET | `/api/agent-brain/audit/verify` | admin/physician | No | Chain integrity verification |
| GET | `/api/agent-brain/heatmap` | admin/physician | No | Risk heatmap data |
| POST | `/api/agent-brain/loop/start` | admin/physician + CSRF | No | Start autonomous loop |
| POST | `/api/agent-brain/loop/stop` | admin/physician + CSRF | No | Stop autonomous loop |
| POST | `/api/agent-brain/cycle` | admin/physician + CSRF | No | Run single manual cycle |
| POST | `/api/agent-brain/simulate` | admin/physician + CSRF | No | Simulate with custom vitals |

### Clinical / Encounters
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| GET | `/api/encounters` | physician/admin | **Yes** | List encounters |
| GET | `/api/encounters/:id` | physician/admin | **Yes** | Single encounter |
| POST | `/api/encounters` | physician/admin | **Yes** | Create encounter |
| PATCH | `/api/encounters/:id` | physician/admin | **Yes** | Update encounter |
| POST | `/api/encounters/:id/approve` | physician/admin | **Yes** | Physician approval |
| GET | `/api/review/queue` | physician/admin | Semi | Review queue |
| POST | `/api/review/case/:id` | physician/admin + CSRF | **Yes** | Submit review decision |

### Intake / Portal
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| POST | `/api/intake/sessions` | None (patient flow) | **Yes** | Create intake session |
| GET | `/api/intake/sessions/:id` | Session token | **Yes** | Get intake session |
| PATCH | `/api/intake/sessions/:id` | Session token | **Yes** | Update intake session |
| POST | `/api/intake/sessions/:id/submit` | Session token | **Yes** | Submit completed intake |

### WhatsApp / Twilio
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| POST | `/api/whatsapp/webhook` | Twilio signature | **Yes** | Inbound WhatsApp message |

Webhook secret: `HARDENING_WEBHOOK_SECRET=[REDACTED]` (validated via Twilio signature header)

### Knowledge Base
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| GET | `/api/kb/*` | admin/physician | No | KB reads (complaints, questions, rules) |
| POST | `/api/kb/*` | admin + CSRF | No | KB writes |
| POST | `/api/admin/sheets/sync` | admin + CSRF | No | Sync KB from Google Sheets |

### Hardening Review (internal)
| Method | Path | Auth | PHI | Description |
|--------|------|------|-----|-------------|
| GET | `/api/hardening-review/webhook/status` | None | No | Review bundle status |
| POST | `/api/hardening-review/webhook` | Webhook secret | No | Trigger Claude review |

*(100+ additional route groups for: federated learning, digital twin, simulation, robotics, EHR, FHIR, billing intelligence, automation, governance, etc.)*

---

## 11. FRONTEND ROUTES AND SCREENS

### Login
| Path | Role | Purpose | PHI |
|------|------|---------|-----|
| `/` | Public | Login — two tabs: "Clinic Login" (shared password) + "Admin/Physician" (email+password) | No |

### Core Workbenches
| Path | Role | Purpose | PHI |
|------|------|---------|-----|
| `/ops` | All | Operations Cockpit — KPIs, metrics, system health panels | No |
| `/clinical` | All | Clinical Workbench hub — 6 navigation tiles to sub-pages | No |
| `/review` | physician/admin | Case review queue (ReviewQueueV2) | **Yes** |
| `/review/:caseId` | physician/admin | Individual case review + approval (CaseReview) | **Yes** |
| `/cases` | staff/admin | Provider case view (ProviderCaseView) | **Yes** |
| `/physician-dashboard` | physician/admin | Physician analytics + patient queue | **Yes** |
| `/clinical-validation` | physician/admin | Clinical AI validation results | No |
| `/outcome-monitoring` | physician/admin | Outcome tracking | Semi |
| `/operations-cockpit` | All | Legacy operations cockpit alias | No |
| `/intake` | All | Intake Workbench — intake queue + new intake wizard | Semi |
| `/safety` | All | Safety Workbench — alert monitoring | No |
| `/settings` | admin | Settings Workbench — system configuration | No |
| `/learning` | admin | Engine Metrics Dashboard — model performance | No |
| `/system` | admin | Dependency Health Map — service graph | No |
| `/workers` | admin | Worker Monitor — BullMQ job queue | No |
| `/clinic-health` | admin | Clinic Health Dashboard | No |

### Agentic Brain
| Path | Role | Purpose | PHI |
|------|------|---------|-----|
| `/agent-brain` | physician/admin | Agentic Brain dashboard — loop controls, results, audit chain | Scrubbed |
| `/autonomous-brain` | All | Autonomous Brain overview | No |
| `/clinical-brain-dashboard` | physician/admin | Clinical brain monitoring | Semi |
| `/brain-command-center` | admin | Multi-agent brain command center | No |
| `/hierarchical-council` | admin | Hierarchical agent council | No |

### Automation / Simulation
| Path | Role | Purpose | PHI |
|------|------|---------|-----|
| `/automation` | admin | Automation Dashboard | No |
| `/automation/studio` | admin | Automation Studio — workflow builder | No |
| `/automation/runs/:runId` | admin | Automation run detail | No |
| `/live-simulation` | admin | Live patient simulation | No |
| `/simulation-lab` | physician/admin | Clinical Simulation Lab (role-guarded) | No |

### Knowledge / Learning
| Path | Role | Purpose | PHI |
|------|------|---------|-----|
| `/knowledge-base` | admin | KB management | No |
| `/knowledge-hub` | admin | KB hub | No |
| `/knowledge-ops` | admin | KB ops dashboard | No |
| `/golden-cases` | physician/admin | Golden case library | Semi |
| `/skill-layer-admin` | admin only | Skill layer admin (RoleGuard) | No |
| `/autonomous-learning` | admin | Autonomous learning console | No |

*(60+ additional routes for: robotics, control tower, multi-patient command, audit replay, clinical trials, EHR, FHIR, pilot dashboard, regional/global command, etc.)*

---

## 12. AI / CLINICAL DECISION SUPPORT

### What the AI does
1. **Adaptive questionnaire** — AI selects next question based on patient answers (LangGraph agent)
2. **Triage scoring** — Rule-based risk scorer + AI bridge: scores vitals as LOW/MODERATE/HIGH/CRITICAL
3. **Differential diagnosis** — AI generates ranked differentials with confidence scores
4. **Clinical proposal** — Structured disposition (treat/refer/ER/ICU) + order suggestions
5. **Safety gate** — Deterministic rules block ICU transfer without physician co-signature; LLM cannot downgrade a deterministic HIGH/CRITICAL score
6. **Trajectory twin** — Projects patient risk trajectory over next 6 intervals
7. **Physician co-pilot** — Suggests phrasing, flags inconsistencies in physician notes

### Models used
- `claude-opus-4-5` (Anthropic) — hardening reviews, complex clinical reasoning
- `gpt-4o` (OpenAI) — primary triage, differential generation
- `gpt-4o-mini` (OpenAI) — fast classification, question selection

### Patient data in AI calls
- Chief complaint + curated symptom answers are sent to LLM
- Names/phone numbers are NOT included in LLM prompts (PHI-scrubbed before dispatch)
- Prompt includes: complaint, answers, age range, relevant red flags — no identifiers

### Output handling
- ALL AI outputs require physician review before acting (no auto-approve)
- AI confidence score displayed alongside disposition
- `aiConfidence: 0–100` stored in `encounters.ai_confidence`
- Orders have `aiGenerated: true` and `physicianApproved: false` until reviewed

### Safety constraints
- `safetyGate()` in `brainOrchestrator.ts` — blocks ICU without co-signature
- `clinicalDecisionBridge.ts` — LLM score cannot downgrade deterministic CRITICAL/HIGH
- Red flag rules (272 rules) evaluated before any AI disposition
- AI output labeled with `intendedUse: "clinical_decision_support_only — not autonomous"` in audit metadata
- System prompt includes FDA disclaimer: "This output is clinical decision support, not a diagnosis."

---

## 13. THIRD-PARTY INTEGRATIONS

| Provider | Purpose | PHI Sent | Webhook Route | BAA Required |
|----------|---------|----------|---------------|--------------|
| **Twilio** | WhatsApp inbound/outbound | **Yes** (message body) | `POST /api/whatsapp/webhook` | Yes |
| **OpenAI** | GPT-4o triage + reasoning | Symptoms (scrubbed name) | None | Yes |
| **Anthropic** | Claude claude-opus-4-5 reviews | Same as OpenAI | None | Yes |
| **Firebase Admin** | Firestore intake storage + file Storage | **Yes** | None | Yes |
| **Google APIs** | Sheets (KB sync), Drive | No | None | No |
| **AWS S3** | File storage for uploaded docs | **Yes** | None | Yes |
| **AWS Secrets Manager** | Secret retrieval | No | None | No |
| **Upstash Redis** | Rate limiting, caching, BullMQ | No | None | No |
| **Epic/SMART on FHIR** | EHR data read/write | **Yes** | `POST /api/smart/callback` | Yes |

### Failure behavior
- Redis ETIMEDOUT: graceful degradation — BullMQ queues disabled, in-memory fallback used
- OpenAI failure: returns cached/deterministic fallback; audit entry records fallback mode
- Twilio failure: message stored, retry via BullMQ job queue

---

## 14. TESTING STATUS

### Framework
- **Unit:** Vitest (`npx vitest`)
- **E2E:** Playwright (`npx playwright test`)
- **API smoke tests:** `supertest` (referenced in deps)

### Current state
- Unit test coverage: **minimal** — most business logic is untested
- E2E tests: **partial** — Playwright can reach all pages but session-quota constraints limit automated runs
- Integration tests: **none** for clinical decision pipeline

### Critical untested areas
- Physician approval gate (must not auto-approve)
- Audit hash chain integrity across restarts
- CSRF protection on all mutation endpoints
- Multi-tenant data isolation
- WhatsApp webhook signature validation
- Clinical AI safety gate (ICU co-signature requirement)
- Concurrent agent loop + audit chain writes

### Known testing limitations
- Playwright test runner has per-session call quota; run one test plan at a time
- Login form has two tabs — testers must click "Admin / Physician" tab before entering email credentials
- CSRF: automated curl tests fail POST routes by design — use browser session for integration tests

### Minimum before production deployment
1. Physician approval gate — cannot approve without `physicianApproved: true`
2. Multi-tenant isolation — patients from clinic A cannot appear in clinic B
3. Audit chain — verify chain survives restart and concurrent writes
4. PHI leak test — confirm no PHI in WebSocket broadcasts (default mode)
5. Rate limiting — verify brute-force protection on `/api/roleAuth/login`
6. File upload validation — verify file type restrictions enforced

---

## 15. SECURITY RULES ALREADY IMPLEMENTED

| Control | Status | Notes |
|---------|--------|-------|
| **Input validation** | ✅ | Zod schemas on all API routes (drizzle-zod + custom extensions) |
| **Output escaping** | ✅ | React handles XSS; API returns JSON not HTML |
| **CSRF** | ✅ | Double-submit cookie pattern on all POST/PUT/PATCH/DELETE |
| **CORS** | Partial | Express default — needs explicit CORS config for production |
| **Rate limiting** | ✅ | `express-rate-limit` + custom per-route limiters (`server/security/rateLimit.ts`) |
| **Audit logs** | ✅ | SHA-256 hash chain in Postgres, advisory-locked appends |
| **Access control** | ✅ | `requireAuth` + `requireAnyRole` on all protected routes |
| **JWT** | ✅ | HS256, 12h expiry, httpOnly cookie, 32+ char secret required |
| **CSRF cookie** | ✅ | `csrf_token` cookie; matched against `x-csrf-token` header |
| **Password hashing** | ✅ | bcrypt SALT_ROUNDS=12 |
| **PHI scrubbing** | ✅ | `scrubPhi()` + `publicPatientRef()` in `server/security/phi.ts` |
| **WS auth** | ✅ | JWT validated on WebSocket upgrade in `patientStream.ts` |
| **File upload** | Partial | multer configured; file type validation needs review |
| **Secrets** | ✅ | All secrets via env vars; no hardcoded values (dev fallbacks warn loudly) |
| **Dependency scanning** | ❌ | Not yet automated |
| **Audit HMAC** | Partial | `AUDIT_HMAC_SECRET` not set in dev — warns at startup |
| **Error handling** | ✅ | `asyncHandler` wrapper; never exposes stack traces in production |
| **Log redaction** | ✅ | Correlation IDs, no PHI in server logs |
| **Encryption at rest** | Cloud | Delegated to Replit/AWS managed DB |
| **Transport encryption** | ✅ | HTTPS in production (Replit Autoscale) |
| **MFA** | ❌ | Not implemented — roadmap |
| **Backup** | Cloud | Replit managed |

---

## 16. CODING CONVENTIONS

### Naming
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components
- DB tables: `snake_case`
- Drizzle columns: `camelCase` mapped to `"snake_case"` strings
- API routes: `kebab-case` paths, camelCase JS identifiers

### Component patterns
- One page per route in `client/src/pages/`
- Shared UI in `client/src/components/`
- All interactive elements have `data-testid` attributes (pattern: `{action}-{target}` or `{type}-{content}-{id}`)
- shadcn/ui components used throughout — import from `@/components/ui/*`

### API handler pattern
```typescript
router.get("/endpoint", requireAuth, requireAnyRole(["admin"]), asyncHandler(async (req, res) => {
  const data = await storage.getData();
  res.json({ ok: true, data });
}));
```

### Storage pattern
- All DB access goes through `IStorage` interface in `server/storage.ts`
- Routes call `storage.*()` — never raw Drizzle in route handlers

### Validation
- All request bodies validated with Zod via `drizzle-zod` insert schemas
- `.extend()` to add custom validation rules
- `zodResolver` used in all frontend forms

### State management
- Server state: TanStack Query v5 (object API only — `useQuery({ queryKey, queryFn })`)
- Local state: React `useState`/`useReducer`
- No global client state store (no Redux/Zustand)

### Form handling
- `useForm` + `zodResolver` from react-hook-form
- Always provide `defaultValues` to `useForm`
- Mutations via `apiRequest(method, url, data)` from `@/lib/queryClient`

### Error style
- Backend: `asyncHandler` wraps async routes; errors caught and returned as `{ ok: false, error: string }`
- Frontend: `useToast` from `@/hooks/use-toast` for user-visible errors
- Never `console.error` PHI

### Environment variables (required — values redacted)
```
DATABASE_URL=[REDACTED]
APP_JWT_SECRET=[REDACTED]               # Primary JWT secret (64 chars recommended)
JWT_SECRET=[REDACTED]                   # Alternative name (session.ts reads either)
AUTH_JWT_SECRET=[REDACTED]             # Alternative name
SESSION_SECRET=[REDACTED]              # Express session secret
CSRF_COOKIE_NAME=[REDACTED]            # Defaults to "csrf_token"
AUTH_COOKIE_NAME=[REDACTED]            # Defaults to "app_session"
ALLOW_BEARER_AUTH_FALLBACK=[REDACTED]  # "false" to enforce cookie-only
OPENAI_API_KEY=[REDACTED]
ANTHROPIC_API_KEY=[REDACTED]
TWILIO_ACCOUNT_SID=[REDACTED]
TWILIO_AUTH_TOKEN=[REDACTED]
TWILIO_FROM_NUMBER=[REDACTED]
HARDENING_WEBHOOK_SECRET=[REDACTED]
REDIS_URL=[REDACTED]
UPSTASH_REDIS_REST_URL=[REDACTED]
UPSTASH_REDIS_REST_TOKEN=[REDACTED]
FIREBASE_PROJECT_ID=[REDACTED]
FIREBASE_CLIENT_EMAIL=[REDACTED]
FIREBASE_PRIVATE_KEY=[REDACTED]
FIREBASE_STORAGE_BUCKET=[REDACTED]
GOOGLE_SHEETS_CREDENTIALS=[REDACTED]
GOOGLE_SHEETS_ID=[REDACTED]
AWS_ACCESS_KEY_ID=[REDACTED]
AWS_SECRET_ACCESS_KEY=[REDACTED]
AWS_REGION=[REDACTED]
AWS_S3_BUCKET=[REDACTED]
AUDIT_HMAC_SECRET=[REDACTED]
CLINIC_PASSWORD=[REDACTED]
DEMO_PASSWORD_ADMIN=[REDACTED]
DEMO_PASSWORD_PHYSICIAN=[REDACTED]
AURALYN_WS_ALLOW_VITALS=[REDACTED]    # "true" enables real vitals over WS
AUDIT_MEMORY_CACHE_SIZE=[REDACTED]    # Defaults to 500
AUDIT_ADVISORY_LOCK_ID=[REDACTED]     # Defaults to 918273645
```

---

## 17. KNOWN ISSUES AND ROADMAP

### Current bugs (as of 2026-04-26)
- `ALLOW_BEARER_AUTH_FALLBACK` — still `true`; localStorage token removal in `AuthContext.tsx` not yet complete
- `AUDIT_HMAC_SECRET` not set in dev — external audit store uses placeholder (warns at startup)
- `audit/verify` returns `verified: undefined` — verify chain endpoint needs response shape fix
- Redis ETIMEDOUT at startup — pre-existing; BullMQ gracefully disabled; non-blocking
- KB consistency audit flags 272 missing red_flag entities, 500 missing diagnoses — KB sync from Sheets needed
- No MFA implementation

### Incomplete features
- `AuthContext.tsx` — not yet migrated to cookie-only auth (still reads `localStorage.getItem("app_auth_token")`)
- CORS policy — not explicitly configured for production origins
- Automated data retention / deletion
- Emergency access override flow
- MFA for physician and admin accounts
- BAA execution with all third parties

### Areas to NOT touch casually
- `server/audit/hashChain.ts` — any change to hash computation breaks the entire chain
- `server/security/session.ts` — JWT verification logic; regression = auth bypass
- `shared/schema.ts` — changing existing column types breaks migrations
- `server/agents/clinicalDecisionBridge.ts` — LLM cannot downgrade deterministic risk; never relax this constraint
- `server/agents/brainOrchestrator.ts` — `safetyGate()` must always run before routing
- Physician approval gate (`physicianApproved` field) — must never be set to `true` by AI alone

### Areas needing refactoring
- `server/routes.ts` — monolithic file (2000+ lines); needs splitting into domain route modules
- `server/index.ts` — startup wiring is complex; refactor into a clean bootstrap module
- `AuthContext.tsx` — needs localStorage removal and cookie-only migration (Phase 8 of hardening plan)
- Test coverage — all critical paths need tests before production

---

## 18. TOP IMPORTANT FILES (sanitized excerpts)

### `server/index.ts` — Entry point
```typescript
// Registers all 100+ route modules
// Starts all WebSocket servers
// Bootstraps: AutonomousLoop, GoldenMonitor, AlertEngine, GovernanceLoop, etc.
// Warms KB cache from Google Sheets at startup
app.use("/api/agent-brain", agentBrainRoutes);
app.use("/api/roleAuth", roleAuthRouter);
// ... 100+ more route registrations
```

### `server/security/session.ts` — Auth middleware
```typescript
export function requireAuth(req, res, next)     // JWT → req.user
export function requireAnyRole(roles)           // role check
export function requireCsrf(req, res, next)     // CSRF double-submit
export function authenticateWsRequest(req)      // WS auth
```

### `server/audit/hashChain.ts` — Audit chain (critical)
```typescript
export async function appendAuditEvent(data)    // PRODUCTION PATH — persists to DB
export async function getAuditChainAsync()      // Reads from Postgres
export async function verifyPersistedChain()    // Checks full chain integrity
export function logEvent(data)                  // LEGACY SHIM — memory only
```

### `server/agents/brainOrchestrator.ts` — Clinical agent loop
```typescript
export function scoreRisk(vitals): RiskResult   // Deterministic vitals scorer
export function icuDecision(risk): ICUDecision  // ICU routing logic
export function safetyGate(icu, risk)           // BLOCKS unsafe actions
export async function runAgentCycle(vitals)     // Full cycle: risk→ICU→safety→route→audit
export function startLoop() / stopLoop()        // Loop lifecycle
```

### `server/agents/clinicalDecisionBridge.ts` — AI bridge
```typescript
// LLM cannot downgrade a deterministic CRITICAL or HIGH score
export async function runClinicalDecisionBridge(vitals, risk)
// Returns: { mode, finalRisk, requiresPhysicianReview, basis }
```

### `shared/schema.ts` — Database schema
```typescript
// 50+ Drizzle table definitions
// All with createInsertSchema + TypeScript inferred types
// Key tables: physicians, patients, encounters, orders,
//             audit_logs, clinic_sites, clinic_patients,
//             agent_loop_state, agent_cycle_results
```

### `client/src/lib/queryClient.ts` — Frontend HTTP client
```typescript
export function getCsrfToken()          // Reads csrf_token cookie
export async function apiRequest(method, url, data)  // Adds CSRF header
export const queryClient               // TanStack Query instance
// NOTE: No localStorage token access — cookie-based auth only
```

---

## 19. WHAT CLAUDE SHOULD NEVER DO

### PHI / Safety
- **NEVER** include PHI (patient names, phone numbers, diagnoses) in server logs, console output, or error messages
- **NEVER** send PHI to external APIs without explicit confirmation it's on the approved BAA list
- **NEVER** bypass `requireAuth` or `requireAnyRole` middleware on any route that touches patient data
- **NEVER** set `physicianApproved: true` programmatically without a real physician action
- **NEVER** allow the LLM to override a deterministic CRITICAL or HIGH risk score downward
- **NEVER** disable or weaken `safetyGate()` in `brainOrchestrator.ts`
- **NEVER** let audit events be skipped, deleted, or modified after being appended to the chain
- **NEVER** expose real patient data in simulation or test mode — always use synthetic data

### Database / Schema
- **NEVER** change the type of an existing primary key column (serial ↔ varchar breaks data)
- **NEVER** run `DROP TABLE` or `TRUNCATE` on clinical tables without explicit user approval
- **NEVER** write raw SQL mutations without first checking `IStorage` interface exists
- **NEVER** bypass the `idempotency_keys` table for duplicate-sensitive clinical operations

### Auth / Security
- **NEVER** hardcode JWT secrets, API keys, or passwords in source files
- **NEVER** weaken CSRF protection — all POST/PUT/PATCH/DELETE routes on clinical data require CSRF
- **NEVER** remove rate limiting from `/api/roleAuth/login` or agent-brain mutation endpoints
- **NEVER** set `ALLOW_BEARER_AUTH_FALLBACK=true` in production once localStorage migration is complete
- **NEVER** trust `req.body.role` to determine permissions — always use `req.user.role` from JWT

### Code quality
- **NEVER** invent clinical logic, red flag rules, or treatment protocols — all clinical rules come from the KB (Google Sheets) or physician-authored rules
- **NEVER** change `server/audit/hashChain.ts` hash computation without regenerating the entire chain
- **NEVER** modify migration files after they have been applied to production
- **NEVER** add `console.log(req.body)` anywhere near an intake or encounter route
- **NEVER** delete or silence the `[STARTUP FATAL]` error when `APP_JWT_SECRET` is missing in production

---

## 20. WHAT "DONE" MEANS FOR THIS PROJECT

A coding task is **done** when ALL of the following are true:

### Code quality
- [ ] `npm run check` (TypeScript) passes with zero errors
- [ ] No `any` types introduced without a comment explaining why
- [ ] No unused imports or dead code added

### Security
- [ ] All new API routes have `requireAuth` and appropriate `requireAnyRole` middleware
- [ ] All new POST/PUT/PATCH/DELETE routes on clinical data have `requireCsrf`
- [ ] All new POST/PUT/PATCH routes have rate limiting via `rateLimit.ts`
- [ ] New inputs are validated with Zod schema before use

### PHI
- [ ] No PHI appears in server logs, error messages, or WebSocket broadcasts
- [ ] Any new patient-data field uses `scrubPhi()` before logging
- [ ] New API responses that include patient data are explicitly marked in this file

### Audit
- [ ] Any new clinical event calls `appendAuditEvent()` with `traceId`, `step`, `input`, `output`
- [ ] Audit chain integrity is not broken (verify with `GET /api/agent-brain/audit/verify`)
- [ ] `logEvent()` (legacy shim) is NOT used in new code — use `appendAuditEvent()`

### Clinical safety
- [ ] `safetyGate()` is still called before any routing decision
- [ ] `clinicalDecisionBridge.ts` still prevents LLM from downgrading deterministic HIGH/CRITICAL
- [ ] No AI output can set `physicianApproved: true`

### Testing
- [ ] New feature has at least a smoke test (Playwright navigates to the page without crash)
- [ ] For clinical logic changes: physician approval gate has been manually verified
- [ ] For auth changes: login and protected route access have been re-verified

### Database
- [ ] New tables defined in `shared/schema.ts` AND migrated via psql (not db:push for existing tables)
- [ ] New columns on existing tables use `ALTER TABLE ADD COLUMN IF NOT EXISTS` in a migration file
- [ ] No primary key type changes

### Frontend
- [ ] New pages are registered in `client/src/App.tsx` AND in `client/src/routes/routeRegistry.ts`
- [ ] All interactive elements have `data-testid` attributes
- [ ] No `localStorage.getItem("app_auth_token")` in new frontend code — use cookie auth
- [ ] `apiRequest` from `@/lib/queryClient` is used for all mutations (injects CSRF header automatically)

### Deployment readiness
- [ ] No new environment variables added without updating this CLAUDE.md section 16
- [ ] No hardcoded secrets in any new file
- [ ] No `console.log` left in production code paths

---

*End of CLAUDE.md — Auralyn Medical Triage SaaS — v2-hardened — 2026-04-26*
