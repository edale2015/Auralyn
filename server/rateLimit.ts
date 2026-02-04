import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { ok: false, error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

export const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window per IP
  message: { ok: false, error: "Too many verification attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful verifications
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour per IP
  message: { ok: false, error: "Upload limit exceeded. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}
