import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export type AuthRole = "admin" | "physician" | "reviewer" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
  clinicId?: string;
}

export interface AuthTokenPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = ENV.JWT_SECRET || (ENV.NODE_ENV !== "production" ? "dev-jwt-secret-DO-NOT-USE-IN-PROD" : undefined);
  if (!secret) {
    throw new Error("❌ JWT_SECRET is not configured");
  }
  return secret;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(user as object, getJwtSecret(), { expiresIn: "12h" });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}
