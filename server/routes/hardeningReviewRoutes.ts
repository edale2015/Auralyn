/**
 * server/routes/hardeningReviewRoutes.ts
 *
 * Hardening Review API — sends 15 slices + ChatGPT recommendations to Claude,
 * returns a phased integration plan.
 *
 * POST /api/hardening-review/run        — synchronous (streams progress via SSE)
 * GET  /api/hardening-review/goals      — returns the preset ChatGPT hardening goals
 * GET  /api/hardening-review/last       — returns the last result (in-memory cache)
 */

import { Router, type Request, type Response } from "express";
import {
  runHardeningReview,
  CHATGPT_HARDENING_GOALS,
  summariseResult,
  type HardeningReviewResult,
} from "../research/hardeningReviewAgent";

const router = Router();

// ── In-memory last result cache (single process, single result) ───────────────
let _lastResult: HardeningReviewResult | null = null;
let _running = false;

// ── GET /api/hardening-review/goals ──────────────────────────────────────────
router.get("/goals", (_req: Request, res: Response) => {
  res.json({
    ok:    true,
    goals: CHATGPT_HARDENING_GOALS,
    count: 7,
    label: "ChatGPT hardening recommendations — 7 highest-risk gaps from Slice 15",
  });
});

// ── GET /api/hardening-review/last ───────────────────────────────────────────
router.get("/last", (_req: Request, res: Response) => {
  if (!_lastResult) {
    return res.status(404).json({ ok: false, error: "No review has been run yet" });
  }
  res.json({ ok: true, result: _lastResult, summary: summariseResult(_lastResult) });
});

// ── POST /api/hardening-review/run — SSE streaming ───────────────────────────
/**
 * Body (optional):
 *   gpt_recommendations?: string — custom ChatGPT recommendations to override defaults
 *
 * Response: Server-Sent Events (text/event-stream) with progress + final result.
 *
 * Events:
 *   data: { type: "progress", message: "..." }
 *   data: { type: "complete", result: HardeningReviewResult, summary: "..." }
 *   data: { type: "error",    error: "..." }
 */
router.post("/run", async (req: Request, res: Response) => {
  if (_running) {
    return res.status(429).json({ ok: false, error: "A review is already running — check /api/hardening-review/last for the previous result" });
  }

  // ── SSE setup ────────────────────────────────────────────────────────────
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const gptRecommendations = req.body?.gpt_recommendations ?? undefined;

  _running = true;
  try {
    send({ type: "progress", message: "Hardening review started…" });

    const result = await runHardeningReview({
      gptRecommendations,
      onProgress: (msg: string) => {
        send({ type: "progress", message: msg });
      },
    });

    _lastResult = result;
    const summary = summariseResult(result);

    send({ type: "complete", result, summary });
    console.log(`[hardeningReview] ${summary}`);
  } catch (err: any) {
    console.error("[hardeningReview] Error:", err?.message);
    send({ type: "error", error: err?.message ?? "Review failed" });
  } finally {
    _running = false;
    res.end();
  }
});

// ── POST /api/hardening-review/run-sync — non-SSE (shorter timeout) ──────────
router.post("/run-sync", async (req: Request, res: Response) => {
  if (_running) {
    return res.status(429).json({ ok: false, error: "A review is already running" });
  }
  _running = true;
  try {
    const logs: string[] = [];
    const result = await runHardeningReview({
      gptRecommendations: req.body?.gpt_recommendations,
      onProgress: (msg: string) => { logs.push(msg); },
    });
    _lastResult = result;
    res.json({ ok: true, result, summary: summariseResult(result), logs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Review failed" });
  } finally {
    _running = false;
  }
});

export default router;
