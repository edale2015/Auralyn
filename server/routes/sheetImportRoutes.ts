import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import multer from "multer";
import fs from "fs";
import path from "path";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".csv", ".xlsx", ".xls", ".json"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv, .xlsx, .xls, and .json files are supported"));
    }
  },
});

export const sheetImportRouter = Router();

sheetImportRouter.post(
  "/api/sheets/import",
  requireRole(["admin"]),
  (req: Request, res: Response, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File too large. Maximum size is 10 MB." });
        }
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const sizeKb = Math.round(file.size / 1024);

    res.json({
      message: "Sheet uploaded successfully",
      filename: file.originalname,
      storedAs: file.filename,
      extension: ext,
      sizeKb,
      uploadedAt: new Date().toISOString(),
    });
  }
);

sheetImportRouter.get("/api/sheets/uploads", requireRole(["admin"]), (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(uploadDir)) {
      return res.json({ count: 0, files: [] });
    }

    const files = fs.readdirSync(uploadDir)
      .filter((f) => !f.startsWith("."))
      .map((f) => {
        const stat = fs.statSync(path.join(uploadDir, f));
        return {
          filename: f,
          sizeKb: Math.round(stat.size / 1024),
          uploadedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    res.json({ count: files.length, files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to list uploads" });
  }
});
