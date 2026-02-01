import { Router, Request, Response } from "express";
import multer from "multer";
import * as path from "path";
import crypto from "crypto";
import * as fs from "fs";
import { db } from "./db";
import { UPLOAD_DIR } from "./storage";
import type { FileRow } from "./types";

export const filesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function newFileId() {
  return `FILE_${crypto.randomBytes(10).toString("hex")}`;
}

function safeExt(mime: string, name: string) {
  const byName = path.extname(name || "").slice(0, 10);
  if (byName) return byName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

filesRouter.post("/api/intake/:token/upload", upload.single("file"), (req: Request, res: Response) => {
  const token = req.params.token;
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: "No file." });

  const fileId = newFileId();
  const ext = safeExt(file.mimetype, file.originalname);
  const storagePath = path.join(UPLOAD_DIR, `${fileId}${ext}`);

  fs.writeFileSync(storagePath, file.buffer);

  db.prepare(`
    INSERT INTO files (file_id, token, original_name, mime_type, storage_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(fileId, token, file.originalname, file.mimetype, storagePath, Date.now());

  return res.json({ ok: true, fileId, mimeType: file.mimetype, name: file.originalname });
});

filesRouter.get("/api/file/:fileId", (req: Request, res: Response) => {
  const fileId = req.params.fileId;
  const row = db.prepare(`SELECT * FROM files WHERE file_id = ?`).get(fileId) as FileRow | undefined;
  if (!row) return res.status(404).send("Not found");

  res.setHeader("Content-Type", row.mime_type);
  return res.sendFile(row.storage_path);
});

filesRouter.get("/api/intake/:token/files", (req: Request, res: Response) => {
  const token = req.params.token;
  const rows = db.prepare(`SELECT file_id, original_name, mime_type, created_at FROM files WHERE token = ? ORDER BY created_at DESC`).all(token) as FileRow[];
  return res.json({ ok: true, files: rows });
});
