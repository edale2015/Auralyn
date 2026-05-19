---
name: auralyn-public-data-ingestion
description: Load when adding a new public clinical data source to Auralyn (CDC, openFDA, NIH, USPSTF, WHO, state health departments, etc.) or modifying an existing ingestion source. Triggers on phrases like "ingest from", "new data source", "scheduled fetch", "CDC", "openFDA", "DailyMed", "RxNorm", "USPSTF", "data ingestion", "BullMQ job", "public API".
---

# Adding a Public Data Source to Auralyn

After the I001 framework is in place (`server/ingestion/sources/`), every
new source follows this pattern.

## Decision: is this source appropriate?

**Yes:**
- US federal agencies (CDC, FDA, NIH, USPSTF, AHRQ, CMS) — public domain
- State health department open data portals — usually public domain
- WHO disease outbreak news — free, citable
- NLM resources (DailyMed, RxNorm, MeSH, PubMed) — free, structured

**No:**
- UpToDate, DynaMed, Epocrates premium — paid, copyrighted, ToS prohibits scraping
- Anything behind a login wall
- Anything that requires HTML parsing

## The interface to implement

```typescript
export const <sourceName>: PublicDataSource = {
  id: "<source-id>",
  name: "<Human Name>",
  baseUrl: "<api-base-url>",
  rateLimit: { requests: 240, perSeconds: 60 },
  auth: undefined,

  async fetch(query) { ... },

  normalize(raw): MemoryEntryDraft[] {
    return raw.results.map(item => ({
      key: `<prefix>:<sub-prefix>:<unique-id>`,
      scope: "global",
      content: <human-readable summary>,
      confidence: 0.95,
      verifiedBy: "external_guideline",
      source: `${this.name} ${item.version || item.date}`,
    }));
  },
};
```

## Key naming convention for clinical_memory

Established prefixes:
- `surveillance:respiratory:<state>:<week>` — CDC FluView etc.
- `safety:drug_recall:<rxcui>:<recall_id>` — openFDA recalls
- `safety:drug_alert:<alert_id>` — openFDA safety communications
- `labeling:drug:<rxcui>` — DailyMed SPL
- `preventive:uspstf:<topic_id>` — USPSTF recommendations
- `guideline:<society>:<id>` — published professional society guidelines

## Hard rules

1. **No HTML parsing.**
2. **No PHI in ingested entries.**
3. **Every entry has a `source` field with a citable reference.**
4. **The audit log captures every fetch** (success or failure).
5. **Idempotent sync.** Re-running produces no duplicates.
6. **Rate limit respect.**
