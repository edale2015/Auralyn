import { providerHeaders } from "./providerAuth";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { ...providerHeaders() } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return await res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { ...providerHeaders() } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return await res.json();
}

export function getNote(caseId: string) {
  return fetchText(`/api/provider/case/${caseId}/note`);
}

export function getBilling(caseId: string) {
  return fetchText(`/api/provider/case/${caseId}/billing`);
}

export function getPacketHtml(caseId: string) {
  return fetchText(`/api/provider/case/${caseId}/packet`);
}

export function getFiles(caseId: string) {
  return fetchJson<{
    ok: boolean;
    files: Array<{
      fileId: string;
      originalName: string;
      mimeType: string;
      downloadUrl: string;
    }>;
  }>(`/api/provider/case/${caseId}/files`);
}
