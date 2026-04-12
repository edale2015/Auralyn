export class FlowContext {
  private data: Record<string, unknown> = {};

  constructor(initial: Record<string, unknown> = {}) {
    this.data = { ...initial };
  }

  get<T>(key: string): T {
    if (!(key in this.data)) {
      throw new Error(`Missing key in FlowContext: ${key}`);
    }
    return this.data[key] as T;
  }

  tryGet<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  has(key: string): boolean {
    return key in this.data;
  }

  merge(other: FlowContext): void {
    this.data = { ...this.data, ...other.dump() };
  }

  mergeRecord(record: Record<string, unknown>): void {
    this.data = { ...this.data, ...record };
  }

  dump(): Record<string, unknown> {
    return { ...this.data };
  }

  clone(): FlowContext {
    return new FlowContext(this.dump());
  }
}
