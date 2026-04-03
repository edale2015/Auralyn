export interface BackpressuredLoopHandle {
  stop(): void;
}

export function startBackpressuredLoop(
  name: string,
  intervalMs: number,
  task: () => Promise<void>,
  onError: (ctx: { loop: string; err: unknown }) => void = (ctx) =>
    console.error(`[BackpressuredLoop] ${ctx.loop} error:`, ctx.err)
): BackpressuredLoopHandle {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      await task();
    } catch (err) {
      onError({ loop: name, err });
    } finally {
      if (!stopped) setTimeout(tick, intervalMs);
    }
  }

  void tick();

  return {
    stop() {
      stopped = true;
    },
  };
}
