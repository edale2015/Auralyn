import { Router } from "express";
import { runUIAutomation, runBrowserTask } from "./browserAgent";
import { getTemplate, listTemplates, fillTemplate } from "./templateLibrary";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/templates", requireRole(["admin", "physician"]), (_req, res) => {
  res.json({ ok: true, templates: listTemplates() });
});

router.get("/templates/:id", requireRole(["admin", "physician"]), (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json({ ok: true, template });
});

router.post("/run", requireRole(["admin"]), async (req, res) => {
  const { templateId, variables = {}, headless = true } = req.body;

  const template = getTemplate(templateId);
  if (!template) {
    return res.status(404).json({ error: `Template '${templateId}' not found` });
  }

  const filled = fillTemplate(template, variables);

  try {
    const result = await runUIAutomation({ template: filled, variables, headless });
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/run-task", requireRole(["admin"]), async (req, res) => {
  const { url, steps, headless = true } = req.body;
  if (!url || !Array.isArray(steps)) {
    return res.status(400).json({ error: "url and steps[] required" });
  }
  try {
    const result = await runBrowserTask({ url, steps, headless });
    res.json({ ok: result.success, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/run-custom", requireRole(["admin"]), async (req, res) => {
  const { url, steps, variables = {}, headless = true } = req.body;

  if (!url || !Array.isArray(steps)) {
    return res.status(400).json({ error: "url and steps[] required" });
  }

  const customTemplate = {
    id: "custom",
    name: "Custom Task",
    description: "One-off automation task",
    url,
    steps,
    category: "custom" as const,
  };

  try {
    const result = await runUIAutomation({ template: customTemplate, variables, headless });
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
