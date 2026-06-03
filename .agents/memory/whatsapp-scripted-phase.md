---
name: WhatsApp scripted phase (F017/T018)
description: How kbIntake.ts routes early turns to scripted questions vs GPT, and how T018 listen-first ack works.
---

## Rule
For the first `MIN_QUESTIONS_BEFORE_DISPOSITION` (= 4) turns of a WhatsApp encounter, `kbIntake.ts` sends pre-written questions from `questionSequences.ts` — **no LLM**. GPT (`extractAndRespond`) is only called for extraction on free-form replies (>4 words), and its generated *response text is discarded* — only `extracted` is used. The next scripted Q is always the send payload.

After turn index 3 the GPT phase starts normally (full `extractAndRespond` call, response used as-is).

## Why
`extractAndRespond()` in `conversationalEngine.ts` was called on every turn including turn 0, adding ~2–3 s of LLM latency to every single patient message in the early interview phase.

## How to apply
- **Turn 0 (first message)**: `keywordExtract(slug, rawText, null, true)` → `getNextQuestion(routerCode, 0)` → send. Set `session.questionIndex = 1`. No LLM.
- **Turns 1–2 (scripted phase, `qIndex < MIN_QUESTIONS_BEFORE_DISPOSITION`)**: Check `wordCount > 4`. If yes, call `extractAndRespond` extraction-only (discard `.response`). If no, call `keywordExtract`. Build reply as `buildListenAck(extracted) + getNextQuestion(routerCode, qIndex)`. Increment `questionIndex`.
- **Turns 3+ (GPT phase)**: Full `extractAndRespond` call; use `.response` directly.
- **Safety always runs**: `checkEscalation` and `isComplete` are called every turn regardless of phase.

## Key identifiers
- `session.questionIndex?: number` on `HotSession` — tracks current scripted Q index.
- `SLUG_TO_ROUTER: Record<string,string>` in `kbIntake.ts` — converts engine slugs to `questionSequences.ts` routerCodes.
- `buildListenAck(extracted)` — deterministic ack prefix from keyword-extracted fields.
- `keywordExtract` exported from `conversationalEngine.ts` (public wrapper around `_keywordExtract`).
- `MIN_QUESTIONS_BEFORE_DISPOSITION` exported from `questionSequences.ts`.
