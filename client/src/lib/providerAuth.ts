export function getProviderKey(): string | null {
  const k = localStorage.getItem("providerKey");
  if (k && k.trim()) return k.trim();

  const envKey = import.meta.env?.VITE_PROVIDER_KEY as string | undefined;
  return envKey?.trim() || null;
}

export function providerHeaders(): Record<string, string> {
  const key = getProviderKey();
  return key ? { "X-Provider-Key": key } : {};
}
