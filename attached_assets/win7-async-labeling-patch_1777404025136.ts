// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — Win 7: Async Case-Type Labeling
// Four targeted edits across two files + two new files already created.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// NEW FILES (already downloaded)
// ═══════════════════════════════════════════════════════════════════════════════
//
//   server/services/caseTypeClassifier.ts   ← deterministic classifier + Firestore write-back
//   client/src/components/CaseTypePill.tsx  ← pill component for queue cards


// ═══════════════════════════════════════════════════════════════════════════════
// BACKEND PATCH — review.routes.ts (or caseService.ts)
// Location: inside GET /api/review/queue handler, after `cases` is fetched
//
// ADD THESE TWO IMPORTS at the top of review.routes.ts:
// ═══════════════════════════════════════════════════════════════════════════════

import { classifyAndPersist } from "../services/caseTypeClassifier";
// You also need your Firestore case update function — whatever updates a CaseDoc field.
// It is likely already imported. Look for: updateCase, setCaseField, patchCase, or similar.
// If the function is called e.g. `updateCase(caseId, patch)`, use that directly.
// If it doesn't exist yet, add this minimal wrapper near your other Firestore helpers:
//
//   async function patchCaseDoc(caseId: string, patch: Record<string, unknown>) {
//     await db.collection("cases").doc(caseId).update(patch);
//   }


// ═══════════════════════════════════════════════════════════════════════════════
// BACKEND PATCH — GET /api/review/queue handler
// Location: after `cases = await listReviewQueue(...)`, before `res.json(cases)`
//
// Replace:
//   res.json(cases)
//
// With:
// ═══════════════════════════════════════════════════════════════════════════════

// Enrich each case with caseType — classify missing ones fire-and-forget
const enriched = cases.map((c: any) => {
  if (c.caseType) {
    // Already classified — return as-is with pending=false
    return { ...c, caseTypePending: false };
  }
  // Not yet classified — trigger async classification and return pending=true
  // classifyAndPersist writes back to Firestore without blocking the response
  classifyAndPersist(
    c.caseId,
    c,
    patchCaseDoc   // ← substitute your actual Firestore update function name here
  ).catch(() => {
    // Classification failure is non-fatal — card shows "Classifying…" until next poll
  });
  return { ...c, caseTypePending: true };
});

res.json(enriched);

// Result: first time a case is seen → caseTypePending: true → card shows skeleton.
// On next queue poll (SSE push or 15s refetch) → caseType is set → pill renders.
// Subsequent polls → caseType already present → no classifier call → fast path.


// ═══════════════════════════════════════════════════════════════════════════════
// SSE EMITTER PATCH (if queue uses SSE push instead of REST polling)
// Location: wherever your SSE emitter calls listReviewQueue and pushes to clients
//
// Apply the same enrichment block above to the SSE payload before emit.
// The pattern is identical — wrap the cases array, fire-and-forget classify.
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// FRONTEND PATCH 1 — Extend CaseSnapshot type
// Location: wherever the CaseSnapshot or CaseDoc type is defined in the frontend
//           (likely shared/types.ts or inside ReviewQueue*.tsx)
//
// Add two fields:
// ═══════════════════════════════════════════════════════════════════════════════

// caseType?:        string    // e.g. "Async Safe", "Urgent Sync Required"
// caseTypePending?: boolean   // true while classifier is running
// caseTypeMeta?: {
//   label:     string
//   asyncSafe: boolean
//   color:     string
//   priority:  number
// }


// ═══════════════════════════════════════════════════════════════════════════════
// FRONTEND PATCH 2 — Add CaseTypePill to CaseSnapshotCard
// Location: inside CaseSnapshotCard component rendering
//
// ADD IMPORT at top of CaseSnapshotCard file:
// ═══════════════════════════════════════════════════════════════════════════════

// import { CaseTypePill } from "@/components/CaseTypePill";

// ADD PILL in the card body — best placement is below the complaint label
// and above or beside the disposition badge row.
// Find the complaint label render and add immediately after it:
//
//   <CaseTypePill
//     label={c.caseType}
//     pending={c.caseTypePending}
//     color={c.caseTypeMeta?.color}
//   />
//
// That's the only visual change to the card — one pill, no layout changes.


// ═══════════════════════════════════════════════════════════════════════════════
// FRONTEND PATCH 3 — Async filter in the queue (optional but high value)
// Location: ReviewQueueV2 state-filter bar (where the NEEDS_REVIEW dropdown lives)
//
// Add a filter button alongside the existing state filter:
//
//   <button
//     onClick={() => setAsyncOnly(prev => !prev)}
//     className={`text-xs px-2 py-1 rounded border ${
//       asyncOnly
//         ? "bg-green-600 text-white border-green-600"
//         : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
//     }`}
//   >
//     {asyncOnly ? "● Async only" : "All cases"}
//   </button>
//
// Add the filter state:
//   const [asyncOnly, setAsyncOnly] = useState(false);
//
// Apply to the cases list before rendering cards:
//   const displayCases = asyncOnly
//     ? cases.filter(c => c.caseType === "Async Safe")
//     : cases;
//
// This lets the physician batch-review all "Async Safe" cases (UTIs, pink eye,
// refills) in one focused session, separate from complex urgent cases.
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW:   server/services/caseTypeClassifier.ts
// NEW:   client/src/components/CaseTypePill.tsx
//
// EDIT:  server/routes/review.routes.ts
//         - Import classifyAndPersist
//         - Enrich cases array in GET /api/review/queue before res.json()
//         - Apply same enrichment to SSE emitter if queue uses SSE
//
// EDIT:  client/src/[CaseSnapshot type file]
//         - Add caseType?, caseTypePending?, caseTypeMeta? fields
//
// EDIT:  client/src/components/CaseSnapshotCard.tsx
//         - Import CaseTypePill
//         - Add <CaseTypePill> after complaint label
//
// EDIT:  client/src/pages/ReviewQueueV2.tsx (optional)
//         - Add asyncOnly filter state
//         - Add "Async only" toggle button
//         - Filter displayCases when asyncOnly is true
//
// NO schema migration needed — caseType lives in Firestore CaseDoc (schema-less).
// NO new backend routes needed — classifier runs inside existing queue handler.
