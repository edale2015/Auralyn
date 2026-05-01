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
