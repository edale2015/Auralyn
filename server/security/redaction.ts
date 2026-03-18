const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const DOB_PATTERN = /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g;
const MRN_PATTERN = /\bMRN[:\s#]*\d{4,}\b/gi;

export function redactPHI(text: string): string {
  return text
    .replace(SSN_PATTERN, "[SSN_REDACTED]")
    .replace(PHONE_PATTERN, "[PHONE_REDACTED]")
    .replace(EMAIL_PATTERN, "[EMAIL_REDACTED]")
    .replace(DOB_PATTERN, "[DOB_REDACTED]")
    .replace(MRN_PATTERN, "[MRN_REDACTED]");
}

export function redactObject(obj: any): any {
  if (typeof obj === "string") return redactPHI(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value);
    }
    return result;
  }
  return obj;
}
