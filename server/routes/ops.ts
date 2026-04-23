import { Router } from "express";
import OpenAI from "openai";
import { getAllQueueHealth } from "../queue/queueHealth";
import { listSystemEvents } from "../repos/systemEventRepo";
import { listRecentJobs } from "../repos/jobRepo";
import { listRecentMetricSnapshots } from "../repos/metricsRepo";
import { testDbConnection, db } from "../db";
import { getRedisAsync } from "../queue/redis";
import { researchArticles, researchReviews, agentHandoffs } from "../../shared/schema";
import { sql, count } from "drizzle-orm";

const router = Router();

// ── GET /api/ops/summary ──────────────────────────────────────────────────────

router.get("/summary", async (_req, res) => {
  let database = { ok: false as boolean, error: undefined as string | undefined };
  let redis = { ok: false as boolean, configured: false as boolean, error: undefined as string | undefined };

  try {
    await testDbConnection();
    database.ok = true;
  } catch (err: any) {
    database.error = err?.message || "DB failure";
  }

  try {
    const client = await Promise.race([
      getRedisAsync(),
      new Promise<null>(r => setTimeout(() => r(null), 3000)),
    ]);
    if (client) {
      redis.configured = true;
      try {
        const pong = await Promise.race([
          client.ping(),
          new Promise<string>(r => setTimeout(() => r("TIMEOUT"), 2000)),
        ]);
        redis.ok = typeof pong === "string" && pong.toUpperCase() === "PONG";
        if (!redis.ok) redis.error = pong === "TIMEOUT" ? "Redis ping timed out" : "Redis ping failed";
      } catch (pingErr: any) {
        redis.ok = false;
        redis.error = "Redis ping failed";
      }
    } else {
      redis.configured = false;
      redis.ok = true;
    }
  } catch (err: any) {
    redis.configured = true;
    redis.error = "Redis connection failed";
  }

  const [queues, events, jobs, metrics] = await Promise.allSettled([
    getAllQueueHealth(),
    listSystemEvents(20),
    listRecentJobs(undefined, 20),
    listRecentMetricSnapshots(undefined, 50)
  ]);

  res.json({
    services: {
      api: { ok: true },
      database,
      redis
    },
    queues: queues.status === "fulfilled" ? queues.value : {},
    recentEvents: events.status === "fulfilled" ? events.value : [],
    recentJobs: jobs.status === "fulfilled" ? jobs.value : [],
    recentMetrics: metrics.status === "fulfilled" ? metrics.value : []
  });
});

// ── POST /api/ops/ask — AI conversational ops assistant ───────────────────────

function makeOpenAI() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");
  return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

router.post("/ask", async (req, res) => {
  try {
    const { question, history = [] } = req.body ?? {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    // ── Gather live operational context in parallel ──
    const [
      queueResult,
      articleCountResult,
      handoffCountResult,
      dbResult,
    ] = await Promise.allSettled([
      getAllQueueHealth(),
      db.select({
        verdict: researchReviews.verdict,
        cnt: count(),
      })
        .from(researchReviews)
        .groupBy(researchReviews.verdict),
      db.select({
        status: agentHandoffs.pipelineStatus,
        cnt: count(),
      })
        .from(agentHandoffs)
        .groupBy(agentHandoffs.pipelineStatus),
      testDbConnection().then(() => true).catch(() => false),
    ]);

    const queues      = queueResult.status === "fulfilled"      ? queueResult.value      : {};
    const articleRows = articleCountResult.status === "fulfilled" ? articleCountResult.value : [];
    const handoffRows = handoffCountResult.status === "fulfilled" ? handoffCountResult.value : [];
    const dbOk        = dbResult.status === "fulfilled"          ? dbResult.value          : false;

    // ── Summarise queue health ──
    type QueueStat = { waiting?: number; active?: number; completed?: number; failed?: number };
    const queueLines = Object.entries(queues as Record<string, QueueStat>).map(([name, q]) =>
      `  • ${name}: ${q?.waiting ?? 0} waiting, ${q?.active ?? 0} active, ${q?.completed ?? 0} completed, ${q?.failed ?? 0} failed`
    ).join("\n");

    // ── Summarise research pipeline ──
    const articleSummary = articleRows.map(r => `  • ${r.verdict ?? "unreviewed"}: ${r.cnt}`).join("\n") || "  • No articles yet";

    // ── Summarise handoff status ──
    const handoffSummary = handoffRows.map(r => `  • ${r.status ?? "unknown"}: ${r.cnt}`).join("\n") || "  • No handoffs yet";

    // ── Total article and handoff counts ──
    const totalArticles = articleRows.reduce((s, r) => s + Number(r.cnt), 0);
    const totalHandoffs = handoffRows.reduce((s, r) => s + Number(r.cnt), 0);
    const pendingApproval = handoffRows.find(r => r.status === "awaiting_approval")?.cnt ?? 0;
    const failedHandoffs  = handoffRows.find(r => r.status === "failed")?.cnt ?? 0;

    const context = `
AURALYN REAL-TIME OPERATIONS SNAPSHOT — ${new Date().toISOString()}

SYSTEM HEALTH
  • Database: ${dbOk ? "OK" : "DEGRADED"}
  • Redis: (used for queue backend; connection status visible in dashboard)

QUEUE HEALTH
${queueLines || "  • No queue data available"}

RESEARCH PIPELINE
  Total articles ingested: ${totalArticles}
  By triage verdict:
${articleSummary}

AGENT HANDOFF QUEUE
  Total handoff records: ${totalHandoffs}
  Pending physician approval: ${pendingApproval}
  Failed pipelines: ${failedHandoffs}
  By status:
${handoffSummary}

KEY ATTENTION ITEMS
${Number(pendingApproval) > 0 ? `  ⚠ ${pendingApproval} handoff(s) awaiting your approval — review in Agent Handoff Queue` : "  ✓ No handoffs awaiting approval"}
${Number(failedHandoffs) > 0 ? `  ⚠ ${failedHandoffs} pipeline failure(s) — check logs` : "  ✓ No pipeline failures"}
`.trim();

    const systemPrompt = `You are Auralyn Ops AI — an intelligent clinical operations assistant for a busy NYC urgent care clinic that processes 500+ patients per day.

Your job is to answer the physician's questions about the live operational state of Auralyn's systems. You have access to real-time data: queue health, research pipeline status, AI handoff queue, and system health.

Style: be concise, clear, and actionable. Lead with what matters most. Highlight anything that needs immediate attention. Never hallucinate — if the data doesn't show something, say so. Use bullet points for multi-item answers.

When the physician asks what needs attention, surface the most critical items first. When they ask about the research pipeline, give specific numbers. When they ask about system health, interpret the meaning (not just the raw stat).

Current live context:
---
${context}
---`;

    const openai = makeOpenAI();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      // Replay conversation history (limit to last 6 turns to stay within context)
      ...((Array.isArray(history) ? history : []) as Array<{ role: string; content: string }>)
        .slice(-6)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: question },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 600,
      temperature: 0.3,
    });

    const answer = completion.choices[0]?.message?.content ?? "No response generated.";
    res.json({ ok: true, answer, context: { totalArticles, totalHandoffs, pendingApproval, failedHandoffs } });

  } catch (e: any) {
    console.error("[ops/ask] error:", e?.message);
    res.status(500).json({ ok: false, error: e?.message ?? "AI assistant error" });
  }
});

export default router;
