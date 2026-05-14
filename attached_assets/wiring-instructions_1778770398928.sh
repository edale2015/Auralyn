# AURALYN — Precise Wiring Instructions
# Everything in the "Needs wiring" column — exact file locations and code snippets
# This assumes your existing Auralyn structure as shown in the Replit screenshots
# ============================================================

# ─── WIRING TASK 1: Register dialogue routes in your domain router ─────────
# File to edit: server/routes/clinical.ts (or wherever your clinical domain router lives)
# Look for where you register other clinical routes and add:

cat << 'ADD_TO_CLINICAL_ROUTER'
// Add at the top of server/routes/clinical.ts:
import dialogueRouter from "./dialogue";
import inpatientRouter from "./inpatient";

// Add inside your clinical router setup (after your existing routes):
app.use("/api/dialogue", dialogueRouter);
app.use("/api/inpatient", inpatientRouter);

// Also add the patient-facing route (no auth required, token-protected):
app.use("/care", express.static("client/dist"));  // SPA catch-all for /care/:token
ADD_TO_CLINICAL_ROUTER

# ─── WIRING TASK 2: Add care_gaps table migration ──────────────────────────
# Run in your PostgreSQL shell:

cat << 'SQL'
CREATE TABLE IF NOT EXISTS care_gaps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID NOT NULL,
  encounter_id          UUID NOT NULL,
  detected_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  gap_type              TEXT NOT NULL,
  gap_category          TEXT NOT NULL,
  severity              TEXT NOT NULL CHECK (severity IN ('immediate','urgent','important','advisory')),
  title                 TEXT NOT NULL,
  plain_english         TEXT NOT NULL,
  clinical_rationale    TEXT NOT NULL,
  responsible_party     TEXT NOT NULL,
  escalation_deadline   TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','acknowledged','resolved','escalated','overridden')),
  acknowledged_by       TEXT,
  acknowledged_at       TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  resolution_note       TEXT,
  linked_order_id       UUID,
  rule_id               TEXT NOT NULL,
  family_visible        BOOLEAN DEFAULT FALSE,
  policy_reference      TEXT,
  UNIQUE (encounter_id, gap_type, status)  -- prevent duplicate open gaps
);

CREATE INDEX IF NOT EXISTS idx_care_gaps_encounter ON care_gaps(encounter_id);
CREATE INDEX IF NOT EXISTS idx_care_gaps_open ON care_gaps(status) WHERE status IN ('open','escalated');
CREATE INDEX IF NOT EXISTS idx_care_gaps_deadline ON care_gaps(escalation_deadline) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_care_gaps_family ON care_gaps(family_visible) WHERE family_visible = TRUE;

-- Unique constraint on open gaps per encounter per type prevents duplicate detection
SQL

# ─── WIRING TASK 3: Add BriefingBanner to Clinical Encounter page ──────────
# File to edit: client/src/pages/ClinicalEncounter.tsx (or equivalent)
# Look for the component that renders the encounter page shown in your screenshots
# It likely starts with something like:
#
# export function ClinicalEncounter() {
#   const { encounterId } = useParams();
#   ...
#   return (
#     <div>
#       <h1>Clinical Encounter</h1>
#       ...
#     </div>
#   )
# }
#
# ADD these two imports at the top:

cat << 'ADD_IMPORTS'
import { BriefingBanner, LivingEncounterTimeline } from "@/components/physician/BriefingBanner";
ADD_IMPORTS

# Then add the BriefingBanner JUST AFTER your encounter header and BEFORE
# the chief complaint / PATIENT DEMOGRAPHICS section:

cat << 'ADD_TO_JSX'
{/* PRE-ENCOUNTER BRIEFING — shows above clinical form when dialogue complete */}
<BriefingBanner encounterId={encounterId} />

{/* ... your existing PATIENT DEMOGRAPHICS section ... */}
{/* ... your existing CHIEF COMPLAINT section ... */}

{/* LIVING ENCOUNTER TIMELINE — shows post-visit patient updates at bottom */}
<LivingEncounterTimeline encounterId={encounterId} />
ADD_TO_JSX

# ─── WIRING TASK 4: Add dialogue session restore to AdaptiveDialogueEngine ──
# File to edit: server/dialogue/AdaptiveDialogueEngine.ts
# The current engine creates fresh state — it needs to restore from DB on subsequent calls
# Add a static factory method:

cat << 'ADD_RESTORE'
// Add to AdaptiveDialogueEngine class:

static async fromSession(sessionId: string, channel: DialogueChannel): Promise<AdaptiveDialogueEngine> {
  const session = await db.execute(
    `SELECT * FROM dialogue_sessions WHERE id = $1`,
    [sessionId]
  ).then(r => r.rows[0]);

  if (!session) throw new Error(`Session ${sessionId} not found`);

  const engine = new AdaptiveDialogueEngine(sessionId, channel);

  // Restore state from DB
  engine["clinicalState"] = session.clinical_state_json || {};
  engine["turns"] = session.turns_json || [];
  engine["safetyAlertsTriggered"] = session.safety_alerts || [];

  // Restore which questions have been asked
  const askedIds = (session.turns_json || [])
    .filter((t: any) => t.speaker === "auralyn" && t.questionId)
    .map((t: any) => t.questionId);
  engine["questionsAsked"] = new Set(askedIds);

  // Restore answer log
  engine["answerLog"] = new Map(
    (session.answer_log_json || []).map((log: any) => [log.questionId, log])
  );

  return engine;
}

// Update the POST /:id/respond handler in dialogue.ts to use this:
// const engine = await AdaptiveDialogueEngine.fromSession(session.id, session.channel);
ADD_RESTORE

# ─── WIRING TASK 5: Register complaint packs in resolveComplaintPack() ──────
# File to edit: server/kb/KBEngine.ts (or wherever resolveComplaintPack is defined)
# Add imports and routing:

cat << 'ADD_PACK_ROUTING'
// Add imports at top of KBEngine.ts:
import { assessChestPain } from "./complaintPacks/chest-pain";
import { assessAbdominalPain } from "./complaintPacks/abdominal-pain";
import { assessHeadache } from "./complaintPacks/headache";
import { assessGU } from "./complaintPacks/gu-uti";
import { synthesizePlan } from "./complaintPacks/uri-respiratory";

// Update resolveComplaintPack() to use the new packs:
export function resolveComplaintPack(complaintId: string, state: ClinicalState): TreatmentPlan {
  switch (complaintId) {
    case "chest_pain":
    case "cardio_palpitations": {
      const ekg = state.examFindings?.ekg || { obtained: false, normal: true };
      return assessChestPain(state, ekg);
    }
    case "abdominal_pain":
      return assessAbdominalPain(state);
    case "neuro_headache":
    case "dizziness":
      return assessHeadache(state);
    case "gu_uti_symptoms":
      const ua = state.tests?.ua || { obtained: false };
      return assessGU(state, ua);
    case "sore_throat":
    case "cough":
    case "pulm_shortness_of_breath":
    case "earache":
    case "ent_sinus_pressure":
      return synthesizePlan(state);
    default:
      // Fall back to existing KB entity store lookup
      return resolveFromEntityStore(complaintId, state);
  }
}
ADD_PACK_ROUTING

# ─── WIRING TASK 6: Add BullMQ job for CareIntelligenceEngine ─────────────
# File to edit: server/queues/scheduler.ts (or wherever your BullMQ jobs are defined)
# This runs gap detection every 15 minutes for all active inpatients

cat << 'ADD_SCHEDULER'
// Add to server/queues/scheduler.ts:
import { CareIntelligenceEngine } from "../inpatient/CareIntelligenceEngine";

// Register the care gap detection queue
const careGapQueue = new Queue("care-gap-detection", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// Schedule: every 15 minutes
await careGapQueue.add(
  "scan-all-active-inpatients",
  {},
  { repeat: { cron: "*/15 * * * *" } }
);

// Worker: fetch all active inpatient encounters and run gap detection
new Worker("care-gap-detection", async (job) => {
  const activeEncounters = await db.execute(
    `SELECT encounter_id, patient_id FROM encounters
     WHERE status = 'inpatient' AND discharged_at IS NULL`,
    []
  ).then(r => r.rows);

  const engine = new CareIntelligenceEngine();

  for (const enc of activeEncounters) {
    try {
      // loadChart() fetches from EHR FHIR or internal DB
      const chart = await engine.loadChart(enc.encounter_id);
      await engine.detectGaps(chart);
      await engine.escalateOverdueGaps();
    } catch (err) {
      console.error(`[CareGap] Failed for encounter ${enc.encounter_id}:`, err);
      // Continue to next patient — never let one failure stop the scan
    }
  }
}, { connection: redisConnection, concurrency: 3 });

// Also add to your existing named queues list:
// "care-gap-detection" joins: triage, notification, learning, golden-case,
// auto-healing, audit, ehr-outbound, explanation, webhook, report, metrics
ADD_SCHEDULER

# ─── WIRING TASK 7: Add /care/:shareToken route to frontend router ──────────
# File to edit: client/src/App.tsx or your Wouter router setup
# Add the patient-facing living encounter page:

cat << 'ADD_ROUTE'
// Add import:
import PatientLivingEncounter from "@/pages/PatientLivingEncounter";

// Add route (no auth — token-protected):
<Route path="/care/:shareToken">
  {(params) => <PatientLivingEncounter shareToken={params.shareToken} />}
</Route>

// This page is intentionally unauthenticated — the shareToken IS the authentication.
// The token is a 32-char hex string generated at encounter creation and
// sent to the patient via SMS/WhatsApp at discharge.
ADD_ROUTE

# ─── WIRING TASK 8: Send share token to patient at discharge ───────────────
# File to edit: wherever your discharge workflow is handled
# Add after discharge is confirmed:

cat << 'ADD_DISCHARGE'
// After physician signs discharge:
const shareToken = await db.execute(
  `SELECT share_token FROM patient_summaries WHERE encounter_id = $1`,
  [encounterId]
).then(r => r.rows[0]?.share_token);

if (shareToken && patient.phoneNumber) {
  const visitUrl = `https://yourdomain.com/care/${shareToken}`;

  await twilioClient.messages.create({
    body: `Your visit summary from today is ready. You can view it here and send us updates on how you're feeling: ${visitUrl}`,
    from: process.env.TWILIO_FROM_NUMBER,
    to: patient.phoneNumber,
  });
}
ADD_DISCHARGE

echo ""
echo "============================================================"
echo "WIRING SUMMARY"
echo "============================================================"
echo ""
echo "8 wiring tasks — estimated time in Replit:"
echo ""
echo "Task 1 — Register routes:         15 min"
echo "Task 2 — care_gaps migration:     5 min (run SQL)"
echo "Task 3 — Embed BriefingBanner:    20 min"
echo "Task 4 — Session restore:         30 min"
echo "Task 5 — Complaint pack routing:  20 min"
echo "Task 6 — BullMQ job:              20 min"
echo "Task 7 — Frontend route:          10 min"
echo "Task 8 — Discharge SMS:           15 min"
echo ""
echo "Total estimated wiring time: ~2.5 hours"
echo ""
echo "After wiring, test in this order:"
echo "1. POST /api/dialogue/start with a chest pain encounter → confirm first question returns"
echo "2. POST /api/dialogue/:id/respond with 'chest pain, pressure quality' → confirm extraction"
echo "3. GET /api/encounters/:id/briefing → confirm briefing card generates"
echo "4. Open /encounter in browser → confirm BriefingBanner appears at top"
echo "5. Open /care/test-token → confirm PatientLivingEncounter renders"
echo "6. POST /api/encounters/:id/update with 'I feel worse' → confirm update saved"
echo "7. Run CareIntelligenceEngine.detectGaps() manually → confirm gaps saved to DB"
echo ""
echo "NOT YET STARTED (future sprints):"
echo "- EHR FHIR R4 integration (loadChart() implementation)"
echo "- Inpatient family portal UI"
echo "- Voice channel (Twilio STT/TTS for dialogue)"
echo "- Remaining complaint packs (MSK, derm, psych, pediatric)"
echo "- Physician gap inbox dashboard"
