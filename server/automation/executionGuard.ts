export interface ExecutionStep<T = unknown> {
  name: string;
  execute: () => Promise<T>;
  verify: (result: T) => Promise<boolean>;
}

export interface GuardedResult<T> {
  success: true;
  verified: true;
  result: T;
  attempts: number;
  durationMs: number;
}

export async function executeWithVerification<T>(
  step: ExecutionStep<T>
): Promise<GuardedResult<T>> {
  const started = Date.now();
  const result = await step.execute();
  const verified = await step.verify(result);

  if (!verified) {
    throw new Error(
      `[ExecutionGuard] Step "${step.name}" executed but failed verification — aborting`
    );
  }

  return {
    success: true,
    verified: true,
    result,
    attempts: 1,
    durationMs: Date.now() - started,
  };
}

export async function retryExecution<T>(
  step: ExecutionStep<T>,
  maxRetries = 3,
  backoffMs = 1000
): Promise<GuardedResult<T>> {
  const started = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await step.execute();
      const verified = await step.verify(result);

      if (!verified) {
        throw new Error(
          `[ExecutionGuard] Step "${step.name}" attempt ${attempt} failed verification`
        );
      }

      console.log(
        `[ExecutionGuard] "${step.name}" succeeded on attempt ${attempt}/${maxRetries}`
      );

      return {
        success: true,
        verified: true,
        result,
        attempts: attempt,
        durationMs: Date.now() - started,
      };
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[ExecutionGuard] "${step.name}" attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
      );

      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(
    `[ExecutionGuard] "${step.name}" failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}
