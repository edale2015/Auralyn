import { Router, Request, Response } from "express";
import { getAllTaskAgents } from "../agents/taskAgentRegistry";
import { getAgentStatus, getCoordinatorStats } from "../agents/agentCoordinator";
import { getTaskBusStats, peekQueue, getProcessedLog } from "../agents/taskBus";
import { dispatchTask } from "../agents/controllerAgent";
import { runExecutorCycle } from "../agents/agentExecutor";
import {
  runEvolutionCycle,
  getEvolutionStatus,
} from "../evolution/evolutionLoop";
import { getVersionHistory } from "../evolution/evolutionStore";

const router = Router();

/* ─── Task Bus ──────────────────────────────────────────── */
router.get("/bus/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, stats: getTaskBusStats() });
});

router.get("/bus/queue", (_req: Request, res: Response) => {
  res.json({ ok: true, queue: peekQueue() });
});

router.get("/bus/log", (_req: Request, res: Response) => {
  res.json({ ok: true, log: getProcessedLog(30) });
});

router.post("/bus/dispatch", (req: Request, res: Response) => {
  const { type, payload, priority } = req.body;
  if (!type) return res.status(400).json({ ok: false, error: "type required" });
  const task = dispatchTask(type, payload ?? {}, priority ?? 5, "api");
  res.json({ ok: true, task });
});

router.post("/bus/cycle", async (_req: Request, res: Response) => {
  await runExecutorCycle();
  res.json({ ok: true });
});

/* ─── Agent Status ──────────────────────────────────────── */
router.get("/agents/task", (_req: Request, res: Response) => {
  res.json({ ok: true, agents: getAllTaskAgents() });
});

router.get("/agents/coordinator", (_req: Request, res: Response) => {
  res.json({ ok: true, agents: getAgentStatus(), stats: getCoordinatorStats() });
});

/* ─── Evolution ─────────────────────────────────────────── */
router.get("/evolution/status", (_req: Request, res: Response) => {
  res.json({ ok: true, evolution: getEvolutionStatus() });
});

router.get("/evolution/history", (_req: Request, res: Response) => {
  res.json({ ok: true, history: getVersionHistory(30) });
});

router.post("/evolution/run", async (_req: Request, res: Response) => {
  try {
    const result = await runEvolutionCycle();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
