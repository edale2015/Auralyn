-- ─────────────────────────────────────────────────────────────────────────────
-- WIN 20 — DATABASE MIGRATION
-- Run in Replit PostgreSQL before starting the server with Win 20 code
-- ─────────────────────────────────────────────────────────────────────────────

-- Table: clinical_document_indexes
-- Stores the hierarchical tree index for each indexed document.
-- The tree_json column contains the full DocumentIndexNode tree.
CREATE TABLE IF NOT EXISTS clinical_document_indexes (
  id           serial PRIMARY KEY,
  document_id  text NOT NULL UNIQUE,
  title        text NOT NULL,
  doc_type     text NOT NULL,   -- 'clinical_guideline' | 'prior_auth_policy' | 'formulary' | 'protocol'
  source       text NOT NULL,
  total_pages  integer DEFAULT 0,
  indexed_at   text NOT NULL,
  tree_json    jsonb NOT NULL,
  created_at   timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doc_indexes_type ON clinical_document_indexes (doc_type);
CREATE INDEX IF NOT EXISTS idx_doc_indexes_indexed_at ON clinical_document_indexes (indexed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- WIRING INSTRUCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- NEW FILES:
--   server/retrieval/clinicalDocumentIndexer.ts   ← Core PageIndex implementation
--   server/integrations/ehr/priorAuthWithIndex.ts ← Enhanced prior auth
--   server/retrieval/guidelineGrounding.ts         ← KB validator integration

-- NO PIPELINE CHANGES REQUIRED
-- These are additive — they enhance existing subsystems without modifying the
-- clinical pipeline. Nothing breaks if the document indexes are empty (the
-- systems fall back gracefully to existing behavior).

-- REGISTER ROUTES IN server/index.ts:

-- import { documentIndexRouter } from "./routes/documentIndex.routes";
-- app.use(documentIndexRouter);

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENT INDEX ROUTES (create server/routes/documentIndex.routes.ts)
-- ─────────────────────────────────────────────────────────────────────────────

-- POST /api/documents/index-guideline
--   Body: { guidelineId, name, organization, year, documentText, totalPages, complaintSlugs }
--   Triggers: guidelineGrounding.indexGuideline()
--   Auth: admin only

-- POST /api/documents/index-prior-auth
--   Body: { payerId, policyName, documentText, totalPages, effectiveDate }
--   Triggers: priorAuthWithIndex.indexPayerPolicy()
--   Auth: admin only

-- GET /api/documents/grounding-status
--   Returns: getGroundingStatus() — which guidelines are indexed, which complaints covered
--   Auth: physician + admin

-- POST /api/documents/query
--   Body: { documentId, query }
--   Returns: DocumentQueryResult with answer + citations + navigation path
--   Auth: physician + admin

-- POST /api/prior-auth/enhanced
--   Body: PriorAuthInput
--   Returns: PriorAuthResult (tries index first, falls back to skeleton)
--   Auth: physician + admin

-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO ONBOARD THE FIRST GUIDELINE
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Get the PDF text from the clinical guideline
--   Use a PDF-to-text library (pdf-parse or similar) to extract text.
--   Most ACEP, AAP, AHA guidelines are freely available.

-- Step 2: Call the index endpoint
-- POST /api/documents/index-guideline
-- {
--   "guidelineId":    "acep_chest_pain_2025",
--   "name":           "ACEP Clinical Policy: Chest Pain 2025",
--   "organization":   "ACEP",
--   "year":           2025,
--   "documentText":   "[full extracted PDF text]",
--   "totalPages":     45,
--   "complaintSlugs": ["chest_pain", "shortness_of_breath"]
-- }

-- Step 3: Verify indexing via grounding status
-- GET /api/documents/grounding-status
-- Should show: indexedGuidelines: 1, coveredComplaints: ["chest_pain", "shortness_of_breath"]

-- Step 4: Test a query
-- POST /api/documents/query
-- {
--   "documentId": "acep_chest_pain_2025",
--   "query": "What is the recommended disposition for low-risk chest pain?"
-- }
-- Should return: answer with page citations + navigation path

-- Step 5: The KB validator and adversarial review automatically pick it up
-- The next nightly KB validation will use the indexed guideline to ground
-- rule challenges in actual ACEP language, not just LLM training knowledge.

-- ─────────────────────────────────────────────────────────────────────────────
-- WIRE TO COMMAND INTERFACE (⌘K)
-- ─────────────────────────────────────────────────────────────────────────────

-- In command.routes.ts, add GUIDELINE_QUERY intent:
-- "what does ACEP say about chest pain in elderly"
-- "does United require prior auth for MRI Brain"
-- "show guideline grounding status"

-- Example executor:
-- case "GUIDELINE_QUERY": {
--   const { queryGuidelines } = await import("../retrieval/guidelineGrounding");
--   const results = await queryGuidelines(intent.complaintSlug, intent.rawQuery);
--   const found = results.filter(r => r.found);
--   result = {
--     actions: [{ type: "GUIDELINE_QUERY", label: `Guideline search — ${found.length} results`, status: "complete",
--       result: found.length > 0 ? found[0].citation : "No indexed guidelines found" }],
--     summary: found.length > 0
--       ? `**${found[0].organization} (${found[0].citation}):**\n${found[0].answer}`
--       : "No indexed guidelines cover this complaint yet. Upload a guideline PDF via /api/documents/index-guideline.",
--   };
--   break;
-- }

-- ─────────────────────────────────────────────────────────────────────────────
-- RESEARCH RADAR: ADD REC 7 — CLINICAL GUIDELINE AUTO-INDEXING
-- ─────────────────────────────────────────────────────────────────────────────

-- The Research Radar currently monitors Rec 5 and Rec 6.
-- Add a third target to researchRadar.ts RESEARCH_TARGETS:

-- {
--   id: "rec7_guideline_auto_indexing",
--   name: "Recommendation 7 — Automated Clinical Guideline Indexing",
--   description: "Automated pipelines that detect new guideline publications (ACEP, AAP, AHA, CDC) and trigger indexing without manual upload. PageIndex MCP protocol would enable this.",
--   clinicalValue: "KB rules always grounded in latest guidelines without manual curation.",
--   auralynaImpact: "guidelineGrounding.ts auto-discovers and indexes new guidelines on publication.",
--   readinessScore: 1,
--   searchQueries: [
--     "PageIndex MCP clinical guidelines auto-indexing 2026",
--     "ACEP AAP guidelines API automated ingestion",
--     "clinical guideline change detection automated",
--   ],
--   readinessSignals: [
--     "PageIndex MCP server released for automated document discovery",
--     "ACEP/AAP/AHA releasing structured guideline APIs",
--     "Medical society guideline change notification API",
--   ],
--   implementationNotes: "Wire into guidelineGrounding.indexGuideline(). When the auto-discovery API is available, it calls this function on new publication detection.",
--   estimatedBuildTime: "1-2 days once API available",
-- }
