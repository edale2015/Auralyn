import { chromium, Browser, Page } from "playwright";

export type AutomationSession = {
  browser: Browser;
  page: Page;
};

export async function startAutomationSession(headless = true): Promise<AutomationSession> {
  const browser = await chromium.launch({ headless });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  });

  return { browser, page };
}

export async function stopAutomationSession(session: AutomationSession) {
  await session.browser.close();
}
