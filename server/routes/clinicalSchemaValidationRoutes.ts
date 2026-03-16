import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { loadWorkbookFromFile } from "../validation/workbookLoader";
import { validateClinicalWorkbook } from "../validation/clinicalSchemaValidator";
import { buildReadableValidationSummary } from "../validation/validationReportBuilder";
import { requireRole } from "../middleware/requireRole";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads");

function findWorkbook(filename?: string): string | null {
  if (!fs.existsSync(uploadDir)) return null;

  if (filename) {
    const fp = path.join(uploadDir, path.basename(filename));
    return fs.existsSync(fp) ? fp : null;
  }

  const files = fs.readdirSync(uploadDir)
    .filter((f) => /\.(xlsx|xls)$/i.test(f))
    .sort((a, b) => {
      const sa = fs.statSync(path.join(uploadDir, a)).mtimeMs;
      const sb = fs.statSync(path.join(uploadDir, b)).mtimeMs;
      return sb - sa;
    });

  return files.length > 0 ? path.join(uploadDir, files[0]) : null;
}

const validationUpload = multer({
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
    if ([".xlsx", ".xls"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx and .xls files are accepted for schema validation"));
    }
  },
});

router.post(
  "/api/clinical-schema/validate",
  requireRole(["admin"]),
  (req: Request, res: Response, next: any) => {
    validationUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ ok: false, error: "File too large (max 50 MB)." });
        }
        return res.status(400).json({ ok: false, error: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    try {
      const filePath = req.file
        ? path.join(uploadDir, req.file.filename)
        : findWorkbook(req.query.file as string | undefined);

      if (!filePath) {
        return res.status(400).json({
          ok: false,
          error: "No workbook found. Upload an .xlsx file or specify ?file=filename.",
        });
      }

      const workbook = loadWorkbookFromFile(filePath);
      const report = validateClinicalWorkbook(workbook);
      res.json({ ...report, validatedFile: path.basename(filePath) });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: "schema_validation_failed",
        detail: error?.message || "Unknown validation error",
      });
    }
  }
);

router.get("/api/clinical-schema/validate", requireRole(["admin"]), (req: Request, res: Response) => {
  try {
    const filePath = findWorkbook(req.query.file as string | undefined);

    if (!filePath) {
      return res.status(400).json({
        ok: false,
        error: "No workbook found. Upload an .xlsx file first.",
      });
    }

    const workbook = loadWorkbookFromFile(filePath);
    const report = validateClinicalWorkbook(workbook);
    res.json({ ...report, validatedFile: path.basename(filePath) });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: "schema_validation_failed",
      detail: error?.message || "Unknown validation error",
    });
  }
});

router.get("/api/clinical-schema/summary", requireRole(["admin"]), (req: Request, res: Response) => {
  try {
    const filePath = findWorkbook(req.query.file as string | undefined);

    if (!filePath) {
      return res.status(400).json({
        ok: false,
        error: "No workbook found. Upload an .xlsx file first.",
      });
    }

    const workbook = loadWorkbookFromFile(filePath);
    const report = validateClinicalWorkbook(workbook);
    res.json(buildReadableValidationSummary(report));
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: "schema_summary_failed",
      detail: error?.message || "Unknown validation error",
    });
  }
});

router.get("/api/clinical-schema/workbooks", requireRole(["admin"]), (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(uploadDir)) return res.json({ files: [] });

    const files = fs.readdirSync(uploadDir)
      .filter((f) => /\.(xlsx|xls)$/i.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(uploadDir, f));
        return {
          filename: f,
          sizeKb: Math.round(stat.size / 1024),
          uploadedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
