import { Router, Request, Response } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { getStore, newId } from "../intakeStorage";
import { UPLOAD_DIR } from "./storage";
import { requireVerifiedSession } from "./routes.intake";

export const filesRouter = Router();
const store = getStore();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function safeExt(mime: string, name: string) {
  const byName = path.extname(name || "").slice(0, 10);
  if (byName) return byName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

filesRouter.post("/api/intake/:token/upload", upload.single("file"), requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: "No file." });

    const fileId = newId("FILE");
    const ext = safeExt(file.mimetype, file.originalname);
    const storagePath = path.join(UPLOAD_DIR, `${fileId}${ext}`);

    fs.writeFileSync(storagePath, file.buffer);

    await store.addFileMeta({
      fileId,
      token,
      originalName: file.originalname,
      mimeType: file.mimetype,
      storagePath,
      createdAt: Date.now()
    });

    return res.json({ ok: true, fileId, mimeType: file.mimetype, name: file.originalname });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Upload failed" });
  }
});

filesRouter.get("/api/file/:fileId", async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    const token = req.query.token as string | undefined;
    
    const meta = await store.getFileMeta(fileId);
    if (!meta) return res.status(404).send("Not found");
    
    if (!token) {
      return res.status(401).send("Token required");
    }
    
    const verified = await store.isSessionVerified(token);
    if (!verified) {
      return res.status(401).send("Unauthorized");
    }
    
    if (meta.token !== token) {
      return res.status(403).send("Forbidden");
    }

    res.setHeader("Content-Type", meta.mimeType);
    return res.sendFile(meta.storagePath);
  } catch (e: any) {
    return res.status(400).send(e?.message || "Error");
  }
});

filesRouter.get("/api/intake/:token/files", requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const files = await store.getFileMetaByToken(token);
    return res.json({ 
      ok: true, 
      files: files.map(f => ({
        file_id: f.fileId,
        original_name: f.originalName,
        mime_type: f.mimeType,
        created_at: f.createdAt
      }))
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Error" });
  }
});
