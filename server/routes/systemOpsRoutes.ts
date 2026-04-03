import { Router } from "express";
import { getSystemOpsComponents, restartLoop } from "../monitoring/systemOpsRegistry";
import { toggleSkill } from "../core/skills/skillRegistry";
import { resetEngineStatus } from "../monitoring/healthRegistry";

export const systemOpsRouter = Router();

// ─── GET all components ───────────────────────────────────────────────────────
systemOpsRouter.get("/api/system-ops/grid", async (_req, res, next) => {
  try {
    const components = await getSystemOpsComponents();
    res.json({ components, total: components.length, generatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ─── Restart a loop ───────────────────────────────────────────────────────────
systemOpsRouter.post("/api/system-ops/loops/:name/restart", (req, res) => {
  const ok = restartLoop(req.params.name);
  if (!ok) return res.status(404).json({ error: "Loop not found or has no restart function" });
  res.json({ ok: true, name: req.params.name, message: "Restart triggered" });
});

// ─── Toggle a skill ───────────────────────────────────────────────────────────
systemOpsRouter.post("/api/system-ops/skills/:id/toggle", (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) required" });
  const ok = toggleSkill(req.params.id, enabled);
  if (!ok) return res.status(404).json({ error: "Skill not found" });
  res.json({ ok: true, id: req.params.id, enabled });
});

// ─── Reset engine error status ────────────────────────────────────────────────
systemOpsRouter.post("/api/system-ops/engines/:name/reset", (req, res) => {
  resetEngineStatus(req.params.name);
  res.json({ ok: true, name: req.params.name, message: "Status reset to green" });
});
