import { Router } from "express";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDeliveryLog,
  getDeliveryStats,
  type Channel,
  type TemplateStatus,
} from "../sl7/messageTemplateService";

const router = Router();

router.get("/api/sl7/templates", async (req, res) => {
  try {
    const { channel, complaint, status } = req.query as { channel?: Channel; complaint?: string; status?: TemplateStatus };
    const templates = await listTemplates({ channel, complaint, status });
    res.json({ templates });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl7/templates/:id", async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json(template);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/sl7/templates", async (req, res) => {
  try {
    const { name, complaint, disposition, channel, status, subject, body, variables } = req.body;
    if (!name || !complaint || !disposition || !channel || !body) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const template = await createTemplate({ name, complaint, disposition, channel, status: status ?? "draft", subject: subject ?? "", body, variables: variables ?? [] });
    res.json(template);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/api/sl7/templates/:id", async (req, res) => {
  try {
    const updated = await updateTemplate(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/api/sl7/templates/:id", async (req, res) => {
  try {
    const ok = await deleteTemplate(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl7/delivery-log", async (_req, res) => {
  try {
    const log = await getDeliveryLog();
    const stats = await getDeliveryStats();
    res.json({ log, stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
