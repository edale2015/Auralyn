/**
 * Harness Engineering routes — /api/harness/*
 * Exposes the five Claude-Code-inspired harness mechanisms.
 */

import express from "express";
import {
  writePlan, formatBoard, claimNextTask, updateTask,
  boardProgress, addTask, getBoard,
} from "../agents/clinicalTaskBoard";
import {
  registerAgent, protocolSend, protocolReceive, protocolComplete,
  protocolUnblock, listAgents, getAgentState, formatStateLog, getStateLog,
} from "../agents/agentProtocol";
import {
  newSession, saveSession, loadSession, listSessions,
  forkSession, deleteSession, appendMessage, sessionSummary,
} from "../session/agentSession";
import {
  dispatch, drainNotifications, formatNotification,
  getTask, awaitTask, listTasks,
} from "../agents/backgroundQueue";
import {
  buildClinicalSystemPrompt, addVariableBlock, toMessages,
  recordUsage, getCacheStats, formatCacheStats,
} from "../ai/promptCache";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Clinical Task Board (TodoWrite)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/board/plan", (req, res) => {
  try {
    const { boardId, title, tasks } = req.body;
    if (!boardId || !title || !Array.isArray(tasks)) {
      res.status(400).json({ error: "boardId, title, and tasks[] required" }); return;
    }
    const { board, summary } = writePlan(boardId, title, tasks);
    res.json({ board, summary });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/board/:boardId", (req, res) => {
  const board = getBoard(req.params.boardId);
  if (!board) { res.status(404).json({ error: "Board not found" }); return; }
  res.json({ board, formatted: formatBoard(board), progress: boardProgress(req.params.boardId) });
});

router.post("/board/:boardId/claim", (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: "agentId required" }); return; }
  const task = claimNextTask(req.params.boardId, agentId);
  if (!task) { res.json({ task: null, message: "No unblocked pending tasks available" }); return; }
  res.json({ task });
});

router.patch("/board/:boardId/task/:taskId", (req, res) => {
  const { status, result, error } = req.body;
  if (!status) { res.status(400).json({ error: "status required" }); return; }
  const task = updateTask(req.params.boardId, req.params.taskId, status, result, error);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const board = getBoard(req.params.boardId)!;
  res.json({ task, formatted: formatBoard(board), progress: boardProgress(req.params.boardId) });
});

router.post("/board/:boardId/task", (req, res) => {
  const { description, priority, dependsOn } = req.body;
  if (!description) { res.status(400).json({ error: "description required" }); return; }
  const task = addTask(req.params.boardId, description, { priority, dependsOn });
  if (!task) { res.status(404).json({ error: "Board not found" }); return; }
  res.status(201).json({ task });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FSM Agent Protocol
// ─────────────────────────────────────────────────────────────────────────────

router.post("/protocol/agents", (req, res) => {
  const { name, id } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const agent = registerAgent(name, id);
  res.status(201).json({ agent });
});

router.get("/protocol/agents", (_req, res) => {
  res.json({ agents: listAgents() });
});

router.get("/protocol/agents/:idOrName/state", (req, res) => {
  const state = getAgentState(req.params.idOrName);
  if (state === null) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json({ state });
});

router.post("/protocol/send", (req, res) => {
  const { fromId, toId, body, replyTo } = req.body;
  if (!fromId || !toId || !body) { res.status(400).json({ error: "fromId, toId, body required" }); return; }
  const result = protocolSend(fromId, toId, body, replyTo);
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/protocol/receive/:agentId", (req, res) => {
  const msg = protocolReceive(req.params.agentId);
  res.json({ message: msg, received: msg !== null });
});

router.post("/protocol/complete/:agentId", (req, res) => {
  protocolComplete(req.params.agentId);
  res.json({ ok: true });
});

router.post("/protocol/unblock/:agentId", (req, res) => {
  protocolUnblock(req.params.agentId);
  res.json({ ok: true });
});

router.get("/protocol/log", (_req, res) => {
  res.json({ log: getStateLog(), formatted: formatStateLog() });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Session Persistence
// ─────────────────────────────────────────────────────────────────────────────

router.post("/sessions", (req, res) => {
  const { title, patientId, tags } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const session = newSession(title, patientId, tags);
  res.status(201).json({ session, summary: sessionSummary(session) });
});

router.get("/sessions", (req, res) => {
  const { patientId } = req.query;
  res.json({ sessions: listSessions(patientId as string | undefined) });
});

router.get("/sessions/:id", (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json({ session, summary: sessionSummary(session) });
});

router.post("/sessions/:id/save", (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (req.body.message) {
    appendMessage(session, req.body.message.role, req.body.message.content);
  }
  saveSession(session);
  res.json({ saved: true, session });
});

router.post("/sessions/:id/fork", (req, res) => {
  const fork = forkSession(req.params.id, req.body.title);
  if (!fork) { res.status(404).json({ error: "Source session not found" }); return; }
  res.status(201).json({ fork, summary: sessionSummary(fork) });
});

router.delete("/sessions/:id", (req, res) => {
  const deleted = deleteSession(req.params.id);
  res.json({ deleted });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Background Task Queue
// ─────────────────────────────────────────────────────────────────────────────

router.post("/bg/dispatch", async (req, res) => {
  try {
    const { label, simulate, timeoutMs } = req.body;
    if (!label) { res.status(400).json({ error: "label required" }); return; }

    const task = dispatch(
      label,
      async () => {
        const delay = Number(simulate?.delayMs ?? 50);
        await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));
        if (simulate?.fail) throw new Error(simulate.failMessage ?? "Simulated failure");
        return simulate?.result ?? { completed: true, label };
      },
      { timeoutMs: timeoutMs ?? 30_000 }
    );

    res.status(202).json({ task: { id: task.id, label: task.label, status: task.status } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/bg/tasks", (_req, res) => {
  res.json({ tasks: listTasks() });
});

router.get("/bg/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json({ task });
});

router.get("/bg/tasks/:id/await", async (req, res) => {
  try {
    const timeoutMs = Number(req.query.timeoutMs ?? 30_000);
    const task = await awaitTask(req.params.id, 100, timeoutMs);
    res.json({ task });
  } catch (err) { res.status(408).json({ error: String(err) }); }
});

router.get("/bg/notifications", (_req, res) => {
  const notifications = drainNotifications();
  res.json({
    count: notifications.length,
    notifications,
    formatted: notifications.map(formatNotification),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Prompt Cache
// ─────────────────────────────────────────────────────────────────────────────

router.post("/cache/build", (req, res) => {
  try {
    const { sessionId, guidelines, scoringRules, patientData } = req.body;
    if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

    const prompt = buildClinicalSystemPrompt({ sessionId, guidelines, scoringRules, patientData });
    const messages = toMessages(prompt);

    const stableBlocks  = prompt.blocks.filter((b) => b.type === "stable");
    const variableBlocks = prompt.blocks.filter((b) => b.type === "variable");
    const stableTokenEst = stableBlocks.reduce((s, b) => s + (b.tokenEstimate ?? 0), 0);

    recordUsage(prompt, false);  // first call = cache miss

    res.json({
      sessionId,
      blockCount: prompt.blocks.length,
      stableBlocks:   stableBlocks.map((b) => ({ label: b.label, tokenEstimate: b.tokenEstimate })),
      variableBlocks: variableBlocks.map((b) => ({ label: b.label, tokenEstimate: b.tokenEstimate })),
      stableTokenEstimate: stableTokenEst,
      messages,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/cache/:sessionId/hit", (req, res) => {
  const { guidelines, scoringRules } = req.body;
  const prompt = buildClinicalSystemPrompt({
    sessionId: req.params.sessionId,
    guidelines, scoringRules,
    patientData: req.body.patientData,
  });
  recordUsage(prompt, true);
  res.json(getCacheStats(req.params.sessionId));
});

router.get("/cache/:sessionId/stats", (req, res) => {
  const stats = getCacheStats(req.params.sessionId);
  if (!stats) { res.status(404).json({ error: "No stats for this session" }); return; }
  res.json({ stats, formatted: formatCacheStats(req.params.sessionId) });
});

export default router;
