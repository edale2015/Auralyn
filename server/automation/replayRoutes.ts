import { Router } from "express";
import { getAutomationRunDetail } from "./automationService";

const router = Router();

router.get("/:runId/timeline", async (req, res) => {
  try {
    const detail = await getAutomationRunDetail(req.params.runId);

    const timeline = (detail.events || []).map((event: any) => ({
      id: event.id,
      ts: event.created_at,
      label: event.event_type,
      stepIndex: event.step_index,
      actionName: event.action_name,
      screenshotKey: event.screenshot_key,
      payload: event.payload,
    }));

    res.json({ run: detail.run, timeline });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load timeline" });
  }
});

export default router;
