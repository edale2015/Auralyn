/**
 * Memory Routes — T019 write triggers
 *
 * These endpoints complete the four cross-encounter learning write paths:
 *
 *   1. Supervisor overrides disposition → POST /api/encounter/:id/supervisor-override (encounter.routes.ts)
 *   2. Supervisor adds hard constraint  → triggered by supervisor gate in pipeline (unifiedClinicalPipeline.ts)
 *   3. Admin adds tenant protocol       → POST /api/memory/protocol  ← HERE
 *   4. Global KB updates guideline      → POST /api/memory/guideline ← HERE
 *
 * GET /api/memory/context returns the active learned context for a physician/tenant pair
 * (used by ClinicalContextManager.assemblePromptFor read path).
 */

import { Router }    from "express";
import {
  writeTenantProtocol,
  writeGlobalGuideline,
  fetchLearnedContext,
}                    from "../context/memoryWriters";

const router = Router();

// ─── POST /api/memory/protocol ───────────────────────────────────────────────
// T019 Trigger 3 — Admin adds a tenant-scoped clinical protocol.
// Body: { tenantId, protocolId, title, content: Record<string, unknown> }
router.post("/protocol", async (req, res) => {
  try {
    const { tenantId, protocolId, title, content = {} } = req.body ?? {};

    if (!tenantId || !protocolId || !title) {
      return res.status(400).json({ error: "tenantId, protocolId, and title are required" });
    }

    const result = await writeTenantProtocol({ tenantId, protocolId, title, content });

    return res.json({
      ok:         true,
      protocolId,
      key:        result.key,
      accepted:   result.accepted,
      scope:      "tenant",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "protocol write failed" });
  }
});

// ─── POST /api/memory/guideline ──────────────────────────────────────────────
// T019 Trigger 4 — Global KB pushes an updated clinical guideline.
// Body: { guidelineId, title, content: Record<string, unknown> }
router.post("/guideline", async (req, res) => {
  try {
    const { guidelineId, title, content = {} } = req.body ?? {};

    if (!guidelineId || !title) {
      return res.status(400).json({ error: "guidelineId and title are required" });
    }

    const result = await writeGlobalGuideline({ guidelineId, title, content });

    return res.json({
      ok:          true,
      guidelineId,
      key:         result.key,
      accepted:    result.accepted,
      scope:       "global",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "guideline write failed" });
  }
});

// ─── GET /api/memory/context ─────────────────────────────────────────────────
// Returns the active learned context for a physician/tenant pair.
// Query params: tenantId, physicianId, maxRows (optional)
router.get("/context", async (req, res) => {
  try {
    const tenantId    = String(req.query.tenantId    ?? "default");
    const physicianId = String(req.query.physicianId ?? "anon");
    const maxRows     = Number(req.query.maxRows ?? 20);

    const entries = await fetchLearnedContext({ tenantId, physicianId, maxRows });

    return res.json({
      ok:       true,
      tenantId,
      physicianId,
      count:    entries.length,
      entries,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "context fetch failed" });
  }
});

export default router;
