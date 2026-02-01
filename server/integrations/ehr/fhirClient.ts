export async function fhirGet(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/fhir+json" }
  });
  if (!res.ok) throw new Error(`FHIR GET failed ${res.status}`);
  return await res.json();
}

export async function fhirPost(url: string, accessToken: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`FHIR POST failed ${res.status}`);
  return await res.json();
}
