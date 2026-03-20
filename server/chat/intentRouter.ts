export interface OperatorIntent {
  action: "queue" | "approve" | "override" | "health" | "alerts" | "simulate" | "learn" | "circuits" | "help" | "unknown";
  target?: string;
  args?: string;
  confidence: "high" | "low";
}

const QUEUE_PHRASES = ["show patients", "patient queue", "who is waiting", "list patients", "pending patients", "show queue", "who needs review", "open cases", "show me patients", "how many patients", "patient list"];
const HEALTH_PHRASES = ["system health", "how is the system", "status check", "system status", "is everything ok", "how are things", "system ok", "check health", "infrastructure status", "server status", "health check"];
const ALERT_PHRASES = ["alerts", "what's wrong", "whats wrong", "any problems", "any issues", "show alerts", "active alerts", "control tower", "anomalies", "what went wrong", "any failures", "recent errors"];
const LEARN_PHRASES = ["run learning", "trigger learning", "train model", "learning cycle", "update weights", "retrain", "run learn", "start learning", "improve model"];
const CIRCUIT_PHRASES = ["circuit", "breaker", "openai down", "is openai up", "db status", "service status", "circuit breaker", "is the db ok", "breakers"];
const SIMULATE_PHRASES = ["simulate", "run simulation", "test scenario", "what if", "try scenario", "run scenario", "clinical sim", "digital twin"];

const ID_PATTERN = /\b([a-zA-Z0-9_-]{4,})\b/;

function matchesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function extractId(text: string): string | undefined {
  const m = text.match(ID_PATTERN);
  return m ? m[1] : undefined;
}

function extractComplaint(text: string): string | undefined {
  const markers = ["simulate", "test", "what if", "scenario", "for", "with"];
  let remaining = text;
  for (const m of markers) {
    const idx = remaining.indexOf(m);
    if (idx !== -1) {
      remaining = remaining.slice(idx + m.length).trim();
      break;
    }
  }
  return remaining.split(/\s+/).slice(0, 4).join(" ").trim() || undefined;
}

export function parseOperatorIntent(text: string): OperatorIntent {
  const t = text.toLowerCase().trim();

  if (matchesAny(t, QUEUE_PHRASES)) {
    return { action: "queue", confidence: "high" };
  }

  if (t.includes("approve")) {
    const id = extractId(t.replace("approve", "").trim());
    return { action: "approve", target: id, confidence: id ? "high" : "low" };
  }

  if (t.includes("override")) {
    const withoutCmd = t.replace("override", "").trim();
    const id = extractId(withoutCmd);
    const note = withoutCmd.replace(id ?? "", "").trim();
    return { action: "override", target: id, args: note || undefined, confidence: id ? "high" : "low" };
  }

  if (matchesAny(t, HEALTH_PHRASES)) {
    return { action: "health", confidence: "high" };
  }

  if (matchesAny(t, ALERT_PHRASES)) {
    return { action: "alerts", confidence: "high" };
  }

  if (matchesAny(t, LEARN_PHRASES)) {
    return { action: "learn", confidence: "high" };
  }

  if (matchesAny(t, CIRCUIT_PHRASES)) {
    return { action: "circuits", confidence: "high" };
  }

  if (matchesAny(t, SIMULATE_PHRASES)) {
    const complaint = extractComplaint(t);
    return { action: "simulate", args: complaint, confidence: complaint ? "high" : "low" };
  }

  if (t.includes("help") || t === "?" || t === "commands") {
    return { action: "help", confidence: "high" };
  }

  return { action: "unknown", confidence: "low" };
}
