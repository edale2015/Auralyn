import type { Page } from "playwright";
import { captureRunScreenshot, recordRunEvent } from "./replayRecorder";
import { interpretPage } from "./pageInterpreter";

export async function handleVisualFallback(input: {
  runId: string;
  page: Page;
  stepIndex: number;
  actionName: string;
  reason: string;
}) {
  const shot = await captureRunScreenshot(
    input.runId,
    input.page,
    `visual-fallback-${input.stepIndex}`
  );

  const pageSummary = await interpretPage(input.page);

  await recordRunEvent({
    runId: input.runId,
    eventType: "visual_fallback.captured",
    stepIndex: input.stepIndex,
    actionName: input.actionName,
    payload: {
      reason: input.reason,
      pageSummary,
    },
    screenshotKey: shot.fileName,
  });

  return {
    screenshot: shot.fileName,
    pageSummary,
  };
}
