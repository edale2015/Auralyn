---
name: kbIntake gap-skipping (F020)
description: How getNextGapQuestion works, slug mapping pitfalls, and hot-reload cache issue.
---

## Rule
`getNextGapQuestion(complaint, extractedFields, fromIndex)` in `server/conversation/questionSequences.ts` scans forward from `fromIndex`, skipping any question whose field hint is already populated in `extractedFields`. Returns `{ question, nextIndex }` or `null` (all exhausted).

## SLUG_TO_ROUTER must be exhaustive
`kbIntake.ts` has a `SLUG_TO_ROUTER` map converting CC_IDs from `COMPLAINT_REGISTRY.csv` to the short router codes used by `SEQUENCES` in `questionSequences.ts`. If a CC_ID is missing, `slugToRouter` returns the raw slug, `SEQUENCES[slug]` is undefined, and `DEFAULT_QUESTIONS` are used — all with null hints (never skipped).

**Why this was a bug:** `persistent_cough` (the actual matched slug for cough complaints) was not in the original map, so gap-skipping silently fell back to DEFAULT_QUESTIONS and never skipped anything.

**Fix:** Added 80+ mappings covering all known CC_IDs from COMPLAINT_REGISTRY.csv.

## Hot-reload / dynamic-import cache pitfall
The `/api/test/kb-sim` handler at `server/index.ts` uses `await import("./whatsapp/kbIntake")`. In development with `tsx`, file-change hot-reloads update the module registry but NOT the captured reference in the already-running handler. Edits to `kbIntake.ts` only take effect after a **clean process restart** (not just file save / tsx hot-reload). Always call `restart_workflow` after editing `kbIntake.ts` before running `/api/test/kb-sim`.

## How to apply
- Turn 0: `getNextGapQuestion(routerCode0, initKwFields, 0)` — skips fields already extracted from the opening message.
- Turns 1+: `getNextGapQuestion(routerCode, updatedFields, session.questionIndex)` — skips fields answered in any previous turn.
- `session.questionIndex` is set to `gapResult.nextIndex` (not `qIndex + 1`) so it points past the chosen question.
- Safety check (`checkEscalation`) always runs BEFORE the gap question, regardless of scripted phase.
