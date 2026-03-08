import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { runAgentTask, listTasks, getTask } from "../services/agents/openSourceAgentAdapter";
import { listTools } from "../services/agents/toolRegistry";
import { registerClinicalTools } from "../services/agents/clinicalAgentTools";

registerClinicalTools();

export const agentTasksRouter = Router();

agentTasksRouter.get("/tools", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json({ tools: listTools().map((t) => ({ id: t.id, name: t.name, description: t.description, category: t.category })) });
});

agentTasksRouter.get("/", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json({ tasks: listTasks() });
});

agentTasksRouter.get("/:taskId", requireRole(["admin", "physician"]), async (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

agentTasksRouter.post("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { instruction } = req.body;
    if (!instruction) { res.status(400).json({ error: "instruction required" }); return; }
    const task = await runAgentTask(instruction);
    res.json(task);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
