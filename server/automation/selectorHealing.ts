/**
 * Selector Healing — Packet 20 final rewrite
 *
 * Round-trip budget:
 *   1  — original selector check via locator()
 *   1  — batch CSS candidates via page.evaluate() (short-circuits in browser)
 *   N  — Playwright-only :has-text() selectors (unavoidable, last resort)
 *
 * Key improvements vs baseline:
 *  - escAttr / escText helpers prevent injecting raw user-controlled strings
 *    into selectors that then break CSS parsing or open selector-injection.
 *  - page.evaluate() now short-circuits: the browser returns the FIRST
 *    matching selector string, so we never evaluate further candidates
 *    once a match is found (vs the old approach of mapping a boolean array).
 *  - [name=] branch symmetrically expands, same as the #id branch.
 */

import type { Page } from "playwright";

// ── Escaping helpers ──────────────────────────────────────────────────────────

/** Escape a value that will be placed inside a CSS attribute selector string. */
function escAttr(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape a value used inside a Playwright :has-text() pseudo-selector. */
function escText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Candidate construction ────────────────────────────────────────────────────

interface CandidateSet {
  css:        string[];   // batchable via page.evaluate() + document.querySelector
  playwright: string[];   // require locator() — must be checked individually
}

function buildCandidates(selector: string): CandidateSet {
  if (selector.startsWith("#")) {
    const id = selector.slice(1).trim();
    const esc = escAttr(id);
    const txt = escText(id);
    return {
      css: [
        `[name="${esc}"]`,
        `[aria-label="${esc}"]`,
        `[placeholder*="${esc}" i]`,
      ],
      playwright: [
        `label:has-text("${txt}") + input`,
        `label:has-text("${txt}") + select`,
        `label:has-text("${txt}") + textarea`,
      ],
    };
  }

  const nameMatch = selector.match(/\[name="([^"]+)"\]/);
  if (nameMatch) {
    const name = nameMatch[1];
    const esc  = escAttr(name);
    const txt  = escText(name);
    return {
      css: [
        `#${name}`,
        `[aria-label="${esc}"]`,
        `[placeholder*="${esc}" i]`,
      ],
      playwright: [
        `label:has-text("${txt}") + input`,
        `label:has-text("${txt}") + select`,
      ],
    };
  }

  return { css: [], playwright: [] };
}

// ── Core healer ───────────────────────────────────────────────────────────────

/**
 * Try to find a working replacement for `selector` on `page`.
 * Returns the selector that matched (original or a healed alternative),
 * or null if nothing worked.
 */
export async function healSelector(page: Page, selector: string): Promise<string | null> {
  // Round-trip 1 — original selector
  try {
    if ((await page.locator(selector).count()) > 0) return selector;
  } catch {}

  const { css, playwright } = buildCandidates(selector);

  // Round-trip 2 — batch CSS candidates; browser short-circuits on first match
  if (css.length > 0) {
    try {
      const found = await page.evaluate(
        (candidates: string[]) => {
          for (const c of candidates) {
            try {
              if (document.querySelector(c)) return c;
            } catch {}
          }
          return null;
        },
        css
      );
      if (found) return found;
    } catch {}
  }

  // Playwright-only fallback — one round-trip per candidate (unavoidable)
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
