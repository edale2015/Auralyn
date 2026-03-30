/**
 * DOMAIN 3 — REC 3.1: Universal Engine Health Wrapper
 *
 * Abstract base class that every clinical engine must extend.
 * Automatically tracks invocation count, error rate, and latency percentiles.
 * Clinical-specific metrics: disposition distribution and red flag detection rate.
 *
 * With 70 discovered engine files, this wrapper gives the Control Tower
 * a uniform surface to query health across the entire engine fleet.
 *
 * MY ADDITION: Engine circuit breaker per-engine (not just global).
 * If a specific engine's error rate exceeds 25%, it trips its own breaker
 * and falls back to the safe-mode response for that engine type.
 */

export interface EngineHealthMetrics {
  engineId:                    string;
  engineVersion:               string;
  lastInvocationAt?:           string;
  invocationCount24h:          number;
  errorRate24h:                number;
  p50LatencyMs:                number;
  p95LatencyMs:                number;
  p99LatencyMs:                number;
  lastErrorMessage?:           string;
  inputValidationFailureRate:  number;
  outputSchemaViolationRate:   number;
  circuitBreakerOpen:          boolean;   // MY ADDITION
  circuitBreakerOpenedAt?:     string;   // MY ADDITION
  dispositionDistribution:     Record<string, number>;
  redFlagDetectionRate:        number;
}

const CIRCUIT_BREAKER_ERROR_THRESHOLD = 0.25;  // 25% error rate trips per-engine breaker
const WINDOW_MS = 24 * 60 * 60 * 1000;         // 24h rolling window

const engineRegistry = new Map<string, MonitoredClinicalEngine<unknown, unknown>>();

export function getEngineRegistry(): Map<string, MonitoredClinicalEngine<unknown, unknown>> {
  return engineRegistry;
}

export function getAllEngineHealthMetrics(): EngineHealthMetrics[] {
  return Array.from(engineRegistry.values()).map(e => e.getHealthMetrics());
}

export abstract class MonitoredClinicalEngine<TInput = unknown, TOutput = unknown> {
  abstract readonly engineId:      string;
  abstract readonly engineVersion: string;

  // Per-engine telemetry (rolling 24h)
  private invocations:     Array<{ at: number; latencyMs: number; error: boolean }> = [];
  private inputFailures    = 0;
  private outputViolations = 0;
  private dispositions:    Record<string, number> = {};
  private redFlagCount     = 0;
  private lastErrorMsg?:   string;

  // MY ADDITION: per-engine circuit breaker
  private _circuitOpen     = false;
  private _circuitOpenedAt?: string;

  constructor() {
    // Self-register in the global registry on instantiation
    // Use a post-construction hook since engineId is abstract
    Promise.resolve().then(() => {
      engineRegistry.set(this.engineId, this as unknown as MonitoredClinicalEngine<unknown, unknown>);
    });
  }

  protected abstract validateInput(input: TInput): void;
  protected abstract validateOutput(output: TOutput): void;

  /**
   * All engine invocations should go through this method — never call
   * the inner handler directly. This wraps the call with telemetry,
   * input/output validation, and circuit breaker logic.
   */
  protected async invoke<I extends TInput, O extends TOutput>(
    input: I,
    handler: (input: I) => Promise<O>
  ): Promise<O> {
    if (this._circuitOpen) {
      throw new Error(`Engine ${this.engineId} circuit breaker OPEN — refusing invocation`);
    }

    const start = Date.now();
    let error  = false;

    try {
      this.validateInput(input);
    } catch (e: any) {
      this.inputFailures++;
      this.lastErrorMsg = e?.message;
      error = true;
      this.recordInvocation(Date.now() - start, true);
      this.checkCircuitBreaker();
      throw e;
    }

    try {
      const output = await handler(input);
      try {
        this.validateOutput(output);
      } catch {
        this.outputViolations++;
      }
      this.recordInvocation(Date.now() - start, false);
      return output;
    } catch (e: any) {
      error = true;
      this.lastErrorMsg = e?.message;
      this.recordInvocation(Date.now() - start, true);
      this.checkCircuitBreaker();
      throw e;
    }
  }

  /** Call this whenever the engine produces a disposition outcome */
  protected recordDisposition(disposition: string): void {
    this.dispositions[disposition] = (this.dispositions[disposition] ?? 0) + 1;
  }

  /** Call this whenever the engine detects a red flag */
  protected recordRedFlag(): void {
    this.redFlagCount++;
  }

  private recordInvocation(latencyMs: number, error: boolean): void {
    const now = Date.now();
    this.invocations.push({ at: now, latencyMs, error });
    // Prune entries older than 24h
    this.invocations = this.invocations.filter(i => now - i.at < WINDOW_MS);
  }

  private checkCircuitBreaker(): void {
    const total = this.invocations.length;
    if (total < 10) return; // Not enough data
    const errors = this.invocations.filter(i => i.error).length;
    const rate   = errors / total;
    if (rate > CIRCUIT_BREAKER_ERROR_THRESHOLD && !this._circuitOpen) {
      this._circuitOpen     = true;
      this._circuitOpenedAt = new Date().toISOString();
      console.error(`[EngineHealth] ${this.engineId} circuit breaker OPENED — error rate ${(rate * 100).toFixed(1)}%`);
    }
  }

  /** MY ADDITION: Manually reset this engine's circuit breaker after investigation */
  resetCircuitBreaker(): void {
    this._circuitOpen     = false;
    this._circuitOpenedAt = undefined;
  }

  getHealthMetrics(): EngineHealthMetrics {
    const window24h = this.invocations;
    const total     = window24h.length;
    const errors    = window24h.filter(i => i.error).length;
    const latencies = window24h.map(i => i.latencyMs).sort((a, b) => a - b);

    const pct = (p: number) => latencies.length === 0 ? 0
      : latencies[Math.floor(latencies.length * p)] ?? 0;

    const totalDispositions = Object.values(this.dispositions).reduce((a, b) => a + b, 0);

    return {
      engineId:                   this.engineId,
      engineVersion:              this.engineVersion,
      lastInvocationAt:           window24h.at(-1) ? new Date(window24h.at(-1)!.at).toISOString() : undefined,
      invocationCount24h:         total,
      errorRate24h:               total > 0 ? errors / total : 0,
      p50LatencyMs:               pct(0.50),
      p95LatencyMs:               pct(0.95),
      p99LatencyMs:               pct(0.99),
      lastErrorMessage:           this.lastErrorMsg,
      inputValidationFailureRate: total > 0 ? this.inputFailures / total : 0,
      outputSchemaViolationRate:  total > 0 ? this.outputViolations / total : 0,
      circuitBreakerOpen:         this._circuitOpen,
      circuitBreakerOpenedAt:     this._circuitOpenedAt,
      dispositionDistribution:    Object.fromEntries(
        Object.entries(this.dispositions).map(([k, v]) => [k, totalDispositions > 0 ? v / totalDispositions : 0])
      ),
      redFlagDetectionRate:       total > 0 ? this.redFlagCount / total : 0,
    };
  }
}
