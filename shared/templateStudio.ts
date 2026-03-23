export type StepActionType =
  | "goto" | "click" | "type" | "select" | "checkbox" | "radio"
  | "waitFor" | "extract" | "assert" | "screenshot" | "upload"
  | "keypress" | "dragdrop" | "custom";

export type VariableSourceType = "runtime" | "secret" | "static" | "derived" | "environment";

export interface SelectorCandidate {
  type: "css" | "xpath" | "text" | "aria" | "label" | "data-testid" | "vision";
  value: string;
  confidence?: number;
}

export interface TemplateVariableDefinition {
  key: string;
  label: string;
  sourceType: VariableSourceType;
  required: boolean;
  defaultValue?: string;
  description?: string;
  secretRef?: string;
  expression?: string;
  exampleValue?: string;
}

export interface TemplateVariableBinding {
  key: string;
  value?: string;
  secretRef?: string;
  sourceType: VariableSourceType;
}

export interface SecretRecord {
  id: string;
  name: string;
  provider: "local" | "aws-secrets-manager" | "vault";
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface VariableResolutionResult {
  resolved: Record<string, string>;
  missing: string[];
  usedSecrets: string[];
}

export interface TemplateStep {
  id: string;
  name: string;
  action: StepActionType;
  url?: string;
  selector?: string;
  selectorCandidates?: SelectorCandidate[];
  value?: string;
  waitMs?: number;
  timeoutMs?: number;
  required?: boolean;
  enabled: boolean;
  approvalRequired?: boolean;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface TemplateVersion {
  versionId: string;
  templateId: string;
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  status: "draft" | "approved" | "archived";
  changelog?: string;
  steps: TemplateStep[];
  variables?: TemplateVariableDefinition[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description?: string;
  tags: string[];
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  approvalPolicy?: {
    requiresPublishApproval: boolean;
    requiresRuntimeApproval: boolean;
  };
}
