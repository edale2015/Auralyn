export async function fetchSmartConfig(fhirBaseUrl: string) {
  const url = `${fhirBaseUrl.replace(/\/$/, "")}/.well-known/smart-configuration`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SMART discovery failed: ${res.status}`);
  return await res.json();
}
