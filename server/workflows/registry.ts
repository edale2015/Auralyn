export type StepFn = (input: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;

const steps: Record<string, StepFn> = {};

export function registerStep(name: string, fn: StepFn): void {
  steps[name] = fn;
}

export function listSteps(): string[] {
  return Object.keys(steps);
}

export function getStep(name: string): StepFn | undefined {
  return steps[name];
}

export function clearSteps(): void {
  for (const k of Object.keys(steps)) delete steps[k];
}
