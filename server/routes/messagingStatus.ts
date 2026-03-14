import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getChannelOpsTracker } from "../channels/channelOps";
import { loadConfig } from "../config";

export const messagingStatusRouter = Router();

messagingStatusRouter.get("/api/messaging/status", requireRole(["admin", "physician"]), async (_req, res) => {
  const config = loadConfig();
  const tracker = getChannelOpsTracker();
  const report = tracker.getReport();

  const channels: Record<string, any> = {
    whatsapp: {
      configured: config.ENABLE_TWILIO === "1" && !!config.TWILIO_ACCOUNT_SID,
      enabled: config.ENABLE_TWILIO === "1",
      from: config.TWILIO_WHATSAPP_FROM || null,
      metrics: report.channels?.["whatsapp"] || null,
    },
    telegram: {
      configured: !!process.env.TELEGRAM_BOT_TOKEN,
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      metrics: report.channels?.["telegram"] || null,
    },
  };

  res.json({
    ok: true,
    resetAt: report.resetAt,
    channels,
    summary: {
      totalInbound: Object.values(channels).reduce((sum: number, c: any) => sum + (c.metrics?.inboundCount ?? 0), 0),
      totalFrictionEscalations: Object.values(channels).reduce((sum: number, c: any) => sum + (c.metrics?.frictionEscalations ?? 0), 0),
      anyCircuitBreakerActive: Object.values(channels).some((c: any) => c.metrics?.llm?.cooldownActive),
    },
  });
});

messagingStatusRouter.post("/api/messaging/reset-metrics", requireRole(["admin"]), async (_req, res) => {
  const tracker = getChannelOpsTracker();
  tracker.reset();
  res.json({ ok: true, message: "Channel metrics reset" });
});
