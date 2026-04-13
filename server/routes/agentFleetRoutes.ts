/**
 * agentFleetRoutes.ts — API surface for parallel agent fleet + best-of-N
 *
 * Routes:
 *   POST /api/agent-fleet/run         — run parallel agent fleet (N tasks, same input)
 *   POST /api/agent-fleet/best-of-n   — compare same clinical question across M models
 *   POST /api/agent-fleet/artifacts   — save a new artifact
 *   GET  /api/agent-fleet/artifacts   — list artifacts (filter by agentId, patientId, type)
 *   GET  /api/agent-fleet/artifacts/:id — get single artifact
 *   PATCH /api/agent-fleet/artifacts/:id/status — physician review (approve/reject)
 *   POST /api/agent-fleet/memory      — save agent memory entry
 *   GET  /api/agent-fleet/memory/:agentId — get agent memory
 *   POST /api/agent-fleet/memory/:agentId/override — record physician override
 *   GET  /api/agent-fleet/memory/:agentId/context — get prompt-ready context block
 *   DELETE /api/agent-fleet/memory/:agentId/prune — prune low-importance memories
 *   GET  /api/agent-fleet/health      — module health
 */

import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { runAgentFleet, type AgentTask, type AgentTaskType } from "../agents/agentFleetOrchestrator";
import { bestOfN, CLINICAL_MODELS } from "../agents/bestOfN";
import {
  saveArtifact,
  getArtifact,
  listArtifacts,
  updateArtifactStatus,
  type ArtifactStatus,
} from "../artifacts/artifactStore";
import {
  saveMemory,
  getMemory,
  getMemoryContext,
  recordPhysicianOverride,
  recordOutcome,
  summarizeMemory,
  pruneMemory,
  type MemoryType,
} from "../agents/agentMemory";

const router = Router();

// ── POST /api/agent-fleet/run ────────────────────────────────────────────────

const RunFleetSchema = z.object({
  tasks: z.array(z.object({
    id:    z.string().optional(),
    type:  z.enum(["diagnosis", "triage", "treatment", "risk_score", "disposition"]),
    input: z.record(z.unknown()),
    model: z.string().default("gpt-4o"),
    role:  z.string().optional(),
  })).min(1).max(12),
  patientId:   z.string().optional(),
  saveArtifact: z.boolean().optional().default(true),
});

router.post("/run", async (req, res) => {
  const parse = RunFleetSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const tasks: AgentTask[] = parse.data.tasks.map((t) => ({
      ...t,
      id: t.id ?? crypto.randomUUID(),
    }));

    const result = await runAgentFleet(tasks, {
      saveArtifactOnComplete: parse.data.saveArtifact,
      patientId: parse.data.patientId,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-fleet/best-of-n ──────────────────────────────────────────

const BestOfNSchema = z.object({
  taskType:     z.enum(["diagnosis", "triage", "treatment", "risk_score", "disposition"]),
  clinicalData: z.record(z.unknown()),
  models:       z.array(z.string()).optional(),
  patientId:    z.string().optional(),
  saveResult:   z.boolean().optional().default(true),
});

router.post("/best-of-n", async (req, res) => {
  const parse = BestOfNSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const result = await bestOfN({
      taskType:     parse.data.taskType,
      clinicalData: parse.data.clinicalData,
      models:       parse.data.models,
      patientId:    parse.data.patientId,
      saveResult:   parse.data.saveResult,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-fleet/artifacts ──────────────────────────────────────────

const SaveArtifactSchema = z.object({
  type:      z.string().min(1),
  content:   z.unknown(),
  agentId:   z.string().min(1),
  patientId: z.string().optional(),
  metadata:  z.record(z.unknown()).optional(),
  status:    z.enum(["pending_review", "approved", "rejected", "archived"]).optional(),
});

router.post("/artifacts", async (req, res) => {
  const parse = SaveArtifactSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const result = await saveArtifact(parse.data as any);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-fleet/artifacts ───────────────────────────────────────────

router.get("/artifacts", async (req, res) => {
  try {
    const artifacts = await listArtifacts({
      agentId:   req.query.agentId as string | undefined,
      patientId: req.query.patientId as string | undefined,
      type:      req.query.type as string | undefined,
      status:    req.query.status as ArtifactStatus | undefined,
      limit:     Number(req.query.limit ?? 50),
      offset:    Number(req.query.offset ?? 0),
    });
    return res.json({ artifacts, count: artifacts.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-fleet/artifacts/:id ───────────────────────────────────────

router.get("/artifacts/:id", async (req, res) => {
  try {
    const artifact = await getArtifact(req.params.id);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    return res.json(artifact);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/agent-fleet/artifacts/:id/status ──────────────────────────────

const UpdateStatusSchema = z.object({
  status:     z.enum(["pending_review", "approved", "rejected", "archived"]),
  reviewNote: z.string().optional(),
});

router.patch("/artifacts/:id/status", async (req, res) => {
  const parse = UpdateStatusSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const updated = await updateArtifactStatus(req.params.id, parse.data.status, parse.data.reviewNote);
    if (!updated) return res.status(404).json({ error: "Artifact not found" });
    return res.json({ id: req.params.id, status: parse.data.status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-fleet/memory ─────────────────────────────────────────────

const SaveMemorySchema = z.object({
  agentId:    z.string().min(1),
  memoryType: z.enum(["clinical_decision", "outcome", "physician_override", "drug_interaction", "pattern_learned", "preference"]),
  content:    z.string().min(1),
  importance: z.number().min(0).max(1).optional().default(0.5),
  context:    z.record(z.unknown()).optional(),
});

router.post("/memory", async (req, res) => {
  const parse = SaveMemorySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const result = await saveMemory(parse.data as any);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-fleet/memory/:agentId ─────────────────────────────────────

router.get("/memory/:agentId", async (req, res) => {
  try {
    const memories = await getMemory(req.params.agentId, {
      limit:          Number(req.query.limit ?? 20),
      memoryType:     req.query.type as MemoryType | undefined,
      minImportance:  req.query.minImportance ? Number(req.query.minImportance) : undefined,
    });
    return res.json({ memories, count: memories.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-fleet/memory/:agentId/override ───────────────────────────

const OverrideSchema = z.object({
  originalDecision: z.string().min(1),
  physicianAction:  z.string().min(1),
  context:          z.record(z.unknown()).optional(),
});

router.post("/memory/:agentId/override", async (req, res) => {
  const parse = OverrideSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    await recordPhysicianOverride(
      req.params.agentId,
      parse.data.originalDecision,
      parse.data.physicianAction,
      parse.data.context,
    );
    return res.json({ recorded: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-fleet/memory/:agentId/context ─────────────────────────────

router.get("/memory/:agentId/context", async (req, res) => {
  try {
    const context = await getMemoryContext(req.params.agentId, Number(req.query.topK ?? 5));
    const summary = await summarizeMemory(req.params.agentId);
    return res.json({ context, summary });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/agent-fleet/memory/:agentId/prune ────────────────────────────

router.delete("/memory/:agentId/prune", async (req, res) => {
  try {
    const result = await pruneMemory(req.params.agentId, Number(req.query.keepTop ?? 50));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-fleet/health ───────────────────────────────────────────────

router.get("/health", async (req, res) => {
  try {
    const aiMode = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    return res.json({
      status: "operational",
      modules: {
        agentFleetOrchestrator: "active",
        bestOfN:                "active",
        artifactStore:          "active",
        agentMemory:            "active",
      },
      availableModels: CLINICAL_MODELS,
      aiMode,
      keyboardShortcuts: {
        runFleet:  "POST /api/agent-fleet/run",
        bestOfN:   "POST /api/agent-fleet/best-of-n",
        artifacts: "GET  /api/agent-fleet/artifacts",
        memory:    "GET  /api/agent-fleet/memory/:agentId",
      },
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", error: err.message });
  }
});

export default router;
