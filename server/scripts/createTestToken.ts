import crypto from "crypto";
import { db, initIntakeDb } from "../intake/db";

initIntakeDb();

const token = process.argv[2] || `TEST_TOKEN_${Date.now()}`;
const code = process.argv[3] || "123456";
const expiresMinutes = Number(process.argv[4]) || 30;

const expiresAt = Date.now() + expiresMinutes * 60 * 1000;
const hash = crypto.createHash("sha256").update(code).digest("hex");

db.prepare(`
  INSERT OR REPLACE INTO intake_sessions (token, code_hash, expires_at, used_at, verified_at, session_expires_at, created_at)
  VALUES (?, ?, ?, NULL, NULL, NULL, ?)
`).run(token, hash, expiresAt, Date.now());

console.log("Created test intake session:");
console.log({
  token,
  code,
  expiresAt: new Date(expiresAt).toISOString(),
  url: `/simple/${token}`
});
console.log(`\nTo use: navigate to /simple/${token} and enter code ${code}`);
