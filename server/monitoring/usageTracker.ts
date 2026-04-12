export interface UsageRecord {
  calls:        number;
  tokens:       number;
  promptTokens: number;
  completionTokens: number;
  errors:       number;
  lastCallAt:   Date | null;
  avgTokensPerCall: number;
}

export interface CallRecord {
  model:            string;
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  durationMs:       number;
  error:            boolean;
  timestamp:        Date;
  endpoint:         string;
}

let _usage: UsageRecord = {
  calls:            0,
  tokens:           0,
  promptTokens:     0,
  completionTokens: 0,
  errors:           0,
  lastCallAt:       null,
  avgTokensPerCall: 0,
};

const _callHistory: CallRecord[] = [];

export function trackUsage(record: {
  model?:            string;
  promptTokens?:     number;
  completionTokens?: number;
  totalTokens?:      number;
  durationMs?:       number;
  error?:            boolean;
  endpoint?:         string;
}): void {
  const promptTokens     = record.promptTokens     ?? 0;
  const completionTokens = record.completionTokens ?? 0;
  const totalTokens      = record.totalTokens      ?? promptTokens + completionTokens;

  _usage.calls            += 1;
  _usage.tokens           += totalTokens;
  _usage.promptTokens     += promptTokens;
  _usage.completionTokens += completionTokens;
  _usage.lastCallAt        = new Date();
  _usage.avgTokensPerCall  = _usage.calls > 0
    ? Math.round(_usage.tokens / _usage.calls)
    : 0;

  if (record.error) _usage.errors += 1;

  _callHistory.push({
    model:            record.model      ?? "unknown",
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs:       record.durationMs ?? 0,
    error:            record.error      ?? false,
    endpoint:         record.endpoint   ?? "unknown",
    timestamp:        new Date(),
  });

  if (_callHistory.length > 1000) _callHistory.shift();
}

export function getUsage(): UsageRecord {
  return { ..._usage };
}

export function getCallHistory(limit = 50): CallRecord[] {
  return _callHistory.slice(-limit);
}

export function resetUsage(): void {
  _usage = {
    calls: 0, tokens: 0, promptTokens: 0, completionTokens: 0,
    errors: 0, lastCallAt: null, avgTokensPerCall: 0,
  };
}

export function estimateCost(model = "gpt-4o"): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o":         { input: 0.0025, output: 0.01 },
    "gpt-4o-mini":    { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo":    { input: 0.01, output: 0.03 },
  };
  const rate = rates[model] ?? rates["gpt-4o"];
  return (
    (_usage.promptTokens / 1000) * rate.input +
    (_usage.completionTokens / 1000) * rate.output
  );
}
