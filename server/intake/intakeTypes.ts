export interface StartIntakeInput {
  channel: "web" | "sms" | "whatsapp" | "telegram" | "voice";
  firstName?: string;
  lastName?: string;
  dob?: string;
  sex?: string;
  phone?: string;
  email?: string;
}

export interface SubmitIntakeStepInput {
  sessionId: number;
  consented?: boolean;
  complaint?: string;
  symptoms?: string[];
  state?: string;
  freeText?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  email?: string;
}

export interface IntakeStepResult {
  session: any;
  next: "consent" | "complaint" | "symptoms" | "complete";
  patient?: any;
  encounter?: any;
  triageResult?: any;
}
