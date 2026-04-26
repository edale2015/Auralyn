import crypto from "crypto";
import type { Response } from "express";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "app_session";
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "csrf_token";
const DEFAULT_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS ?? 8 * 60 * 60 * 1000);

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
}

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function setAuthCookies(res: Response, jwtToken: string, csrfToken = createCsrfToken()): void {
  res.cookie(AUTH_COOKIE_NAME, jwtToken, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: DEFAULT_MAX_AGE_MS,
  });

  // Readable by JS for double-submit CSRF header. This is not the auth secret.
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: DEFAULT_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
}
