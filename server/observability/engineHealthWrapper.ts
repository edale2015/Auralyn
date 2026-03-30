/**
 * DOMAIN 3 — REC 3.1: Universal Engine Health Wrapper
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - EngineCircuitBreakerThreshold enum: SAFETY_CRITICAL=5%, CLINICAL=10%, SUPPORT=25%
 *   - Dual-window: 1h (acute) + 24h (trend) rolling windows — circuit trips on 1h rate
 *   - circuitBreakerTriggeredBy: "1h_window" | "24h_window" | "manual"
 *   - errorRate1h field on EngineHealthMetrics
 *   - abstract readonly circuitBreakerThreshold on base class
 */

export enum EngineCircuitBreakerThreshold {
  SAFETY_CRITICAL = 0.05,   // red flag, hard stop, pediatric safety engines
  CLINICAL        = 0.10,   // differential, scoring, intake engines
  SUPPORT         = 0.25,   // billing, formatting, channel normalization
}

export interface EngineHealthMetrics {
  engineId:                   string;
  engineVersion:              string;
  lastInvocationAt?:          string;
  invocationCount24h:         number;
  errorRate24h:               number;
  errorRate1h:                number;    // Claude rec: 1-hour rolling for acute failure detection
  p50LatencyMs:               number;
  p95LatencyMs:               number;
  p99LatencyMs:               number;
  lastErrorMessage?:          string;
  inputValidationFailureRate: number;
  outputSchemaViolationRate:  number;
  circuitBreakerOpen:         boolean;
  circuitBreakerOpenedAt?:    string;
  circuitBreakerTriggeredBy?: "1h_window" | "24h_window" | "manual";  // Claude rec
  dispositionDistribution:    Record<string, number>;
  redFlagDetectionRate:       number;
}

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const WINDOW_1H_MS  = 60 * 60 * 1000;

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

  /**
   * Claude rec: engines declare their own safety tier.
   * Defaults to CLINICAL if not overridden.
   */
  readonly circuitBreakerThreshold: EngineCircuitBreakerThreshold = EngineCircuitBreakerThreshold.CLINICAL;

  private invocations:     Array<{ at: number; latencyMs: number; error: boolean }> = [];
  private inputFailures    = 0;
  private outputViolations = 0;
  private dispositions:    Record<string, number> = {};
  private redFlagCount     = 0;
  private lastErrorMsg?:   string;

  private _circuitOpen          = false;
  private _circuitOpenedAt?:    string;
  private _circuitTriggeredBy?: "1h_window" | "24h_window" | "manual";

  constructor() {
    Promise.resolve().then(() => {
      engineRegistry.set(this.engineId, this as unknown as MonitoredClinicalEngine<unknown, unknown>);
    });
  }

  protected abstract validateInput(input: TInput): void;
  protected abstract validateOutput(output: TOutput): void;

  protected async invoke<I extends TInput, O extends TOutput>(
    input:   I,
    handler: (input: I) => Promise<O>
  ): Promise<O> {
    if (this._circuitOpen) {
      throw new Error(`Engine ${this.engineId} circuit breaker OPEN — refusing invocation`);
    }

    const start = Date.now();

    try {
      this.validateInput(input);
    } catch (e: any) {
      this.inputFailures++;
      this.lastErrorMsg = e?.message;
      this.recordInvocation(Date.now() - start, true);
      this.checkCircuitBreaker();
      throw e;
    }

    try {
      const output = await handler(input);
      try { this.validateOutput(output); } catch { this.outputViolations++; }
      this.recordInvocation(Date.now() - start, false);
      return output;
    } catch (e: any) {
      this.lastErrorMsg = e?.message;
      this.recordInvocation(Date.now() - start, true);
      this.checkCircuitBreaker();
      throw e;
    }
  }

  protected recordDisposition(disposition: string): void {
    this.dispositions[disposition] = (this.dispositions[disposition] ?? 0) + 1;
  }

  protected recordRedFlag(): void {
    this.redFlagCount++;
  }

  private recordInvocation(latencyMs: number, error: boolean): void {
    const now = Date.now();
    this.invocations.push({ at: now, latencyMs, error });
    this.invocations = this.invocations.filter(i => now - i.at < WINDOW_24H_MS);
  }

  /**
   * Claude rec: circuit breaker trips on 1h rate (acute), not 24h rate.
   * Uses the engine's declared circuitBreakerThreshold (SAFETY_CRITICAL/CLINICAL/SUPPORT).
   */
  private checkCircuitBreaker(): void {
    const now   = Date.now();
    const recent1h = this.invocations.filter(i => now - i.at < WINDOW_1H_MS);

    if (recent1h.length >= 5) {
      const errors1h = recent1h.filter(i => i.error).length;
      const rate1h   = errors1h / recent1h.length;
      if (rate1h > this.circuitBreakerThreshold && !this._circuitOpen) {
        this._circuitOpen        = true;
        this._circuitOpenedAt    = new Date().toISOString();
        this._circuitTriggeredBy = "1h_window";
        console.error(`[EngineHealth] ${this.engineId} circuit OPENED (1h rate ${(rate1h * 100).toFixed(1)}% > threshold ${(this.circuitBreakerThreshold * 100).toFixed(0)}%)`);
        return;
      }
    }

    // Fallback: also check 24h rate in case 1h window is thin
    const total24h  = this.invocations.length;
    if (total24h >= 10) {
      const errors24h = this.invocations.filter(i => i.error).length;
      const rate24h   = errors24h / total24h;
      if (rate24h > this.circuitBreakerThreshold && !this._circuitOpen) {
        this._circuitOpen        = true;
        this._circuitOpenedAt    = new Date().toISOString();
        this._circuitTriggeredBy = "24h_window";
        console.error(`[EngineHealth] ${this.engineId} circuit OPENED (24h rate ${(rate24h * 100).toFixed(1)}%)`);
      }
    }
  }

  resetCircuitBreaker(): void {
    this._circuitOpen        = false;
    this._circuitOpenedAt    = undefined;
    this._circuitTriggeredBy = undefined;
  }

  getHealthMetrics(): EngineHealthMetrics {
    const now       = Date.now();
    const window24h = this.invocations;
    const window1h  = this.invocations.filter(i => now - i.at < WINDOW_1H_MS);

    const total24h  = window24h.length;
    const errors24h = window24h.filter(i => i.error).length;
    const total1h   = window1h.length;
    const errors1h  = window1h.filter(i => i.error).length;

    const latencies = window24h.map(i => i.latencyMs).sort((a, b) => a - b);
    const pct = (p: number) => latencies.length === 0 ? 0 : latencies[Math.floor(latencies.length * p)] ?? 0;

    const totalDispositions = Object.values(this.dispositions).reduce((a, b) => a + b, 0);

    return {
      engineId:                   this.engineId,
      engineVersion:              this.engineVersion,
      lastInvocationAt:           window24h.at(-1) ? new Date(window24h.at(-1)!.at).toISOString() : undefined,
      invocationCount24h:         total24h,
      errorRate24h:               total24h > 0 ? errors24h / total24h : 0,
      errorRate1h:                total1h  > 0 ? errors1h  / total1h  : 0,
      p50LatencyMs:               pct(0.50),
      p95LatencyMs:               pct(0.95),
      p99LatencyMs:               pct(0.99),
      lastErrorMessage:           this.lastErrorMsg,
      inputValidationFailureRate: total24h > 0 ? this.inputFailures / total24h : 0,
      outputSchemaViolationRate:  total24h > 0 ? this.outputViolations / total24h : 0,
      circuitBreakerOpen:         this._circuitOpen,
      circuitBreakerOpenedAt:     this._circuitOpenedAt,
      circuitBreakerTriggeredBy:  this._circuitTriggeredBy,
      dispositionDistribution:    Object.fromEntries(
        Object.entries(this.dispositions).map(([k, v]) => [k, totalDispositions > 0 ? v / totalDispositions : 0])
      ),
      redFlagDetectionRate:       total24h > 0 ? this.redFlagCount / total24h : 0,
    };
  }
}
