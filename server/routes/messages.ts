import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listMessages, getMessageStats, routeMessage } from "../services/messageRoutingService";
import {
  listThresholds, setThreshold, checkThreshold, recordSend,
  getCurrentUsage, listBreachEvents, logBreachEvent,
} from "../services/messagingThresholds";

export const messagesRouter = Router();

messagesRouter.get("/", requireRole(["admin", "physician", "staff"]), async (_req, res) => {
  res.json({ messages: listMessages() });
});

messagesRouter.get("/stats", requireRole(["admin"]), async (_req, res) => {
  res.json(getMessageStats());
});

messagesRouter.post("/send", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { recipientId, content, channels } = req.body;
    if (!recipientId || !content) { res.status(400).json({ error: "recipientId and content required" }); return; }

    // ── Threshold check ──────────────────────────────────────────────────
    const channelList: string[] = Array.isArray(channels) ? channels : ["whatsapp"];
    const breaches: { channel: string; reason: string }[] = [];
    for (const ch of channelList) {
      const check = checkThreshold(ch, recipientId);
      if (!check.allowed) {
        breaches.push({ channel: ch, reason: check.reason ?? "Threshold exceeded" });
        logBreachEvent({ channel: ch, breachType: check.breachType!, current: 0, limit: 0, recipientId, timestamp: new Date().toISOString() });
      }
    }
    if (breaches.length > 0) {
      return res.status(429).json({ error: "Messaging threshold exceeded", breaches });
    }

    const msg = routeMessage(recipientId, content, channels);
    channelList.forEach((ch) => recordSend(ch, recipientId));
    res.json(msg);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

// ── Threshold management ──────────────────────────────────────────────────────

messagesRouter.get("/thresholds", requireRole(["admin"]), (_req, res) => {
  const thresholds = listThresholds();
  const usage = getCurrentUsage();
  const recentBreaches = listBreachEvents(20);
  res.json({ thresholds, usage, recentBreaches });
});

messagesRouter.post("/thresholds/:channel", requireRole(["admin"]), (req, res) => {
  try {
    const { channel } = req.params;
    const { dailyLimit, hourlyLimit, perRecipientDailyLimit, enabled, alertOnBreach } = req.body;
    const updatedBy = (req as any).user?.email ?? "admin";
    const result = setThreshold(channel, {
      dailyLimit: dailyLimit !== undefined ? Number(dailyLimit) : undefined,
      hourlyLimit: hourlyLimit !== undefined ? Number(hourlyLimit) : undefined,
      perRecipientDailyLimit: perRecipientDailyLimit !== undefined ? Number(perRecipientDailyLimit) : undefined,
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      alertOnBreach: alertOnBreach !== undefined ? Boolean(alertOnBreach) : undefined,
    }, updatedBy);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update threshold" });
  }
});

messagesRouter.get("/thresholds/breaches", requireRole(["admin"]), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ breaches: listBreachEvents(limit) });
});
