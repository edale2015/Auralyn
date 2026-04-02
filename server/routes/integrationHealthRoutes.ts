import { Router } from "express";
import { measureIntegrationHealth } from "../engine/integrationHealthMonitor";
import { getPoolMetrics } from "../db/index";
import { getChatClientAuditLog, getChatTokenBudgetStatus } from "../services/ai/chatgptClient";
import { getPhiAuditLog } from "../middleware/phiGuardOpenAI";
import { getTelegramWebhookAuditLog } from "../integrations/telegramBot";
import { getTelegramSendAuditLog } from "../integrations/telegramAdapter";
import { getWhatsAppSendAuditLog } from "../channels/whatsappClient";
import { getTwilioWASendAuditLog } from "../whatsapp/send";
import { getAgentMetrics, getRegisteredAgents } from "../agents/orchestrator";
import { getAgentConfig } from "../agents/agentConfig";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getLlmBreakerStatus } from "../hardening/resilience/llmClient";

export const integrationHealthRouter = Router();

integrationHealthRouter.get("/health-dashboard", async (req, res) => {
  try {
    const [baseHealth, poolMetrics, gptAudit, phiAudit, tgWebhookAudit, tgSendAudit, waMetaAudit, waTwilioAudit, agentMetrics, breakerStates] = await Promise.all([
      measureIntegrationHealth(),
      Promise.resolve(getPoolMetrics()),
      Promise.resolve(getChatClientAuditLog()),
      Promise.resolve(getPhiAuditLog()),
      Promise.resolve(getTelegramWebhookAuditLog()),
      Promise.resolve(getTelegramSendAuditLog()),
      Promise.resolve(getWhatsAppSendAuditLog()),
      Promise.resolve(getTwilioWASendAuditLog()),
      Promise.resolve(getAgentMetrics()),
      Promise.resolve(getAllBreakerStates()),
    ]);

    const tokenBudget = getChatTokenBudgetStatus();
    const agentConfig = getAgentConfig();
    const registeredAgents = getRegisteredAgents();

    const recentGptCalls = gptAudit.slice(-100);
    const gptErrorRate = recentGptCalls.length > 0
      ? Math.round((recentGptCalls.filter(e => !e.ok).length / recentGptCalls.length) * 100)
      : 0;
    const gptCacheHitRate = recentGptCalls.length > 0
      ? Math.round((recentGptCalls.filter(e => e.cached).length / recentGptCalls.length) * 100)
      : 0;
    const phiEventCount24h = phiAudit.filter(e =>
      Date.now() - new Date(e.timestamp).getTime() < 86_400_000
    ).length;

    const recentTgSends = tgSendAudit.slice(-50);
    const tgSendSuccessRate = recentTgSends.length > 0
      ? Math.round((recentTgSends.filter(e => e.ok).length / recentTgSends.length) * 100)
      : 100;
    const tgWebhookCount = tgWebhookAudit.length;
    const tgPhiDetections = tgWebhookAudit.filter(e => e.phiDetected).length;
    const tgRateLimited = tgWebhookAudit.filter(e => e.rateLimited).length;

    const recentWaMeta = waMetaAudit.slice(-50);
    const waTwilio = waTwilioAudit.slice(-50);
    const waMetaSuccessRate = recentWaMeta.length > 0
      ? Math.round((recentWaMeta.filter(e => e.ok).length / recentWaMeta.length) * 100)
      : 100;
    const waRateLimited = [...recentWaMeta, ...waTwilio].filter(e => (e as any).rateLimited).length;
    const waPhiEvents = [...recentWaMeta, ...waTwilio].filter(e => (e as any).phiFound).length;
    const waDuplicatesBlocked = waTwilio.filter(e => (e as any).duplicate).length;

    const llmBreakerStatus = getLlmBreakerStatus();

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      base: baseHealth,
      openai: {
        tokenBudget,
        gptErrorRate,
        gptCacheHitRate,
        totalCallsTracked: gptAudit.length,
        phiEventsLast24h: phiEventCount24h,
        breakerState: llmBreakerStatus,
        recentCalls: recentGptCalls.slice(-10),
      },
      telegram: {
        webhookCount: tgWebhookCount,
        phiDetectionsTotal: tgPhiDetections,
        rateLimitedTotal: tgRateLimited,
        sendSuccessRate: tgSendSuccessRate,
        recentSends: recentTgSends.slice(-10),
      },
      whatsapp: {
        metaSuccessRate: waMetaSuccessRate,
        rateLimitedBlocked: waRateLimited,
        phiRedactionEvents: waPhiEvents,
        duplicatesBlocked: waDuplicatesBlocked,
        recentMetaSends: recentWaMeta.slice(-10),
        recentTwilioSends: waTwilio.slice(-10),
      },
      database: {
        poolMetrics,
        breakerState: breakerStates.find(b => b.name === "database") ?? { state: "closed" },
      },
      agents: {
        registered: registeredAgents,
        config: agentConfig,
        metrics: agentMetrics,
        breakerStates: breakerStates.filter(b => b.name.startsWith("agent:")),
      },
      circuitBreakers: breakerStates,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "Health check failed" });
  }
});

integrationHealthRouter.get("/health-dashboard/circuit-breakers", (req, res) => {
  return res.json({ ok: true, breakers: getAllBreakerStates() });
});

integrationHealthRouter.get("/health-dashboard/agents", (req, res) => {
  return res.json({
    ok: true,
    registered: getRegisteredAgents(),
    config: getAgentConfig(),
    metrics: getAgentMetrics(),
  });
});

integrationHealthRouter.get("/health-dashboard/openai", (req, res) => {
  return res.json({
    ok: true,
    tokenBudget: getChatTokenBudgetStatus(),
    phiAuditRecent: getPhiAuditLog().slice(-20),
    callsRecent: getChatClientAuditLog().slice(-20),
    breakerStatus: getLlmBreakerStatus(),
  });
});

integrationHealthRouter.get("/health-dashboard/database", (req, res) => {
  return res.json({
    ok: true,
    pool: getPoolMetrics(),
    breaker: getAllBreakerStates().find(b => b.name === "database"),
  });
});
