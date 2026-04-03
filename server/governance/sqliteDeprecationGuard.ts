const DEADLINE = new Date(
  process.env.SQLITE_PHI_DEPRECATION_DEADLINE ?? "2026-07-02T00:00:00.000Z"
);

const SENSITIVE_TOKENS = [
  "dob", "date_of_birth", "full_name", "patient_name",
  "address", "ssn", "social_security", "mrn", "medical_record",
  "phone", "email", "zip_code", "insurance_id",
];

export function assertNoPhiToSqlite(payload: Record<string, unknown>): void {
  if (new Date() >= DEADLINE) {
    const err = new Error("SQLITE_PHI_WRITES_FORBIDDEN_AFTER_DEADLINE");
    (err as any).statusCode = 500;
    throw err;
  }

  const serialized = JSON.stringify(payload).toLowerCase();
  const hit = SENSITIVE_TOKENS.find(t => serialized.includes(t));
  if (hit) {
    console.error(`[SQLiteDeprecationGuard] PHI field "${hit}" detected in SQLite write — blocked`);
    const err = new Error("PHI_PAYLOAD_BLOCKED_FROM_SQLITE");
    (err as any).statusCode = 500;
    throw err;
  }
}
