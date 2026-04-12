/**
 * Tool layer routes — /api/tools/*
 * Exposes the schema registry, envelope format, and 5-step call loop.
 */

import express from "express";
import { z } from "zod";
import {
  listSchemaTools, getSchemaTool, validateToolInput,
  exportReadOnlyFunctions, exportAllFunctions,
  registerBuiltInSchemaTools,
} from "../tools/toolSchemaRegistry";
import {
  executeToolCall, executeToolBatch, grantApproval, formatLoopSummary,
  type CallerContext,
} from "../tools/toolCallLoop";

const router = express.Router();

registerBuiltInSchemaTools();

// ── Tool catalog ──────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const { category, accessLevel, requiresApproval } = req.query;
  const tools = listSchemaTools({
    category:         category as string,
    accessLevel:      accessLevel as any,
    requiresApproval: requiresApproval === "true" ? true : requiresApproval === "false" ? false : undefined,
  });
  res.json({ count: tools.length, tools: tools.map((t) => ({
    id: t.id, name: t.name, description: t.description,
    category: t.category, accessLevel: t.accessLevel,
    requiresApproval: t.requiresApproval,
    exampleCount: (t.examples ?? []).length,
  })) });
});

router.get("/:toolId", (req, res) => {
  const tool = getSchemaTool(req.params.toolId);
  if (!tool) { res.status(404).json({ error: `Tool not found: ${req.params.toolId}` }); return; }
  res.json({ tool: { id: tool.id, name: tool.name, description: tool.description,
    category: tool.category, accessLevel: tool.accessLevel,
    requiresApproval: tool.requiresApproval, examples: tool.examples ?? [] } });
});

// ── Validation (dry-run) ──────────────────────────────────────────────────────

router.post("/:toolId/validate", (req, res) => {
  const result = validateToolInput(req.params.toolId, req.body);
  res.status(result.valid ? 200 : 400).json(result);
});

// ── OpenAI / MCP function definitions ────────────────────────────────────────

router.get("/schema/functions", (req, res) => {
  const level = (req.query.maxLevel ?? "read") as any;
  const fns = level === "read" ? exportReadOnlyFunctions() : exportAllFunctions(level);
  res.json({ count: fns.length, functions: fns });
});

// ── Single tool execution ─────────────────────────────────────────────────────

const callerSchema = z.object({
  callerId:         z.string().min(1).default("anonymous"),
  role:             z.enum(["physician", "nurse", "agent", "system"]).default("agent"),
  maxLevel:         z.enum(["read", "write", "admin"]).default("read"),
  approvalGranted:  z.array(z.string()).optional(),
});

router.post("/:toolId/execute", async (req, res) => {
  try {
    const { caller: rawCaller, input } = req.body;
    const parsed = callerSchema.safeParse(rawCaller ?? {});
    if (!parsed.success) { res.status(400).json({ error: "Invalid caller context", details: parsed.error.errors }); return; }

    const caller: CallerContext = {
      ...parsed.data,
      approvalGranted: new Set(rawCaller?.approvalGranted ?? []),
    };

    const result = await executeToolCall(req.params.toolId, input ?? {}, caller);
    res.json({ step: result.step, attempt: result.attempt, blockedReason: result.blockedReason, envelope: result.envelope });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Batch execution ───────────────────────────────────────────────────────────

router.post("/execute/batch", async (req, res) => {
  try {
    const { caller: rawCaller, calls } = req.body;
    if (!Array.isArray(calls) || calls.length === 0) { res.status(400).json({ error: "calls array required" }); return; }

    const parsed = callerSchema.safeParse(rawCaller ?? {});
    if (!parsed.success) { res.status(400).json({ error: "Invalid caller context" }); return; }

    const caller: CallerContext = {
      ...parsed.data,
      approvalGranted: new Set(rawCaller?.approvalGranted ?? []),
    };

    const batch = await executeToolBatch(calls, caller);
    res.json({ ...batch, summary: formatLoopSummary(batch) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Approval grant ────────────────────────────────────────────────────────────

router.post("/approve", (req, res) => {
  // Stateless endpoint — returns the approval payload the client should include
  // in subsequent execute calls. In production this would be signed.
  const { callerId, toolIds } = req.body;
  if (!callerId || !Array.isArray(toolIds)) { res.status(400).json({ error: "callerId and toolIds[] required" }); return; }
  res.json({ approved: true, callerId, toolIds, approvalToken: `APV-${callerId}-${Date.now().toString(36)}` });
});

export default router;
