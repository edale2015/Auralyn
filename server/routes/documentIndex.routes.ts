/**
 * documentIndex.routes.ts
 * server/routes/documentIndex.routes.ts
 *
 * REST API for the PageIndex clinical document indexer (Win 20).
 */

import { Router }              from "express";
import { requireReviewAuth }   from "../middleware/reviewAuth";
import { requireRole }         from "../middleware/requireRole";
import { ClinicalDocumentIndexer } from "../retrieval/clinicalDocumentIndexer";
import { indexGuideline, queryGuidelines, getGroundingStatus } from "../retrieval/guidelineGrounding";
import { indexPayerPolicy, assessPriorAuthWithIndex }          from "../integrations/ehr/priorAuthWithIndex";

export const documentIndexRouter = Router();

// ─── POST /api/documents/index-guideline ─────────────────────────────────────
// Indexes a new clinical guideline PDF text. Admin only.

documentIndexRouter.post(
  "/api/documents/index-guideline",
  requireReviewAuth,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const { guidelineId, name, organization, year, documentText, totalPages, complaintSlugs } = req.body;

      if (!guidelineId || !name || !organization || !year || !documentText || !totalPages || !complaintSlugs) {
        return res.status(400).json({ ok: false, error: "guidelineId, name, organization, year, documentText, totalPages, complaintSlugs required" });
      }

      await indexGuideline(guidelineId, name, organization, Number(year), documentText, Number(totalPages), complaintSlugs);

      return res.json({ ok: true, guidelineId, pagesIndexed: totalPages, complaintSlugs });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/documents/index-prior-auth ────────────────────────────────────
// Indexes a payer policy PDF text. Admin only.

documentIndexRouter.post(
  "/api/documents/index-prior-auth",
  requireReviewAuth,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const { payerId, policyName, documentText, totalPages, effectiveDate } = req.body;

      if (!payerId || !policyName || !documentText || !totalPages || !effectiveDate) {
        return res.status(400).json({ ok: false, error: "payerId, policyName, documentText, totalPages, effectiveDate required" });
      }

      const documentId = await indexPayerPolicy(payerId, policyName, documentText, Number(totalPages), effectiveDate);

      return res.json({ ok: true, documentId, payerId, pagesIndexed: totalPages });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── GET /api/documents/grounding-status ─────────────────────────────────────
// Returns which guidelines are indexed and which complaints are covered.

documentIndexRouter.get(
  "/api/documents/grounding-status",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    try {
      const status = getGroundingStatus();
      const indexes = ClinicalDocumentIndexer.listIndexes().map(idx => ({
        documentId: idx.documentId,
        title:      idx.title,
        type:       idx.type,
        source:     idx.source,
        totalPages: idx.totalPages,
        indexedAt:  idx.indexedAt,
        nodeCount:  countNodes(idx.tree),
      }));

      return res.json({ ok: true, ...status, indexedDocuments: indexes });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/documents/query ────────────────────────────────────────────────
// Navigate a document index and answer a clinical question.

documentIndexRouter.post(
  "/api/documents/query",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    try {
      const { documentId, query, pageTexts } = req.body;

      if (!documentId || !query) {
        return res.status(400).json({ ok: false, error: "documentId and query required" });
      }

      const result = await ClinicalDocumentIndexer.query(documentId, query, pageTexts ?? {});
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/prior-auth/enhanced ───────────────────────────────────────────
// Enhanced prior auth — tries index first, falls back to skeleton.

documentIndexRouter.post(
  "/api/prior-auth/enhanced",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    try {
      const { caseId, cptCode, diagnosisCode, procedureDisplay, diagnosisDisplay, payerId, patientAge, clinicalNotes, pageTexts } = req.body;

      if (!caseId || !cptCode || !diagnosisCode || !procedureDisplay || !diagnosisDisplay || !payerId) {
        return res.status(400).json({ ok: false, error: "caseId, cptCode, diagnosisCode, procedureDisplay, diagnosisDisplay, payerId required" });
      }

      const result = await assessPriorAuthWithIndex(
        { caseId, cptCode, diagnosisCode, procedureDisplay, diagnosisDisplay, payerId, patientAge, clinicalNotes },
        pageTexts
      );

      return res.json({ ok: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── POST /api/documents/query-guidelines ────────────────────────────────────
// Query all indexed guidelines for a complaint + clinical question.

documentIndexRouter.post(
  "/api/documents/query-guidelines",
  requireReviewAuth,
  requireRole(["admin", "physician"]),
  async (req, res) => {
    try {
      const { complaintSlug, query, pageTexts } = req.body;

      if (!complaintSlug || !query) {
        return res.status(400).json({ ok: false, error: "complaintSlug and query required" });
      }

      const results = await queryGuidelines(complaintSlug, query, pageTexts ?? {});
      return res.json({ ok: true, results, found: results.filter(r => r.found).length });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countNodes(node: any): number {
  return 1 + (node.children ?? []).reduce((s: number, c: any) => s + countNodes(c), 0);
}
