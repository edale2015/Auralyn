export type EhrVendor = "athena" | "ecw";

export type EhrConfig = {
  vendor: EhrVendor;
  fhirBaseUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
  allowWrites: boolean;
};

export interface EhrConnector {
  vendor: EhrVendor;

  getSmartConfiguration(): Promise<{
    authorization_endpoint: string;
    token_endpoint: string;
    scopes_supported?: string[];
  }>;

  buildAuthorizeUrl(state: string, launch?: string): Promise<string>;
  exchangeCodeForToken(code: string): Promise<any>;

  getPatient(patientId: string, accessToken: string): Promise<any>;
  getClinicalSnapshot(patientId: string, accessToken: string): Promise<{
    meds: any[];
    allergies: any[];
    problems: any[];
  }>;

  postDocumentReference(
    patientId: string,
    encounterId: string | null,
    accessToken: string,
    doc: { title: string; contentType: string; dataBase64: string }
  ): Promise<any>;

  postNoteDraft(
    patientId: string,
    encounterId: string | null,
    accessToken: string,
    noteText: string
  ): Promise<any>;
}
