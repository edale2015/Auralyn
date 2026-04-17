/**
 * server/automation/recorderRoutes.ts — Browser automation template recorder
 *
 * FIX (Code Review Security Gap):
 *   POST /record and GET /templates were unauthenticated. /record opens a real
 *   Chromium instance and navigates to caller-supplied URLs — a critical SSRF
 *   vector. requirePhysician added to the entire router.
 */

import { Router } from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { startAutomationSession, stopAutomationSession } from "./browser";
import { recordTemplateFromPage } from "./templateRecorder";
import { saveRecordedTemplate, listStoredTemplates } from "./templateStore";

const router = Router();
router.use(requirePhysician);

router.post("/record", async (req, res) => {
  const { url, templateKey, name, description } = req.body || {};

  if (!url || !templateKey || !name) {
    return res.status(400).json({ error: "url, templateKey, and name are required" });
  }

  const session = await startAutomationSession(true);

  try {
    await session.page.goto(url, { waitUntil: "networkidle" });

    const recorded = await recordTemplateFromPage({
      page: session.page,
      templateKey,
      name,
      description,
    });

    const saved = await saveRecordedTemplate(recorded.template);

    res.json({ saved, pageData: recorded.pageData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to record template" });
  } finally {
    await stopAutomationSession(session);
  }
});

router.get("/templates", async (_req, res) => {
  const rows = await listStoredTemplates();
  res.json(rows);
});

export default router;
