import { Request, Response, NextFunction } from "express";

const PHI_KEYS = ["patient", "name", "dob", "dateOfBirth", "ssn", "phone", "email", "address", "mrn"];

function deepRedact(obj: any, depth = 0): any {
  if (depth > 5) return "[NESTED]";
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepRedact(item, depth + 1));
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PHI_KEYS.includes(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = deepRedact(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

export function stripPHI(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    (req as any)._sanitizedBody = deepRedact(req.body);
  }
  next();
}
