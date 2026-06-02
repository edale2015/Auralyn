---
name: Registry failure backoff
description: Missing Google Sheet tabs cause retry storms — must cache failures with a backoff TTL.
---

## Rule
When `loadTable()` in `server/data/registry.ts` fails to fetch a Sheet tab (e.g. "Unable to parse range"), it MUST set `FAILURE_BACKOFF` for 5 minutes so subsequent calls return `[]` immediately instead of hitting the Sheets API again.

**Why:** `SCORING_SYSTEMS` and `CARDS_MODIFIER_MASTER` tabs don't exist in the production Sheet. Without the backoff, every call to `getTable()` re-fetches and fails — hundreds of failing HTTP requests per minute → Google Sheets API gets hammered → event loop blocked 36 seconds → DB latency spikes to 32,000ms.

**How to apply:** The backoff is already implemented in `server/data/registry.ts` via the `FAILURE_BACKOFF` Map. If adding a new table config that might not exist, ensure it goes through `loadTable()` (all registered tables do). Clear the backoff by calling `invalidateTable()` once the sheet tab is created.
