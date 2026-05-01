/**
 * clinicalPathways.routes.ts
 * server/routes/clinicalPathways.routes.ts
 *
 * REST API for the complaint pathway schema system (Win 21).
 * Provides the master map, pathway registry, validation, and sheet migration.
 */

import { Router }            from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { requireRole }       from "../middleware/requireRole";
import { SheetMigrator }     from "../clinical/sheetMigrator";
import { validatePathway }   from "../clinical/complaintPathwaySchema";
import { ALL_SYSTEMS, MASTER_SUMMARY, getComplaintsByPriority, getCriticalMissingP1, getSystemStatus } from "../clinical/PATHWAY_MASTER_MAP";
import { ENT_EYE_INFECTIOUS_PATHWAYS } from "../clinical/pathways/ent-eye-infectious";
import type { ComplaintPathway } from "../clinical/complaintPathwaySchema";
import { completePathwayDraft } from "../clinical/pathwayCompletionEngine";
import { appendAuditEvent }    from "../governance/audit";
import { db }  from "../db";
import { sql } from "drizzle-orm";

export const clinicalPathwaysRouter = Router();

// In-memory pathway registry (loaded pathways survive server restarts via JSON files)
const PATHWAY_REGISTRY: Record<string, Partial<ComplaintPathway>> = {
  ...ENT_EYE_INFECTIOUS_PATHWAYS,
};

// ─── GET /api/clinical/pathways/master-map ────────────────────────────────────
// Returns the complete 23-system taxonomy with status and priority.

clinicalPathwaysRouter.get(
  "/api/clinical/pathways/master-map",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (_req, res) => {
    res.json({
      ok: true,
      summary: MASTER_SUMMARY,
      systems: getSystemStatus(),
      criticalMissingP1: getCriticalMissingP1().map(c => ({ slug: c.slug, name: c.name })),
    });
  }
);

// ─── GET /api/clinical/pathways ───────────────────────────────────────────────
// Lists all pathways currently in the registry.

clinicalPathwaysRouter.get(
  "/api/clinical/pathways",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (_req, res) => {
    const entries = Object.values(PATHWAY_REGISTRY).map(p => ({
      slug:         p.slug,
      displayName:  p.displayName,
      system:       p.system,
      acuityClass:  p.acuityClass,
      redFlagCount: p.redFlags?.length ?? 0,
      complete:     !!(p.differential && p.treatment && p.patientCommunication),
      version:      p.version ?? 1,
    }));
    res.json({ ok: true, count: entries.length, pathways: entries });
  }
);

// ─── GET /api/clinical/pathways/pending-review ───────────────────────────────
// WIN 22: Returns all pathway drafts awaiting physician approval.
// NOTE: Must be registered BEFORE /:slug to avoid slug capture.

clinicalPathwaysRouter.get(
  "/api/clinical/pathways/pending-review",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    try {
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
        requiresPhysicianReview: typeof r.review_items === "string"
          ? JSON.parse(r.review_items)
          : (r.review_items ?? []),
        status: r.status,
        draft:  typeof r.draft_json === "string"
          ? JSON.parse(r.draft_json)
          : (r.draft_json ?? {}),
      }));

      return res.json({ ok: true, drafts, count: drafts.length });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── GET /api/clinical/pathways/:slug ─────────────────────────────────────────
// Returns a single pathway by slug.

clinicalPathwaysRouter.get(
  "/api/clinical/pathways/:slug",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (req, res) => {
    const pathway = PATHWAY_REGISTRY[req.params.slug];
    if (!pathway) return res.status(404).json({ ok: false, error: `Pathway '${req.params.slug}' not found` });
    return res.json({ ok: true, pathway });
  }
);

// ─── POST /api/clinical/pathways/validate ─────────────────────────────────────
// Validates a pathway against the clinical schema.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/validate",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (req, res) => {
    try {
      const pathway = req.body as ComplaintPathway;
      if (!pathway?.slug) return res.status(400).json({ ok: false, error: "pathway.slug required" });
      const result = validatePathway(pathway);
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/clinical/pathways/load ────────────────────────────────────────
// Loads a validated pathway into the registry. Admin only.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/load",
  requireReviewAuth,
  requireRole(["admin"]),
  (req, res) => {
    try {
      const pathway = req.body as ComplaintPathway;
      if (!pathway?.slug) return res.status(400).json({ ok: false, error: "pathway.slug required" });

      const validation = validatePathway(pathway);
      if (!validation.valid) {
        return res.status(422).json({
          ok: false,
          error: "Pathway validation failed — fix errors before loading to production",
          errors: validation.errors,
          score: validation.score,
        });
      }

      PATHWAY_REGISTRY[pathway.slug] = pathway;
      return res.json({ ok: true, slug: pathway.slug, score: validation.score, warnings: validation.warnings });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/clinical/pathways/migrate-csv ──────────────────────────────────
// Migrates a Google Sheets CSV upload into pathway objects.
// Accepts raw CSV content in request body.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/migrate-csv",
  requireReviewAuth,
  requireRole(["admin"]),
  (req, res) => {
    try {
      const { csvContent, systemName } = req.body;
      if (!csvContent) return res.status(400).json({ ok: false, error: "csvContent required" });

      const migrator = new SheetMigrator();
      const result   = migrator.fromCSVString(csvContent);

      return res.json({
        ok: true,
        systemName: systemName ?? "unknown",
        totalRows:          result.report.totalRows,
        readyForProduction: result.report.readyForProduction.length,
        needsReview:        result.report.needsReview.length,
        criticalGaps:       result.report.criticalGaps.length,
        report:             result.report,
        pathways:           result.pathways,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── GET /api/clinical/pathways/system/:systemName ───────────────────────────
// Returns all complaints for a given system from the master map.

clinicalPathwaysRouter.get(
  "/api/clinical/pathways/system/:systemName",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (req, res) => {
    const systemName = req.params.systemName.toUpperCase() as keyof typeof ALL_SYSTEMS;
    const complaints = ALL_SYSTEMS[systemName];
    if (!complaints) {
      return res.status(404).json({ ok: false, error: `System '${systemName}' not found. Valid systems: ${Object.keys(ALL_SYSTEMS).join(", ")}` });
    }
    return res.json({ ok: true, system: systemName, complaints, count: complaints.length });
  }
);

// ─── GET /api/clinical/pathways/priority/:level ───────────────────────────────
// Returns complaints by priority (P1, P2, P3).

clinicalPathwaysRouter.get(
  "/api/clinical/pathways/priority/:level",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  (req, res) => {
    const level = req.params.level as "P1" | "P2" | "P3";
    if (!["P1", "P2", "P3"].includes(level)) {
      return res.status(400).json({ ok: false, error: "level must be P1, P2, or P3" });
    }
    const complaints = getComplaintsByPriority(level);
    return res.json({ ok: true, priority: level, complaints, count: complaints.length });
  }
);

// ─── WIN 22 ROUTES ────────────────────────────────────────────────────────────

// POST /api/clinical/pathways/complete-draft
// Triggers async AI drafting for a single pathway slug.
// Returns immediately; draft appears in pending-review queue within ~30s.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/complete-draft",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ ok: false, error: "slug required" });

    const existing = await db.execute(sql`
      SELECT pathway_json FROM clinical_pathways WHERE slug = ${slug}
    `).catch(() => ({ rows: [] }));

    const partialPathway: Partial<ComplaintPathway> = existing.rows[0]
      ? JSON.parse((existing.rows[0] as any).pathway_json)
      : { slug, displayName: (slug as string).replace(/_/g, " ") };

    // Fire async — respond immediately, draft saved to pathway_drafts
    completePathwayDraft({ partialPathway }).catch((err: Error) =>
      console.error(`[PathwayCompletion] Error drafting ${slug}:`, err.message)
    );

    return res.json({
      ok:      true,
      message: `Draft generation started for ${slug}. Check pending review queue in ~30s.`,
    });
  }
);

// POST /api/clinical/pathways/:slug/approve
// Physician approves a draft and loads it to the clinical_pathways KB.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/:slug/approve",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const { slug }    = req.params;
    const physicianId = (req as any).authUser?.userId ?? (req as any).authUser?.id;

    if (!physicianId) {
      return res.status(403).json({ ok: false, error: "Physician actor required for pathway approval" });
    }

    const draftRow = await db.execute(sql`
      SELECT draft_json, validation_score FROM pathway_drafts WHERE slug = ${slug}
    `).catch(() => ({ rows: [] }));

    if (!draftRow.rows[0]) {
      return res.status(404).json({ ok: false, error: `Draft not found for slug: ${slug}` });
    }

    const draft = typeof (draftRow.rows[0] as any).draft_json === "string"
      ? JSON.parse((draftRow.rows[0] as any).draft_json)
      : (draftRow.rows[0] as any).draft_json;

    const score = (draftRow.rows[0] as any).validation_score;

    if (score < 80) {
      return res.status(400).json({
        ok:    false,
        error: `Validation score ${score}/100 is below minimum 80 for KB loading`,
      });
    }

    const approvedAt = new Date().toISOString();

    await db.execute(sql`
      INSERT INTO clinical_pathways (
        slug, display_name, system, acuity_class, pathway_json,
        validation_score, approved_by, approved_at, version, active
      ) VALUES (
        ${slug},
        ${draft.displayName ?? slug},
        ${draft.system ?? "general"},
        ${draft.acuityClass ?? "routine"},
        ${JSON.stringify(draft)},
        ${score},
        ${physicianId},
        ${approvedAt},
        1,
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        pathway_json     = ${JSON.stringify(draft)},
        validation_score = ${score},
        approved_by      = ${physicianId},
        approved_at      = ${approvedAt},
        version          = clinical_pathways.version + 1,
        updated_at       = CURRENT_TIMESTAMP
    `);

    await db.execute(sql`
      UPDATE pathway_drafts
      SET status = 'approved', approved_by = ${physicianId}, approved_at = ${approvedAt}
      WHERE slug = ${slug}
    `);

    await appendAuditEvent({
      actor:      physicianId,
      action:     "CLINICAL_PATHWAY_APPROVED",
      entityId:   slug,
      entityType: "complaint_pathway",
      details:    { validationScore: score },
    }).catch(console.error);

    return res.json({ ok: true, message: `${slug} approved and loaded to clinical KB` });
  }
);

// POST /api/clinical/pathways/:slug/reject
// Physician rejects a draft with an optional reason.

clinicalPathwaysRouter.post(
  "/api/clinical/pathways/:slug/reject",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const { slug }    = req.params;
    const { reason }  = req.body;
    const physicianId = (req as any).authUser?.userId ?? (req as any).authUser?.id ?? "system";
    const rejectedAt  = new Date().toISOString();

    await db.execute(sql`
      UPDATE pathway_drafts
      SET status           = 'rejected',
          rejection_reason = ${reason ?? "No reason provided"},
          approved_by      = ${physicianId},
          approved_at      = ${rejectedAt}
      WHERE slug = ${slug}
    `);

    await appendAuditEvent({
      actor:      physicianId,
      action:     "CLINICAL_PATHWAY_REJECTED",
      entityId:   slug,
      entityType: "complaint_pathway",
      details:    { reason: (reason as string | undefined)?.slice(0, 200) },
    }).catch(console.error);

    return res.json({ ok: true });
  }
);
