# AURALYN — EHR Credential Setup Guide
# eClinicalWorks + Athena Health
# Complete step-by-step instructions
# ============================================================

# ════════════════════════════════════════════════════════════
# SECTION 1: eCLINICALWORKS (eCW) — YOUR PRIMARY EHR
# ════════════════════════════════════════════════════════════

# ── Step 1: Register your application in eCW App Orchard ─────
#
# URL: https://fhir.eclinicalworks.com
# (This is the provider-facing portal — NOT connect4.healow.com
#  which is for patient-facing apps)
#
# Process:
#   1. Go to fhir.eclinicalworks.com
#   2. Click "Register as a Developer" or "Sign Up"
#   3. Create a developer account with your organization email
#   4. Click "Register New Application"
#   5. Fill in:
#        App Name: Auralyn Clinical Intelligence
#        App Type: SELECT "Backend / Single Patient" (NOT bulk)
#                  — Auralyn writes per-encounter, not population bulk
#        Use Case: "Clinical Decision Support and Documentation"
#        FHIR Version: R4
#        Redirect URI: https://yourdomain.replit.dev/api/ehr/ecw/callback
#        Scopes requested:
#          system/Patient.read
#          system/Encounter.read
#          system/Encounter.write
#          system/Condition.read
#          system/Condition.write
#          system/Procedure.write
#          system/MedicationRequest.read
#          system/MedicationRequest.write
#          system/AllergyIntolerance.read
#   6. Submit — eCW review typically takes 3-5 business days
#   7. You will receive: Client ID and Client Secret via email
#
# IMPORTANT: After approval you also need to enable FHIR APIs
# from WITHIN your eCW instance:
#   - Log into eCW as admin
#   - Go to: Administration → On-Demand Activation
#   - Enable FHIR API access
#   - Note your practice-specific FHIR base URL (looks like:
#     https://yourpractice.eclinicalworks.com/fhir/r4)

# ── Step 2: Get your eCW-specific URLs ──────────────────────
#
# Your FHIR base URL is practice-specific.
# Find it by logging into eCW admin and looking under:
#   Administration → API Settings → FHIR Endpoint
#
# It will look like one of:
#   https://[yoursubdomain].eclinicalworks.com
#   https://ecw.yourhospital.org
#   https://prod-[region].eclinicalworks.com/[practiceid]
#
# Your Practice ID is visible in eCW under:
#   Administration → Practice Information → Practice ID

# ── Step 3: Add to Replit Secrets ───────────────────────────
#
# In Replit → your project → Secrets tab → add each:

ECW_CLIENT_ID=your_client_id_from_ecw_app_orchard
ECW_CLIENT_SECRET=your_client_secret_from_ecw_app_orchard
ECW_FHIR_BASE_URL=https://yourpractice.eclinicalworks.com
ECW_PRACTICE_ID=your_practice_id

# ── Step 4: Test the connection ──────────────────────────────
#
# Run this to verify credentials work:

cat << 'TEST_ECW'
import { ECWWriter } from "./server/ehr/ECWWriter";

async function testECW() {
  const writer = new ECWWriter();

  // Step 4a: Check what this eCW instance actually supports
  console.log("Checking eCW CapabilityStatement...");
  const capability = await writer.getCapabilityStatement();
  console.log("Supported resources:", capability.rest?.[0]?.resource?.map(r => r.type));

  // Step 4b: Try reading a test patient (use a known test MRN)
  console.log("\nTesting patient read...");
  const patient = await writer.getPatientByMRN("TEST-MRN-001");
  console.log("Patient found:", patient ? "YES" : "NO (check MRN)");

  console.log("\neCW connection verified.");
}

testECW().catch(console.error);
TEST_ECW

# npx tsx server/ehr/testECW.ts


# ════════════════════════════════════════════════════════════
# SECTION 2: ATHENA HEALTH — SECONDARY EHR
# (Keep this ready for multi-clinic deployment)
# ════════════════════════════════════════════════════════════

# ── Step 1: Register on Athena Developer Portal ──────────────
#
# URL: https://developer.athenahealth.com
#
# Process:
#   1. Create account at developer.athenahealth.com
#   2. Click "Register Application"
#   3. Fill in:
#        App Name: Auralyn Clinical Intelligence
#        App Type: "Practice API" (for provider-facing clinical use)
#        Environment: Start with "Preview" (sandbox) — switch to
#                     "Production" after testing
#        Redirect URI: https://yourdomain.replit.dev/api/ehr/athena/callback
#   4. You receive Client ID and Client Secret immediately
#      (Athena does NOT require a review period for sandbox)
#   5. For production access, submit for Athena App Market review
#
# Your Practice ID is in Athena admin:
#   Admin → Practice Setup → Practice Information

# ── Step 2: Add to Replit Secrets ───────────────────────────

ATHENA_CLIENT_ID=your_athena_client_id
ATHENA_CLIENT_SECRET=your_athena_client_secret
ATHENA_PRACTICE_ID=your_athena_practice_id

# ── Note on Athena environments: ────────────────────────────
#   Preview (sandbox): api.preview.platform.athenahealth.com
#   Production:        api.platform.athenahealth.com
#
# The AthenaEHRWriter.ts already uses production URL.
# For sandbox testing, temporarily change baseUrl to preview.


# ════════════════════════════════════════════════════════════
# SECTION 3: ADD eCW TO SIGNOFF.TS (wire alongside Athena)
# ════════════════════════════════════════════════════════════

cat << 'ADD_TO_SIGNOFF'
// In server/routes/signoff.ts, after physician approves:
// Add eCW write alongside existing Athena write

import { ECWWriter } from "../ehr/ECWWriter";

const ecwWriter = new ECWWriter();

// Determine which EHR this clinic uses
const ehrType = encounter.clinic?.ehrType || process.env.DEFAULT_EHR || "ecw";

if (ehrType === "ecw" || ehrType === "both") {
  // Fire eCW write (non-blocking — don't let EHR failure block signoff)
  ecwWriter.writeFullEncounter({
    ecwPatientId:   encounter.ecwPatientId,
    ecwEncounterId: encounter.ecwEncounterId,
    chartNote:      encounter.generatedChartNote,
    primaryDiagnosis: encounter.primaryDiagnosis,
    primaryIcd10:   encounter.icd10Code,
    secondaryDiagnoses: encounter.secondaryDiagnoses,
    cptCodes:       encounter.cptCodes,
    prescriptions:  encounter.prescriptions,
  }).then(result => {
    if (!result.success) {
      console.error("[ECW] Write partial/failed:", result.errors);
      // Dead letter queue handles retry (already implemented in ECWWriter)
    }
  }).catch(err => {
    console.error("[ECW] Write exception:", err.message);
  });
}

if (ehrType === "athena" || ehrType === "both") {
  // Existing Athena write (already wired)
}
ADD_TO_SIGNOFF


# ════════════════════════════════════════════════════════════
# SECTION 4: PRE-POPULATE DIALOGUE FROM eCW CHART
# This is the high-value feature — returning patients skip
# questions about medications, allergies, and conditions
# because Auralyn already knows from their chart
# ════════════════════════════════════════════════════════════

cat << 'ADD_PREFILL'
// In server/routes/dialogue.ts, POST /api/dialogue/start:
// BEFORE creating the dialogue session, if patient has an eCW ID,
// fetch their chart and pre-populate the clinical state

import { ECWWriter } from "../ehr/ECWWriter";

const ecwWriter = new ECWWriter();

let prefillState = {};
if (req.body.ecwPatientId) {
  try {
    const chartData = await ecwWriter.prefillFromChart(req.body.ecwPatientId);
    prefillState = {
      currentMedications: chartData.medications,
      medicationAllergies: chartData.allergies,
      knownConditions:    chartData.conditions,
    };
    console.log(`[Dialogue] Prefilled from eCW chart: 
      ${chartData.medications.length} meds, 
      ${chartData.allergies.length} allergies, 
      ${chartData.conditions.length} conditions`);
  } catch (err) {
    // Non-blocking — if prefill fails, dialogue still works
    console.warn("[Dialogue] eCW prefill failed:", err.message);
  }
}

// Pass prefillState to engine — it skips questions already answered
const engine = new AdaptiveDialogueEngine(sessionId, channel, prefillState);
ADD_PREFILL


# ════════════════════════════════════════════════════════════
# SECTION 5: REAL-WORLD eCW INTEGRATION NOTES
# Based on current 2026 research
# ════════════════════════════════════════════════════════════

# 1. ALWAYS CHECK CAPABILITYSTATEMENT FIRST
#    eCW's FHIR implementation is certified but partial.
#    Run: GET /fhir/r4/metadata
#    This tells you exactly what resources your eCW instance supports.
#    Do not assume a resource is available just because it's in the FHIR spec.

# 2. PROGRESS NOTES USE PROPRIETARY API (not FHIR)
#    eCW does NOT support FHIR DocumentReference writes for progress notes.
#    ECWWriter.ts uses the proprietary /api/v1/patients/.../progressnotes endpoint.
#    The exact path may vary slightly by eCW version — verify in their API docs
#    at fhir.eclinicalworks.com after you have credentials.

# 3. SANDBOX RATE LIMITS ARE MORE PERMISSIVE THAN PRODUCTION
#    The ECWWriter has exponential backoff built in (up to 4 retries).
#    In production, track your actual rate against limits.
#    eCW typically allows 100-200 requests/minute per application.

# 4. PATIENT ID MAPPING
#    eCW uses its own internal patient IDs (not MRNs for API calls).
#    You need to either:
#    a) Look up the eCW patient ID by MRN at encounter start
#       (GET /Patient?identifier={mrn})
#    b) Or store the eCW patient ID in your encounters table during registration
#    Column to add: ALTER TABLE encounters ADD COLUMN ecw_patient_id TEXT;

# 5. BAA STATUS
#    eCW's standard Business Associate Agreement covers API usage for
#    treatment purposes. Confirm your existing eCW contract includes
#    the BAA addendum — most clinical contracts do.
#    If unsure: contact your eCW account representative.

# 6. TIMELINE EXPECTATIONS
#    - Sandbox access:    After App Orchard registration → 3-5 business days
#    - Production access: After sandbox testing + eCW app review → 2-4 weeks
#    - On-Demand Activation in eCW admin: immediate (you do this yourself)

# ════════════════════════════════════════════════════════════
# SECTION 6: ENVIRONMENT VARIABLE CHECKLIST
# All secrets needed for full EHR integration
# ════════════════════════════════════════════════════════════

# eClinicalWorks (primary):
ECW_CLIENT_ID=                    # from App Orchard registration
ECW_CLIENT_SECRET=                # from App Orchard registration
ECW_FHIR_BASE_URL=                # your practice FHIR endpoint
ECW_PRACTICE_ID=                  # from eCW admin → Practice Information

# Athena Health (secondary / multi-clinic):
ATHENA_CLIENT_ID=                 # from developer.athenahealth.com
ATHENA_CLIENT_SECRET=             # from developer.athenahealth.com
ATHENA_PRACTICE_ID=               # from Athena admin

# Twilio (already set, verify these exist):
TWILIO_ACCOUNT_SID=               # from twilio.com/console
TWILIO_AUTH_TOKEN=                # from twilio.com/console
TWILIO_FROM_NUMBER=               # your clinic Twilio number
CLINIC_FRONT_DESK_NUMBER=         # where safety escalations transfer

# OpenAI (already set):
OPENAI_API_KEY=                   # from platform.openai.com

# Redis (already set):
UPSTASH_REDIS_REST_URL=           # from upstash.com
UPSTASH_REDIS_REST_TOKEN=         # from upstash.com

# Default EHR routing:
DEFAULT_EHR=ecw                   # "ecw" | "athena" | "both"
