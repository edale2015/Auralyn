-- ─────────────────────────────────────────────────────────────────────────────
-- WIN 22 DATABASE MIGRATION
-- Run before starting server with Win 22 code
-- ─────────────────────────────────────────────────────────────────────────────

-- Pathway drafts table — stores AI-drafted pathways pending physician review
-- Nothing in this table is used clinically until status = 'approved'
CREATE TABLE IF NOT EXISTS pathway_drafts (
  id               serial PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  drafted_at       text NOT NULL,
  validation_score integer DEFAULT 0,
  draft_json       jsonb NOT NULL,
  review_items     jsonb DEFAULT '[]',
  status           text NOT NULL DEFAULT 'pending_physician_review',
  approved_by      text,
  approved_at      text,
  rejection_reason text,
  created_at       timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Index for status queries (pending review queue)
CREATE INDEX IF NOT EXISTS idx_pathway_drafts_status ON pathway_drafts (status);
CREATE INDEX IF NOT EXISTS idx_pathway_drafts_score  ON pathway_drafts (validation_score);

-- Approved pathways table — only physician-approved pathways load here
CREATE TABLE IF NOT EXISTS clinical_pathways (
  id              serial PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  system          text NOT NULL,
  acuity_class    text NOT NULL,
  pathway_json    jsonb NOT NULL,
  validation_score integer DEFAULT 0,
  approved_by     text NOT NULL,
  approved_at     text NOT NULL,
  version         integer DEFAULT 1,
  active          boolean DEFAULT true,
  created_at      timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clinical_pathways_slug   ON clinical_pathways (slug);
CREATE INDEX IF NOT EXISTS idx_clinical_pathways_system ON clinical_pathways (system);
CREATE INDEX IF NOT EXISTS idx_clinical_pathways_active ON clinical_pathways (active);


-- ─────────────────────────────────────────────────────────────────────────────
-- WIN 22 WIRING INSTRUCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- NEW FILES:
--   server/clinical/pathwayCompletionEngine.ts  ← AI drafting engine
--   client/src/pages/PhysicianPathwayReview.tsx ← Review dashboard

-- NEW ROUTES to add to server/index.ts or a new pathwayRoutes file:

/*
import { completePathwayDraft, runBatchCompletion } from "./clinical/pathwayCompletionEngine";

// Generate AI draft for a single pathway (physician triggers this)
app.post("/api/clinical/pathways/complete-draft", requireReviewAuth, async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "slug required" });

  // Load existing partial pathway if available
  const existing = await db.execute(sql`
    SELECT pathway_json FROM clinical_pathways WHERE slug = ${slug}
  `).catch(() => ({ rows: [] }));

  const partialPathway = existing.rows[0]
    ? JSON.parse((existing.rows[0] as any).pathway_json)
    : { slug, displayName: slug.replace(/_/g, " ") };

  // Fire async — returns immediately, draft appears in pending queue
  completePathwayDraft({ partialPathway }).catch(console.error);

  res.json({ ok: true, message: `Draft generation started for ${slug}. Check pending review queue.` });
});

// Get pending review queue
app.get("/api/clinical/pathways/pending-review", requireReviewAuth, async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT slug, display_name, drafted_at, validation_score, review_items, status, draft_json
    FROM pathway_drafts
    WHERE status = 'pending_physician_review'
    ORDER BY validation_score DESC
    LIMIT 50
  `);

  const drafts = (rows.rows as any[]).map(r => ({
    slug:                    r.slug,
    displayName:             r.display_name,
    draftedAt:               r.drafted_at,
    validationScore:         r.validation_score,
    requiresPhysicianReview: JSON.parse(r.review_items ?? "[]"),
    status:                  r.status,
    draft:                   JSON.parse(r.draft_json),
  }));

  res.json({ drafts, count: drafts.length });
});

// Approve a draft — loads to clinical_pathways KB
app.post("/api/clinical/pathways/:slug/approve", requireReviewAuth, async (req, res) => {
  const { slug }      = req.params;
  const physicianId   = req.user?.id;

  if (!physicianId || physicianId === "system") {
    return res.status(403).json({ error: "Physician actor required for pathway approval" });
  }

  // Get the draft
  const draftRow = await db.execute(sql`
    SELECT draft_json, validation_score FROM pathway_drafts WHERE slug = ${slug}
  `);

  if (!draftRow.rows[0]) return res.status(404).json({ error: "Draft not found" });

  const draft      = JSON.parse((draftRow.rows[0] as any).draft_json);
  const score      = (draftRow.rows[0] as any).validation_score;

  if (score < 80) {
    return res.status(400).json({ error: `Validation score ${score}/100 is below minimum 80 for KB loading` });
  }

  // Load to clinical KB
  await db.execute(sql`
    INSERT INTO clinical_pathways (
      slug, display_name, system, acuity_class, pathway_json,
      validation_score, approved_by, approved_at, version, active
    ) VALUES (
      ${slug}, ${draft.displayName}, ${draft.system ?? "general"},
      ${draft.acuityClass ?? "routine"}, ${JSON.stringify(draft)},
      ${score}, ${physicianId}, ${new Date().toISOString()}, 1, true
    )
    ON CONFLICT (slug) DO UPDATE SET
      pathway_json     = ${JSON.stringify(draft)},
      validation_score = ${score},
      approved_by      = ${physicianId},
      approved_at      = ${new Date().toISOString()},
      version          = clinical_pathways.version + 1,
      updated_at       = CURRENT_TIMESTAMP
  `);

  // Update draft status
  await db.execute(sql`
    UPDATE pathway_drafts
    SET status = 'approved', approved_by = ${physicianId}, approved_at = ${new Date().toISOString()}
    WHERE slug = ${slug}
  `);

  // Audit event
  await appendAuditEvent({
    actor:      physicianId,
    action:     "CLINICAL_PATHWAY_APPROVED",
    entityId:   slug,
    entityType: "complaint_pathway",
    details:    { validationScore: score, version: 1 },
  });

  res.json({ ok: true, message: `${slug} approved and loaded to clinical KB` });
});

// Reject a draft
app.post("/api/clinical/pathways/:slug/reject", requireReviewAuth, async (req, res) => {
  const { slug }   = req.params;
  const { reason } = req.body;
  const physicianId = req.user?.id;

  await db.execute(sql`
    UPDATE pathway_drafts
    SET status = 'rejected', rejection_reason = ${reason ?? "No reason provided"},
        approved_by = ${physicianId}, approved_at = ${new Date().toISOString()}
    WHERE slug = ${slug}
  `);

  await appendAuditEvent({
    actor:      physicianId ?? "system",
    action:     "CLINICAL_PATHWAY_REJECTED",
    entityId:   slug,
    entityType: "complaint_pathway",
    details:    { reason: reason?.slice(0, 200) },
  });

  res.json({ ok: true });
});
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- FRONTEND WIRING (App.tsx)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add route:
-- <Route path="/pathway-review" component={PhysicianPathwayReview} />

-- Add nav link in physician section:
-- <Link to="/pathway-review">Pathway Review</Link>

-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO USE — WORKFLOW FOR BUILDING OUT 230 PATHWAYS
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 1: Export your Google Sheets
-- For each of your 23 system sheets:
--   File → Download → CSV
-- Save as: sheets/cardiovascular.csv, sheets/respiratory.csv, etc.

-- STEP 2: Run the sheet migrator for each system
-- npx tsx server/clinical/sheetMigrator.ts \
--   --csv ./sheets/cardiovascular.csv \
--   --out ./migration-output/cardiovascular

-- STEP 3: Review the physician checklist
-- Open: migration-output/cardiovascular/_physician_review_checklist.md
-- This shows exactly which pathways have critical gaps

-- STEP 4: Use /pathway-review to generate drafts
-- Open Auralyn in browser → /pathway-review → P1 Gaps tab
-- Click "Generate Draft" for each P1 critical pathway
-- The AI drafts the missing fields using your migrated sheet data

-- STEP 5: Review and approve
-- Each draft shows:
--   - Validation score (must be ≥80 to approve)
--   - Items requiring physician review
--   - Differential with LR tables to verify
--   - Return precautions to verify
-- Click "Approve & Load to KB" when satisfied

-- STEP 6: Drift canary is generated automatically on approval
-- Each approved pathway generates a drift canary test case
-- Canary runs nightly to verify the pathway stays calibrated

-- ESTIMATED TIME per pathway (P1 critical, with your Google Sheets imported):
--   ~30 minutes physician review
--   ~5 minutes AI draft generation
--   Total: ~35 minutes per pathway
--   Priority P1 pathways: ~60 pathways
--   Total time for P1 coverage: ~35 hours physician review
