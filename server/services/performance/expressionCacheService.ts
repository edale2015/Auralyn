const expressionCache = new Map<string, { result: unknown; timestamp: number }>();
const TTL_MS = 30000;

export function cacheExpression(expression: string, result: unknown): void {
  expressionCache.set(expression, { result, timestamp: Date.now() });
}

export function getCachedExpression(expression: string): unknown | undefined {
  const entry = expressionCache.get(expression);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > TTL_MS) { expressionCache.delete(expression); return undefined; }
  return entry.result;
}

export function getExpressionCacheStats(): { size: number; hitRate: number } {
  return { size: expressionCache.size, hitRate: 0 };
}
