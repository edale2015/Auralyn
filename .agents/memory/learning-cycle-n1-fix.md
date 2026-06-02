---
name: Learning cycle N+1 fix
description: runLearningCycle() had N+1 DB queries; was also called on every patient encounter.
---

## Rule
`runLearningCycle()` in `server/engines/unifiedOutcomeLearning.ts` must batch DB operations: one SELECT for all weights upfront, compute deltas in memory, then one UPDATE per unique diagnosis.

**Why:** The original code did SELECT + UPDATE for each of 200 rows = 400+ queries per cycle. Worse, `asyncWorkerInit.ts` called `runLearningCycle()` on EVERY patient encounter (every "learning" job), so cycles ran every 2-3 seconds → constant 400+ query storm → connection pool exhausted → 29-second DB latency.

**How to apply:**
- `asyncWorkerInit.ts` "learning" handler: only call `recordOutcome()`, never `runLearningCycle()`. The periodic autonomous loop (every 5 min) handles the cycle.
- `runLearningCycle()`: load all weights in ONE query, accumulate deltas in a Map, then one UPDATE per unique diagnosis key — not one per outcome row.
