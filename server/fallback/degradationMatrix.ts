export interface DegradedResponse {
  success: false;
  fallback: true;
  degraded: true;
  message: string;
  safe: boolean;
  reason: string;
}

export function degrade(err: Error | unknown): DegradedResponse {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("Circuit open") || msg.includes("circuit open")) {
    return {
      success: false, fallback: true, degraded: true, safe: true,
      reason: "circuit_open",
      message: "Clinical AI temporarily unavailable. If symptoms are severe, seek care immediately or call 911.",
    };
  }

  if (msg.includes("database") || msg.includes("DB") || msg.includes("ECONNREFUSED")) {
    return {
      success: false, fallback: true, degraded: true, safe: true,
      reason: "database_unavailable",
      message: "System is temporarily busy. Seek care if symptoms worsen. Your case has been flagged for clinician review.",
    };
  }

  if (msg.includes("timeout") || msg.includes("TIMEOUT") || msg.includes("deadline")) {
    return {
      success: false, fallback: true, degraded: true, safe: true,
      reason: "timeout",
      message: "Clinical evaluation is taking longer than expected. A clinician will review your case. If urgent, call 911.",
    };
  }

  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("Too Many")) {
    return {
      success: false, fallback: true, degraded: true, safe: true,
      reason: "rate_limited",
      message: "High demand at this time. Please try again in a few minutes or seek in-person care if symptoms are severe.",
    };
  }

  if (msg.includes("OpenAI") || msg.includes("openai") || msg.includes("model")) {
    return {
      success: false, fallback: true, degraded: true, safe: true,
      reason: "ai_unavailable",
      message: "AI engine is temporarily unavailable. Issue has been flagged. A clinician will review your case shortly.",
    };
  }

  return {
    success: false, fallback: true, degraded: true, safe: true,
    reason: "unexpected_error",
    message: "An issue was detected. A clinician will review your case. If symptoms are severe, seek immediate care.",
  };
}
