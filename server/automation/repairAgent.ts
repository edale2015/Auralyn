/**
 * Upgrade 5 — Autonomous Template Repair Agent
 *
 * Scans all templates for selectors with low confidence scores and, for each
 * broken one, attempts to:
 *   1. Generate AI replacement candidates
 *   2. Verify them offline (without a live page)  — if a live Page is given
 *   3. Propose repairs as a structured recommendation report
 *
 * The agent does NOT auto-apply repairs to production templates. Repairs are
 * surfaced as a RepairRecommendation list that a human or the API can review
 * and approve. If approved, the caller should call patchSelectorInTemplate().
 *
 * Designed to be called from:
 *   - POST /api/automation/repair/scan (admin endpoint)
 *   - A nightly cron job
 *   - After a validation worker reports failures
 */

import type { Page } from "playwright";
import {
  getBrokenSelectors,
  getTemplateScores,
  type SelectorScore,
} from "./selectorScore";
import { generateAlternativeSelectors, type AiSelectorCandidate } from "./aiSelectorGenerator";
import { getStoredTemplate, saveRecordedTemplate } from "./templateStore";
import { getAutomationTemplate }                   from "./templateRegistry";
import type { AutomationTemplate }                 from "./types";

export interface RepairRecommendation {
  templateKey:      string;
  brokenSelector:   string;
  confidence:       number;
  attempts:         number;
  aiCandidates:     AiSelectorCandidate[];
  topCandidate?:    string;
  status:           "pending" | "no-candidates" | "ready";
}

export interface RepairScanReport {
  scannedAt:       string;
  totalBroken:     number;
  withCandidates:  number;
  noCandidates:    number;
  recommendations: RepairRecommendation[];
}

// ── Agent: scan + recommend ───────────────────────────────────────────────────

/**
 * Find all broken selectors and generate AI repair recommendations.
 * Pass a live `page` to enable on-page verification of AI candidates;
 * omit it for a faster offline scan (candidates returned but not verified).
 */
export async function runRepairScan(page?: Page): Promise<RepairScanReport> {
  const broken = await getBrokenSelectors();
  const recommendations: RepairRecommendation[] = [];

  for (const score of broken) {
    let aiCandidates: AiSelectorCandidate[] = [];

    if (page) {
      // Attempt to navigate to the template's startUrl for live verification
      try {
        const tmpl = await resolveTemplate(score.templateKey);
        if (tmpl?.startUrl) {
          await page.goto(tmpl.startUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
          aiCandidates = await generateAlternativeSelectors(
            page, score.selector, score.templateKey
          );
        }
      } catch {
        // navigation failed — proceed without candidates
      }
    }

    const topCandidate =
      aiCandidates.find((c) => c.confidence === "high")?.selector ??
      aiCandidates.find((c) => c.confidence === "medium")?.selector;

    recommendations.push({
      templateKey:    score.templateKey,
      brokenSelector: score.selector,
      confidence:     score.confidence,
      attempts:       score.attempts,
      aiCandidates,
      topCandidate,
      status:         aiCandidates.length > 0 ? "ready" : "no-candidates",
    });
  }

  return {
    scannedAt:       new Date().toISOString(),
    totalBroken:     broken.length,
    withCandidates:  recommendations.filter((r) => r.status === "ready").length,
    noCandidates:    recommendations.filter((r) => r.status === "no-candidates").length,
    recommendations,
  };
}

// ── Agent: apply a specific repair ───────────────────────────────────────────

export interface ApplyRepairResult {
  templateKey:      string;
  originalSelector: string;
  replacement:      string;
  applied:          boolean;
  error?:           string;
}

/**
 * Apply a recommended repair to a template — replaces `originalSelector` with
 * `replacement` in both the actions and fields arrays, then saves to DB.
 */
export async function applyRepair(
  templateKey:      string,
  originalSelector: string,
  replacement:      string,
  appliedBy?:       string
): Promise<ApplyRepairResult> {
  const result: ApplyRepairResult = {
    templateKey,
    originalSelector,
    replacement,
    applied: false,
  };

  try {
    const tmpl = await resolveTemplate(templateKey);
    if (!tmpl) {
      result.error = "Template not found";
      return result;
    }

    const patched: AutomationTemplate = {
      ...tmpl,
      actions: tmpl.actions.map((a) =>
        a.selector === originalSelector ? { ...a, selector: replacement } : a
      ),
      fields: tmpl.fields.map((f) =>
        f.selector === originalSelector ? { ...f, selector: replacement } : f
      ),
    };

    await saveRecordedTemplate(patched, appliedBy ?? "repair-agent");
    result.applied = true;
    console.log(
      `[repairAgent] Applied repair: "${originalSelector}" → "${replacement}" in ${templateKey}`
    );
  } catch (err: any) {
    result.error = err?.message ?? "unknown error";
  }

  return result;
}

// ── Template resolution (DB first, registry fallback) ────────────────────────

async function resolveTemplate(templateKey: string): Promise<AutomationTemplate | null> {
  try {
    const row = await getStoredTemplate(templateKey);
    if (row?.definition) return row.definition as AutomationTemplate;
  } catch {}
  try {
    return getAutomationTemplate(templateKey);
  } catch {}
  return null;
}

// ── Health summary per template ───────────────────────────────────────────────

export interface TemplateSummary {
  templateKey:    string;
  totalSelectors: number;
  healthy:        number;
  degraded:       number;
  broken:         number;
  overallHealth:  "healthy" | "degraded" | "broken";
}

export async function getTemplateSummaries(
  templateKeys: string[]
): Promise<TemplateSummary[]> {
  const summaries: TemplateSummary[] = [];

  for (const templateKey of templateKeys) {
    const scores = await getTemplateScores(templateKey);
    const healthy  = scores.filter((s) => s.confidence >= 0.8).length;
    const degraded = scores.filter((s) => s.confidence >= 0.5 && s.confidence < 0.8).length;
    const broken   = scores.filter((s) => s.needsRepair).length;

    const total = scores.length;
    const overallHealth: TemplateSummary["overallHealth"] =
      broken > 0       ? "broken"   :
      degraded > 0     ? "degraded" : "healthy";

    summaries.push({ templateKey, totalSelectors: total, healthy, degraded, broken, overallHealth });
  }

  return summaries;
}
