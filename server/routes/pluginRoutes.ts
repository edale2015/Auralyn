/**
 * Plugin-style routes — /api/plugins/*
 * Exposes preference memory, hook registry, and command registry.
 */

import express from "express";
import {
  remember, forget, recall, recallOne,
  composeMemoryContext, listOwners,
} from "../memory/preferenceMemory";
import {
  registerHook, unregisterHook, listHooks, fireHooks,
  registerBuiltInHooks,
} from "../hooks/hookRegistry";
import {
  registerBuiltInCommands, invokeCommand, parseCommand,
  listCommands, getCommand,
} from "../commands/commandRegistry";

const router = express.Router();

// Bootstrap built-in libraries once at import time
registerBuiltInHooks();
registerBuiltInCommands();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Preference Memory
// ─────────────────────────────────────────────────────────────────────────────

router.post("/memory/remember", (req, res) => {
  try {
    const { scope, ownerId, ...entry } = req.body;
    if (!scope || !ownerId || !entry.key || !entry.value) {
      res.status(400).json({ error: "scope, ownerId, key, and value required" }); return;
    }
    const result = remember(scope, ownerId, {
      category:   entry.category   ?? "general",
      key:        entry.key,
      value:      entry.value,
      confidence: entry.confidence ?? 0.8,
      tags:       entry.tags       ?? [],
      source:     entry.source     ?? "physician_explicit",
      expiresAt:  entry.expiresAt,
    });
    res.json({ entry: result });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/memory/:scope/:ownerId", (req, res) => {
  const { scope, ownerId } = req.params;
  const { category, minConfidence, tags } = req.query;
  const prefs = recall(scope as any, ownerId, {
    category:      category as any,
    minConfidence: minConfidence ? Number(minConfidence) : undefined,
    tags:          tags ? String(tags).split(",") : undefined,
  });
  res.json({ count: prefs.length, preferences: prefs });
});

router.delete("/memory/:scope/:ownerId/:key", (req, res) => {
  const removed = forget(req.params.scope as any, req.params.ownerId, req.params.key);
  res.json({ removed });
});

router.get("/memory/context/:physicianId/:patientId", (req, res) => {
  const ctx = composeMemoryContext(req.params.physicianId, req.params.patientId,
    req.query.minConfidence ? Number(req.query.minConfidence) : 0.5);
  res.json({ context: ctx });
});

router.get("/memory/owners/:scope", (req, res) => {
  res.json({ owners: listOwners(req.params.scope as any) });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hook Registry
// ─────────────────────────────────────────────────────────────────────────────

router.get("/hooks", (req, res) => {
  const event = req.query.event as any;
  const hooks = listHooks(event);
  res.json({ count: hooks.length, hooks: hooks.map((h) => ({ id: h.id, name: h.name, event: h.event, priority: h.priority, blocking: h.blocking, description: h.description })) });
});

router.post("/hooks/fire", async (req, res) => {
  try {
    const { event, patientId, data } = req.body;
    if (!event || !patientId) { res.status(400).json({ error: "event and patientId required" }); return; }
    const result = await fireHooks(event, {
      event, patientId, data: data ?? {}, timestamp: new Date().toISOString(),
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/hooks", (req, res) => {
  try {
    const { id, name, description, event, priority, blocking } = req.body;
    if (!id || !name || !event) { res.status(400).json({ error: "id, name, event required" }); return; }
    registerHook({
      id, name, description: description ?? name, event, priority: priority ?? 50,
      blocking: blocking ?? false,
      action: (ctx) => ({ action: "continue", context: ctx }),
    });
    res.status(201).json({ registered: true, hookId: id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete("/hooks/:hookId", (req, res) => {
  const removed = unregisterHook(req.params.hookId);
  res.json({ removed });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Command Registry
// ─────────────────────────────────────────────────────────────────────────────

router.get("/commands", (req, res) => {
  const cmds = listCommands(req.query.category as string);
  res.json({ count: cmds.length, commands: cmds.map((c) => ({
    name: c.name, description: c.description, category: c.category,
    params: c.params, examples: c.examples,
  })) });
});

router.get("/commands/:name", (req, res) => {
  const cmd = getCommand(req.params.name);
  if (!cmd) { res.status(404).json({ error: `Command /${req.params.name} not found` }); return; }
  res.json({ command: { name: cmd.name, description: cmd.description, category: cmd.category, params: cmd.params, examples: cmd.examples } });
});

router.post("/commands/invoke", async (req, res) => {
  try {
    const { command, context } = req.body;
    if (!command) { res.status(400).json({ error: "command string required (e.g. '/news2 patientId=P001')" }); return; }
    const result = await invokeCommand(command, context ?? {});
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
