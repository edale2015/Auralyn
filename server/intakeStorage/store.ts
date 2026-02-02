import type { DraftPayload, SubmitPayload, StatusResult, FileMeta, ExternalEhr } from "./types";

export interface VerifySessionResult {
  sessionExpiresAtMs: number;
}

export interface CaseData {
  caseId: string;
  status: string;
  intake: SubmitPayload;
  assistant: any;
  updatedAt: number;
  externalEhr?: ExternalEhr;
}

export interface StorageDriver {
  createSession(token: string, code: string, expiresAtMs: number): Promise<void>;
  verifySession(token: string, code: string): Promise<VerifySessionResult>;
  isSessionVerified(token: string): Promise<boolean>;
  markSessionUsed(token: string): Promise<void>;

  getOrCreateCaseForToken(token: string): Promise<{
    caseId: string;
    status: string;
    currentStep: number;
  }>;

  setCaseDraft(token: string, draft: DraftPayload): Promise<void>;
  setCaseSubmitted(token: string, intake: SubmitPayload, assistant: any): Promise<{ caseId: string }>;
  getStatus(token: string): Promise<StatusResult>;
  getSummaryHtml(token: string): Promise<string>;

  signCase(caseId: string): Promise<void>;
  getCase(caseId: string): Promise<CaseData>;

  setExternalEhr(caseId: string, ehr: ExternalEhr): Promise<void>;
  getExternalEhr(caseId: string): Promise<ExternalEhr | null>;

  addFileMeta(meta: FileMeta): Promise<void>;
  getFileMeta(fileId: string): Promise<FileMeta | null>;
  getFileMetaByToken(token: string): Promise<FileMeta[]>;
}
