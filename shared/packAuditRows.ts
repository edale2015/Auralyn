export interface PackAuditLogRow {
  id: string;
  entityType: "symptom_pack" | "modifier_pack" | "clinician_algorithm" | "pack_question" | "plan_template";
  entityId: string;
  action: "create" | "update" | "delete" | "validate";
  actorId: string;
  actorName?: string;
  at: string;
  beforeJson?: string;
  afterJson?: string;
  validationOk?: boolean;
  validationIssuesJson?: string;
  notes?: string;
}
