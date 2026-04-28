// ─────────────────────────────────────────────────────────────────────────────
// Win 8 — Complete Apply Instructions
// Read this file top to bottom before making any changes.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — NEW FILES (download and place)
// ═══════════════════════════════════════════════════════════════════════════════
//
//   shared/followUpSchema.ts                    ← 3 new Postgres tables
//   server/followup/followUpProtocolSeeds.ts    ← 10 protocol definitions
//   server/followup/followUpService.ts          ← enrollment, scheduling, response processing
//   server/routes/followUp.routes.ts            ← REST API (3 endpoints)
//   client/src/pages/FollowUpMonitoringDashboard.tsx  ← monitoring UI


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — DATABASE MIGRATION
// Run this ONCE to create the three new tables.
// Use Drizzle's push or generate a migration file.
// ═══════════════════════════════════════════════════════════════════════════════

// Option A — Drizzle push (dev only, safe on empty tables):
//   npx drizzle-kit push:pg
//
// Option B — generate SQL migration:
//   npx drizzle-kit generate:pg
//   then apply the generated SQL file
//
// The three new tables are:
//   follow_up_protocols
//   follow_up_enrollments
//   follow_up_responses


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — SEED PROTOCOLS
// Run once after migration to populate follow_up_protocols table.
// Create this file and run it:
// ═══════════════════════════════════════════════════════════════════════════════

// File: server/followup/seedProtocols.ts
//
// import { db }                        from "../db";
// import { followUpProtocols }         from "../../shared/followUpSchema";
// import { FOLLOW_UP_PROTOCOL_SEEDS }  from "./followUpProtocolSeeds";
//
// async function seed() {
//   console.log("Seeding follow-up protocols...");
//   for (const seed of FOLLOW_UP_PROTOCOL_SEEDS) {
//     await db.insert(followUpProtocols).values({
//       complaintSlug:        seed.complaintSlug,
//       name:                 seed.name,
//       scheduleDays:         seed.scheduleDays,
//       questions:            seed.questions,
//       escalationThreshold:  seed.escalationThreshold,
//       active:               true,
//     }).onConflictDoNothing();
//   }
//   console.log(`Seeded ${FOLLOW_UP_PROTOCOL_SEEDS.length} protocols.`);
//   process.exit(0);
// }
// seed().catch(console.error);
//
// Run with: npx ts-node server/followup/seedProtocols.ts


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — server/index.ts: Register router + worker
// Add these two blocks in server/index.ts
// ═══════════════════════════════════════════════════════════════════════════════

// IMPORT (top of file with other route imports):
//   import { followUpRouter }          from "./routes/followUp.routes";
//   import { registerFollowUpWorker }  from "./followup/followUpService";

// REGISTER ROUTER (with other app.use() calls):
//   app.use(followUpRouter);

// REGISTER WORKER (after server starts listening, fire-and-forget):
//   registerFollowUpWorker().catch(console.error);


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — shared/schema.ts: Export new schema
// Add one line at the bottom of shared/schema.ts:
// ═══════════════════════════════════════════════════════════════════════════════

//   export * from "./followUpSchema";


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 — review.routes.ts: Auto-enroll at case approval
// Inside POST /api/review/case/:caseId handler,
// AFTER the existing discharge WhatsApp send block (Win 1),
// BEFORE res.json()
// ═══════════════════════════════════════════════════════════════════════════════

// ADD IMPORT at top:
//   import { enrollInFollowUp } from "../followup/followUpService";

// ADD BLOCK in handler:
//
//   if (status === "APPROVED" || status === "SIGNED_OFF") {
//     const followUpDoc = doc ?? await getCase(caseId);
//     const phone       = followUpDoc?.source?.threadId;
//     const slug        = followUpDoc?.complaint?.slug ?? followUpDoc?.complaint;
//     const isWhatsApp  = followUpDoc?.source?.channel === "whatsapp";
//
//     if (isWhatsApp && phone && slug) {
//       enrollInFollowUp({
//         caseId,
//         complaintSlug:  slug,
//         patientPhone:   phone,
//         patientName:    followUpDoc?.answers?.structured?.name ?? "Patient",
//         physicianId:    reviewer?.id ?? req.user?.id,
//       }).catch((err: Error) =>
//         console.error("[Review] Follow-up enrollment failed", { caseId, err: err.message })
//       );
//     }
//   }


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 — Twilio webhook: Wire inbound responses
// In your existing WhatsApp inbound webhook handler,
// add this call AFTER you process the message for triage:
// ═══════════════════════════════════════════════════════════════════════════════

// import { processPatientResponse } from "../followup/followUpService";
//
// // Inside the inbound webhook handler, after existing triage logic:
// await processPatientResponse(inboundFrom, inboundBody).catch((err: Error) =>
//   console.error("[WhatsApp] Follow-up response processing failed", err.message)
// );
//
// The function is a no-op if the sender has no active enrollment — safe to call always.


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 8 — Frontend: Register route + add nav link
// ═══════════════════════════════════════════════════════════════════════════════

// In App.tsx / router file:
//   import FollowUpMonitoringDashboard from "@/pages/FollowUpMonitoringDashboard";
//   <Route path="/follow-up-monitoring" component={FollowUpMonitoringDashboard} />

// In clinical nav:
//   <Link to="/follow-up-monitoring">Follow-Up Monitoring</Link>


// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE FILE LIST
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW FILES:
//   shared/followUpSchema.ts
//   server/followup/followUpProtocolSeeds.ts
//   server/followup/followUpService.ts
//   server/followup/seedProtocols.ts          (create manually from Step 3 above)
//   server/routes/followUp.routes.ts
//   client/src/pages/FollowUpMonitoringDashboard.tsx
//
// EDITED FILES:
//   shared/schema.ts                          → export * from "./followUpSchema"
//   server/index.ts                           → router + worker registration
//   server/routes/review.routes.ts            → auto-enroll import + block
//   server/routes/whatsapp.routes.ts          → processPatientResponse call
//   client/src/App.tsx                        → route registration
//   client/src/[nav component]               → Follow-Up Monitoring link
