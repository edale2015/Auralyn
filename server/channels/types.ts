export type ChannelName = "telegram" | "whatsapp";

export interface IncomingPatientMessage {
  channel: ChannelName;
  externalUserId: string;
  externalMessageId?: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  timestamp: number;
  raw?: any;
}

export interface OutgoingMessage {
  channel: ChannelName;
  to: string;
  text: string;
}

export interface ChatIntakeReply {
  text: string;
  escalate?: boolean;
  escalationReason?: string;
  result?: any;
}

export interface PhysicianAlertPayload {
  type: "patient_escalation" | "high_risk" | "workflow_failure" | "robot_safety_stop" | "deterioration";
  channel?: ChannelName;
  patientExternalUserId?: string;
  caseId?: string;
  summary: string;
  riskScore?: number;
  priority?: "immediate" | "urgent" | "routine";
}
