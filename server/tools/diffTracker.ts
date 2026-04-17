/**
 * server/tools/diffTracker.ts — SHA-256 file hash tracker for diff-based exports
 *
 * Tracks which files have changed since the last export.
 * Only changed files are included in the Claude review slice.
 * This reduces review volume and focuses Claude on actual changes.
 */

import fs   from "fs";
import path from "path";
import crypto from "crypto";

const HASH_FILE = path.join(
  process.cwd(),
  "exports",
  "claude-review",
  "fileHashes.json"
);

type HashMap = Record<string, string>;

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function loadPreviousHashes(): HashMap {
  if (!fs.existsSync(HASH_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(HASH_FILE, "utf8")) as HashMap;
  } catch {
    return {};
  }
}

export function saveHashes(map: HashMap): void {
  const dir = path.dirname(HASH_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HASH_FILE, JSON.stringify(map, null, 2));
}

export function hasChanged(
  filePath: string,
  content: string,
  prev: HashMap
): boolean {
  const h = sha256(content);
  return prev[filePath] !== h;
}

export function computeHash(content: string): string {
  return sha256(content);
}
