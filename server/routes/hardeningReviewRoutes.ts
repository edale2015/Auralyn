/**
 * server/routes/hardeningReviewRoutes.ts
 *
 * Hardening Review API
 *
 * GET  /api/hardening-review/goals                  — preset ChatGPT hardening goals
 * GET  /api/hardening-review/last                   — last review result (in-memory cache)
 * POST /api/hardening-review/run                    — SSE streaming review
 * POST /api/hardening-review/run-sync               — synchronous review (no SSE)
 *
 * Webhook (for ChatGPT → Auralyn pipeline, no manual input):
 * POST /api/hardening-review/webhook/upload-zip     — receive new ZIP bundle
 * GET  /api/hardening-review/webhook/status         — list available bundles + last upload
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import {
  runHardeningReview,
  CHATGPT_HARDENING_GOALS,
  summariseResult,
  findNewestZip,
  type HardeningReviewResult,
} from "../research/hardeningReviewAgent";

const router = Router();

// ── In-memory last result cache ───────────────────────────────────────────────
let _lastResult: HardeningReviewResult | null = null;
let _running = false;

// ── Hardening bundles directory ───────────────────────────────────────────────
const BUNDLES_DIR = path.join(process.cwd(), "attached_assets", "hardening_bundles");
if (!fs.existsSync(BUNDLES_DIR)) fs.mkdirSync(BUNDLES_DIR, { recursive: true });

// ── Multer — disk storage, ZIP only, 50 MB cap ───────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BUNDLES_DIR),
  filename: (_req, file, cb) => {
    const ts   = Date.now();
    const ext  = path.extname(file.originalname) || ".zip";
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${base}_${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" ||
        file.mimetype === "application/x-zip-compressed" ||
        file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted"));
    }
  },
});

// ── Webhook secret auth middleware ────────────────────────────────────────────
function requireWebhookSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.HARDENING_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({
      ok:    false,
      error: "Webhook secret not configured — set HARDENING_WEBHOOK_SECRET env var",
    });
  }
  const provided = req.headers["x-webhook-secret"] as string | undefined;
  if (!provided || provided !== secret) {
    return res.status(401).json({ ok: false, error: "Invalid or missing X-Webhook-Secret header" });
  }
  next();
}

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

  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (data: object) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
  const gptRecommendations = req.body?.gpt_recommendations ?? undefined;

  _running = true;
  try {
    send({ type: "progress", message: "Hardening review started…" });

    const result = await runHardeningReview({
      gptRecommendations,
      onProgress: (msg: string) => send({ type: "progress", message: msg }),
    });

    _lastResult = result;
    send({ type: "complete", result, summary: summariseResult(result) });
    console.log(`[hardeningReview] ${summariseResult(result)}`);
  } catch (err: any) {
    console.error("[hardeningReview] Error:", err?.message);
    send({ type: "error", error: err?.message ?? "Review failed" });
  } finally {
    _running = false;
    res.end();
  }
});

// ── POST /api/hardening-review/run-sync — non-SSE ────────────────────────────
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

// ── POST /api/hardening-review/webhook/upload-zip ────────────────────────────
/**
 * Called automatically by ChatGPT's code interpreter to deliver a new
 * hardening bundle ZIP. No manual steps required on the Auralyn side.
 *
 * Required header:
 *   X-Webhook-Secret: <HARDENING_WEBHOOK_SECRET>
 *
 * Body: multipart/form-data
 *   bundle: <zip file>
 *
 * Response:
 *   { ok: true, filename, path, sizeBytes, newestZip }
 *
 * ChatGPT Python example:
 *   import requests
 *   with open("hardening_bundle.zip", "rb") as f:
 *       r = requests.post(
 *           "https://<your-replit-url>/api/hardening-review/webhook/upload-zip",
 *           headers={"X-Webhook-Secret": "<secret>"},
 *           files={"bundle": f}
 *       )
 *   print(r.json())
 */
router.post(
  "/webhook/upload-zip",
  requireWebhookSecret as any,
  upload.single("bundle"),
  (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file uploaded — include a ZIP as the 'bundle' field" });
    }

    const { filename, path: filePath, size } = req.file;
    const newest = findNewestZip();

    console.log(`[hardeningWebhook] New bundle received: ${filename} (${size.toLocaleString()} bytes)`);

    res.json({
      ok:        true,
      filename,
      path:      filePath,
      sizeBytes: size,
      message:   `Bundle saved. Next review run will use: ${newest ?? filename}`,
      newestZip: newest,
    });
  }
);

// ── GET /api/hardening-review/webhook/status ─────────────────────────────────
/**
 * Lists all available hardening bundles and shows which one will be used
 * by the next review run.
 */
router.get("/webhook/status", (_req: Request, res: Response) => {
  const webhookConfigured = !!process.env.HARDENING_WEBHOOK_SECRET;

  // Collect all ZIPs: root attached_assets + hardening_bundles subdir
  const rootDir     = path.join(process.cwd(), "attached_assets");
  const allZips: Array<{ file: string; dir: string; mtimeMs: number; sizeBytes: number }> = [];

  for (const dir of [rootDir, BUNDLES_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".zip")) continue;
      const full  = path.join(dir, f);
      const stat  = fs.statSync(full);
      allZips.push({ file: f, dir, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
    }
  }

  allZips.sort((a, b) => b.mtimeMs - a.mtimeMs);

  res.json({
    ok:               true,
    webhookConfigured,
    webhookSecretSet: webhookConfigured,
    uploadEndpoint:   "POST /api/hardening-review/webhook/upload-zip",
    requiredHeader:   "X-Webhook-Secret: <HARDENING_WEBHOOK_SECRET>",
    requiredField:    "bundle (multipart/form-data)",
    newestZip:        findNewestZip(),
    availableBundles: allZips.map(z => ({
      filename:       z.file,
      directory:      z.dir,
      sizeBytes:      z.sizeBytes,
      uploadedAt:     new Date(z.mtimeMs).toISOString(),
    })),
  });
});

export default router;
