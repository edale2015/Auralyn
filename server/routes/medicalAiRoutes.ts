/**
 * server/routes/medicalAiRoutes.ts
 *
 * Medical AI REST API — TypeScript/Express equivalent of the Python scaffold's routes.py.
 *
 * Endpoints:
 *   POST /api/medical-ai/chat             — Conversational medical assistant
 *   POST /api/medical-ai/knowledge/ingest — Ingest a document into the RAG knowledge base
 *   GET  /api/medical-ai/knowledge/search — Semantic search the knowledge base
 *   POST /api/medical-ai/artifact         — Generate a structured medical artifact
 *   GET  /api/medical-ai/knowledge/stats  — Knowledge base statistics
 *   DELETE /api/medical-ai/knowledge/:id  — Remove a document from the knowledge base
 */

import { Router, type Request, type Response } from "express";
import { generate, generateArtifact, type ArtifactType } from "../medicalAi/llm";
import { ingestDocument, searchKnowledge, getStoreStats, deleteDocument } from "../medicalAi/store";
import { checkMessageSafety, buildSafetyEnvelope, scrubPHI, type MedicalRole } from "../medicalAi/safety";

const router = Router();

const VALID_ROLES:          Set<string>      = new Set(["patient", "physician", "staff"]);
const VALID_ARTIFACT_TYPES: Set<ArtifactType> = new Set([
  "doctor_questions", "symptom_summary", "discharge_instructions",
  "referral_note", "visit_prep", "medication_review",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateRole(role: unknown): role is MedicalRole {
  return typeof role === "string" && VALID_ROLES.has(role);
}

// ── POST /api/medical-ai/chat ─────────────────────────────────────────────────
/**
 * Request body:
 *   role:           "patient" | "physician" | "staff"
 *   message:        string  — user's question or message
 *   patient_context?: string — additional context (e.g. current symptoms)
 *   history?:       Array<{role: "user"|"assistant"; content: string}>
 *   use_rag?:       boolean (default: true)
 */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { role, message, patient_context, history, use_rag } = req.body ?? {};

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "message is required and must be a non-empty string" });
    }
    if (!validateRole(role)) {
      return res.status(400).json({ ok: false, error: "role must be one of: patient, physician, staff" });
    }

    // ── Safety gate — run before LLM call ────────────────────────────────────
    const safety = checkMessageSafety(message);

    if (safety.erRequired) {
      return res.json({
        ok:      true,
        answer:  `⚠️ EMERGENCY DETECTED — ${safety.recommendation}`,
        safety:  buildSafetyEnvelope(message, role as MedicalRole),
        ragSources:    [],
        model:         "safety-gate",
        durationMs:    0,
        erOverride:    true,
      });
    }

    // ── LLM generation ────────────────────────────────────────────────────────
    const result = await generate({
      role:           role as MedicalRole,
      message,
      patientContext: patient_context,
      history:        Array.isArray(history) ? history : [],
      useRAG:         use_rag !== false,
    });

    res.json({
      ok:          true,
      answer:      result.answer,
      safety:      buildSafetyEnvelope(message, role as MedicalRole),
      ragSources:  result.ragSources,
      ragContext:  result.ragContext,
      model:       result.model,
      promptTokens:  result.promptTokens,
      outputTokens:  result.outputTokens,
      durationMs:    result.durationMs,
    });
  } catch (err: any) {
    console.error("[medical-ai/chat] error:", err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? "Chat generation failed" });
  }
});

// ── POST /api/medical-ai/knowledge/ingest ─────────────────────────────────────
/**
 * Request body:
 *   title:       string   — document title
 *   text:        string   — document content (PHI-scrubbed before storage)
 *   source_type: string   — e.g. "clinic_policy" | "clinical_guideline" | "formulary" | "faq"
 *   metadata?:   object   — optional key/value tags
 */
router.post("/knowledge/ingest", async (req: Request, res: Response) => {
  try {
    const { title, text, source_type, metadata } = req.body ?? {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ ok: false, error: "title is required" });
    }
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return res.status(400).json({ ok: false, error: "text is required (minimum 10 characters)" });
    }
    if (!source_type || typeof source_type !== "string") {
      return res.status(400).json({ ok: false, error: "source_type is required" });
    }

    // ── Scrub PHI from text before embedding + storage ────────────────────────
    const scrubbedText = scrubPHI(text);

    const doc = await ingestDocument({
      title,
      text:       scrubbedText,
      sourceType: source_type,
      metadata:   typeof metadata === "object" && metadata !== null ? metadata : {},
    });

    res.status(201).json({
      ok:          true,
      id:          doc.id,
      title:       doc.title,
      sourceType:  doc.sourceType,
      ingestedAt:  doc.ingestedAt,
      phiScrubbed: scrubbedText !== text,
      charCount:   scrubbedText.length,
    });
  } catch (err: any) {
    console.error("[medical-ai/knowledge/ingest] error:", err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? "Ingestion failed" });
  }
});

// ── GET /api/medical-ai/knowledge/search ─────────────────────────────────────
/**
 * Query params:
 *   q:        string — search query
 *   top_k?:   number (default 5, max 20)
 *   min_score?: number (default 0.15)
 */
router.get("/knowledge/search", async (req: Request, res: Response) => {
  try {
    const query    = req.query.q as string;
    const topK     = Math.min(20, Math.max(1, parseInt(req.query.top_k as string) || 5));
    const minScore = parseFloat(req.query.min_score as string) || 0.15;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "q (query) is required" });
    }

    const results = await searchKnowledge(query.trim(), topK, minScore);

    res.json({
      ok:      true,
      query,
      results,
      total:   results.length,
    });
  } catch (err: any) {
    console.error("[medical-ai/knowledge/search] error:", err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? "Search failed" });
  }
});

// ── GET /api/medical-ai/knowledge/stats ──────────────────────────────────────
router.get("/knowledge/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getStoreStats() });
});

// ── DELETE /api/medical-ai/knowledge/:id ─────────────────────────────────────
router.delete("/knowledge/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = deleteDocument(id);
  if (!deleted) return res.status(404).json({ ok: false, error: "Document not found" });
  res.json({ ok: true, deleted: id });
});

// ── POST /api/medical-ai/artifact ────────────────────────────────────────────
/**
 * Request body:
 *   artifact_type: ArtifactType — one of the 6 supported types
 *   text:          string       — input text for the artifact
 *   role:          MedicalRole  — caller role context
 *
 * Supported artifact types:
 *   doctor_questions | symptom_summary | discharge_instructions
 *   referral_note    | visit_prep      | medication_review
 */
router.post("/artifact", async (req: Request, res: Response) => {
  try {
    const { artifact_type, text, role } = req.body ?? {};

    if (!artifact_type || !VALID_ARTIFACT_TYPES.has(artifact_type as ArtifactType)) {
      return res.status(400).json({
        ok:    false,
        error: `artifact_type must be one of: ${[...VALID_ARTIFACT_TYPES].join(", ")}`,
      });
    }
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return res.status(400).json({ ok: false, error: "text is required (minimum 10 characters)" });
    }
    if (!validateRole(role)) {
      return res.status(400).json({ ok: false, error: "role must be one of: patient, physician, staff" });
    }

    const result = await generateArtifact({
      artifactType: artifact_type as ArtifactType,
      text,
      role:         role as MedicalRole,
    });

    res.json({
      ok:           true,
      artifactType: result.artifactType,
      content:      result.content,
      model:        result.model,
      durationMs:   result.durationMs,
    });
  } catch (err: any) {
    console.error("[medical-ai/artifact] error:", err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? "Artifact generation failed" });
  }
});

export default router;
