import type { Request, Response, NextFunction } from "express";

export function requireDispositionFirst(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const disposition =
    req.body?.disposition ||
    req.body?.canonicalDisposition ||
    req.body?.selectedDisposition;

  if (!disposition) {
    res.status(400).json({
      ok: false,
      code: "DISPOSITION_REQUIRED",
      message:
        "A disposition decision is required before this action can be finalized. " +
        "Please set disposition (home_supportive_care | home_with_rx | follow_up_primary_care | " +
        "same_day_urgent_care | er_now | hospital_admission) before proceeding.",
    });
    return;
  }

  next();
}
