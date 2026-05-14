/**
 * PHIGuard.ts
 * Lightweight PHI sanitization for safe LLM and log processing.
 * Strips / masks common PHI patterns before text leaves trust boundary.
 */

const PHI_PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
  { name: "SSN",        re: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,               replacement: "[SSN]" },
  { name: "DOB",        re: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g, replacement: "[DOB]" },
  { name: "Phone",      re: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE]" },
  { name: "Email",      re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: "[EMAIL]" },
  { name: "MRN",        re: /\b(MRN|mrn)[:\s#]*\d{4,12}\b/gi,                  replacement: "[MRN]" },
  { name: "NPI",        re: /\bNPI[:\s]*\d{10}\b/gi,                            replacement: "[NPI]" },
  { name: "ZIP",        re: /\b\d{5}(-\d{4})?\b/g,                              replacement: "[ZIP]" },
  { name: "CreditCard", re: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,                    replacement: "[CC]" },
];

/**
 * Sanitize a string by replacing PHI patterns with safe placeholders.
 * Returns the sanitized string.
 */
export function applyPHIGuard(text: string): string {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const { re, replacement } of PHI_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Sanitize all string values in an object deeply.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      result[k] = applyPHIGuard(v);
    } else if (Array.isArray(v)) {
      result[k] = v.map(item =>
        typeof item === "string" ? applyPHIGuard(item) :
        typeof item === "object" ? sanitizeObject(item) : item
      );
    } else if (typeof v === "object" && v !== null) {
      result[k] = sanitizeObject(v);
    } else {
      result[k] = v;
    }
  }
  return result as T;
}

/**
 * Check if a string contains detectable PHI (for audit alerting).
 */
export function containsPHI(text: string): boolean {
  if (!text) return false;
  return PHI_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}
