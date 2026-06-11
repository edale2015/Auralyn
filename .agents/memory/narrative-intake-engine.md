---
name: Narrative Intake Engine
description: Design decisions and gotchas for the two-pass free-text clinical intake NLP engine
---

# Narrative Intake Engine

## Architecture decision: hybrid GPT + deterministic matching

**Rule:** Pass 1 uses GPT-4o-mini to extract clinical entities + detect complaint. Pass 2 uses a deterministic entity-based regex matcher — NOT a second LLM call.

**Why:** Initial design used GPT for Pass 2 (question matching). Two problems:
1. `response_format: { type: "json_object" }` forces GPT to wrap arrays in an object with an unpredictable key — the `obj.matches ?? obj.results ?? obj.questions ?? []` fallback chain was unreliable and returned 0 matches.
2. 42-question prompts took 15s per request.

Switching Pass 2 to a deterministic matcher reduced latency from ~17s to ~2s (88% faster) and improved reliability. Pre-fill rate: ~38% on chest pain (16/42 questions).

**How to apply:** Entity extraction must come first (Pass 1 GPT call). Pass 2 matches entity fields against question text using regex patterns in `matchQuestionToEntities()`. The function returns the first matching pattern — ORDER MATTERS in the if-chain (duration before onset before severity before quality, etc.).

## GPT entity extraction inconsistency

GPT-4o-mini occasionally puts associated symptoms (sweating, nausea) in the `aggravating` field instead of `associated`. This causes cosmetic value-display issues but the questions ARE still correctly pre-filled (the aggravating field match fires with the right yes/no answer). Not a critical bug — if refinement needed, tighten the Pass 1 prompt for each field.

## Route registration

All three endpoints at `/api/complaint-test-lab/narrative-intake`, `/narrative-run`, `/intake-prompts` — added BEFORE `export default router` in `complaintTestLab.routes.ts`. The server requires restart after any route file changes (tsx hot reload doesn't always catch route additions).

## OpenAI instantiation pattern (project-wide)

```typescript
import OpenAI from "openai";
const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
```
