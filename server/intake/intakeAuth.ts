import crypto from "crypto";

export function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function expiresAtMinutes(minutes: number): number {
  return Date.now() + minutes * 60 * 1000;
}

export function normalizeBaseUrl(url: string): string {
  return (url || "").replace(/\/+$/, "");
}

export const INTAKE_EXPIRY_MINUTES = 30;
function resolveBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const domains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "";
  const first = domains.split(",")[0]?.trim();
  if (first) return `https://${first}`;
  return "http://localhost:5000";
}

export const BASE_URL = normalizeBaseUrl(resolveBaseUrl());
