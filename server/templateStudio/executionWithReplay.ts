import { ReplayLogger } from "./replayLogger";
import { ReplayRepository } from "./replayRepository";
import { VariableResolver } from "./variableResolver";
import { SecretStore } from "./secretStore";
import type { TemplateVariableDefinition, TemplateVariableBinding } from "../../shared/templateStudio";

const replayLogger = new ReplayLogger(new ReplayRepository());
const secretStore = new SecretStore();
const resolver = new VariableResolver(secretStore);

export async function executeTemplateWithReplay({
  templateId,
  versionId,
  initiatedBy,
  environment,
  steps,
  variableDefinitions = [],
  runtimeBindings = [],
  page,
}: {
  templateId: string;
  versionId: string;
  initiatedBy: string;
  environment: string;
  steps: any[];
  variableDefinitions?: TemplateVariableDefinition[];
  runtimeBindings?: TemplateVariableBinding[];
  page: any;
}) {
  const resolution = await resolver.resolve(variableDefinitions, runtimeBindings);

  if (resolution.missing.length) {
    throw new Error(`Missing required variables: ${resolution.missing.join(", ")}`);
  }

  const hydratedSteps = steps.map(step => resolver.interpolateObject(step, resolution.resolved));

  const session = await replayLogger.startSession({
    templateId,
    versionId,
    initiatedBy,
    environment,
  });

  try {
    for (const step of hydratedSteps) {
      const started = Date.now();
      const startedAt = new Date().toISOString();
      let success = false;
      let errorMessage: string | undefined;
      let screenshotPath: string | undefined;

      try {
        if (step.action === "click") await page.click(step.selector);
        else if (step.action === "type") await page.fill(step.selector, step.value ?? "");
        else if (step.action === "goto") await page.goto(step.url);
        else if (step.action === "waitFor") await page.waitForSelector(step.selector);

        screenshotPath = `artifacts/replay/${session.replayId}-${step.id}.png`;
        try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch {}
        success = true;
      } catch (err: any) {
        errorMessage = err.message || "Unknown error";
        screenshotPath = `artifacts/replay/${session.replayId}-${step.id}-error.png`;
        try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch {}
      }

      await replayLogger.appendStep(session.replayId, {
        stepId: step.id,
        stepName: step.name,
        action: step.action,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        success,
        selectorOriginal: step.selector,
        selectorResolved: step.selectorResolved || step.selector,
        selectorHealingApplied: !!step.selectorResolved && step.selectorResolved !== step.selector,
        inputPreview: step.value ? String(step.value).slice(0, 100) : undefined,
        errorMessage,
        artifacts: screenshotPath
          ? [{ type: "screenshot" as const, path: screenshotPath, createdAt: new Date().toISOString() }]
          : [],
        variablesUsed: resolution.usedSecrets,
        approvalState: step.approvalRequired ? "approved" : "not-required",
      });

      if (!success) {
        await replayLogger.complete(session.replayId, "failed");
        throw new Error(errorMessage);
      }
    }

    await replayLogger.complete(session.replayId, "completed");
    return { replayId: session.replayId };
  } catch (err) {
    await replayLogger.complete(session.replayId, "failed");
    throw err;
  }
}
