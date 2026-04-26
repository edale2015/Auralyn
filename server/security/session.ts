import type { NextFunction, Request, Response } from "express";
import type { IncomingMessage } from "http";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthRole = "admin" | "physician" | "staff" | "patient";

export interface RequestUser {
  userId: string;
  email?: string;
  displayName?: string;
  role: AuthRole;
  organizationId?: string;
  clinicSiteId?: string | number;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

const DEFAULT_COOKIE = "app_session";

function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME || DEFAULT_COOKIE;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET/AUTH_JWT_SECRET must be set to a strong 32+ character value");
  }
  return secret;
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export function getTokenFromRequest(req: Request | IncomingMessage): string | null {
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies[getAuthCookieName()];
  if (cookieToken) return cookieToken;

  // Transition fallback: keep this only while moving the frontend off localStorage tokens.
  const allowBearer = process.env.ALLOW_BEARER_AUTH_FALLBACK !== "false";
  return allowBearer ? extractBearer(req.headers?.authorization) : null;
}

function normalizeRole(role: unknown): AuthRole {
  if (role === "admin" || role === "physician" || role === "staff" || role === "patient") return role;
  return "patient";
}

export function verifyAuthToken(token: string): RequestUser {
  const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as JwtPayload & Record<string, unknown>;
  const userId = String(payload.userId ?? payload.sub ?? "");
  if (!userId) throw new Error("Token missing subject/userId");

  const user: RequestUser = {
    userId,
    email: typeof payload.email === "string" ? payload.email : undefined,
    displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
    role: normalizeRole(payload.role),
    organizationId: payload.organizationId !== undefined ? String(payload.organizationId) : undefined,
    clinicSiteId: payload.clinicSiteId as string | number | undefined,
    isActive: payload.isActive !== false,
  };

  if (!user.isActive) throw new Error("Inactive user");
  return user;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }
    req.user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Invalid or expired session" });
  }
}

export function requireAnyRole(roles: AuthRole[]) {
  const allowed = new Set(roles);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }
    if (!allowed.has(req.user.role)) {
      res.status(403).json({ ok: false, error: "Insufficient role" });
      return;
    }
    next();
  };
}

export function requireActiveClinicalUser(req: Request, res: Response, next: NextFunction): void {
  return requireAnyRole(["admin", "physician", "staff"])(req, res, next);
}

export function authenticateWsRequest(req: IncomingMessage): RequestUser | null {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    const user = verifyAuthToken(token);
    if (!["admin", "physician", "staff"].includes(user.role)) return null;
    return user;
  } catch {
    return null;
  }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();

  // Bearer-token fallback requests are not cookie-authenticated and do not need CSRF.
  // Once localStorage tokens are removed, set ALLOW_BEARER_AUTH_FALLBACK=false.
  const bearer = extractBearer(req.headers.authorization);
  if (bearer && process.env.ALLOW_BEARER_AUTH_FALLBACK !== "false") return next();

  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = cookies[process.env.CSRF_COOKIE_NAME || "csrf_token"];
  const fromHeader = req.headers["x-csrf-token"];

  if (fromCookie && typeof fromHeader === "string" && fromHeader === fromCookie) return next();
  res.status(403).json({ ok: false, error: "CSRF token missing or invalid" });
}
