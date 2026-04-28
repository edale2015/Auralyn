// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — Dashboard Context Integration
// Three sections. Apply in order.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// PATCH 1 — AuralynCommandInterface.tsx
// Add event listener so DashboardContextPrompt can pre-fill and open the
// command interface programmatically via "Ask agent" button.
//
// Location: inside the useEffect that handles keyboard shortcuts (the one
// with Cmd+K and Escape). Add the third handler shown below.
// ═══════════════════════════════════════════════════════════════════════════════

// FIND this block in AuralynCommandInterface.tsx:
//
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       if ((e.metaKey || e.ctrlKey) && e.key === "k") {
//         e.preventDefault();
//         setIsOpen(prev => !prev);
//       }
//       if (e.key === "Escape") setIsOpen(false);
//     };
//     window.addEventListener("keydown", handler);
//     return () => window.removeEventListener("keydown", handler);
//   }, []);
//
// REPLACE WITH:
//
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       if ((e.metaKey || e.ctrlKey) && e.key === "k") {
//         e.preventDefault();
//         setIsOpen(prev => !prev);
//       }
//       if (e.key === "Escape") setIsOpen(false);
//     };
//
//     // Listen for pre-fill events from DashboardContextPrompt "Ask agent" buttons
//     const prefillHandler = (e: Event) => {
//       const detail = (e as CustomEvent).detail;
//       if (detail?.prefill) {
//         setInput(detail.prefill);
//         setIsOpen(true);
//         // Focus after open animation
//         setTimeout(() => inputRef.current?.focus(), 80);
//       }
//     };
//
//     window.addEventListener("keydown", handler);
//     window.addEventListener("auralyn:open-command", prefillHandler);
//     return () => {
//       window.removeEventListener("keydown", handler);
//       window.removeEventListener("auralyn:open-command", prefillHandler);
//     };
//   }, []);


// ═══════════════════════════════════════════════════════════════════════════════
// PATCH 2 — Four dashboard page insertions
// Add DashboardContextPrompt to the top of each dashboard page.
// Import and insert before the summary bar / data content in each file.
// ═══════════════════════════════════════════════════════════════════════════════

// ── 2A: FollowUpMonitoringDashboard.tsx ──────────────────────────────────────
//
// ADD IMPORT at top:
//   import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
//
// INSERT after the page header <div> and before the summary bar grid.
// Find the line with the three-column summary bar (escalated/active/completed grid)
// and insert this BEFORE it:
//
//   <DashboardContextPrompt
//     context="followup"
//     data={{
//       escalated: escalated.length,
//       active:    active.length,
//       completed: completed.length,
//     }}
//   />
//
// The escalated/active/completed variables are already computed in the component.


// ── 2B: ReviewQueueV2.tsx (or whatever your queue page is named) ──────────────
//
// ADD IMPORT at top:
//   import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
//
// INSERT after the page header, before the case list.
// You will need to compute the counts from your existing cases array.
// Add these derived values near your existing cases list:
//
//   const urgentCount = cases.filter(c =>
//     ["High-Risk ED Diversion", "Urgent Sync Required", "Pediatric Urgent"]
//       .includes(c.caseType ?? "")
//   ).length;
//   const asyncCount = cases.filter(c => c.caseType === "Async Safe").length;
//
// Then insert:
//   <DashboardContextPrompt
//     context="queue"
//     data={{
//       urgent: urgentCount,
//       async:  asyncCount,
//       total:  cases.length,
//     }}
//   />


// ── 2C: ProviderFeedbackDashboard.tsx ─────────────────────────────────────────
//
// ADD IMPORT at top:
//   import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
//
// INSERT after the page header <div>, before the Grade card.
// The summary variable is already fetched via summaryQuery.
// Insert this AFTER the isLoading check (so it renders with real data):
//
//   {summary && (
//     <DashboardContextPrompt
//       context="performance"
//       data={{
//         grade:        summary.grade,
//         overrideRate: summary.overrideRate,
//         totalCases:   summary.totalCases,
//       }}
//     />
//   )}


// ── 2D: TelemedicineDoctorDashboard.tsx ───────────────────────────────────────
//
// ADD IMPORT at top:
//   import { DashboardContextPrompt } from "@/components/DashboardContextPrompt";
//
// INSERT after the page/panel header, before the session list.
// The sessions array is already available from your useQuery.
// Add this derived count near the top of the component body:
//
//   const pendingDraftCount = sessions.filter(s => s.draftReply?.trim()).length;
//
// Then insert before the session list:
//
//   <DashboardContextPrompt
//     context="telemed"
//     data={{
//       active:        sessions.filter(s => s.status === "active").length,
//       pendingDrafts: pendingDraftCount,
//     }}
//   />


// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW FILE:  client/src/components/DashboardContextPrompt.tsx
//
// EDITED FILES:
//   client/src/components/AuralynCommandInterface.tsx
//     → Added auralyn:open-command event listener for pre-fill
//
//   client/src/pages/FollowUpMonitoringDashboard.tsx
//     → DashboardContextPrompt inserted with live escalated/active counts
//
//   client/src/pages/ReviewQueueV2.tsx (or equivalent)
//     → DashboardContextPrompt inserted with urgent/async/total counts
//
//   client/src/pages/ProviderFeedbackDashboard.tsx
//     → DashboardContextPrompt inserted with grade/overrideRate/totalCases
//
//   client/src/pages/TelemedicineDoctorDashboard.tsx
//     → DashboardContextPrompt inserted with active/pendingDrafts counts
//
// NO backend changes needed.
// NO new routes needed.
// NO schema changes needed.
// The command interface already handles all intents these prompts generate.
