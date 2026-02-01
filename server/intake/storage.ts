import * as fs from "fs";
import * as path from "path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

export function ensureDirs() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function safeJoinUpload(fileId: string, ext: string) {
  return path.join(UPLOAD_DIR, `${fileId}${ext}`);
}
