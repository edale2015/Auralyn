import { runStagingValidation } from "./stagingValidationService"
import { runWorkflowSmokeTests } from "./workflowSmokeTestService"

export type ValidationRun = {
  id: string
  startedAt: string
  finishedAt?: string
  status: "running" | "passed" | "failed"
  validationResult?: Awaited<ReturnType<typeof runStagingValidation>>
  smokeResult?: Awaited<ReturnType<typeof runWorkflowSmokeTests>>
}

const runs: ValidationRun[] = []

export async function startValidationRun(): Promise<ValidationRun> {
  const run: ValidationRun = {
    id: `run_${Date.now()}`,
    startedAt: new Date().toISOString(),
    status: "running",
  }
  runs.push(run)

  try {
    const [validationResult, smokeResult] = await Promise.all([
      runStagingValidation(),
      runWorkflowSmokeTests(),
    ])
    run.validationResult = validationResult
    run.smokeResult = smokeResult
    run.status = validationResult.ok && smokeResult.ok ? "passed" : "failed"
  } catch (err: any) {
    run.status = "failed"
  }

  run.finishedAt = new Date().toISOString()
  return run
}

export function listValidationRuns(): ValidationRun[] {
  return [...runs].reverse()
}

export function getLatestRun(): ValidationRun | null {
  return runs.length > 0 ? runs[runs.length - 1] : null
}
