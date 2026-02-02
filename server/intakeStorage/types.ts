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

export type StorageMode = "local_disk" | "firebase_storage";

export type FileMeta = {
  fileId: string;
  token: string;
  originalName: string;
  mimeType: string;
  storageMode: StorageMode;
  storagePath: string;
  bucket?: string;
  objectPath?: string;
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

export type EhrVendor = "none" | "athena" | "ecw";
export type EhrSyncStatus = "not_linked" | "ready" | "synced" | "error";

export type ExternalEhr = {
  vendor: EhrVendor;
  patientId?: string;
  encounterId?: string;
  lastSyncAt?: number;
  syncStatus?: EhrSyncStatus;
  lastError?: string;
};
