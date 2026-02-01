export type CaseStatus = "draft" | "submitted" | "in_review" | "signed" | "closed";

export type VerifyResult = {
  ok: true;
  caseId: string;
  status: CaseStatus;
  currentStep: number;
  flowId: string;
};

export type StatusResult = {
  ok: true;
  caseId: string;
  status: CaseStatus;
  updatedAt: number;
  nextActionText: string;
};

export type DraftPayload = {
  currentStep: number;
  draft: Record<string, any>;
};

export type SubmitPayload = {
  chiefComplaint: string;
  freeText?: string;
  symptoms: Record<string, "yes" | "no" | "ns">;
  modifiers?: Record<string, any>;
  meds?: any[];
  allergies?: any[];
  pmh?: any;
  pharmacy?: any;
  attachments?: string[];
  consent: {
    telehealth: boolean;
    privacy: boolean;
    signatureName: string;
    signedAt: string;
  };
};

export type FileMeta = {
  fileId: string;
  token: string;
  originalName: string;
  mimeType: string;
  storagePath: string;
  createdAt: number;
};

export type SessionData = {
  token: string;
  codeHash: string;
  expiresAt: number;
  usedAt: number | null;
  verifiedAt: number | null;
  sessionExpiresAt: number | null;
  createdAt: number;
};
