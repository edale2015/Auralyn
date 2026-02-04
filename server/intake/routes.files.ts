import { Router, Request, Response } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { getStore, newId } from "../intakeStorage";
import { UPLOAD_DIR } from "./storage";
import { requireVerifiedSession } from "./routes.intake";
import type { StorageMode } from "../intakeStorage/types";
import { uploadLimiter, isAllowedMimeType } from "../rateLimit";

export const filesRouter = Router();
const store = getStore();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Allowed: jpeg, png, webp, pdf`));
    }
  }
});

function getUploadsMode(): StorageMode {
  const mode = process.env.UPLOADS_MODE;
  if (mode === "firebase_storage") return "firebase_storage";
  return "local_disk";
}

function safeExt(mime: string, name: string) {
  const byName = path.extname(name || "").slice(0, 10);
  if (byName) return byName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

async function uploadToFirebaseStorage(
  token: string,
  fileId: string,
  ext: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ bucket: string; objectPath: string }> {
  const { getStorageBucket } = await import("../firebase");
  const bucket = getStorageBucket();
  const objectPath = `intake_uploads/${token}/${fileId}${ext}`;

  await bucket.file(objectPath).save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0"
    }
  });

  return {
    bucket: bucket.name,
    objectPath
  };
}

filesRouter.post("/api/intake/:token/upload", uploadLimiter, upload.single("file"), requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: "No file." });

    const fileId = newId("FILE");
    const ext = safeExt(file.mimetype, file.originalname);
    const mode = getUploadsMode();

    if (mode === "firebase_storage") {
      const { bucket, objectPath } = await uploadToFirebaseStorage(
        token,
        fileId,
        ext,
        file.buffer,
        file.mimetype
      );

      await store.addFileMeta({
        fileId,
        token,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storageMode: "firebase_storage",
        storagePath: "",
        bucket,
        objectPath,
        createdAt: Date.now()
      });
    } else {
      const storagePath = path.join(UPLOAD_DIR, `${fileId}${ext}`);
      fs.writeFileSync(storagePath, file.buffer);

      await store.addFileMeta({
        fileId,
        token,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storageMode: "local_disk",
        storagePath,
        createdAt: Date.now()
      });
    }

    return res.json({ ok: true, fileId, mimeType: file.mimetype, name: file.originalname });
  } catch (e: any) {
    console.error("[Upload Error]", e);
    return res.status(400).json({ ok: false, error: e?.message || "Upload failed" });
  }
});

async function streamFromFirebaseStorage(bucketName: string, objectPath: string, res: Response, mimeType: string) {
  const { admin } = await import("../firebase");
  const storageBucket = admin.storage().bucket(bucketName);
  const file = storageBucket.file(objectPath);
  
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).send("File not found in storage");
    return;
  }
  
  res.setHeader("Content-Type", mimeType);
  file.createReadStream()
    .on("error", (err) => {
      console.error("[Firebase Storage Stream Error]", err);
      if (!res.headersSent) {
        res.status(500).send("Error streaming file");
      }
    })
    .pipe(res);
}

filesRouter.get("/api/file/:fileId", async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    const token = req.query.token as string | undefined;
    const providerKey = req.headers["x-provider-key"] as string | undefined;
    const configuredProviderKey = process.env.PROVIDER_API_KEY;
    
    const meta = await store.getFileMeta(fileId);
    if (!meta) return res.status(404).send("Not found");
    
    const isProviderAuth = providerKey && configuredProviderKey && providerKey === configuredProviderKey;
    
    if (!isProviderAuth) {
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
    }

    if (meta.storageMode === "firebase_storage" && meta.bucket && meta.objectPath) {
      return streamFromFirebaseStorage(meta.bucket, meta.objectPath, res, meta.mimeType);
    } else {
      res.setHeader("Content-Type", meta.mimeType);
      return res.sendFile(meta.storagePath);
    }
  } catch (e: any) {
    console.error("[File Download Error]", e);
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

filesRouter.get("/api/intake/_driver", (req: Request, res: Response) => {
  const storageDriver = process.env.STORAGE_DRIVER || "sqlite";
  const uploadsMode = getUploadsMode();
  return res.json({ driver: storageDriver, uploadsMode });
});
