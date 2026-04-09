/**
 * Upgrade 2 — AI Selector Generator
 *
 * When a selector fails and normal healing strategies are exhausted, this
 * module sends a compact page snapshot to OpenAI and asks for ranked
 * alternative selectors. The response is parsed and returned as a scored list.
 *
 * Design constraints:
 *   - Never sends patient data. Only the HTML skeleton of the page is sent.
 *   - The HTML is stripped of text content (values, placeholder text truncated)
 *     to minimize token usage.
 *   - The function is intentionally synchronous-in-spirit: it awaits and returns
 *     results, then the caller decides whether to apply them.
 *   - Falls back gracefully (returns []) if OpenAI is unavailable or the
 *     response is unparseable.
 */

import OpenAI from "openai";
import type { Page } from "playwright";

// Lazy-initialized so the module loads safely even when OPENAI_API_KEY is absent.
// The client is only constructed the first time generateAlternativeSelectors() is called.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

export interface AiSelectorCandidate {
  selector:    string;
  rationale:   string;
  confidence:  "high" | "medium" | "low";
}

// ── Page snapshot ─────────────────────────────────────────────────────────────

/**
 * Extract a compact HTML skeleton of the form fields on the page.
 * Strips text nodes and attribute values longer than 40 chars.
 * Keeps tag names, id, name, type, aria-label, placeholder.
 */
async function getPageSkeleton(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const KEEP_ATTRS = ["id", "name", "type", "aria-label", "placeholder", "class", "role"];
      function skeleton(el: Element, depth = 0): string {
        if (depth > 6) return "";
        const tag  = el.tagName.toLowerCase();
        const keep = ["input", "select", "textarea", "label", "button", "form", "fieldset"];
        if (!keep.includes(tag)) {
          return Array.from(el.children).map((c) => skeleton(c, depth + 1)).join("\n");
        }
        const attrs = KEEP_ATTRS
          .map((a) => {
            const v = el.getAttribute(a);
            return v ? ` ${a}="${v.slice(0, 40)}"` : "";
          })
          .join("");
        return `<${tag}${attrs}>`;
      }
      return Array.from(document.querySelectorAll("form, [role='form']"))
        .map((f) => skeleton(f))
        .join("\n") || skeleton(document.body);
    });
  } catch {
    return "(page snapshot unavailable)";
  }
}

// ── AI call ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a browser automation expert. You receive:
1. A broken CSS selector that no longer matches any element.
2. A compact HTML skeleton of the page (tags + key attributes only, no text content).

Return a JSON array of up to 5 alternative selectors that are likely to match the intended element.
Each item: { "selector": "...", "rationale": "one sentence", "confidence": "high"|"medium"|"low" }

Rules:
- Prefer stable attributes: id, name, aria-label, data-testid
- Avoid brittle selectors like nth-child or positional selectors unless unavoidable
- Never include :has-text() or other Playwright-only pseudo-selectors
- Return ONLY the JSON array, no markdown fences, no extra text`;

export async function generateAlternativeSelectors(
  page:             Page,
  brokenSelector:   string,
  templateKey?:     string
): Promise<AiSelectorCandidate[]> {
  try {
    const skeleton = await getPageSkeleton(page);

    const userMessage =
      `Broken selector: ${brokenSelector}\n` +
      (templateKey ? `Template: ${templateKey}\n` : "") +
      `\nPage skeleton:\n${skeleton.slice(0, 3_000)}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system",  content: SYSTEM_PROMPT },
        { role: "user",    content: userMessage   },
      ],
      max_tokens:  512,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item: any) =>
        typeof item.selector   === "string" &&
        typeof item.rationale  === "string" &&
        ["high", "medium", "low"].includes(item.confidence)
    ) as AiSelectorCandidate[];
  } catch (err) {
    console.warn("[aiSelectorGenerator] Failed to generate selectors:", err);
    return [];
  }
}

// ── Verify + rank ─────────────────────────────────────────────────────────────

/**
 * Generate AI alternatives, then verify each against the live page.
 * Returns only the selectors that actually match, ordered by AI confidence.
 */
export async function generateAndVerifySelectors(
  page:           Page,
  brokenSelector: string,
  templateKey?:   string
): Promise<string[]> {
  const candidates = await generateAlternativeSelectors(page, brokenSelector, templateKey);
  if (candidates.length === 0) return [];

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...candidates].sort((a, b) => order[a.confidence] - order[b.confidence]);

  const verified: string[] = [];
  for (const { selector } of sorted) {
    try {
      const found = await page.evaluate(
        (s: string) => { try { return !!document.querySelector(s); } catch { return false; } },
        selector
      );
      if (found) verified.push(selector);
    } catch {}
  }
  return verified;
}
