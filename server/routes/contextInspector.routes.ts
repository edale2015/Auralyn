/**
 * Context Inspector API
 *
 * Read-only endpoints for inspecting the live EncounterContext built by
 * ClinicalContextManager during runClinicalPipeline.  Used by the
 * Context Inspector tab on the Master Rule Map dashboard.
 *
 * All writes go through the pipeline itself — these endpoints are
 * intentionally read-only to preserve audit integrity.
 */

import { Router } from "express";
import type { EncounterContext } from "../context/types";
import { ClinicalContextManager } from "../context/ClinicalContextManager";
import { buildDefaultRegistry } from "../context/RoleScopedToolRegistry";

const router = Router();

export interface CompactionEvent {
  sessionId:    string;
  step:         number;
  beforeTokens: number;
  afterTokens:  number;
  artifactsEmitted: number;
  occurredAt:   string;
}

export interface EncounterStateCache {
  context:    EncounterContext;
  sessionId:  string;
  updatedAt:  string;
  compactionHistory: CompactionEvent[];
}

const STATE_CACHE = new Map<string, EncounterStateCache>();

export function storeEncounterContext(
  encounterId: string,
  sessionId:   string,
  ctx:         EncounterContext,
  compactionEvents?: CompactionEvent[],
): void {
  const existing = STATE_CACHE.get(encounterId);
  STATE_CACHE.set(encounterId, {
    context:   ctx,
    sessionId,
    updatedAt: new Date().toISOString(),
    compactionHistory: compactionEvents ?? existing?.compactionHistory ?? [],
  });
}

export function appendCompactionEvent(encounterId: string, evt: CompactionEvent): void {
  const entry = STATE_CACHE.get(encounterId);
  if (entry) {
    entry.compactionHistory.push(evt);
    entry.updatedAt = new Date().toISOString();
  }
}

// GET /api/context/:encounterId/state
router.get("/:encounterId/state", (req, res) => {
  const entry = STATE_CACHE.get(req.params.encounterId);
  if (!entry) {
    return res.status(404).json({ error: "Encounter context not found. Run the pipeline first." });
  }
  const { context, sessionId, updatedAt } = entry;
  return res.json({
    encounterId:  req.params.encounterId,
    sessionId,
    updatedAt,
    immutables:   context.immutables,
    working: {
      step:                context.working.step,
      currentAgent:        context.working.currentAgent,
      estimatedTokens:     context.working.estimatedTokens,
      currentDifferential: context.working.currentDifferential,
      pendingQuestions:    context.working.pendingQuestions,
      answeredQuestionsCount: context.working.answeredQuestions.length,
      candidateDispositions: context.working.candidateDispositions,
    },
    artifacts: context.artifacts.map((a) => ({
      id:          a.id,
      type:        a.type,
      producedBy:  a.producedBy,
      producedAt:  a.producedAt,
      consumedBy:  a.consumedBy,
      estimatedTokens: a.estimatedTokens,
      payload:     a.payload,
      provenance:  a.provenance,
    })),
    traceRefId: context.traceRefId,
  });
});

// GET /api/context/:encounterId/prompts/:role
router.get("/:encounterId/prompts/:role", (req, res) => {
  const VALID_ROLES = ["triage", "differential", "disposition", "billing", "supervisor"] as const;
  type Role = typeof VALID_ROLES[number];

  const role = req.params.role as Role;
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
  }

  const entry = STATE_CACHE.get(req.params.encounterId);
  if (!entry) {
    return res.status(404).json({ error: "Encounter context not found. Run the pipeline first." });
  }

  const manager  = new ClinicalContextManager(entry.context);
  const registry = buildDefaultRegistry();
  const prompt   = manager.assemblePromptFor(role, `[QA PREVIEW — no model call made]`);

  return res.json({
    encounterId:    req.params.encounterId,
    role,
    systemPrompt:   prompt.systemPrompt,
    userPrompt:     prompt.userPrompt,
    estimatedTokens: prompt.estimatedTokens,
    toolNames:      registry.toolNamesFor(role),
    includedArtifactIds: prompt.includedArtifactIds,
    excluded:       prompt.excluded,
  });
});

// GET /api/context/:encounterId/compaction-history
router.get("/:encounterId/compaction-history", (req, res) => {
  const entry = STATE_CACHE.get(req.params.encounterId);
  if (!entry) {
    return res.status(404).json({ error: "Encounter context not found." });
  }
  return res.json({
    encounterId: req.params.encounterId,
    events:      entry.compactionHistory,
    totalEvents: entry.compactionHistory.length,
  });
});

// GET /api/context/action-space-sizes (global, no encounter needed)
router.get("/action-space-sizes", (_req, res) => {
  const registry = buildDefaultRegistry();
  return res.json(registry.actionSpaceSizes());
});

// GET /api/context/cached-encounters (list what's in memory)
router.get("/cached-encounters", (_req, res) => {
  const list = [...STATE_CACHE.entries()].map(([id, e]) => ({
    encounterId: id,
    sessionId:   e.sessionId,
    updatedAt:   e.updatedAt,
    artifactCount: e.context.artifacts.length,
    step:          e.context.working.step,
    redFlags:      e.context.immutables.redFlagsIdentified.length,
  }));
  return res.json({ count: list.length, encounters: list });
});

export default router;
