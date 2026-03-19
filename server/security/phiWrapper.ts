import { encrypt, decrypt } from "./encryption";

const PHI_FIELDS = ["name", "dob", "dateOfBirth", "phone", "ssn", "email", "address", "mrn"];

export function protectPHI(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  const result = { ...obj };
  for (const field of PHI_FIELDS) {
    if (result[field] && typeof result[field] === "string") {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

export function unprotectPHI(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  const result = { ...obj };
  for (const field of PHI_FIELDS) {
    if (result[field] && typeof result[field] === "string" && result[field].includes(":")) {
      try {
        result[field] = decrypt(result[field]);
      } catch {
        // field not encrypted, leave as-is
      }
    }
  }
  return result;
}

export function protectSpecificFields(obj: any, fields: string[]): any {
  if (!obj || typeof obj !== "object") return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && typeof result[field] === "string") {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}
