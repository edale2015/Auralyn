export type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  factor?: number
  onRetry?: (attempt: number, err: Error) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3
  const baseDelay = opts.baseDelayMs ?? 500
  const maxDelay = opts.maxDelayMs ?? 10_000
  const factor = opts.factor ?? 2

  let lastErr: Error = new Error("Unknown error")

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(factor, attempt - 1), maxDelay)
        opts.onRetry?.(attempt, err)
        await sleep(delay)
      }
    }
  }

  throw lastErr
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
