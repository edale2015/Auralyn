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
export const BASE_URL = normalizeBaseUrl(
  process.env.PUBLIC_BASE_URL || 
  "https://61cec9e4-00a9-4d94-acfa-e596f88c5659-00-2ffbhly9zabi6.spock.replit.dev"
);
