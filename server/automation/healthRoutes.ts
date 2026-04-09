/**
 * Health Routes — REST API for Upgrade 4 (Template Health Dashboard)
 *
 * GET  /api/automation/health              — offline health report for all stored templates
 * GET  /api/automation/scores             — all selector scores
 * GET  /api/automation/scores/:key        — selector scores for one template
 * POST /api/automation/scores/record      — record a selector result
 * GET  /api/automation/repair/scan        — autonomous repair scan (no live browser)
 * POST /api/automation/repair/apply       — apply a specific repair recommendation
 * GET  /api/automation/summaries          — template health summaries for dashboard
 */

import { Router } from "express";
import { listStoredTemplates, getStoredTemplate } from "./templateStore";
import { listAutomationTemplates, getAutomationTemplate, validateTemplateSelectors } from "./templateRegistry";
import {
  getAllScores,
  getTemplateScores,
  getBrokenSelectors,
  recordSelectorResult,
} from "./selectorScore";
import { runRepairScan, applyRepair, getTemplateSummaries } from "./repairAgent";

const router = Router();

// ── Template health (offline — no browser, uses stored scores) ───────────────

router.get("/health", async (_req, res) => {
  try {
    const stored = await listStoredTemplates();
    const templates = stored.length > 0
      ? stored.map((r: any) => r.definition)
      : listAutomationTemplates();

    const broken   = await getBrokenSelectors();
    const brokenByTemplate = new Map<string, typeof broken>();
    for (const b of broken) {
      const list = brokenByTemplate.get(b.templateKey) ?? [];
      list.push(b);
      brokenByTemplate.set(b.templateKey, list);
    }

    const results = templates.map((t: any) => ({
      templateKey:     t.templateKey,
      name:            t.name,
      startUrl:        t.startUrl,
      brokenSelectors: (brokenByTemplate.get(t.templateKey) ?? []).map((b) => ({
        selector:   b.selector,
        confidence: b.confidence,
        attempts:   b.attempts,
      })),
      healthy: (brokenByTemplate.get(t.templateKey) ?? []).length === 0,
    }));

    res.json({
      checkedAt: new Date().toISOString(),
      total:     results.length,
      healthy:   results.filter((r: any) => r.healthy).length,
      degraded:  results.filter((r: any) => !r.healthy).length,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Health check failed" });
  }
});

// ── Selector scores ──────────────────────────────────────────────────────────

router.get("/scores", async (_req, res) => {
  try {
    const scores = await getAllScores();
    res.json(scores);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/scores/:key", async (req, res) => {
  try {
    const scores = await getTemplateScores(req.params.key);
    res.json(scores);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/scores/record", async (req, res) => {
  const { templateKey, selector, success } = req.body;
  if (!templateKey || !selector || typeof success !== "boolean") {
    return res.status(400).json({ error: "templateKey, selector, and success (boolean) are required" });
  }
  try {
    await recordSelectorResult(templateKey, selector, success);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Repair agent ─────────────────────────────────────────────────────────────

router.get("/repair/scan", async (_req, res) => {
  try {
    const report = await runRepairScan(); // offline — no live browser
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Repair scan failed" });
  }
});

router.post("/repair/apply", async (req, res) => {
  const { templateKey, originalSelector, replacement, appliedBy } = req.body;
  if (!templateKey || !originalSelector || !replacement) {
    return res.status(400).json({ error: "templateKey, originalSelector, and replacement are required" });
  }
  try {
    const result = await applyRepair(templateKey, originalSelector, replacement, appliedBy);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Dashboard summaries ──────────────────────────────────────────────────────

router.get("/summaries", async (_req, res) => {
  try {
    const stored = await listStoredTemplates();
    const registryKeys = listAutomationTemplates().map((t) => t.templateKey);
    const storedKeys   = stored.map((r: any) => r.template_key as string);
    const allKeys      = [...new Set([...registryKeys, ...storedKeys])];

    const summaries = await getTemplateSummaries(allKeys);
    res.json(summaries);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
