import { findElement } from "./uiEngine";
import { sendToECWEncounter } from "../integrations/ecwAdapter";

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
          { type: "text", text: `Locate the UI element for: "${goal}". Return ONLY valid JSON {x:number,y:number} with pixel coordinates. No markdown.` },
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

export function buildHeatmap(events: Array<{ x?: number; y?: number; [key: string]: unknown }>): Array<{ x: number; y: number }> {
  return events
    .filter(e => e.x != null && e.y != null)
    .map(e => ({ x: e.x as number, y: e.y as number }));
}

// ── Multi-system Fallback Chain ────────────────────────────────────────────────
export async function fallbackChain(data: {
  patientId: string;
  disposition: string;
  [key: string]: unknown;
}): Promise<"ecw" | "epic" | "failed"> {
  try {
    await sendToECWEncounter({ patientId: data.patientId, disposition: data.disposition });
    return "ecw";
  } catch {
    try {
      const token = process.env.EPIC_TOKEN ?? "";
      const base  = process.env.FHIR_BASE  ?? "";
      if (!token || !base) throw new Error("No EPIC config");
      await fetch(`${base}/Observation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return "epic";
    } catch {
      return "failed";
    }
  }
}
