/**
 * Selector Healing — Packet 20 rewrite
 *
 * Original problem: candidate selectors were checked with sequential
 * page.locator(candidate).count() calls — one browser round-trip per
 * candidate. With 6 candidates per strategy branch, that is up to 7
 * round-trips for a single failed selector (1 primary + 6 fallbacks).
 *
 * Fix: collect all candidate selectors first, then check them in a single
 * page.evaluate() call that runs querySelectorAll in the browser context.
 * This reduces N round-trips to 2 (1 primary + 1 batch), regardless of
 * how many fallback candidates exist.
 *
 * Note: page.evaluate() does not support :has-text() pseudo-selectors
 * (those are Playwright-specific). Playwright-only selectors are kept in
 * a separate fallback list and re-checked individually only if the batch
 * finds nothing, avoiding the round-trip cost in the common case.
 */

import type { Page } from "playwright";

/** CSS-compatible selectors — can be batched in page.evaluate() */
type CssSelector = string;

/** Playwright-specific selectors that need locator() and can't be batched */
type PlaywrightSelector = string;

interface CandidateSet {
  css: CssSelector[];
  playwright: PlaywrightSelector[];
}

/**
 * Batch-check all CSS-compatible selectors in one browser round-trip.
 * Returns a parallel boolean array: result[i] === true if candidates[i] matched.
 */
async function batchCssCheck(page: Page, candidates: CssSelector[]): Promise<boolean[]> {
  if (candidates.length === 0) return [];
  try {
    return await page.evaluate((selectors: string[]) =>
      selectors.map((s) => {
        try {
          return document.querySelector(s) !== null;
        } catch {
          return false;
        }
      }),
      candidates
    );
  } catch {
    return candidates.map(() => false);
  }
}

function buildCandidates(selector: string): CandidateSet {
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    return {
      css: [
        `[name="${id}"]`,
        `[aria-label="${id}"]`,
        `[placeholder*="${id}"]`,
      ],
      playwright: [
        `label:has-text("${id}") + input`,
        `label:has-text("${id}") + select`,
        `label:has-text("${id}") + textarea`,
      ],
    };
  }

  if (selector.includes("[name=")) {
    const match = selector.match(/\[name="([^"]+)"\]/);
    const name = match?.[1];
    if (name) {
      return {
        css: [
          `#${name}`,
          `[aria-label="${name}"]`,
          `[placeholder*="${name}"]`,
        ],
        playwright: [],
      };
    }
  }

  return { css: [], playwright: [] };
}

export async function healSelector(page: Page, selector: string): Promise<string | null> {
  // ── Round-trip 1: Check the original selector ──────────────────────────────
  try {
    if ((await page.locator(selector).count()) > 0) return selector;
  } catch {}

  const { css, playwright } = buildCandidates(selector);

  // ── Round-trip 2: Batch-check all CSS-compatible candidates at once ─────────
  if (css.length > 0) {
    const results = await batchCssCheck(page, css);
    const idx = results.findIndex((found) => found);
    if (idx >= 0) return css[idx];
  }

  // ── Playwright-only selectors: one round-trip per candidate (unavoidable) ───
  for (const candidate of playwright) {
    try {
      if ((await page.locator(candidate).count()) > 0) return candidate;
    } catch {}
  }

  return null;
}

export async function resolveSelector(page: Page, selector?: string): Promise<string> {
  if (!selector) throw new Error("No selector provided");
  const healed = await healSelector(page, selector);
  if (!healed) throw new Error(`Selector not found and could not heal: ${selector}`);
  return healed;
}
