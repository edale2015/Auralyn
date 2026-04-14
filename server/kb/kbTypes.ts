export type KbEntityType =
  | "complaint"
  | "question"
  | "modifier"
  | "red_flag_rule"
  | "workup_rule"
  | "diagnosis_rule"
  | "treatment_rule"
  | "disposition_rule"
  | "plan_template"
  | "feature_model"
  | "engine_routing"
  | "clinical_rule"
  | "complaint_pack";

export type KbEntityStatus = "draft" | "active" | "deprecated";
export type KbSourceType = "csv" | "json" | "manual" | "llm" | "system";

export interface KbEntityInput {
  entityType: KbEntityType;
  entityKey: string;
  title: string;
  content: Record<string, unknown>;
  tags?: string[];
  sourceKey?: string;
  changedBy?: string;
  changeSummary?: string;
}

export interface KbResolvedEntity {
  id: number;
  entityType: KbEntityType;
  entityKey: string;
  title: string;
  status: KbEntityStatus;
  version: number;
  content: Record<string, unknown>;
  tags: string[];
  sourceKey?: string;
}
