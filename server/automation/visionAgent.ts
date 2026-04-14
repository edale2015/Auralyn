/**
 * server/automation/visionAgent.ts — Vision-assisted UI automation agent
 *
 * FIX (Code Review Critical Finding #5):
 *   fallbackChain() was an unsafeguarded EHR write bypass:
 *   - Wrote directly to ECW and Epic using raw env-var tokens
 *   - No physician signature requirement
 *   - No scope gate or confidence threshold
 *   - No audit log entry
 *   - No error recovery or retry accounting
 *   It was a structural escape from every clinical safety control in the system.
 *
 *   Fixed: fallbackChain() is DELETED. All EHR writes must go through
 *   ehrWriter.ts via executeWithScope() with physicianSigned + confidence gates.
 *   If a retry/fallback chain is needed, define it as a retry policy within the
 *   gated write path (ehrExecutor.ts → writeToEHR) with full audit logging.
 */

import { findElement } from "./uiEngine";

let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI();
  }
  return _openai;
}

export interface VisionCoords { x: number; y: number }

export async function findByVision(
  screenshotBase64: string,
  goal: string
): Promise<VisionCoords | null> {
  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Locate the UI element for: "${goal}". Return ONLY valid JSON {x:number,y:number} with pixel coordinates. No markdown.`,
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        ],
      }],
      max_tokens: 80,
    });
    const text = res.choices[0]?.message?.content?.trim() ?? "";
    return JSON.parse(text) as VisionCoords;
  } catch {
    return null;
  }
}

export async function clickAt(page: any, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y);
}

export async function smartClick(page: any, label: string): Promise<void> {
  const sel = await findElement(page, label);
  if (sel) { await page.click(sel); return; }
  try {
    const img = await page.screenshot({ encoding: "base64" });
    const pos = await findByVision(img, label);
    if (pos?.x != null) { await clickAt(page, pos.x, pos.y); return; }
  } catch {}
  throw new Error(`smartClick: could not locate "${label}" via selector or vision`);
}

// ── Selector Learning Memory ──────────────────────────────────────────────────

const selectorMemory: Record<string, string> = {};

export function rememberSelector(label: string, selector: string): void {
  selectorMemory[label] = selector;
}

export function recallSelector(label: string): string | undefined {
  return selectorMemory[label];
}

export function clearSelectorMemory(): void {
  Object.keys(selectorMemory).forEach(k => delete selectorMemory[k]);
}

// ── UI Screen Memory ──────────────────────────────────────────────────────────

const uiMemory: Record<string, unknown> = {};

export function rememberUI(screen: string, mapping: unknown): void {
  uiMemory[screen] = mapping;
}

export function recallUI(screen: string): unknown {
  return uiMemory[screen];
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export function diagnoseUIError(err: string): string {
  if (err.includes("timeout"))  return "Page load issue";
  if (err.includes("selector")) return "UI changed";
  if (err.includes("FHIR"))     return "FHIR token issue";
  if (err.includes("network"))  return "Network unavailable";
  return "Unknown";
}

export function buildHeatmap(
  events: Array<{ x?: number; y?: number; [key: string]: unknown }>
): Array<{ x: number; y: number }> {
  return events
    .filter(e => e.x != null && e.y != null)
    .map(e => ({ x: e.x as number, y: e.y as number }));
}

// ── REMOVED: fallbackChain() ──────────────────────────────────────────────────
// The fallbackChain() function that directly called ECW and Epic with raw env-var
// tokens, bypassing all safety gates, has been deleted. See file header for details.
//
// If you need to call this function, route through:
//   writeToEHR() in server/ehr/ehrExecutor.ts (scope-gated)
// or:
//   ehrWrite()   in server/ehr/ehrWriter.ts (canonical write path)
