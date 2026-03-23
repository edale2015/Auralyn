import type { Page } from "playwright";

export async function healSelector(page: Page, selector: string): Promise<string | null> {
  try {
    const found = await page.locator(selector).count();
    if (found > 0) return selector;
  } catch {
  }

  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    const candidates = [
      `[name="${id}"]`,
      `[aria-label="${id}"]`,
      `[placeholder*="${id}" i]`,
      `label:has-text("${id}") + input`,
      `label:has-text("${id}") + select`,
      `label:has-text("${id}") + textarea`,
    ];

    for (const candidate of candidates) {
      try {
        if ((await page.locator(candidate).count()) > 0) return candidate;
      } catch {}
    }
  }

  if (selector.includes("[name=")) {
    const match = selector.match(/\[name="([^"]+)"\]/);
    const name = match?.[1];

    if (name) {
      const candidates = [
        `#${name}`,
        `[aria-label="${name}"]`,
        `[placeholder*="${name}" i]`,
      ];

      for (const candidate of candidates) {
        try {
          if ((await page.locator(candidate).count()) > 0) return candidate;
        } catch {}
      }
    }
  }

  return null;
}

export async function resolveSelector(page: Page, selector?: string): Promise<string> {
  if (!selector) throw new Error("No selector provided");
  const healed = await healSelector(page, selector);
  if (!healed) throw new Error(`Selector not found and could not heal: ${selector}`);
  return healed;
}
