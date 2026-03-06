import type { EngineDisposition } from "./case";

export type SignoffStatus =
  | "APPROVED"
  | "APPROVED_WITH_EDITS"
  | "REQUEST_MORE_INFO"
  | "ESCALATED"
  | "REJECTED";

export interface PhysicianOverride {
  disposition?: EngineDisposition;
  dxCandidates?: Array<{
    dxId: string;
    label: string;
    rank?: number;
  }>;
  noteDraft?: string;
  returnPrecautions?: string[];
  comments?: string;
}

export interface SignoffRecord {
  signoffId: string;
  caseId: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerRole?: string;

  createdAt: string;
  updatedAt: string;

  status: SignoffStatus;

  engineDisposition?: EngineDisposition;
  finalDisposition?: EngineDisposition;

  override?: PhysicianOverride;

  requestMoreInfoQuestions?: string[];
  rationale?: string;

  engineVersion?: string;
  rulesVersion?: string;
}
