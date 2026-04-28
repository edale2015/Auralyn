// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — TelemedicineDoctorDashboard.tsx
// Three targeted edits. Do NOT replace the whole file.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// EDIT 1 — ADD IMPORT
// Location: top of file, with existing imports
// ═══════════════════════════════════════════════════════════════════════════════

import { ConversationPanel } from "@/components/ConversationPanel";


// ═══════════════════════════════════════════════════════════════════════════════
// EDIT 2 — EXTEND LOCAL Session TYPE
// Location: wherever the local `type Session` or `interface Session` is defined
// Add these two fields so TypeScript knows about draftReply and status:
// ═══════════════════════════════════════════════════════════════════════════════

// Find your existing Session type and add:
//
//   draftReply?: string                                    ← ADD
//   status:      "active" | "completed" | "discharged"    ← ADD (if not already present)
//
// Example — your type should look like this after the edit:
//
//   type Session = {
//     caseId:          string
//     complaint?:      string
//     checkedSymptoms: string[]
//     differential?:   { diagnosis: string; confidence: number }[]
//     disposition?:    string
//     safetyAlerts:    string[]
//     redFlags:        string[]
//     icdCodes:        { code: string; description: string }[]
//     cptCodes:        { code: string; description: string }[]
//     returnPrecautions: string[]
//     startedAt:       string
//     updatedAt:       string
//     draftReply?:     string           ← NEW
//     status:          "active" | "completed" | "discharged"  ← NEW (or confirm already there)
//   }


// ═══════════════════════════════════════════════════════════════════════════════
// EDIT 3 — ADD "Chat" TAB
// Location: inside SessionDetailPanel (or wherever the right-side Tabs component is)
//
// Find your existing <TabsList> block — it has tabs like:
//   "overview" | "meds" | "codes" | "precautions" | "note" | "discharge"
//
// Step A: Add one <TabsTrigger> to the TabsList:
// ═══════════════════════════════════════════════════════════════════════════════

// In your <TabsList> block, add this trigger as the FIRST tab
// (so the physician sees the conversation immediately on session select):
//
//   <TabsTrigger value="chat" className="text-xs">
//     Chat
//     {selected?.draftReply && (
//       <span className="ml-1 inline-block w-2 h-2 rounded-full bg-purple-500" />
//     )}
//   </TabsTrigger>
//
// The purple dot appears whenever an AI draft reply is waiting for physician approval.


// ═══════════════════════════════════════════════════════════════════════════════
// EDIT 3B — ADD <TabsContent> for "chat"
// Location: after your last existing <TabsContent> block, before closing </Tabs>
// ═══════════════════════════════════════════════════════════════════════════════

// Add this block:
//
//   <TabsContent value="chat" className="mt-3">
//     {selected && (
//       <ConversationPanel caseId={selected.caseId} />
//     )}
//   </TabsContent>


// ═══════════════════════════════════════════════════════════════════════════════
// EDIT 4 — SET "chat" AS DEFAULT TAB (optional but recommended)
// Location: the <Tabs> component opening tag in the right panel
//
// Change:
//   <Tabs defaultValue="overview">
// To:
//   <Tabs defaultValue="chat">
//
// This means when a physician clicks a session, they immediately see the
// conversation + AI draft rather than the overview tab.
// Revert to "overview" if you prefer the clinical summary first.
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY OF ALL FILES CHANGED
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW:   client/src/components/ConversationPanel.tsx
//
// EDIT:  client/src/pages/TelemedicineDoctorDashboard.tsx
//         - Import ConversationPanel
//         - Extend Session type with draftReply? and status
//         - Add "chat" TabsTrigger with purple dot indicator
//         - Add "chat" TabsContent with <ConversationPanel caseId={selected.caseId} />
//         - Optionally set defaultValue="chat" on <Tabs>
//
// NO backend changes needed — all five endpoints already exist:
//   GET  /api/telemed/session/:caseId
//   POST /api/telemed/session/:caseId/doctor-reply
//   PATCH /api/telemed/session/:caseId/draft
//   POST /api/telemed/session/:caseId/generate-draft
//   POST /api/telemed/discharge/:caseId
