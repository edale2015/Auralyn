import path from "node:path";
import fs from "node:fs/promises";
import type { Page } from "playwright";
import { createAutomationRunEvent } from "../repos/automationRunRepo";

const SCREENSHOT_DIR = path.join(process.cwd(), "tmp", "automation-screenshots");

export async function ensureScreenshotDir() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
}

export async function captureRunScreenshot(runId: string, page: Page, label: string) {
  await ensureScreenshotDir();

  const filename = `${runId}-${Date.now()}-${label}.png`;
  const fullPath = path.join(SCREENSHOT_DIR, filename);

  await page.screenshot({ path: fullPath, fullPage: true });

  return { filePath: fullPath, fileName: filename };
}

export async function recordRunEvent(input: {
  runId: string;
  eventType: string;
  stepIndex?: number;
  actionName?: string;
  payload?: unknown;
  screenshotKey?: string;
}) {
  return createAutomationRunEvent(input);
}
