export interface IntakeAuditEntry {
  at: string;
  event: string;
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
}

const entries: IntakeAuditEntry[] = [];

export const intakeAuditLog = {
  write(entry: Omit<IntakeAuditEntry, "at">) {
    const full = { ...entry, at: new Date().toISOString() };
    entries.push(full);
    return full;
  },
  list() {
    return [...entries];
  },
};
