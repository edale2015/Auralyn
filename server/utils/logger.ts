const isProd = process.env.NODE_ENV === "production";

function redactPhone(value?: string) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "[REDACTED_PHONE]";
  return `***${digits.slice(-4)}`;
}

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) { out[key] = value; continue; }
    const k = key.toLowerCase();
    if (k.includes("phone") || k === "from" || k === "to") {
      out[key] = redactPhone(String(value));
    } else if (k.includes("message") || k.includes("body") || k.includes("text") || k.includes("content") || k.includes("note")) {
      out[key] = value ? "[REDACTED_TEXT]" : value;
    } else if (k.includes("patient") || k.includes("payload") || k === "request") {
      out[key] = "[REDACTED_OBJECT]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function formatEntry(level: string, event: string, data: Record<string, unknown>): string {
  const safe = sanitize(data);
  if (isProd) {
    return JSON.stringify({ level, event, ...safe, ts: new Date().toISOString() });
  }
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${event}`;
  const extras = Object.keys(safe).length ? " " + JSON.stringify(safe) : "";
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
