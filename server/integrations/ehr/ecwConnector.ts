import { fetchSmartConfig } from "./smartDiscovery";
import { fhirGet, fhirPost } from "./fhirClient";
import type { EhrConnector, EhrConfig } from "./ehrConnector";

export function makeEcwConnector(config: EhrConfig): EhrConnector {
  return {
    vendor: "ecw",

    async getSmartConfiguration() {
      return await fetchSmartConfig(config.fhirBaseUrl);
    },

    async buildAuthorizeUrl(state: string, launch?: string) {
      const smart = await fetchSmartConfig(config.fhirBaseUrl);
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes,
        state
      });
      if (launch) params.set("launch", launch);
      params.set("aud", config.fhirBaseUrl);

      return `${smart.authorization_endpoint}?${params.toString()}`;
    },

    async exchangeCodeForToken(code: string) {
      const smart = await fetchSmartConfig(config.fhirBaseUrl);
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId
      });
      if (config.clientSecret) body.set("client_secret", config.clientSecret);

      const res = await fetch(smart.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
      return await res.json();
    },

    async getPatient(patientId: string, accessToken: string) {
      const url = `${config.fhirBaseUrl.replace(/\/$/, "")}/Patient/${patientId}`;
      return await fhirGet(url, accessToken);
    },

    async getClinicalSnapshot(patientId: string, accessToken: string) {
      const base = config.fhirBaseUrl.replace(/\/$/, "");
      const [meds, allergies, problems] = await Promise.all([
        fhirGet(`${base}/MedicationRequest?patient=${patientId}`, accessToken).catch(() => ({ entry: [] })),
        fhirGet(`${base}/AllergyIntolerance?patient=${patientId}`, accessToken).catch(() => ({ entry: [] })),
        fhirGet(`${base}/Condition?patient=${patientId}`, accessToken).catch(() => ({ entry: [] }))
      ]);

      return {
        meds: (meds.entry ?? []).map((e: any) => e.resource),
        allergies: (allergies.entry ?? []).map((e: any) => e.resource),
        problems: (problems.entry ?? []).map((e: any) => e.resource)
      };
    },

    async postDocumentReference(patientId, encounterId, accessToken, doc) {
      if (!config.allowWrites) throw new Error("EHR writes disabled by config");
      const base = config.fhirBaseUrl.replace(/\/$/, "");

      const resource: any = {
        resourceType: "DocumentReference",
        status: "current",
        subject: { reference: `Patient/${patientId}` },
        type: { text: doc.title },
        content: [{
          attachment: {
            contentType: doc.contentType,
            data: doc.dataBase64,
            title: doc.title
          }
        }]
      };

      if (encounterId) {
        resource.context = { encounter: [{ reference: `Encounter/${encounterId}` }] };
      }

      return await fhirPost(`${base}/DocumentReference`, accessToken, resource);
    },

    async postNoteDraft(patientId, encounterId, accessToken, noteText) {
      const dataBase64 = Buffer.from(noteText, "utf8").toString("base64");
      return await this.postDocumentReference(patientId, encounterId, accessToken, {
        title: "AI Draft Note",
        contentType: "text/plain",
        dataBase64
      });
    }
  };
}
