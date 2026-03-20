const isProd = process.env.NODE_ENV === "production";

function formatEntry(level: string, event: string, data: Record<string, unknown>): string {
  if (isProd) {
    return JSON.stringify({ level, event, ...data, ts: new Date().toISOString() });
  }
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${event}`;
  const extras = Object.keys(data).length ? " " + JSON.stringify(data) : "";
  return prefix + extras;
}

export const logger = {
  info(event: string, data: Record<string, unknown> = {}): void {
    console.log(formatEntry("info", event, data));
  },
  warn(event: string, data: Record<string, unknown> = {}): void {
    console.warn(formatEntry("warn", event, data));
  },
  error(event: string, data: Record<string, unknown> = {}): void {
    console.error(formatEntry("error", event, data));
  },
  debug(event: string, data: Record<string, unknown> = {}): void {
    if (!isProd) console.debug(formatEntry("debug", event, data));
  },
};
