const PHI_FIELDS = new Set([
  "name", "firstName", "lastName", "fullName", "displayName",
  "phone", "phoneNumber", "mobile", "cellPhone",
  "email", "emailAddress",
  "dob", "dateOfBirth", "birthDate",
  "ssn", "socialSecurityNumber",
  "address", "streetAddress", "city", "state", "zip", "zipCode", "postalCode",
  "complaint", "chiefComplaint", "symptoms", "text", "body", "message",
  "diagnosis", "diagnoses", "notes", "clinicalNotes",
  "mrn", "patientId", "memberId",
  "insurance", "insuranceId", "policyNumber",
]);

export function sanitizeForLog(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map((item) => sanitizeForLog(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (PHI_FIELDS.has(key) || PHI_FIELDS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitizeForLog(val, depth + 1);
    }
  }
  return result;
}

export function redactPhi<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Partial<T> {
  const copy = { ...obj };
  for (const field of fields) {
    if (field in copy) {
      (copy as any)[field] = "[REDACTED]";
    }
  }
  return copy;
}
