export type CaseStatus = "draft" | "submitted" | "in_review" | "signed" | "closed";

export type DraftPayload = {
  currentStep: number;
  draft: Record<string, any>;
};

export type VerifyPayload = {
  code: string;
  dob?: string;
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

export interface IntakeSession {
  token: string;
  code_hash: string;
  expires_at: number;
  used_at: number | null;
  verified_at: number | null;
  session_expires_at: number | null;
  created_at: number;
}

export interface CaseRow {
  case_id: string;
  token: string;
  status: CaseStatus;
  created_at: number;
  updated_at: number;
  current_step: number;
  draft_json: string;
  intake_json: string;
  assistant_json: string;
  summary_html: string | null;
  summary_pdf_path: string | null;
}

export interface FileRow {
  file_id: string;
  token: string;
  original_name: string;
  mime_type: string;
  storage_path: string;
  created_at: number;
}
