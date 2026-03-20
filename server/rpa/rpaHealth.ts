export async function getRpaMode(): Promise<{ mode: "live" | "simulated"; reason?: string }> {
  try {
    const mod = await import("playwright").catch(() => null);
    if (mod?.chromium) {
      return { mode: "live" };
    }
    return { mode: "simulated", reason: "playwright not installed" };
  } catch {
    return { mode: "simulated", reason: "import error" };
  }
}
