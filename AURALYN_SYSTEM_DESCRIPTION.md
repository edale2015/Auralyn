# Auralyn: System Description for AI Enhancement Review
*Prepared for external Claude/ChatGPT consultation — 2026-04-26*
*No PHI, no credentials, no secret values.*

---

## What Does the System Currently Do?

Auralyn is a production-targeted, multi-tenant medical triage SaaS built for high-volume urgent care clinics in New York City. The initial deployment profile: **one supervising physician covering 500+ patients per day** across ENT and flu-like URI presentations, with a roadmap toward all urgent care complaint categories.

The system's core loop is:

1. **Patient submits symptoms** — via WhatsApp conversation or a web portal intake wizard
2. **AI conducts an adaptive interview** — LangGraph-powered questionnaire that branches based on answers, applying 272 red-flag rules before the LLM is even called
3. **AI generates a structured clinical proposal** — differential diagnoses (ranked by confidence), disposition recommendation (treat/refer/ER/ICU), and draft orders (labs, prescriptions, referrals)
4. **Physician reviews and approves** — nothing is acted on until a real physician takes an explicit review action; AI cannot set approval status
5. **Tamper-evident audit chain** — every event (intake, red-flag trigger, AI output, physician decision) is appended to a SHA-256 hash chain in Postgres with advisory locking

The system is **not** an EHR. It sits upstream of the EHR, generating the structured clinical summary that the physician then uses to complete the chart in Athena/Epic/ECW.

---

## What AI Models Is It Using?

| Model | Purpose |
|-------|---------|
| `gpt-4o` | Primary triage reasoning, differential diagnosis, disposition recommendation |
| `gpt-4o-mini` | Fast symptom classification, question selection in adaptive questionnaire |
| `gpt-4o-mini-transcribe` | Speech-to-text transcription for ambient documentation |
| `claude-opus-4-5` (Anthropic) | Complex clinical reasoning, architecture/governance reviews |
| LangChain + LangGraph | Agent orchestration — multi-step clinical reasoning graph |

All AI outputs are:
- Labeled `intendedUse: "clinical_decision_support_only"`
- Blocked from setting approval status
- Run through deterministic safety gates before reaching the physician

---

## What Does the Patient-Facing Side Look Like?

### Channel 1: WhatsApp (primary, live)
- Patient texts the clinic's WhatsApp number (Twilio sandbox number in dev)
- System responds with a conversational symptom interview
- AI adaptively selects next question based on prior answers
- Red-flag rules run continuously — if any trigger, patient is immediately told to call 911 or go to the ED
- At completion, a structured encounter record is created for physician review
- Physician response is sent back to the patient via WhatsApp

### Channel 2: Web Portal Intake (live)
- Multi-step intake wizard at `/intake`
- Collects: chief complaint, symptom duration, associated symptoms, medications, allergies, photos (via camera upload)
- AI generates the clinical proposal from the structured intake data
- Session linked to the clinic site (multi-tenant) via a short code or intake token
- Patient receives a confirmation and outcome notification when the physician has reviewed

### What the patient does NOT see:
- The AI's confidence score
- The differential diagnosis
- The proposed orders
- The audit trail

---

## What Does the Provider-Facing Side Look Like?

### Clinical Workbench hub (`/clinical`)
The main entry point for clinical staff. Six sub-sections:

**1. Review Queue (`/review`)** — The workhorse view
- List of pending encounters sorted by urgency (emergent/urgent/routine)
- Each card shows: chief complaint, AI triage summary, urgency level, time waiting
- Click into an encounter to see: full symptom history, AI differential with confidence scores, proposed disposition, proposed orders
- Physician actions: Approve as-is / Modify and approve / Reject / Escalate
- Every action is captured in the audit chain

**2. Physician Dashboard (`/physician-dashboard`)**
- Analytics view: cases reviewed today, approval rate, average review time, override patterns
- AI confidence calibration — shows where AI is systematically wrong
- Disposition distribution over time

**3. Case Management (`/cases`)** — Staff view of all encounters across status stages

**4. Clinical Validation (`/clinical-validation`)** — AI output quality review — where physician overrides are analyzed against AI predictions

**5. Outcome Monitoring (`/outcome-monitoring`)** — Post-visit outcome tracking (currently early-stage)

**6. Operations Cockpit (`/ops`)** — Clinic operational metrics, queue depth, wait times

### Agentic Brain (`/agent-brain`)
A continuous autonomous clinical reasoning loop that:
- Runs on real or simulated patient vitals
- Scores risk (LOW/MODERATE/HIGH/CRITICAL) using deterministic rules first, then LLM
- Makes ICU/ER routing decisions, blocked by a safety gate requiring physician co-signature for CRITICAL/ICU
- Emits real-time events via WebSocket to monitoring dashboards
- Persists its state and every cycle result to Postgres

### Telemedicine Assistant (`/api/telemed/*` — backend fully built, frontend in progress)
Active backend services for:
- **Live session management** — session start/track/conversation
- **Safety alerts** — checks in-session patient messages for red flags
- **Real-time differential update** — updates diagnosis list as visit progresses
- **Medication safety** — drug interaction checking and dose suggestions
- **Clinical coding** — ICD-10/CPT code generation from the visit
- **Chart note generation** — full SOAP note drafted from visit data
- **Discharge/return precautions** — personalized discharge instructions with return criteria

### Voice/Ambient Documentation (backend built, frontend in progress)
- `gpt-4o-mini-transcribe` transcribes audio in real-time or batch
- Streaming transcription via WebSocket (`/ws/multimodal`)
- Voice agent can conduct intake interviews over phone (`server/voice/`)
- Transcription → note generation pipeline exists but is not yet in the physician UI

### Knowledge Base Admin (admin only)
- 272 red-flag rules
- 500+ diagnosis rules  
- Complaint packs (structured symptom templates)
- Treatment plan templates
- All sourced from Google Sheets — admin can update rules without code deployment

---

## What's the Database and Backend?

### Backend
- **Runtime:** Node.js 20, Express.js, TypeScript
- **Entry point:** `server/index.ts` — registers 100+ route modules, starts all WebSocket servers, boots background loops
- **API style:** REST, with WebSocket for real-time clinical events

### Database
- **Primary:** PostgreSQL 16 (Replit-managed)
- **ORM:** Drizzle ORM with drizzle-zod for type-safe validation
- **Key clinical tables:** `encounters`, `patients`, `orders`, `clinic_encounters`, `clinic_intake_sessions`, `audit_logs`, `kb_*` (knowledge base tables)
- **Agent tables:** `agent_loop_state`, `agent_cycle_results`
- **No Redis dependency for clinical data** — Redis (Upstash) is used only for rate limiting and caching; BullMQ degrades gracefully if Redis is unavailable

### Auth
- JWT (HS256) via httpOnly cookie
- Roles: admin, physician, staff, patient
- CSRF double-submit on all mutations
- Multi-tenant: every clinical query scoped to `clinicSiteId`

### External services
- **Twilio** — WhatsApp in/out, voice call handling
- **Firebase** — Patient document storage, Firestore for intake sessions
- **Google Sheets** — Knowledge base source (rules, questions, templates)
- **OpenAI / Anthropic** — AI reasoning
- **Epic/SMART on FHIR** — EHR write-back (orchestrator + write guard built, not in production)
- **AWS S3** — Uploaded patient files

### Frontend
- React 18 + TypeScript + Vite
- TanStack Query v5 for server state
- shadcn/ui + Tailwind CSS v4
- Wouter for routing
- ~150 pages, ~200+ components

---

## Gap Map Against the 10 Recommendations

### 1. AI-Powered Triage at the Front Door
**Status: FULLY BUILT ✅**

The WhatsApp intake + adaptive questionnaire + 272 red-flag rules + AI risk scoring + physician review queue is the core product. It is working end-to-end in dev.

**What's missing for production:**
- Twilio WhatsApp number approval (currently using sandbox number)
- Intake-to-EHR write-back (EHR orchestrator built but not wired to the intake completion event)
- Load testing at 500 concurrent patients

---

### 2. Intelligent Telemedicine Visit Pre-Screening
**Status: BACKEND BUILT, FRONTEND MISSING ⚠️**

`server/routes/telemedicineAssistantRoutes.ts` and `server/assistant/telemedicine*Service.ts` files implement: session management, differential update, medication safety, safety alerts, chart note generation, discharge/return precautions.

**What's missing:**
- A physician-facing telemedicine pre-screening page that surfaces the pre-collected intake data at call start
- The patient-facing pre-call questionnaire UI (currently the intake wizard covers this but is not linked to a video call session)
- Actual video/WebRTC call integration (WebRTC WebSocket endpoint exists at `/ws/webrtc` but is not connected to a video UI)

**Effort to complete:** Medium. Backend is solid. Need to build one `TelemedPreScreenPage` and connect it to the existing telemedicine assistant services.

---

### 3. Real-Time Clinical Decision Support at Point of Care
**Status: LARGELY BUILT ✅**

Clinical decision bridge + agent brain + 272 red-flag rules + disposition rules + KB-driven treatment templates all exist. The physician dashboard shows AI confidence and differential.

**What's missing:**
- A **sidebar panel on the case review page** that shows live CDS suggestions as the physician reads the case (currently all CDS is pre-generated before the physician opens the case, not updated in real-time as they type notes)
- Drug interaction and dose calculator surfaced inline in the review UI

**Effort to complete:** Low-Medium. The CDS data is already computed. Need a sidebar component wired to the existing telemed medication safety endpoint.

---

### 4. Asynchronous Telemedicine for Low-Acuity Conditions
**Status: PARTIALLY BUILT ⚠️**

The web portal intake (UTI, pink eye, refill request) is effectively async telemedicine — patient fills out the form, AI reviews for safety, physician reviews asynchronously. Photo upload exists (multimodal/vision engine built).

**What's missing:**
- Explicit case type routing — the system doesn't currently label a case as "safe for async" vs. "requires synchronous care"
- A physician async review UI that makes this feel like a deliberate async workflow (vs. the same review queue used for in-clinic cases)
- Automated completeness check — AI currently doesn't push back on the patient to collect more info before the case goes to the queue

**Effort to complete:** Medium. Mostly configuration of existing components + one new case-type filter in the review queue.

---

### 5. AI-Assisted Documentation and Note Generation
**Status: BACKEND BUILT, NOT IN PHYSICIAN UI ⚠️**

- `server/assistant/telemedicineNoteService.ts` — generates SOAP notes from visit data
- `server/replit_integrations/audio/client.ts` — transcribes audio via `gpt-4o-mini-transcribe`
- `server/voice/` — voice agent that can conduct a phone intake
- `buildDischargeInstructionBlock()` — discharge instruction builder service
- Streaming transcription via WebSocket multimodal gateway

**What's missing:**
- An ambient recording button in the physician case review UI that captures the visit audio and generates the note
- A note editor panel in the review UI that shows the AI-generated draft and lets the physician edit/sign
- Athena/EHR write-back from the signed note (EHR orchestrator exists but isn't triggered from the note editor)

**Effort to complete:** Medium-High. Audio capture UI + note editor component + EHR write-back trigger. All backend services exist; need frontend plumbing.

---

### 6. Remote Chronic Disease Touchpoints via Telemedicine
**Status: MINIMAL — MOSTLY MISSING ❌**

- `server/outcomes/outcomeTracker.ts` — tracks visit outcomes
- No automated follow-up messaging loop
- No chronic disease protocol management
- No escalation rules for worsening trends

**What's needed:**
- A protocol definition layer (admin configures: "for hypertension follow-ups, check in at 3 days, 7 days, 30 days with these specific questions")
- A follow-up messaging engine that sends WhatsApp/SMS at scheduled intervals
- A response monitoring service that alerts the physician if a patient's response suggests deterioration
- A follow-up dashboard showing enrolled patients and their latest responses

**Effort to complete:** High. This is the largest missing piece. Would need: new schema tables (`follow_up_protocols`, `follow_up_enrollments`, `follow_up_responses`), a BullMQ scheduled job worker, a messaging template system, and a monitoring dashboard.

---

### 7. AI-Driven Specialist Routing and eConsult Triage
**Status: PARTIAL ⚠️**

- Disposition routing (ER/ICU/treat-and-release) exists in the agent brain
- Referral orders are part of the `orders` table (type: `referral`)
- No structured eConsult request generation
- No specialist routing recommendation with clinical rationale written out

**What's missing:**
- A specialist routing recommendation panel in the case review UI
- A draft eConsult generator that takes the encounter summary and produces a structured specialist referral message
- Integration with a specialist directory or scheduling system

**Effort to complete:** Medium. The encounter summary and AI differential already provide the inputs. Need: a `generateEConsult()` LLM call in the telemedicine assistant service + a UI panel in case review.

---

### 8. Predictive Staffing and Patient Volume Forecasting
**Status: NOT BUILT ❌**

- `server/prediction/` contains only `realClaimProcessor.ts` (billing, not staffing)
- `server/staffing/` contains only deterioration and time-series engines (clinical, not operational)
- No staffing prediction model exists

**What's needed:**
- Historical visit volume data aggregation by hour/day/week/season
- A forecasting model (could be a simple statistical model or LLM-based trend analysis)
- External data inputs: local event calendar, weather API, CDC flu surveillance feed
- A staffing recommendation dashboard for clinic management (not physician-facing)

**Effort to complete:** High. New domain entirely. Requires: visit history aggregation schema, a forecasting service, external API integrations, and a management dashboard.

---

### 9. Patient Education and Discharge Instruction Personalization
**Status: BACKEND BUILT, NOT IN PHYSICIAN WORKFLOW ⚠️**

- `buildDischargeInstructionBlock()` in `server/services/dischargeInstructionBuilder.ts` — exists
- `server/assistant/telemedicineReturnPrecautionService.ts` — generates return precaution instructions
- `POST /api/telemed/assistant/discharge` — discharge endpoint exists
- Language/reading-level personalization: NOT implemented yet

**What's missing:**
- Discharge instruction preview in the physician sign-off step (physician should see and approve before it's sent)
- Language preference capture in intake (currently not collected)
- Reading-level adaptation (currently instructions are generated at a fixed level)
- Delivery mechanism — instructions currently not sent to the patient automatically on approval

**Effort to complete:** Low-Medium. Most of the generation logic is there. Need: a discharge preview component in the review UI + intake language field + WhatsApp/SMS delivery trigger on physician approval.

---

### 10. The Clinical AI Feedback and Quality Loop
**Status: PARTIALLY BUILT ✅**

- `server/quality/hedisEngine.ts` — HEDIS metric engine (guideline adherence measurement)
- `server/quality/reportGenerator.ts` — quality report generation
- `server/quality/agentOutputGate.ts` — gates AI output based on quality thresholds
- Physician override capture: every approval/modification/rejection stored in audit chain
- Federated learning: model weight aggregation across clinic nodes (built)
- Clinical validation page (`/clinical-validation`): shows AI prediction vs. physician decision

**What's missing:**
- An individual physician feedback dashboard showing their own patterns (currently the quality data is aggregated, not surfaced to the individual provider in a useful format)
- Statistical outlier detection for individual physician decisions vs. peer benchmarks
- Guideline adherence scoring surfaced at the case level (not just in aggregate)

**Effort to complete:** Low-Medium. Data is already being captured. Need: a provider-specific analytics view + outlier detection logic on top of existing quality engine.

---

## Priority Build Order (Clinical Impact × Technical Feasibility)

| Priority | Recommendation | Status | Effort | Clinical Impact |
|----------|---------------|--------|--------|----------------|
| 1 | **Discharge instructions in physician sign-off** (#9) | Backend built | Low | High — patients leave knowing what to do |
| 2 | **Async telemedicine case-type labeling** (#4) | Partial | Low-Med | High — physician throughput ×10 for low-acuity |
| 3 | **Ambient note generation button in review UI** (#5) | Backend built | Med-High | High — 2-3 hrs/day physician time recovery |
| 4 | **CDS sidebar in case review** (#3) | Partial | Low-Med | High — reduces cognitive load at point of care |
| 5 | **eConsult draft generator** (#7) | Partial | Med | Medium — closes specialist routing gap |
| 6 | **Telemedicine pre-screening page** (#2) | Backend built | Med | Medium — improves telemedicine efficiency |
| 7 | **Provider feedback/quality dashboard** (#10) | Partial | Low-Med | Medium — long-term clinical improvement |
| 8 | **Chronic disease follow-up loop** (#6) | Not built | High | Very High — but requires new domain |
| 9 | **Staffing forecast** (#8) | Not built | High | High (operational) — but no clinical AI needed |
| 10 | **WhatsApp → production** (#1) | Functionally complete | Low | In production already |

---

## The Three Fastest Wins

These three changes have all backend logic already implemented. They only need frontend plumbing:

### Win 1: Discharge Instructions in the Review UI
**Backend:** `POST /api/telemed/assistant/discharge` and `buildDischargeInstructionBlock()` already exist.
**Frontend needed:** A discharge preview card at the bottom of the case review page, generated when the physician clicks "Approve." Physician can edit and then approve the instructions. On final approval, trigger `POST /api/whatsapp/send` to deliver to patient.

### Win 2: Ambient Note Button
**Backend:** `POST /api/telemed/assistant/note` + WebSocket multimodal transcription gateway already exist.
**Frontend needed:** A microphone toggle in the case review header. Audio streams to `/ws/multimodal`, transcript accumulates in a note editor panel below the case summary, physician edits and signs.

### Win 3: CDS Sidebar
**Backend:** `POST /api/telemed/assistant` + medication safety + differential update endpoints already exist.
**Frontend needed:** A collapsible right-hand panel in the case review page that calls the telemedicine assistant API with the current encounter context and displays: updated differential, medication safety alerts, relevant guideline references, dose calculator.

---

## Key Technical Constraints for New Features

1. **No new auth systems** — use `requireAuth` + `requireAnyRole` + `requireCsrf` in that order on all clinical routes
2. **All new clinical events must call `appendAuditEvent()`** — not `logEvent()` or `console.log`
3. **Schema changes to existing tables = explicit SQL migration file** — not `db:push` on production-shaped data
4. **New background jobs must be behind env flags** — default off, opt-in
5. **No PHI in WebSocket payloads, Redis, logs, or metric labels** — use `scrubPhi()` and `publicPatientRef()`
6. **New frontend mutations use `apiRequest()` from `@/lib/queryClient`** — handles CSRF header automatically
7. **All AI outputs need physician gate** — nothing auto-approves

---

## Architecture Diagram (Text)

```
Patient
  │
  ├─ WhatsApp ──────────────────┐
  │                             │
  └─ Web Portal Intake ─────────┤
                                │
                         Twilio Webhook / Firebase
                                │
                    ┌───────────▼───────────┐
                    │   Adaptive Intake AI  │
                    │  (LangGraph + GPT-4o) │
                    │  272 Red-flag rules   │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Clinical Decision    │
                    │  Bridge               │
                    │  (Deterministic first,│
                    │   then LLM)           │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Physician Review     │
                    │  Queue                │
                    │  (Approve/Modify/     │
                    │   Reject)             │
                    └───────────┬───────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
      WhatsApp reply      EHR Write-back      Audit Chain
      to patient          (Epic/Athena)       (Postgres
                                              SHA-256)
```

```
Backend Stack                Frontend Stack
─────────────────            ─────────────────────
Express (Node 20)            React 18 + TypeScript
PostgreSQL 16 (Drizzle)      TanStack Query v5
JWT + httpOnly cookie        shadcn/ui + Tailwind
CSRF double-submit           Wouter routing
WebSocket (ws)               150+ pages
BullMQ (Redis optional)      200+ components
Firebase (docs/storage)
Twilio (WhatsApp/Voice)
OpenAI / Anthropic
```
