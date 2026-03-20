import { emitEvent } from "../controlTower/eventBus";

type CBState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private state: CBState = "closed";
  private lastFailAt = 0;
  private successCount = 0;

  constructor(
    private readonly name: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly halfOpenSuccessesNeeded = 2
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailAt > this.cooldownMs) {
        this.state = "half-open";
        this.successCount = 0;
        console.log(`[CircuitBreaker:${this.name}] Half-open — probing recovery`);
      } else {
        const err = new Error(`Circuit breaker OPEN: ${this.name} is unavailable. Try again in ${Math.round((this.cooldownMs - (Date.now() - this.lastFailAt)) / 1000)}s`);
        emitEvent({ type: "ALERT", payload: { message: `Circuit OPEN: ${this.name}`, severity: "HIGH" }, timestamp: Date.now() });
        throw err;
      }
    }

    try {
      const result = await fn();

      if (this.state === "half-open") {
        this.successCount++;
        if (this.successCount >= this.halfOpenSuccessesNeeded) {
          this.state = "closed";
          this.failures = 0;
          console.log(`[CircuitBreaker:${this.name}] Recovered — circuit closed`);
          emitEvent({ type: "ENGINE_STATUS", payload: { engine: this.name, status: "recovered" }, timestamp: Date.now() });
        }
      } else {
        this.failures = 0;
      }

      return result;
    } catch (e: any) {
      this.failures++;
      this.lastFailAt = Date.now();

      if (this.failures >= this.threshold && this.state !== "open") {
        this.state = "open";
        console.error(`[CircuitBreaker:${this.name}] Circuit OPEN after ${this.failures} failures — cooling down ${this.cooldownMs / 1000}s`);
        emitEvent({
          type: "ALERT",
          payload: { message: `Circuit breaker tripped: ${this.name} (${this.failures} failures)`, severity: "CRITICAL" },
          timestamp: Date.now(),
        });
      }

      throw e;
    }
  }

  getState(): { name: string; state: CBState; failures: number; lastFailAt: number } {
    return { name: this.name, state: this.state, failures: this.failures, lastFailAt: this.lastFailAt };
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successCount = 0;
    console.log(`[CircuitBreaker:${this.name}] Manually reset`);
  }
}

export const openAIBreaker = new CircuitBreaker("openai", 5, 30_000);
export const dbBreaker = new CircuitBreaker("database", 5, 30_000);
export const twilioBreaker = new CircuitBreaker("twilio", 3, 60_000);
export const scoringBreaker = new CircuitBreaker("scoring", 5, 20_000);

export function getAllBreakerStates() {
  return [openAIBreaker, dbBreaker, twilioBreaker, scoringBreaker].map((b) => b.getState());
}
