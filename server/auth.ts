import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "medsess";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function setProviderSession(res: Response) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");

  const issuedAt = Date.now();
  const expiresAt = issuedAt + TTL_HOURS * 60 * 60 * 1000;
  const token = makeToken();

  // Cookie value is: token.issuedAt.expiresAt.sig
  const body = `${token}.${issuedAt}.${expiresAt}`;
  const sig = sign(body, secret);
  const value = `${body}.${sig}`;

  const isProd = process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProd || process.env.COOKIE_SECURE === "1",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/"
  });
}

export function clearProviderSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function isSessionValid(req: Request): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return false;

  const parts = String(raw).split(".");
  if (parts.length !== 4) return false;

  const [token, issuedAtStr, expiresAtStr, sig] = parts;
  const body = `${token}.${issuedAtStr}.${expiresAtStr}`;
  const expected = sign(body, secret);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;

  try {
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  } catch {
    return false;
  }

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

export function requireProviderSession(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: "Missing SESSION_SECRET" });

  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const parts = String(raw).split(".");
  if (parts.length !== 4) return res.status(401).json({ ok: false, error: "Invalid session" });

  const [token, issuedAtStr, expiresAtStr, sig] = parts;
  const body = `${token}.${issuedAtStr}.${expiresAtStr}`;
  const expected = sign(body, secret);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return res.status(401).json({ ok: false, error: "Invalid session" });
  }

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return res.status(401).json({ ok: false, error: "Session expired" });
  }

  // Attach provider identity (single provider)
  (req as any).provider = { role: "provider" };

  next();
}

// Middleware that allows both session cookie AND X-Provider-Key fallback for dev/scripts
export function requireProviderAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.SESSION_SECRET;
  const cookieName = process.env.SESSION_COOKIE_NAME || "medsess";
  const raw = req.cookies?.[cookieName];
  
  // Try session cookie first
  if (raw && secret) {
    const parts = String(raw).split(".");
    if (parts.length === 4) {
      const [token, issuedAtStr, expiresAtStr, sig] = parts;
      const body = `${token}.${issuedAtStr}.${expiresAtStr}`;
      const expected = sign(body, secret);
      
      try {
        if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
          const expiresAt = Number(expiresAtStr);
          if (Number.isFinite(expiresAt) && Date.now() <= expiresAt) {
            (req as any).provider = { role: "provider" };
            return next();
          }
        }
      } catch (e) {
        // Fall through to API key check
      }
    }
  }

  // Fallback: X-Provider-Key header for scripts/dev (disabled in production)
  const isProd = process.env.NODE_ENV === "production";
  const allowFallback = !isProd && process.env.ALLOW_PROVIDER_KEY_FALLBACK !== "0";
  if (allowFallback) {
    const apiKey = req.headers["x-provider-key"];
    const expectedKey = process.env.PROVIDER_API_KEY;
    if (expectedKey && apiKey === expectedKey) {
      (req as any).provider = { role: "provider", via: "api-key" };
      return next();
    }
  }

  return res.status(401).json({ ok: false, error: "Not authenticated" });
}
