export function getOrCreateCorrelationId(): string {
  const key = "app_correlation_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(key, id);
  return id;
}
