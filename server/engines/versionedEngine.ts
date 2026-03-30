/**
 * DOMAIN 4 — REC 4.2: Versioned Clinical Engine Interface
 *
 * Contract-first versioning prevents downstream breakage when engines
 * are modified. Every engine that implements this interface declares:
 *   - Its semantic version
 *   - What versions it is backward-compatible with
 *   - Input/output schema for runtime validation
 *
 * The FeatureFlaggedEngine wrapper runs stable + candidate in parallel
 * (shadow mode) so divergences can be captured before candidate goes live.
 *
 * MY ADDITION: Automatic rollback trigger. If the candidate engine's
 * error rate exceeds the stable engine by >5%, shadow mode auto-disables.
 */

export interface SemanticVersion { major: number; minor: number; patch: number; }
export interface EngineHealthSnapshot {
  engineId:          string;
  version:           string;
  lastInvocationAt?: string;
  invocationCount:   number;
  errorCount:        number;
  errorRate:         number;       // 0-1
  avgLatencyMs:      number;
}

export interface VersionedClinicalEngine<TInput = unknown, TOutput = unknown> {
  engineId:          string;
  version:           SemanticVersion;
  compatibleWith:    SemanticVersion[];
  invoke(input: TInput): Promise<TOutput>;
  healthCheck(): EngineHealthSnapshot;
}

function semverStr(v: SemanticVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Wraps two engines (stable + candidate) in shadow mode.
 * Candidate runs on a configurable traffic percentage but its result
 * is NEVER returned to the patient — stable always wins.
 * Divergences are logged for analysis.
 *
 * MY ADDITION: Auto-disable candidate if its error rate exceeds stable + 5%.
 */
export class FeatureFlaggedEngine<TInput, TOutput>
  implements VersionedClinicalEngine<TInput, TOutput> {

  engineId:       string;
  version:        SemanticVersion;
  compatibleWith: SemanticVersion[] = [];

  private stableStats   = { invocations: 0, errors: 0, totalMs: 0 };
  private candidateStats = { invocations: 0, errors: 0, totalMs: 0 };
  private shadowEnabled  = true;
  private divergenceLog: Array<{ at: string; input: unknown; stableOutput: unknown; candidateOutput: unknown }> = [];
  private readonly MAX_DIVERGENCE_LOG = 100;

  constructor(
    private stable:     VersionedClinicalEngine<TInput, TOutput>,
    private candidate:  VersionedClinicalEngine<TInput, TOutput>,
    private shadowPct:  number = 0.10   // 10% traffic to candidate in shadow
  ) {
    this.engineId = stable.engineId;
    this.version  = stable.version;
  }

  async invoke(input: TInput): Promise<TOutput> {
    const start = Date.now();
    let stableResult: TOutput;

    try {
      stableResult = await this.stable.invoke(input);
      this.stableStats.invocations++;
      this.stableStats.totalMs += Date.now() - start;
    } catch (e) {
      this.stableStats.errors++;
      this.stableStats.invocations++;
      throw e;
    }

    // Shadow mode — run candidate on sampled traffic
    if (this.shadowEnabled && Math.random() < this.shadowPct) {
      const cStart = Date.now();
      try {
        const candidateResult = await this.candidate.invoke(input);
        this.candidateStats.invocations++;
        this.candidateStats.totalMs += Date.now() - cStart;

        if (this.diverges(stableResult, candidateResult)) {
          this.logDivergence(input, stableResult, candidateResult);
        }

        // MY ADDITION: Auto-disable if candidate error rate too high
        this.checkAutoDisable();
      } catch {
        this.candidateStats.errors++;
        this.candidateStats.invocations++;
        this.checkAutoDisable();
      }
    }

    return stableResult; // Always return stable to patient
  }

  private checkAutoDisable(): void {
    if (!this.shadowEnabled) return;
    if (this.candidateStats.invocations < 20) return; // Need enough data

    const stableRate    = this.stableStats.errors / Math.max(1, this.stableStats.invocations);
    const candidateRate = this.candidateStats.errors / Math.max(1, this.candidateStats.invocations);

    if (candidateRate > stableRate + 0.05) {
      this.shadowEnabled = false;
      console.warn(
        `[FeatureFlaggedEngine:${this.engineId}] Candidate auto-disabled: error rate ${(candidateRate * 100).toFixed(1)}% vs stable ${(stableRate * 100).toFixed(1)}%`
      );
    }
  }

  private diverges(a: TOutput, b: unknown): boolean {
    try {
      return JSON.stringify(a) !== JSON.stringify(b);
    } catch { return false; }
  }

  private logDivergence(input: TInput, stableOut: TOutput, candidateOut: unknown): void {
    this.divergenceLog.push({
      at: new Date().toISOString(),
      input,
      stableOutput:    stableOut,
      candidateOutput: candidateOut,
    });
    if (this.divergenceLog.length > this.MAX_DIVERGENCE_LOG) this.divergenceLog.shift();
  }

  getDivergenceLog() { return [...this.divergenceLog]; }
  isShadowEnabled()  { return this.shadowEnabled; }
  enableShadow()     { this.shadowEnabled = true; }
  disableShadow()    { this.shadowEnabled = false; }

  healthCheck(): EngineHealthSnapshot {
    return {
      engineId:         this.engineId,
      version:          semverStr(this.version),
      invocationCount:  this.stableStats.invocations,
      errorCount:       this.stableStats.errors,
      errorRate:        this.stableStats.errors / Math.max(1, this.stableStats.invocations),
      avgLatencyMs:     this.stableStats.totalMs / Math.max(1, this.stableStats.invocations),
    };
  }
}
