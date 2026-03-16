import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireRole } from "../middleware/requireRole";
import { runSheetGraphPipeline } from "../ingestion/sheetToGraphPipeline";
import { analyzeIngestionImpact } from "../audit/changeImpactAnalyzer";
import { runFileSync, getLatestUploadedWorkbook, getSyncHistory } from "../sheets/sheetSyncEngine";
import { getSyncSchedulerStatus } from "../sheets/sheetSyncScheduler";

const uploadDir = path.join(process.cwd(), "uploads");

const ingestionUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${ts}_${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls"].includes(ext)) cb(null, true);
    else cb(new Error("Only .xlsx and .xls files accepted"));
  },
});

const router = Router();

router.post(
  "/api/sheets/ingest-graph",
  requireRole(["admin"]),
  (req: Request, res: Response, next: any) => {
    ingestionUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 50 MB)" });
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    try {
      let filePath: string | null = null;

      if (req.file) {
        filePath = path.join(uploadDir, req.file.filename);
      } else if (req.query.file) {
        filePath = path.join(uploadDir, path.basename(req.query.file as string));
      } else {
        filePath = getLatestUploadedWorkbook();
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({
          status: "error",
          error: "No workbook found. Upload a file or specify ?file=filename.",
        });
      }

      const result = runSheetGraphPipeline(filePath);

      const impacts = result.counts ? analyzeIngestionImpact(result.counts) : [];

      res.json({
        ...result,
        impacts,
        file: path.basename(filePath),
      });
    } catch (err: any) {
      res.status(500).json({
        status: "error",
        error: err?.message || "Ingestion failed",
      });
    }
  }
);

router.post("/api/sheets/sync", requireRole(["admin"]), (req: Request, res: Response) => {
  try {
    const file = req.query.file
      ? path.join(uploadDir, path.basename(req.query.file as string))
      : getLatestUploadedWorkbook();

    if (!file || !fs.existsSync(file)) {
      return res.status(400).json({ error: "No workbook to sync" });
    }

    const result = runFileSync(file, "manual");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Sync failed" });
  }
});

router.get("/api/sheets/sync-history", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({
    scheduler: getSyncSchedulerStatus(),
    history: getSyncHistory(),
  });
});

export default router;
