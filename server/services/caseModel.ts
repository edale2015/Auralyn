export type CaseStatus = "draft" | "submitted" | "in_review" | "signed" | "closed";

export type EhrSyncStatus = "not_linked" | "ready" | "synced" | "error";

export interface CasePatient {
  name?: string;
  dob?: string;
  phone: string;
}

export interface CaseDraft {
  currentStep: number;
  data: Record<string, any>;
  lastTouchedAt?: number;
}

export interface CaseConsent {
  telehealth: boolean;
  privacy: boolean;
  signatureName?: string;
  signedAt?: number;
}

export interface CaseIntake {
  chiefComplaint?: string;
  answers: Record<string, any>;
  modifiers: Record<string, any>;
  pmh: Record<string, any>;
  meds: string[];
  allergies: string[];
  pharmacy: Record<string, any>;
  attachments: string[];
  consent?: CaseConsent;
}

export interface CaseAssistant {
  triageLevel?: string;
  redFlags: string[];
  draftNote?: string;
  draftDx: string[];
  draftOrders: string[];
  draftCoding?: {
    icd10: string[];
    cpt: string[];
  };
}

export interface CaseExternalEhr {
  vendor: "none" | "athena" | "ecw";
  fhirBaseUrl?: string;
  patientId?: string;
  encounterId?: string;
  lastSyncAt?: number;
  syncStatus: EhrSyncStatus;
  lastSyncError?: string;
}

export interface Case {
  caseId: string;
  token: string;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;
  patient: CasePatient;
  flowId: string;
  draft?: CaseDraft;
  intake?: CaseIntake;
  assistant?: CaseAssistant;
  external_ehr?: CaseExternalEhr;
}

export function generateCaseId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "_");
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  return `CASE_${date}_${seq}`;
}

export function createEmptyCase(token: string, phone: string, flowId: string): Case {
  const now = Date.now();
  return {
    caseId: generateCaseId(),
    token,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    patient: { phone },
    flowId,
    draft: { currentStep: 0, data: {} },
    intake: {
      answers: {},
      modifiers: {},
      pmh: {},
      meds: [],
      allergies: [],
      pharmacy: {},
      attachments: []
    },
    assistant: {
      redFlags: [],
      draftDx: [],
      draftOrders: []
    },
    external_ehr: {
      vendor: "none",
      syncStatus: "not_linked"
    }
  };
}
