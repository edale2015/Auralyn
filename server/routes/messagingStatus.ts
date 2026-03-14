import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getChannelOpsTracker } from "../channels/channelOps";
import { loadConfig } from "../config";

export const messagingStatusRouter = Router();

interface AlertThresholds {
  maxFrictionEscalations: number;
  maxLlmBudgetHits: number;
  maxInboundPerChannel: number;
  maxCircuitBreakerActivations: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  maxFrictionEscalations: 10,
  maxLlmBudgetHits: 5,
  maxInboundPerChannel: 1000,
  maxCircuitBreakerActivations: 3,
};

let currentThresholds: AlertThresholds = { ...DEFAULT_THRESHOLDS };

function computeAlerts(channels: Record<string, any>, thresholds: AlertThresholds): string[] {
  const alerts: string[] = [];
  for (const [name, ch] of Object.entries(channels)) {
    const m = ch.metrics;
    if (!m) continue;
    if (m.frictionEscalations >= thresholds.maxFrictionEscalations) {
      alerts.push(`[${name}] Friction escalations (${m.frictionEscalations}) exceeded threshold (${thresholds.maxFrictionEscalations})`);
    }
    if (m.llm?.budgetExceededCount >= thresholds.maxLlmBudgetHits) {
      alerts.push(`[${name}] LLM budget hits (${m.llm.budgetExceededCount}) exceeded threshold (${thresholds.maxLlmBudgetHits})`);
    }
    if (m.inboundCount >= thresholds.maxInboundPerChannel) {
      alerts.push(`[${name}] Inbound messages (${m.inboundCount}) exceeded threshold (${thresholds.maxInboundPerChannel})`);
    }
    if (m.circuitBreakerActivations >= thresholds.maxCircuitBreakerActivations) {
      alerts.push(`[${name}] Circuit breaker activations (${m.circuitBreakerActivations}) exceeded threshold (${thresholds.maxCircuitBreakerActivations})`);
    }
  }
  return alerts;
}

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

  const alerts = computeAlerts(channels, currentThresholds);

  res.json({
    ok: true,
    resetAt: report.resetAt,
    channels,
    summary: {
      totalInbound: Object.values(channels).reduce((sum: number, c: any) => sum + (c.metrics?.inboundCount ?? 0), 0),
      totalFrictionEscalations: Object.values(channels).reduce((sum: number, c: any) => sum + (c.metrics?.frictionEscalations ?? 0), 0),
      anyCircuitBreakerActive: Object.values(channels).some((c: any) => c.metrics?.llm?.cooldownActive),
    },
    alerts,
    thresholds: currentThresholds,
  });
});

messagingStatusRouter.get("/api/messaging/thresholds", requireRole(["admin"]), (_req, res) => {
  res.json({ thresholds: currentThresholds, defaults: DEFAULT_THRESHOLDS });
});

messagingStatusRouter.post("/api/messaging/thresholds", requireRole(["admin"]), (req, res) => {
  const body = req.body as Partial<AlertThresholds>;
  currentThresholds = {
    maxFrictionEscalations: Number(body.maxFrictionEscalations ?? currentThresholds.maxFrictionEscalations),
    maxLlmBudgetHits: Number(body.maxLlmBudgetHits ?? currentThresholds.maxLlmBudgetHits),
    maxInboundPerChannel: Number(body.maxInboundPerChannel ?? currentThresholds.maxInboundPerChannel),
    maxCircuitBreakerActivations: Number(body.maxCircuitBreakerActivations ?? currentThresholds.maxCircuitBreakerActivations),
  };
  res.json({ ok: true, thresholds: currentThresholds });
});

messagingStatusRouter.post("/api/messaging/reset-metrics", requireRole(["admin"]), async (_req, res) => {
  const tracker = getChannelOpsTracker();
  tracker.reset();
  res.json({ ok: true, message: "Channel metrics reset" });
});
