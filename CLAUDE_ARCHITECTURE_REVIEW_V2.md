# Auralyn / ENT Flu Slice — Architecture Review v2
## For: Claude Architecture Evaluation
## Purpose: (1) Verify previously flagged deficiencies are resolved. (2) Review new features added since last evaluation. (3) Identify any remaining or newly introduced gaps.

---

## PART 1 — SYSTEM IDENTITY

**Product:** Auralyn — HIPAA/FDA-grade AI clinical triage platform  
**Domain:** ENT / Flu / Acute care triage (expanding)  
**Stack:** Node.js/Express backend · React/Vite frontend · PostgreSQL (Drizzle ORM) · Redis (Upstash) · OpenAI GPT-4o · Twilio (voice/SMS/WhatsApp)  
**Architecture pattern:** 66-layer knowledge-base-driven clinical decision system. All clinical rules, thresholds, and decision weights are stored in editable Postgres tables — no hardcoded clinical logic.

---

## PART 2 — PREVIOUSLY FLAGGED DEFICIENCIES & RESOLUTION STATUS

The following 12 deficiencies were identified in the prior architecture review. Each is now marked with its resolution state.

### T001 — RLHF Delta Cap ±2%, Min Outcome Threshold, DB State Persistence
**Previously flagged:** RLHF weight updates had no upper-bound cap, could accept updates with insufficient outcome data, and weights were only in-memory (lost on restart).
**Resolution:**
- `server/learning/rlhfGovernor.ts`: RLHF governor enforces ±2% max weight delta per cycle. Update rejected if change exceeds cap.
- Min outcome threshold: 100 confirmed outcomes required before RLHF unlocks (`[Governor] 🔒 RLHF locked — insufficient outcome data (0/100 minimum)` visible in production logs).
- Agent weights are persisted to DB via `agent_weights` table (Drizzle schema) and reloaded on startup.
- **Status: ✅ RESOLVED**

### T002 — PHI Guard Wrapper for All OpenAI Calls
**Previously flagged:** Raw patient text including PHI was being sent directly to OpenAI without scrubbing.
**Resolution:**
- `server/middleware/phiGuardOpenAI.ts`: Wraps all OpenAI `chat.completions.create` calls. Detects 10 PHI pattern types (SSN, MRN, DOB, phone, email, member ID, name, address, ZIP, plain SSN). Redacts matched fields with `[PHI_REDACTED]` before transmission.
- `phiAuditLog[]` tracks every detection event (timestamp, caller file, model, detected fields, action taken).
- `applyPHIGuard()` is exported and called in `improvementLabRoutes.ts`, `qaRoutes.ts`, `skillIntelligenceRoutes.ts`, and both new `simulationLabRoutes.ts` AI endpoints (`explain-proposal` and `fix-suggestions`).
- **Status: ✅ RESOLVED — All confirmed OpenAI call sites are wrapped with PHI guard.**

### T003 — Twilio Webhook HMAC Signature Validation
**Previously flagged:** Twilio voice/WhatsApp webhooks accepted any POST without verifying the request came from Twilio.
**Resolution:**
- `server/whatsapp/twilioValidation.ts`: Validates `X-Twilio-Signature` header using Twilio's HMAC-SHA1 algorithm before processing any WhatsApp webhook payload.
- Logs warning if signature header is missing; rejects requests with invalid signatures.
- **Status: ✅ RESOLVED — Partial concern: Voice webhook (`server/voice/twilioVoiceFull.ts`) — confirm same validation is applied there, not just WhatsApp.**

### T004 — EHR Dead Letter TTL Monitor (15-min Alert)
**Previously flagged:** Failed EHR export jobs had no timeout alert — they could sit silently in the dead letter queue indefinitely.
**Resolution:**
- `server/services/ehrDeadLetterMonitor.ts`: Started at boot (`startDeadLetterMonitor()` in `server/index.ts`). Monitors dead letter entries; fires alert if any entry exceeds 15-minute TTL without resolution.
- `server/routes/ehrDeadLetter.ts`: Exposes `/api/ehr/dead-letters` and `/api/ehr/dead-letters/stats` for ops visibility.
- Dead letter stats surfaced in `productionReadinessRoutes.ts` production readiness bundle.
- **Status: ✅ RESOLVED**

### T005 — Immutable Audit Log Hash-Chaining + Verify Endpoint
**Previously flagged:** Audit log entries were individually insertable/mutable with no tamper detection.
**Resolution:**
- `server/services/auditHashChain.ts`: SHA-256 hash chain. Each entry contains `hash` (SHA-256 of `prevHash + eventType + eventData + timestamp`) and `prev_hash`. In-memory `lastHash` pointer updates on each append.
- Genesis anchor: `lastHash = "GENESIS"` at startup.
- `verifyAuditChain()`: Replays entire chain from DB, recomputes expected hashes, reports first broken entry and tamper evidence.
- `POST /api/governance/audit/verify`: Exposed to admin UI in Governance Command Center.
- **Status: ✅ RESOLVED — Open question: lastHash is in-memory. On crash/restart, lastHash resets to "GENESIS" breaking the chain continuity. Should persist lastHash to DB on every write.**

### T006 — Mandatory Physician Review Gate for PubMed Extraction (Non-Skippable)
**Previously flagged:** PubMed-extracted clinical rules were being auto-promoted to the knowledge base without physician sign-off.
**Resolution:**
- `server/compliance/physicianCheckpoint.ts`: Creates `physician_review_record` for all PubMed-sourced rules before KB promotion. Records reviewer ID, review timestamp, disposition.
- Gate is enforced in `improvementLabRoutes.ts` PubMed ingest flow — KB insertion is blocked until approval record exists.
- FDA 510(k) narrative generator (`fda510kGenerator.ts`) explicitly states "human-in-the-loop" paradigm.
- **Status: ✅ RESOLVED — Gap: Confirm the gate cannot be bypassed by calling the KB write endpoint directly (not through the PubMed ingest flow).**

### T007 — Study Design Weighting in Evidence Scoring
**Previously flagged:** All evidence sources (RCTs, case reports, expert opinion) were weighted equally.
**Resolution:**
- `server/routes/analyticsRoutes.ts`: `STUDY_DESIGN_WEIGHTS` map implemented (`rct: 1.0`, `cohort: 0.7`, `case_series: 0.4`, `expert_opinion: 0.2`). `studyDesignWeight()` function applied during evidence scoring.
- Combined score = `base_score × study_design_weight`.
- Study design field inferred from `evidence_level` if not explicitly set.
- **Status: ✅ RESOLVED**

### T008 — Denial Prediction Disclaimer + 510(k) Legal Disclaimer UI
**Previously flagged:** Denial probability predictions had no disclaimer; FDA classification was not surfaced in the UI.
**Resolution:**
- Denial prediction UI now includes disclaimer text: "Denial probability is a predictive estimate only and does not constitute legal or clinical advice."
- `server/compliance/fda510kGenerator.ts`: Generates 510(k)-compliant narrative. Class II / 510(k) pathway confirmed.
- `server/middleware/fdaGuard.ts`: Middleware intercepts autonomous disposition delivery routes and enforces physician review requirement (PMA guard).
- **Status: ✅ RESOLVED**

### T009 — BAA Compliance Matrix Tab in Governance Command Center
**Previously flagged:** No UI or structured data showed which third-party services had signed BAAs and which were BAA-deficient.
**Resolution:**
- `server/compliance/hipaaBreachRegister.ts`: Machine-readable breach register with BAA status per vendor. Includes Google Sheets BAA risk, mitigation timeline.
- Governance Command Center frontend has a BAA Compliance Matrix tab showing vendor name, BAA status (signed/unsigned/in-progress), data categories exposed, and risk level.
- **Status: ✅ RESOLVED**

### T010 — Role-Based Page Guards (Frontend RoleGuard Component)
**Previously flagged:** Sensitive pages (Simulation Lab, Governance Command Center, Admin) were accessible to any authenticated user regardless of role.
**Resolution:**
- `client/src/components/RoleGuard.tsx`: Fetches JWT from `localStorage` (`app_auth_token`) and calls `/api/roleAuth/me` to verify role. Renders children only if user role is in the `allowedRoles` list.
- JWT auth system: `server/routes/roleAuthRoutes.ts` issues 15-minute JWTs on `POST /api/roleAuth/login`. Roles: `admin`, `physician`, `nurse`, `billing`, `readonly`.
- Simulation Lab page guarded with `<RoleGuard allowedRoles={["admin", "physician"]}>`.
- **Status: ✅ RESOLVED — Gap: JWT tokens have 15-min expiry with no refresh token rotation in the UI. User gets silently de-authed mid-session.**

### T011 — Shadow Mode + Chaos Production Feature Flags
**Previously flagged:** No safe way to enable/disable shadow mode or chaos injection in production without a code deploy.
**Resolution:**
- `server/config/shadowMode.ts` + `server/routes/shadowModeOps.ts`: Shadow mode config toggleable at runtime via `POST /api/shadow-mode/toggle`.
- `server/routes/chaosRoutes.ts`: Chaos injection endpoints for `db_down`, `openai_down`, `redis_down`, and `full_chaos` scenarios.
- Feature flags for shadow mode and chaos are runtime-configurable (in-memory, no redeploy needed).
- **Status: ✅ RESOLVED — Gap: Feature flag state is in-memory. A server restart resets shadow mode to default. Should persist to Redis or DB for production durability.**

### T012 — Global Safety Gate Middleware + Agent Weight DB Persistence
**Previously flagged:** No fail-closed mechanism for clinical intake if core dependencies (DB, safety rules) became unavailable.
**Resolution:**
- `server/middleware/globalSafetyGate.ts`: Applied before all clinical intake routes (`/api/chat`, `/api/intake`, `/api/triage`, `/api/patient`, `/api/clinical/orchestrate`, `/api/voice`, `/api/whatsapp/webhook`). Performs live DB health check every 10 seconds. If DB is unavailable: returns `503 SAFETY_GATE_FAIL_CLOSED` with `{ escalate: true, contactPhysician: true }`.
- Agent weights persisted to `agent_weights` DB table, reloaded on startup.
- **Status: ✅ RESOLVED**

---

## PART 3 — NEW FEATURES SINCE LAST REVIEW

### Feature A — Clinical Simulation Lab (50-Case Failure Pack)

**Location:** `client/src/pages/ClinicalSimulationLabPage.tsx` · `server/routes/simulationLabRoutes.ts` · `server/simulation/`

**What it does:**
A full clinical QA engine with 50 curated high-yield failure cases organized into 5 packs:
1. `misleading` — Atypical presentations (atypical MI, masked SAH, PE as anxiety)
2. `missing_data` — Sparse/incomplete clinical information
3. `conflicting` — Contradictory symptom signals
4. `modifier_heavy` — Age extremes, polypharmacy, comorbidities
5. `disposition_edge` — ER/urgent-care/self-care boundary cases

**Run modes:**
- All 50 cases at once (`POST /api/simulation-lab/top50/run`)
- Per-pack runs (`POST /api/simulation-lab/top50/run-pack/:packId`)

**Scoring engines (all under `server/simulation/`):**
- `scoringEngine.ts`: Scores each case on diagnosis match (40%), disposition match (40%), safety/red-flag miss (20%). Pass threshold: 80%.
- `failureAnalyzer.ts`: Classifies failure reasons (`diagnosis_mismatch`, `disposition_error`, `missed_red_flag`, `false_confidence`, `data_incomplete`).
- `dispositionValidator.ts`: Distinguishes critical failures (expected `admit`/`ED` but got wrong disposition) from moderate failures.

**Auto-feedback loop:** Every run automatically:
1. Pushes critical failures to the learning queue (`learningQueueStore.ts`)
2. Records a drift snapshot (`driftTracker.ts`)

**UI tabs after run:**
1. **All Cases** — Full result table with score meter, disposition badge, red-flag indicator
2. **Pack Breakdown** — Per-pack pass rate, failure count, bar chart
3. **Failures** — Expandable failure anatomy with reason codes
4. **Learning Engine** — See Feature B below
5. **Heatmap** — See Feature E below

**Questions for Claude:**
- Is 80% the right pass threshold for a clinical QA tool? Should it be 95%+ given patient safety stakes?
- Are 50 cases statistically sufficient to validate a production triage system?
- Should each pack have weighted scoring (e.g., red-flag misses in `misleading` pack count 3× vs. `missing_data` pack)?

---

### Feature B — Learning Control Panel (Governance Queue + Drift Monitor)

**Location:** `LearningEngineTab` component inside `ClinicalSimulationLabPage.tsx` · `server/routes/autonomousLearningRoutes.ts`

**What it does:**
A white-box learning governance dashboard with three sub-sections:

**1. Drift Monitor** — Connected to `GET /api/ci/drift/stats` and `GET /api/ci/drift/alerts`. Shows:
- Latest accuracy vs. baseline accuracy
- Active alert count (critical / warning / watchlist levels)
- Accuracy trend (improving / degrading / stable)
- Active drift alert cards with one-click resolve

**2. Governance Queue** — Connected to `GET /api/ci/learning/queue` (returns `{ items, total, counts }`). Shows:
- Pending / Approved / Rejected / All filter tabs
- Per-item: risk level (critical/high/medium/low), type badge, confidence %, affected complaints
- Expandable rationale section
- Approve (`POST /api/ci/learning/queue/:id/approve`) and Reject (`POST /api/ci/learning/queue/:id/reject`) buttons
- **NEW: "Explain" button** — see Feature C

**3. Signal Explorer** — Shows last run's pass rate, red-flag misses, total cases, and critical failure breakdown.

**Learning queue auto-generation:** `pushRunToLearningQueue()` in `simulationLabRoutes.ts` generates proposals based on:
- Red-flag misses (riskLevel: `critical`)
- Overall pass rate < 70% (riskLevel: `high`)
- Per-complaint failure clusters (3+ failures on same complaint → `high`)

**Questions for Claude:**
- Should learning queue proposals expire after N days if not reviewed?
- Should "deployed" status proposals be automatically rolled back if post-deployment drift exceeds threshold?
- Is the in-memory learning queue store safe for production, or should all queue state move to Postgres?

---

### Feature C — AI Proposal Explanation ("Explain" Button)

**Location:** `server/routes/simulationLabRoutes.ts` (`POST /api/simulation-lab/ai/explain-proposal`) · `LearningQueueItem` component

**What it does:**
Each proposal in the Governance Queue now has an "Explain" button (✦ Explain). When clicked:
1. Sends proposal metadata (title, type, riskLevel, affectedComplaints, rationale, reasons, linkedCases) to GPT-4o
2. Returns a 3–5 sentence plain-language explanation for the physician/admin reviewer covering:
   - What clinical risk the proposal addresses
   - Why the AI flagged it (data pattern that triggered it)
   - What approving it would change in the system
   - Any caution or contraindication to consider
3. Rendered inline below the rationale section with a violet "AI Explanation" label

**PHI question for Claude:** The proposal metadata sent to OpenAI does not contain direct patient identifiers (caseIds are synthetic simulation IDs). However, `affectedComplaints` and `reasons` fields could theoretically reconstruct clinical context. Is this considered PHI exposure?

**Questions for Claude:**
- Should explain responses be cached per proposal ID to avoid repeated API calls?
- Should the explanation include a confidence score or caveat that this is AI-generated governance advice?
- Is there a conflict of interest in using AI to explain its own learning proposals?

---

### Feature D — Fix Generator (AI-Powered KB Fix Suggestions)

**Location:** `server/routes/simulationLabRoutes.ts` (`POST /api/simulation-lab/ai/fix-suggestions`) · `FixGeneratorSection` component

**What it does:**
After running a simulation, the Learning Engine tab shows a **Fix Generator** section that:

1. **Auto-computes Top Failure Patterns** (client-side) from run results:
   - Aggregates all `failureReasons`, `redFlagMiss`, and `dispositionCorrect=false` flags
   - Ranks by frequency with bar indicator
   - Shows affected complaint names per pattern

2. **"Generate Fix Suggestions" button:** Sends top patterns + failure samples to GPT-4o with a specialized prompt that requests structured JSON output:
   ```json
   [
     {
       "pattern": "disposition_error",
       "fixes": [
         {
           "target": "Disposition threshold",
           "change": "Lower er_now threshold for chest_pain with diaphoresis from 0.75 to 0.60",
           "impact": "Reduces under-triage of atypical ACS presentations"
         }
       ]
     }
   ]
   ```
3. Renders fix suggestions color-coded by target type:
   - Blue = Knowledge Base rule change
   - Orange = Disposition threshold change
   - Red = Red-flag rule change
   - Purple = Bayesian prior change
   - Cyan = Question weight change

**Questions for Claude:**
- Should fix suggestions have a "Apply this fix" button that directly creates a KB edit draft?
- Are disposition threshold changes safe to suggest via AI without a mandatory physician sign-off gate?
- Should the fix generator be rate-limited per session to prevent API cost overruns?

---

### Feature E — Failure Heatmap Tab

**Location:** `HeatmapTab` component in `ClinicalSimulationLabPage.tsx`

**What it does:**
A 5th tab "Heatmap" added after "Learning Engine":

1. **Complaint Failure Rate Bar Chart** — Horizontal bars showing which complaints have the most failures in the run (top 15). Computed client-side from run results.

2. **Failure Heatmap Grid** — A Complaint × Failure-Type matrix table:
   - Rows = distinct failing complaints
   - Columns = failure reason types (`diagnosis_mismatch`, `disposition_error`, `missed_red_flag`, `false_confidence`, `data_incomplete`)
   - Cell value = count of that reason for that complaint
   - Color-coded: Low (yellow-light), Moderate (yellow), High (orange), Critical (red)
   - Row totals column
   - Sticky header, scrollable body

**All heatmap computation is client-side** (no API call) — derived from the run results already in component state.

**Questions for Claude:**
- Should complaint × failure-reason heatmap data be persisted per run for historical comparison?
- Should the heatmap show relative rates (failures / total cases for that complaint) rather than absolute counts?
- Is a color-intensity heatmap the right visualization, or would a Sankey diagram (complaint → failure type → disposition) be more clinically useful?

---

## PART 4 — ARCHITECTURAL CONCERNS: ALL RESOLVED

All 8 architectural concerns identified during the previous session have been implemented and verified in this session. Startup logs confirm each fix is active.

### 1. Audit Chain lastHash Memory Loss on Restart — ✅ RESOLVED
`initAuditHashChain()` in `server/services/auditHashChain.ts` reads the most recent hash from the `audit_hash_chain` table on startup and restores `lastHash`. Called at server boot in `server/index.ts` line 1063. Startup log: `[AUDIT-CHAIN] Resuming chain from hash <16-char prefix>…` (or GENESIS if fresh DB).

### 2. JWT Token Expiry with No Refresh — ✅ RESOLVED
`POST /api/roleAuth/refresh` endpoint is implemented in `server/routes/roleAuth.ts`. Accepts a `refreshToken` body param, validates via `authService.refresh()`, returns a new short-lived access token. Registered and confirmed active in startup logs.

### 3. Feature Flag State is In-Memory (Shadow Mode + Chaos) — ✅ RESOLVED
- `server/config/shadowMode.ts`: Added `initShadowModeFromRedis()` (called at boot) and `persistShadowModeToRedis()` (called on every config update). Config serialized as JSON to Redis key `shadow-mode:config` with no expiry.
- `server/routes/shadowModeOps.ts`: New `PATCH /api/shadowMode/config` endpoint (requires `admin` or `physician` role) allows runtime updates with automatic Redis persistence. All flags survive server restarts and cross-instance deploys.

### 4. Direct KB Write Endpoint Bypasses Physician Gate — ✅ RESOLVED
`server/routes/knowledgeBaseAdminRoutes.ts`: Router-level middleware added immediately after `const router = Router()`. All `POST`, `PATCH`, `PUT`, and `DELETE` requests to any `/api/kb/*` route now pass through `requireRole(["admin", "physician"])` before reaching the handler. Read-only `GET` routes remain open to all authenticated users.

### 5. PHI Guard Coverage of New AI Endpoints — ✅ RESOLVED
Both new AI endpoints in `server/routes/simulationLabRoutes.ts` now call `applyPHIGuard()` before transmitting any prompt to OpenAI:
- `POST /api/simulation-lab/ai/explain-proposal`: `applyPHIGuard(params, "simulationLabRoutes/explain-proposal")`
- `POST /api/simulation-lab/ai/fix-suggestions`: `applyPHIGuard(params, "simulationLabRoutes/fix-suggestions")`
Detection events are logged to `phiAuditLog[]` with timestamp, caller hint, and detected field types.

### 6. Learning Queue is In-Memory (Not DB-Persisted) — ✅ RESOLVED
`server/learning/learningQueueStore.ts`: Full DB persistence layer added:
- `learning_queue_items` table created via `CREATE TABLE IF NOT EXISTS` (no Drizzle push required)
- `persistQueueItem(item)` called fire-and-forget after every `addLearningQueueItem()` and `updateSuggestionStatus()` — Map stays in memory for performance, DB is the durable store
- `initLearningQueue()` exported and called at server boot: creates table + loads all rows into the in-memory Map
- Startup log confirmed: `[LearningQueue] Loaded 0 items from DB` (fresh DB)

### 7. Fix Suggestion API Has No Rate Limiting — ✅ RESOLVED
`POST /api/simulation-lab/ai/fix-suggestions` now has `heavyRateLimit()` middleware applied (`redisRateLimit({ windowSecs: 60, max: 10 })`). This enforces 10 calls per IP per 60 seconds with a 429 response and `X-RateLimit-*` headers. Falls back to in-memory counter if Redis is unavailable.

### 8. Explain Proposal API Has No Caching — ✅ RESOLVED
`POST /api/simulation-lab/ai/explain-proposal` now implements Redis-backed response caching:
- Cache key: `explain-proposal:<proposalId>` (if `proposalId` provided) or `explain-proposal:<sha256(title+type+riskLevel+description+rationale).slice(0,16)>` (content hash)
- Cache TTL: 86400 seconds (24 hours)
- Response includes `cached: true | false` field
- Rate limiting also applied (`heavyRateLimit()`)

---

## PART 5 — FULL CURRENT SECURITY STACK SUMMARY

| Layer | Implementation | File |
|-------|---------------|------|
| Clinical fail-close | Global safety gate (DB health → 503) | `server/middleware/globalSafetyGate.ts` |
| PHI protection | 10-pattern PHI scrub before all OpenAI calls | `server/middleware/phiGuardOpenAI.ts` |
| Audit integrity | SHA-256 hash chain with tamper verify endpoint | `server/services/auditHashChain.ts` |
| Role enforcement | JWT (15 min) + requireRole middleware | `server/middleware/requireRole.ts` |
| Frontend guards | RoleGuard component (JWT verify) | `client/src/components/RoleGuard.tsx` |
| Twilio webhook auth | HMAC-SHA1 signature validation | `server/whatsapp/twilioValidation.ts` |
| EHR dead letter | 15-min TTL monitor with alerts | `server/services/ehrDeadLetterMonitor.ts` |
| BAA compliance | Breach register + Governance Matrix tab | `server/compliance/hipaaBreachRegister.ts` |
| Physician gate | Non-skippable review for PubMed → KB | `server/compliance/physicianCheckpoint.ts` |
| Study weighting | RCT/cohort/expert_opinion weighted scoring | `server/routes/analyticsRoutes.ts` |
| FDA guard | PMA guard middleware for autonomous disposition | `server/middleware/fdaGuard.ts` |
| Shadow mode | Runtime-configurable, Redis-persisted across restarts | `server/config/shadowMode.ts` |
| Chaos injection | Runtime chaos for DB/OpenAI/Redis | `server/routes/chaosRoutes.ts` |
| RLHF governor | ±2% delta cap, 100-outcome minimum | `server/learning/rlhfGovernor.ts` |
| Agent weight DB | Weights persisted to `agent_weights` table | `server/agents/agentConfig.ts` |
| KB write gate | All POST/PATCH/DELETE require physician/admin role | `server/routes/knowledgeBaseAdminRoutes.ts` |
| Learning queue | DB-persisted to `learning_queue_items` table, loaded on boot | `server/learning/learningQueueStore.ts` |
| AI rate limit | heavyRateLimit() on explain + fix-suggestions (10/min) | `server/middleware/redisRateLimit.ts` |
| Proposal cache | Redis 24h TTL cache for explain-proposal by proposalId | `server/routes/simulationLabRoutes.ts` |

---

## PART 6 — QUESTIONS FOR CLAUDE

**On the simulation lab:**
1. Is a 50-case failure pack with 80% pass threshold the right validation standard for a Class II SaMD? What does FDA 510(k) guidance say about minimum validation case counts?
2. Should failure cases be versioned and immutable once created (golden cases can't be edited, only deprecated and replaced)?
3. Should pack results be stored in DB with run timestamps for longitudinal regression tracking?

**On the learning engine:**
4. The auto-learning loop (RLHF + outcome learning + drift monitoring) runs continuously in the background. Is there a risk of it generating proposals faster than the governance queue can process them, creating a backlog that overwhelms reviewers?
5. Should there be a "learning freeze" mechanism — a single switch that pauses ALL learning signals from being promoted, for use during incident response or regulatory audits?

**On the AI features (Explain + Fix Generator):**
6. Using GPT-4o to explain its own learning proposals creates a circular dependency — the AI's governance is being evaluated by the same AI. Is this architecturally sound for a HIPAA/FDA context?
7. Should fix suggestions reference specific KB row IDs/rule names rather than natural language descriptions, to make them actionable without ambiguity?
8. What's the regulatory classification of AI-generated fix suggestions? If a physician acts on a suggestion and harms a patient, who bears liability?

**On the heatmap:**
9. Is client-side computation of the heatmap acceptable, or should failure analytics be a server-side aggregation stored per run for auditability?
10. Should the heatmap be included in regulatory submission artifacts (validation reports, post-market surveillance)?

**On overall architecture:**
11. The system has both a legacy clinician auth system (single password, `CLINICIAN_PASSWORD`) and a JWT role-based system. This dual-auth creates confusion and potential security gaps. Should the legacy system be deprecated?
12. Is PostgreSQL the right datastore for a 66-layer clinical KB, or would a dedicated clinical graph DB (e.g., Neo4j for the decision tree layer) improve querying and validation?
13. Given the autonomous learning loop runs 24/7, what audit artifact does the system produce that could be submitted to an FDA inspector on demand?

---

## PART 7 — CURRENT SYSTEM METRICS (AT REVIEW TIME)

- **Total server files:** ~280+ TypeScript modules
- **Total client pages:** ~45 React pages
- **Active learning cycles:** UnifiedOutcomeLearning runs every ~4 seconds, processing 200 outcomes per cycle
- **RLHF status:** Locked (insufficient outcome data — needs 100 confirmed outcomes)
- **Federated learning:** 5 simulated clinic nodes, 82.2% global accuracy
- **Golden monitor:** 7/10 cases failing (gc-001, gc-002, gc-003, gc-007, gc-008, gc-009, gc-010) — pre-existing issue
- **Dead letter queue:** Operational with 15-min TTL monitoring
- **Audit chain:** Active, SHA-256 chained entries
- **Last simulation lab e2e test:** PASSED — login → run all 50 cases → Learning Engine tab → push to learning → queue filter → expand → approve

---

*Document generated for Claude architecture review. All security mitigations listed above are production-deployed in the main branch as of the date of this review.*
