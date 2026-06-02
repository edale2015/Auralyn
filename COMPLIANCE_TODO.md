# COMPLIANCE_TODO.md

Deferred compliance / hardening items for the physician WhatsApp disposition
flow (`server/whatsapp/agent/physicianPacket.ts`, `server/whatsapp/kbIntake.ts`).
These were identified while building the physician-reply disposition feature
and are **intentionally deferred to a dedicated compliance session** — they are
not bugs in the feature logic but cross-cutting privacy/security/durability
concerns that need their own review.

Status legend: 🔴 not started.

---

## 1. 🔴 PHI / BAA for clinical packet over WhatsApp (Twilio)

**What.** The physician triage packet (chief complaint, age/sex, symptoms,
differentials, red-flag status) is sent to the physician's WhatsApp number via
Twilio. This is a PHI transfer to an external service.

**Risk.** Per `CLAUDE.md` §6 / §12, Twilio is a PHI-capable provider requiring
confirmed BAA/approval **for this specific workflow** before production use.
Sending minimum-necessary PHI must be verified.

**Where.** `sendPhysicianPacket()` / `formatPhysicianWhatsAppMessage()` in
`server/whatsapp/agent/physicianPacket.ts`; outbound send in
`server/whatsapp/send.ts`.

**To do.** Confirm Twilio BAA covers WhatsApp messaging for this clinic/tenant;
review minimum-necessary content; decide whether any field should be dropped or
referenced by case ID only.

---

## 2. 🔴 Physician authentication is sender-number match only

**What.** A physician's reply is authorized solely by matching the inbound
WhatsApp number against a single global `PHYSICIAN_PHONE_NUMBER` env var
(`isPhysicianNumber()`).

**Risk.** Number-only auth is spoofable/forwardable and is **not tenant-scoped**
— one global number serves all clinics, so there is no per-physician or
per-clinic identity on a clinical decision. A one-word reply triggers a real
patient disposition.

**Where.** `isPhysicianNumber()` and `handlePhysicianReply()` in
`server/whatsapp/agent/physicianPacket.ts`; routing in
`server/whatsapp/kbIntake.ts` (physician short-circuit).

**To do.** Add a verified physician principal (registered physician records,
per-tenant number allowlist, ideally a confirmation/second factor for
high-acuity actions). Tie the disposition to a verified physician identity in
the audit record (currently `physicianContact: "verified_number"`).

---

## 3. 🔴 Pending case → patient mapping is in-memory (lost on restart)

**What.** The `caseId → { patientPhone, complaint, slug }` mapping that lets a
physician reply route back to the right patient lives in an in-process `Map`
with a 6-hour TTL (`pendingByCaseId`).

**Risk.** A server restart / redeploy drops all pending cases, so a physician
reply afterward finds nothing to dispatch (fails safe but loses the linkage).
Also not shared across multiple Node workers/instances.

**Where.** `pendingByCaseId` in `server/whatsapp/agent/physicianPacket.ts`.

**To do.** Persist pending dispositions in durable storage (the `encounters` /
review tables already exist in `shared/schema.ts` / `server/storage.ts`) and
look the case up from there on physician reply.

---

## 5. 🔴 No live end-to-end (webhook) integration test for the disposition flow

**What.** `tests/unit/physicianDisposition.test.ts` covers the logic with the
send / audit / LLM boundaries mocked. There is no test that drives the real
Twilio inbound webhook → `handlePhysicianReply` → patient send path.

**Risk.** Webhook signature validation, physician routing in `kbIntake.ts`, and
real message delivery are not exercised together; a wiring regression could pass
unit tests.

**Where.** `server/routes/whatsappWebhook.ts`, `server/whatsapp/kbIntake.ts`,
`server/whatsapp/agent/physicianPacket.ts`.

**To do.** Add a supertest-level webhook integration test (synthetic data only,
opt-in like `tests/integration/neuroHeadacheSkipLogic.integration.test.ts`)
covering a signed inbound physician reply end to end.

---

## Emergency protocol — deferred items

The universal clinic emergency protocol was built backend-first (commit
`2244b78b`): `server/emergency/emergencyProtocol.ts` (staff alert + audit) and
the WhatsApp patient-phrase bypass in `server/whatsapp/kbIntake.ts`. The
following were intentionally deferred.

### 6. 🔴 Physician sign-off on the emergency clinical template

**What.** The ABCs / "consider while waiting" block in
`formatEmergencyAlert()` is a physician-authored static template containing
specific interventions (e.g. NS 500 mL bolus, O2 if SpO2 < 95%, EKG, hold pain
meds).

**Risk.** Per `CLAUDE.md` §2, clinical protocol/dosing must be physician-owned.
It is transcribed verbatim and flagged in-file as not-for-production until
reviewed.

**Where.** `formatEmergencyAlert()` in `server/emergency/emergencyProtocol.ts`.

**To do.** Obtain documented physician sign-off on the template wording before
production; record the approving physician + date.

### 7. 🔴 Dashboard EMERGENCY button (frontend)

**What.** A prominent one-tap EMERGENCY button on the physician dashboard that
calls `triggerEmergencyProtocol()`.

**Where (to build).** A new route/endpoint that invokes
`triggerEmergencyProtocol({ source: "staff_dashboard", ... })`, plus the button
in the dashboard UI (`client/src/...`). Needs auth (admin/physician role + CSRF)
and a decision on which dashboard page hosts it.

**To do.** Add the protected endpoint and the UI control; audit already fires
inside `triggerEmergencyProtocol()`.

### 8. 🔴 Staff dedicated-number trigger + staff authentication

**What.** Allow staff to text "EMERGENCY — [description]" to a dedicated number
to fire the protocol (`source: "staff_text"`).

**Risk.** Needs a verified staff principal — like the physician number
(item #2), an inbound number is weak/unscoped auth for a clinical trigger.

**Where (to build).** Inbound routing in `server/routes/whatsappWebhook.ts` /
`server/whatsapp/kbIntake.ts`; a `STAFF_EMERGENCY_NUMBER`-style allowlist.

**To do.** Decide the number + per-clinic allowlist and how staff senders are
authenticated, then route matching inbound texts to
`triggerEmergencyProtocol()`.

---

_Note: Issue #4 (URGENT → ER_SEND disposition mapping) was resolved — see commit
`38bd55a3`. The mapping was already correct; a regression test now locks it._
