import { findByVision, clickAt } from "./visionAgent";
import { smartClick } from "./visionAgent";

export async function runVisionAgent(
  page: any,
  goal: string,
  maxAttempts = 5
): Promise<{ success: boolean; attempts: number }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const screenshot = await page.screenshot({ encoding: "base64" });
      const pos = await findByVision(screenshot, goal);
      if (pos?.x != null) {
        await clickAt(page, pos.x, pos.y);
        return { success: true, attempts: i + 1 };
      }
      await page.waitForTimeout?.(500);
    } catch {}
  }
  return { success: false, attempts: maxAttempts };
}

export async function actOnUI(page: any, goal: string): Promise<{ method: "vision" | "selector" | "failed" }> {
  const visionResult = await runVisionAgent(page, goal);
  if (visionResult.success) return { method: "vision" };
  try {
    await smartClick(page, goal);
    return { method: "selector" };
  } catch {
    return { method: "failed" };
  }
}
