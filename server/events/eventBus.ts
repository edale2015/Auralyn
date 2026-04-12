/**
 * Simple EventBus with on/emit API (compatible with the harness spec).
 * Re-exports from the existing bus.ts publish/subscribe infrastructure where appropriate.
 */

type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

class EventBus {
  private readonly handlers: Map<string, Handler[]> = new Map();

  on(event: string, handler: Handler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: Handler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    this.handlers.set(event, list.filter((h) => h !== handler));
  }

  emit(event: string, payload: Record<string, unknown> = {}): void {
    const list = this.handlers.get(event) ?? [];
    for (const h of list) {
      try {
        void h(payload);
      } catch {
        // Non-fatal — bus should not interrupt callers
      }
    }
  }

  async emitAsync(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const list = this.handlers.get(event) ?? [];
    await Promise.allSettled(list.map((h) => h(payload)));
  }

  listenerCount(event: string): number {
    return (this.handlers.get(event) ?? []).length;
  }

  clear(event?: string): void {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
  }
}

export const bus = new EventBus();
export default bus;
