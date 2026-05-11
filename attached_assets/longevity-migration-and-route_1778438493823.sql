-- ============================================================
-- AURALYN — Longevity Intelligence Agent
-- PostgreSQL Migration
-- Run once in your Replit PostgreSQL shell
-- ============================================================

CREATE TABLE IF NOT EXISTS longevity_findings (
  id                  SERIAL PRIMARY KEY,
  treatment           TEXT NOT NULL,
  study_type          TEXT NOT NULL,
  evidence_score      DECIMAL(4,3) NOT NULL,     -- 0.000 to 1.000
  summary             TEXT NOT NULL,
  key_finding         TEXT NOT NULL,
  sample_size         INTEGER,
  population          TEXT,
  outcome_measured    TEXT,
  effect_size         TEXT,
  confidence_interval TEXT,
  safety_signals      JSONB DEFAULT '[]',
  fda_status          TEXT,
  clinical_relevance  TEXT CHECK (clinical_relevance IN ('high','moderate','low','insufficient')),
  pubmed_ids          JSONB DEFAULT '[]',
  source_urls         JSONB DEFAULT '[]',
  scan_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  physician_reviewed  BOOLEAN DEFAULT FALSE,
  physician_notes     TEXT,
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  -- One finding per treatment per day (upsert-safe)
  UNIQUE (treatment, (scan_date::date))
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_longevity_evidence_score 
  ON longevity_findings (evidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_longevity_scan_date 
  ON longevity_findings (scan_date DESC);

CREATE INDEX IF NOT EXISTS idx_longevity_relevance 
  ON longevity_findings (clinical_relevance);

CREATE INDEX IF NOT EXISTS idx_longevity_unreviewed 
  ON longevity_findings (physician_reviewed) 
  WHERE physician_reviewed = FALSE;


-- ============================================================
-- API ROUTE
-- File: server/routes/longevity.ts
-- Add to your domain router: app.use('/api/longevity', longevityRouter)
-- ============================================================

/*
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { db } from "../db";
import { LongevityIntelligenceAgent } from "../agents/LongevityIntelligenceAgent";
import { appendAuditEvent } from "../audit/HashChain";

const router = Router();

// GET /api/longevity/findings
// Returns all findings sorted by evidence score
// Filter by ?relevance=high&reviewed=false
router.get("/findings", requireRole(["physician", "admin"]), async (req, res) => {
  const { relevance, reviewed, limit = 50 } = req.query;

  let query = `
    SELECT * FROM longevity_findings
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 0;

  if (relevance) {
    paramCount++;
    query += ` AND clinical_relevance = $${paramCount}`;
    params.push(relevance);
  }

  if (reviewed !== undefined) {
    paramCount++;
    query += ` AND physician_reviewed = $${paramCount}`;
    params.push(reviewed === "true");
  }

  query += ` ORDER BY evidence_score DESC, scan_date DESC LIMIT $${paramCount + 1}`;
  params.push(Number(limit));

  const findings = await db.execute(query, params);
  res.json({ findings: findings.rows });
});

// GET /api/longevity/findings/high-evidence
// Only returns RCT-level or above (score >= 0.85)
router.get("/findings/high-evidence", requireRole(["physician", "admin"]), async (req, res) => {
  const findings = await db.execute(`
    SELECT * FROM longevity_findings
    WHERE evidence_score >= 0.85
    ORDER BY evidence_score DESC, scan_date DESC
    LIMIT 20
  `);
  res.json({ findings: findings.rows });
});

// PATCH /api/longevity/findings/:id/review
// Physician marks a finding as reviewed with notes
router.patch("/findings/:id/review", requireRole(["physician"]), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const physician = (req as any).user;

  await db.execute(`
    UPDATE longevity_findings
    SET physician_reviewed = TRUE,
        physician_notes = $1,
        reviewed_by = $2,
        reviewed_at = NOW()
    WHERE id = $3
  `, [notes, physician.id, id]);

  await appendAuditEvent({
    eventType: "LONGEVITY_FINDING_REVIEWED",
    userId: physician.id,
    metadata: { findingId: id, notes },
  });

  res.json({ success: true });
});

// POST /api/longevity/scan/trigger
// Admin can trigger a manual scan outside the weekly schedule
router.post("/scan/trigger", requireRole(["admin"]), async (req, res) => {
  const agent = new LongevityIntelligenceAgent();
  
  // Run async — don't block the response
  agent.run().catch((err) => {
    console.error("[LongevityAgent] Manual scan failed:", err);
  });

  res.json({ 
    message: "Longevity scan started. Results will appear in /api/longevity/findings within 10-15 minutes.",
    startedAt: new Date().toISOString(),
  });
});

// GET /api/longevity/scan/history
// Shows last 10 scan runs from audit trail
router.get("/scan/history", requireRole(["admin", "physician"]), async (req, res) => {
  const history = await db.execute(`
    SELECT metadata, created_at
    FROM governance_audit_log
    WHERE event_type = 'LONGEVITY_SCAN_COMPLETE'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  res.json({ history: history.rows });
});

export default router;
*/
